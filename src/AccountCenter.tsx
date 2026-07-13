import { useEffect, useRef, useState } from 'preact/hooks';
import { type SeasonMeta, fetchSeasons, uploadSeason } from './api';
import type { AuthProfile } from './auth';
import { JwtTool } from './JwtTool';

interface AccountCenterProps {
  profiles: AuthProfile[];
  activeUserId: string | null;
  initialTab?: 'accounts' | 'jwt';
  onSwitchProfile: (userId: string) => Promise<void>;
  onDeleteProfile: (userId: string) => void;
  onSaveProfile: (token: string, makeActive: boolean) => Promise<void>;
}

interface AccountSeasonUploadProps {
  profile: AuthProfile;
  currentSeason?: SeasonMeta;
  onUploaded: (token: string) => Promise<void>;
}

function formatDate(timestamp: number, seconds = false): string {
  if (!timestamp) return '—';
  return new Date(seconds ? timestamp * 1000 : timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AccountSeasonUpload({ profile, currentSeason, onUploaded }: AccountSeasonUploadProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(currentSeason?.name ?? `${profile.nickname || profile.userId} 的自定义赛季`);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (currentSeason?.name) setName(currentSeason.name);
  }, [currentSeason?.name]);

  const submit = async (event: Event) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage({ ok: false, text: '请选择赛季 JSON 文件。' });
      return;
    }
    if (!name.trim()) {
      setMessage({ ok: false, text: '请填写赛季显示名称。' });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`JSON 解析失败：${detail}`);
      }
      const result = await uploadSeason(profile.token, name.trim(), data);
      setMessage({ ok: true, text: `上传成功，CRC32：${result.crc32 >>> 0}` });
      if (fileRef.current) fileRef.current.value = '';
      await onUploaded(profile.token);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="account-upload">
      <button type="button" onClick={() => setExpanded((value) => !value)}>
        {currentSeason ? '替换赛季' : '上传赛季'}
      </button>
      {expanded && (
        <form class="account-upload-form" onSubmit={submit}>
          <input
            class="input-field account-upload-name"
            type="text"
            value={name}
            placeholder="赛季显示名称"
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <input
            ref={fileRef}
            class="input-field account-upload-file"
            type="file"
            accept=".json,application/json"
            required
          />
          <button type="submit" class="primary" disabled={busy}>
            {busy ? '上传中' : '确认上传'}
          </button>
          {message && <span class={`account-row-message ${message.ok ? 'ok' : 'bad'}`}>{message.text}</span>}
        </form>
      )}
    </div>
  );
}

export function AccountCenter({
  profiles,
  activeUserId,
  initialTab,
  onSwitchProfile,
  onDeleteProfile,
  onSaveProfile,
}: AccountCenterProps) {
  const [tab, setTab] = useState<'accounts' | 'jwt'>(
    initialTab ?? (profiles.length === 0 ? 'jwt' : 'accounts'),
  );
  const [seasons, setSeasons] = useState<SeasonMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingUserId, setSwitchingUserId] = useState<string | null>(null);
  const [editingToken, setEditingToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadSeasons = async (token?: string) => {
    const fallbackToken = profiles.find((profile) => profile.userId === activeUserId)?.token
      ?? profiles[0]?.token;
    const requestToken = token ?? fallbackToken;
    if (!requestToken) {
      setSeasons([]);
      return;
    }
    setLoading(true);
    try {
      setSeasons(await fetchSeasons(requestToken));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSeasons();
  }, [activeUserId, profiles.length]);

  const switchProfile = async (userId: string) => {
    setSwitchingUserId(userId);
    setError(null);
    try {
      await onSwitchProfile(userId);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : String(switchError));
    } finally {
      setSwitchingUserId(null);
    }
  };

  const editProfile = (profile: AuthProfile) => {
    setEditingToken(profile.token);
    setTab('jwt');
  };

  const now = Math.floor(Date.now() / 1000);
  const customByOwner = new Map(
    seasons.filter((season) => !season.isBuiltin).map((season) => [season.ownerId, season]),
  );

  return (
    <div class="account-center">
      <div class="account-tabs" role="tablist" aria-label="账户与令牌">
        <button type="button" class={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}>
          已保存账户 <span>{profiles.length}</span>
        </button>
        <button type="button" class={tab === 'jwt' ? 'active' : ''} onClick={() => { setEditingToken(''); setTab('jwt'); }}>
          登录新 Token / JWT 工具
        </button>
      </div>

      {tab === 'accounts' ? (
        <section class="account-list-panel">
          <div class="account-list-heading">
            <div>
              <h3>多用户账户</h3>
              <p>切换账户会改变整个控制台的当前身份；逐行上传只使用该行 JWT，不会切换账户。</p>
            </div>
            <div class="account-heading-actions">
              <button type="button" class="primary" onClick={() => { setEditingToken(''); setTab('jwt'); }}>
                登录新 Token
              </button>
              <button type="button" onClick={() => loadSeasons()} disabled={loading}>
                {loading ? '刷新中' : '刷新赛季'}
              </button>
            </div>
          </div>

          {error && <div class="account-global-error">{error}</div>}

          {profiles.length === 0 ? (
            <div class="account-empty">
              <p>还没有已保存账户。</p>
              <button type="button" onClick={() => setTab('jwt')}>打开 JWT 工具</button>
            </div>
          ) : (
            <div class="account-list">
              {profiles.map((profile) => {
                const isActive = profile.userId === activeUserId;
                const expired = profile.exp <= now;
                const customSeason = customByOwner.get(profile.userId);
                return (
                  <article class={`account-card ${isActive ? 'active' : ''}`} key={profile.userId}>
                    <div class="account-card-main">
                      <div class="account-identity">
                        <div class="account-avatar">{(profile.nickname || profile.userId).slice(0, 1).toUpperCase()}</div>
                        <div>
                          <h4>{profile.nickname || '未命名用户'} {isActive && <span>当前</span>}</h4>
                          <code>{profile.userId}</code>
                        </div>
                      </div>
                      <div class="account-meta">
                        <span class={expired ? 'bad' : 'ok'}>{expired ? 'Token 已过期' : `有效至 ${formatDate(profile.exp, true)}`}</span>
                        <span>本地更新 {formatDate(profile.updatedAt)}</span>
                      </div>
                    </div>

                    <div class="account-season-summary">
                      {customSeason ? (
                        <>
                          <strong>{customSeason.name}</strong>
                          <span>CRC32 {customSeason.crc32 >>> 0}</span>
                          <span>更新于 {formatDate(customSeason.updatedAt)}</span>
                        </>
                      ) : (
                        <span class="muted">该用户尚未上传自定义赛季</span>
                      )}
                    </div>

                    <div class="account-actions">
                      {!isActive && (
                        <button type="button" class="primary" disabled={!!switchingUserId} onClick={() => switchProfile(profile.userId)}>
                          {switchingUserId === profile.userId ? '切换中' : '切换到此账户'}
                        </button>
                      )}
                      <AccountSeasonUpload
                        profile={profile}
                        currentSeason={customSeason}
                        onUploaded={loadSeasons}
                      />
                      <button type="button" onClick={() => editProfile(profile)}>更新 Token</button>
                      <button
                        type="button"
                        class="danger"
                        onClick={() => {
                          if (confirm(`从此浏览器删除账户「${profile.nickname || profile.userId}」？不会删除后端数据。`)) {
                            onDeleteProfile(profile.userId);
                          }
                        }}
                      >
                        删除本地账户
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <JwtTool
          key={editingToken || 'new-token'}
          initialToken={editingToken}
          onSaveProfile={onSaveProfile}
        />
      )}
    </div>
  );
}
