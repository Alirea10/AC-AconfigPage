import { useState, useEffect, useRef } from 'preact/hooks';
import { type Settings, type SeasonMeta, fetchSettings, updateSetting, fetchSeasons, uploadSeason, deleteSeason, fetchCheatStatus, fetchChessList, executeCheatAction, type CheatConnection, type ChessItem, type BondItem } from './api';
import { MAPS, NAME_CARDS } from './constants';
import { SecretarySelector } from './SecretarySelector';

interface JwtPayload {
  appid: string;
  user_id: string;
  nickname: string;
  iat: number;
  exp: number;
}

// ─── 赛季管理组件 ─────────────────────────────────────────────────────────────

function SeasonManager({ jwt, myUserId, currentSeasonId, onSeasonChange }: {
  jwt: string;
  myUserId: string;
  currentSeasonId: string;
  onSeasonChange: (id: string) => void;
}) {
  const [seasons, setSeasons] = useState<SeasonMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingActive, setSettingActive] = useState<string | null>(null);

  const mySeasonId = `user:${myUserId}`;

  const loadSeasons = async () => {
    if (!jwt) return;
    try {
      setLoading(true);
      setError(null);
      setSeasons(await fetchSeasons(jwt));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSeasons(); }, [jwt]);

  const handleFileUpload = async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const file = form.querySelector<HTMLInputElement>('input[type=file]')?.files?.[0];
    if (!file || !uploadName.trim()) { setUploadError('请填写名称并选择文件'); return; }
    try {
      setUploading(true); setUploadError(null); setUploadSuccess(null);
      const result = await uploadSeason(jwt, uploadName.trim(), JSON.parse(await file.text()));
      setUploadSuccess(`上传成功！CRC32: ${result.crc32 >>> 0}`);
      setUploadName(''); form.reset();
      await loadSeasons();
    } catch (e: any) { setUploadError(e.message); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除你上传的自定义赛季吗？')) return;
    try {
      setDeleting(true);
      await deleteSeason(jwt);
      if (currentSeasonId === mySeasonId) {
        await updateSetting(jwt, 'seasonId', 'act1autochess');
        onSeasonChange('act1autochess');
      }
      await loadSeasons();
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  };

  const handleSetActive = async (id: string) => {
    try {
      setSettingActive(id);
      await updateSetting(jwt, 'seasonId', id);
      onSeasonChange(id);
    } catch (e: any) { setError(e.message); }
    finally { setSettingActive(null); }
  };

  const formatTs = (ts: number) =>
    ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const myUploadedSeason = seasons.find(s => s.id === mySeasonId);

  return (
    <section class="cyber-section">
      <h2 class="section-title">赛季管理 <span>SEASON_MGR</span></h2>

      {loading ? (
        <div style={{ opacity: 0.5, fontSize: '0.8rem' }}>加载中...</div>
      ) : error ? (
        <div style={{ color: '#ff4d4d', fontSize: '0.8rem' }}>{error}</div>
      ) : (
        <div style={{ marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-primary-dim)', opacity: 0.6 }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>名称</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>CRC32</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>更新时间</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(s => {
                const isActive = s.id === currentSeasonId;
                const isMine = s.id === mySeasonId;
                return (
                  <tr key={s.id} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: isActive ? 'rgba(0,255,180,0.06)' : undefined,
                  }}>
                    <td style={{ padding: '6px 8px' }}>
                      {s.name}
                      {isMine && <span style={{ marginLeft: '6px', fontSize: '0.65rem', opacity: 0.5 }}>（我的）</span>}
                      {isActive && <span style={{ marginLeft: '6px', fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 'bold' }}>◆ 当前</span>}
                    </td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', opacity: 0.6 }}>{s.crc32 >>> 0}</td>
                    <td style={{ padding: '6px 8px', opacity: 0.6 }}>{s.isBuiltin ? '内置' : formatTs(s.updatedAt)}</td>
                    <td style={{ padding: '6px 8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {!isActive && (
                        <button class="input-field"
                          style={{ cursor: 'pointer', padding: '2px 10px', fontSize: '0.7rem' }}
                          onClick={() => handleSetActive(s.id)} disabled={!!settingActive}>
                          {settingActive === s.id ? '设置中...' : '设为当前'}
                        </button>
                      )}
                      {isMine && (
                        <button class="input-field"
                          style={{ cursor: 'pointer', padding: '2px 10px', fontSize: '0.7rem', color: '#ff6b6b', border: '1px solid #ff6b6b' }}
                          onClick={handleDelete} disabled={deleting}>
                          {deleting ? '删除中...' : '删除'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--color-primary-dim)', paddingTop: '16px' }}>
        <h3 style={{ fontSize: '0.8rem', marginBottom: '4px', opacity: 0.8 }}>
          {myUploadedSeason ? '替换我的自定义赛季' : '上传自定义赛季'}
        </h3>
        {myUploadedSeason && (
          <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '10px' }}>
            上传新文件会替换现有的「{myUploadedSeason.name}」
          </div>
        )}
        <form onSubmit={handleFileUpload} style={{ display: 'grid', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '4px' }}>赛季显示名称</div>
            <input class="input-field" type="text" placeholder="e.g. 我的自定义赛季"
              value={uploadName} onInput={(e) => setUploadName(e.currentTarget.value)}
              required style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '4px' }}>赛季 JSON 文件</div>
            <input class="input-field" type="file" accept=".json" required style={{ width: '100%', cursor: 'pointer' }} />
          </div>
          {uploadError && <div style={{ color: '#ff4d4d', fontSize: '0.75rem' }}>{uploadError}</div>}
          {uploadSuccess && <div style={{ color: '#4dff88', fontSize: '0.75rem' }}>{uploadSuccess}</div>}
          <button class="input-field" type="submit" disabled={uploading}
            style={{ cursor: 'pointer', background: 'var(--color-primary-dim)', fontWeight: 'bold', border: '2px solid var(--color-primary)' }}>
            {uploading ? '上传中...' : (myUploadedSeason ? '替换赛季' : '上传赛季')}
          </button>
        </form>
      </div>
    </section>
  );
}

// ─── 作弊控制台组件 ─────────────────────────────────────────────────────────

function CheatConsole({ jwt }: { jwt: string }) {
  const [connections, setConnections] = useState<CheatConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chessListCache, setChessListCache] = useState<Record<string, { chars: ChessItem[]; traps: ChessItem[]; bonds: BondItem[] }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [coinValue, setCoinValue] = useState<Record<string, string>>({});
  const [hpValue, setHpValue] = useState<Record<string, string>>({});
  const [roundValue, setRoundValue] = useState<Record<string, string>>({});
  const [bondId, setBondId] = useState<Record<string, string>>({});
  const [bondCount, setBondCount] = useState<Record<string, string>>({});
  const [chessId, setChessId] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionResult, setActionResult] = useState<Record<string, { ok: boolean; msg: string } | null>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      const data = await fetchCheatStatus(jwt);
      setConnections(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, 2000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [jwt]);

  const loadChessList = async (teamId: string) => {
    if (chessListCache[teamId]) return;
    try {
      const data = await fetchChessList(jwt, teamId);
      setChessListCache(prev => ({ ...prev, [teamId]: data }));
    } catch (e: any) {
      console.error('Failed to load chess list', e);
    }
  };

  const toggleExpand = (teamId: string) => {
    setExpanded(prev => {
      const next = { ...prev, [teamId]: !prev[teamId] };
      if (next[teamId]) loadChessList(teamId);
      return next;
    });
  };

  const showResult = (key: string, ok: boolean, msg: string) => {
    setActionResult(prev => ({ ...prev, [key]: { ok, msg } }));
    setTimeout(() => setActionResult(prev => ({ ...prev, [key]: null })), 3000);
  };

  // 只操作自己（服务端从 JWT 里取 userId）
  const doAction = async (teamId: string, actionKey: string, action: string, value?: any) => {
    const key = `${teamId}_${actionKey}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await executeCheatAction(jwt, action as any, value);
      showResult(key, true, result.message);
    } catch (e: any) {
      showResult(key, false, e.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const ResultBadge = ({ k }: { k: string }) => {
    const r = actionResult[k];
    if (!r) return null;
    return (
      <span style={{ fontSize: '0.65rem', marginLeft: '8px', color: r.ok ? '#00ff9d' : '#ff4d4d' }}>
        {r.ok ? '✓' : '✗'} {r.msg}
      </span>
    );
  };

  return (
    <section class="cyber-section">
      <h2 class="section-title" style={{ color: '#ff4d4d', borderBottomColor: '#ff4d4d' }}>
        作弊控制台 <span style={{ color: '#ff4d4d' }}>CHEAT_SYS</span>
      </h2>

      <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '12px' }}>
        轮询间隔 2s · 在线连接：{connections.length} 个
        {error && <span style={{ color: '#ff4d4d', marginLeft: '8px' }}>错误：{error}</span>}
      </div>

      {connections.length === 0 && !error && (
        <div style={{ fontSize: '0.8rem', opacity: 0.4, textAlign: 'center', padding: '20px 0' }}>暂无在线连接</div>
      )}

      {connections.map(conn => {
        const isExpanded = expanded[conn.teamId];
        const chess = chessListCache[conn.teamId];

        return (
          <div key={conn.teamId} style={{ marginBottom: '16px', border: '1px solid rgba(255,77,77,0.2)', padding: '12px' }}>
            {/* 连接头部 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}
              onClick={() => toggleExpand(conn.teamId)}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                background: conn.inBattle ? '#00ff9d' : '#ffaa00',
                boxShadow: conn.inBattle ? '0 0 6px #00ff9d' : '0 0 6px #ffaa00',
              }} />
              <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{conn.nickname}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>
                {conn.inBattle ? `对局中 R${conn.round}` : conn.teamState}
              </span>
              <span style={{ fontSize: '0.6rem', opacity: 0.3, marginLeft: 'auto' }}>
                {conn.teamId.slice(0, 12)}...
              </span>
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* 玩家数据表 */}
            {conn.players.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', marginBottom: '8px' }}>
                <thead>
                  <tr style={{ opacity: 0.4 }}>
                    {['#', '昵称', 'HP', '金币', '回合', '棋子', '状态'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '2px 6px', fontWeight: 'normal' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conn.players.map(p => (
                    <tr key={p.uid} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '3px 6px', opacity: 0.5 }}>{p.uidIndex}</td>
                      <td style={{ padding: '3px 6px' }}>{p.nickName}</td>
                      <td style={{ padding: '3px 6px', color: p.hp !== null && p.hp < 30 ? '#ff6b6b' : undefined }}>{p.hp ?? '—'}</td>
                      <td style={{ padding: '3px 6px' }}>{p.coin ?? '—'}</td>
                      <td style={{ padding: '3px 6px' }}>{p.round ?? '—'}</td>
                      <td style={{ padding: '3px 6px' }}>{p.charChessCount}</td>
                      <td style={{ padding: '3px 6px', fontSize: '0.6rem', opacity: 0.5 }}>{p.state ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

        {/* 展开操作区 */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid rgba(255,77,77,0.2)', paddingTop: '10px', marginTop: '6px' }}>

                {/* 调整金币 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed rgba(0,255,157,0.08)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>调整金币</span>
                  <input class="input-field" type="number" min="0" max="999"
                    style={{ width: '70px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder={String(conn.players.find(p => p.userId === conn.userId)?.coin ?? '')}
                    value={coinValue[conn.teamId] ?? ''}
                    onInput={e => setCoinValue(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_coin`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_coin`]}
                    onClick={() => doAction(conn.teamId, 'coin', 'SET_COIN', Number(coinValue[conn.teamId] || 0))}>
                    {actionLoading[`${conn.teamId}_coin`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_coin`} />
                </div>

                {/* 调整 HP */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed rgba(0,255,157,0.08)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>调整 HP</span>
                  <input class="input-field" type="number" min="0" max="9999"
                    style={{ width: '70px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder={String(conn.players.find(p => p.userId === conn.userId)?.hp ?? '')}
                    value={hpValue[conn.teamId] ?? ''}
                    onInput={e => setHpValue(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_hp`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_hp`]}
                    onClick={() => doAction(conn.teamId, 'hp', 'SET_HP', Number(hpValue[conn.teamId] || 0))}>
                    {actionLoading[`${conn.teamId}_hp`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_hp`} />
                </div>

                {/* 调整回合（整个 team） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed rgba(0,255,157,0.08)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>调整回合</span>
                  <input class="input-field" type="number" min="1" max="15"
                    style={{ width: '60px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder={String(conn.round ?? '')}
                    value={roundValue[conn.teamId] ?? ''}
                    onInput={e => setRoundValue(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <span style={{ fontSize: '0.6rem', opacity: 0.4 }}>（对整个队伍生效）</span>
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_round`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_round`]}
                    onClick={() => doAction(conn.teamId, 'round', 'SET_ROUND', Number(roundValue[conn.teamId] || conn.round || 1))}>
                    {actionLoading[`${conn.teamId}_round`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_round`} />
                </div>

                {/* 调整盟约叠层 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed rgba(0,255,157,0.08)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>盟约叠层</span>
                  <select class="select-field"
                    style={{ flex: 1, padding: '3px 6px', fontSize: '0.7rem', minWidth: '120px' }}
                    value={bondId[conn.teamId] ?? ''}
                    onChange={e => setBondId(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))}>
                    {chess ? chess.bonds.map(b => (
                      <option key={b.bondId} value={b.bondId}>{b.name}</option>
                    )) : <option value="">加载中...</option>}
                  </select>
                  <input class="input-field" type="number" min="0" max="99"
                    style={{ width: '55px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder="叠层"
                    value={bondCount[conn.teamId] ?? ''}
                    onInput={e => setBondCount(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_bond`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_bond`]}
                    onClick={() => doAction(conn.teamId, 'bond', 'SET_BOND_STACK', {
                      bondId: bondId[conn.teamId] || (chess?.bonds[0]?.bondId ?? ''),
                      count: Number(bondCount[conn.teamId] ?? 1),
                    })}>
                    {actionLoading[`${conn.teamId}_bond`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_bond`} />
                </div>

                {/* 添加棋子 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed rgba(0,255,157,0.08)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>添加棋子</span>
                  <select class="select-field"
                    style={{ flex: 1, padding: '3px 6px', fontSize: '0.7rem', minWidth: '140px' }}
                    value={chessId[conn.teamId] ?? ''}
                    onChange={e => setChessId(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))}>
                    {chess ? [
                      ...chess.chars.map(c => <option key={c.chessId} value={c.chessId}>{c.chessId}</option>),
                      ...chess.traps.map(c => <option key={c.chessId} value={c.chessId}>[装备] {c.chessId}</option>),
                    ] : <option value="">加载中...</option>}
                  </select>
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_chess`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_chess`]}
                    onClick={() => doAction(conn.teamId, 'chess', 'ADD_CHESS',
                      chessId[conn.teamId] || (chess?.chars[0]?.chessId ?? ''))}>
                    {actionLoading[`${conn.teamId}_chess`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_chess`} />
                </div>

                {/* 危险操作区 */}
                <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    class="input-field"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: '0.7rem', color: '#ff4d4d', border: '1px solid #ff4d4d', opacity: actionLoading[`${conn.teamId}_forcelogin`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_forcelogin`]}
                    onClick={() => doAction(conn.teamId, 'forcelogin', 'FORCE_LOGIN')}
                  >
                    {actionLoading[`${conn.teamId}_forcelogin`] ? '执行中...' : '⚠ 强制退出到登录页'}
                  </button>
                  <button
                    class="input-field"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: '0.7rem', color: '#ff4d4d', border: '1px solid #ff4d4d', opacity: actionLoading[`${conn.teamId}_dissolve`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_dissolve`]}
                    onClick={() => doAction(conn.teamId, 'dissolve', 'DISSOLVE_TEAM')}
                  >
                    {actionLoading[`${conn.teamId}_dissolve`] ? '执行中...' : '⚠ 强制解散队伍'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_forcelogin`} />
                  <ResultBadge k={`${conn.teamId}_dissolve`} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function App() {
  const [jwt, setJwt] = useState<string>(localStorage.getItem('auth_token') || '');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [userData, setUserData] = useState<JwtPayload | null>(null);

  useEffect(() => {
    if (jwt) {
      parseJwt(jwt);
      loadSettings(jwt);
    }
  }, [jwt]);

  const parseJwt = (token: string) => {
    try {
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const jsonPayload = decodeURIComponent(
          atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))
            .split('')
            .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        setUserData(JSON.parse(jsonPayload));
      }
    } catch (e) {
      console.error('JWT Parse Error', e);
    }
  };

  const loadSettings = async (token: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSettings(token);
      setSettings(data);
      localStorage.setItem('auth_token', token);
    } catch (err) {
      setError('认证失败：身份令牌无效或已过期');
      setSettings(null);
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (key: keyof Settings, value: any) => {
    if (!settings || !jwt) return;
    try {
      setUpdating(key);
      const updated = await updateSetting(jwt, key, value);
      setSettings(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(null);
    }
  };

  const toggleMap = (mapId: string) => {
    if (!settings) return;
    const currentMaps = settings.enabledMaps || [];
    const nextMaps = currentMaps.includes(mapId)
      ? currentMaps.filter(id => id !== mapId)
      : [...currentMaps, mapId];
    handleUpdate('enabledMaps', nextMaps);
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  const [tempJwt, setTempJwt] = useState<string>('');

  const handleAuthSubmit = (e: Event) => {
    e.preventDefault();
    if (tempJwt.trim()) {
      setJwt(tempJwt.trim());
    }
  };

  const logout = () => {
    setJwt('');
    setSettings(null);
    setUserData(null);
    localStorage.removeItem('auth_token');
  };

  if (!jwt || error) {
    return (
      <div class="auth-container">
        <div class="bg-text bg-text-1">RHODES</div>
        <div class="cyber-section" style={{ width: '100%', maxWidth: '450px' }}>
          <h2 class="section-title">身份认证 <span>AUTH_REQUIRED</span></h2>
          <form onSubmit={handleAuthSubmit} style={{ display: 'grid', gap: '20px' }}>
            <div class="setting-info">
              <h3>身份令牌 (JWT)</h3>
              <p>请输入 PRTS 授权令牌以建立连接</p>
            </div>
            <textarea 
              class="input-field" 
              style={{ minHeight: '150px', resize: 'none' }}
              placeholder="请粘贴您的令牌内容..."
              value={tempJwt}
              onInput={(e) => setTempJwt(e.currentTarget.value)}
              required
            ></textarea>
            {error && <div style={{ color: '#ff4d4d', fontSize: '0.8rem', textAlign: 'center' }}>{error}</div>}
            <button class="input-field" style={{ cursor: 'pointer', background: 'var(--color-primary-dim)', fontWeight: 'bold', border: '2px solid var(--color-primary)' }}>
              {loading ? '建立连接中...' : '开始同步'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loading && !settings) {
    return (
      <div class="loading-screen">
        <div class="spinner"></div>
        <div style={{ letterSpacing: '4px', fontSize: '0.8rem', marginTop: '20px' }}>PRTS_SYNCING...</div>
      </div>
    );
  }

  return (
    <>
      <div class="bg-text bg-text-1">RHODES</div>
      <div class="bg-text bg-text-2">ISLAND</div>

      <header class="top-header">
        <h1>
          明日方舟·橘戍协议
          <span style={{ fontSize: '0.5rem', opacity: '0.5', fontWeight: '400', marginTop: '2px', display: 'block' }}>TERMINAL_INTERFACE // v2.0.4</span>
        </h1>
        <div class="user-info">
          <div class="info-item">
            <span>Operator</span>
            <span>{userData?.nickname || 'UNKNOWN'}</span>
          </div>
          <div class="info-item">
            <span>UID</span>
            <span>{userData?.user_id || 'N/A'}</span>
          </div>
          <div class="info-item">
            <span>Session_Exp</span>
            <span>{formatTime(userData?.exp)}</span>
          </div>
          <div class="info-item" style={{ cursor: 'pointer', opacity: 1, color: '#ff4d4d' }} onClick={logout}>
            <span>Action</span>
            <span>登出</span>
          </div>
        </div>
      </header>

      <div class="container">
        {/* 配置区 */}
        <aside class="cyber-section">
          <h2 class="section-title">核心参数 <span>CORE_V1.0</span></h2>
          
          <div class="setting-item">
            <div class="setting-info">
              <h3>回合限时模式</h3>
              <p>启用后将执行严格操作时限</p>
            </div>
            <label class="switch">
              <input 
                type="checkbox" 
                checked={settings?.isTurnTimeLimitEnabled} 
                onChange={(e) => handleUpdate('isTurnTimeLimitEnabled', e.currentTarget.checked)}
                disabled={!!updating}
              />
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <h3>时限数值 (秒)</h3>
            </div>
            <input 
              type="number" 
              class="input-field" 
              style={{ width: '85px' }}
              value={settings?.turnTimeLimit}
              onChange={(e) => handleUpdate('turnTimeLimit', parseInt(e.currentTarget.value))}
              disabled={!!updating}
            />
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <h3>全局共享卡池</h3>
              <p>所有玩家共用资源池</p>
            </div>
            <label class="switch">
              <input 
                type="checkbox" 
                checked={settings?.isSharedPoolEnabled} 
                onChange={(e) => handleUpdate('isSharedPoolEnabled', e.currentTarget.checked)}
                disabled={!!updating}
              />
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-item">
            <div class="setting-info">
              <h3>公开访问权限</h3>
              <p>是否在大厅公开广播</p>
            </div>
            <label class="switch">
              <input 
                type="checkbox" 
                checked={settings?.isRoomVisibleInLobby} 
                onChange={(e) => handleUpdate('isRoomVisibleInLobby', e.currentTarget.checked)}
                disabled={!!updating}
              />
              <span class="slider"></span>
            </label>
          </div>

          <div class="setting-item" style={{ marginTop: '20px', flexDirection: 'column', alignItems: 'stretch', gap: '10px', borderBottom: 'none' }}>
            <div class="setting-info">
              <h3>助理干员委派</h3>
            </div>
            <SecretarySelector
              value={settings?.secretary}
              onChange={(value) => handleUpdate('secretary', value)}
              disabled={!!updating}
            />
          </div>
        </aside>

        {/* 列表区 */}
        <div style={{ display: 'grid', gap: '30px' }}>
          <section class="cyber-section">
            <h2 class="section-title">授权战区地图 <span>MAP_AUTH</span></h2>
            <div class="maps-grid">
              {MAPS.map(map => (
                <div 
                  key={map.id} 
                  class={`map-card ${settings?.enabledMaps?.includes(map.id) ? 'active' : ''}`}
                  onClick={() => !updating && toggleMap(map.id)}
                >
                  <img src={map.image} alt={map.name} loading="lazy" />
                  <div class="map-label">{map.name}</div>
                </div>
              ))}
            </div>
          </section>

          <section class="cyber-section">
            <h2 class="section-title">身份标识涂装 <span>ID_SKINS</span></h2>
            <div class="nc-grid">
              {Object.entries(NAME_CARDS).map(([id, info]) => (
                <div
                  key={id}
                  class={`nc-card ${settings?.nameCardSkinId === id ? 'active' : ''}`}
                  title={info.name}
                  onClick={() => !updating && handleUpdate('nameCardSkinId', id)}
                >
                  <img src={info.image} alt={info.name} loading="lazy" />
                </div>
              ))}
            </div>
          </section>

          <SeasonManager
            jwt={jwt}
            myUserId={userData?.user_id ?? ''}
            currentSeasonId={settings?.seasonId ?? 'act1autochess'}
            onSeasonChange={(id) => setSettings(s => s ? { ...s, seasonId: id } : s)}
          />

          <CheatConsole jwt={jwt} />
        </div>
      </div>
    </>
  );
}
