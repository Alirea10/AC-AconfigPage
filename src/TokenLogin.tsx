import { useEffect, useState } from 'preact/hooks';

interface TokenLoginProps {
  initialToken?: string;
  onSaveProfile: (token: string, makeActive: boolean) => Promise<void>;
}

export function TokenLogin({ initialToken = '', onSaveProfile }: TokenLoginProps) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState<'save' | 'save-active' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setToken(initialToken);
    setMessage(null);
  }, [initialToken]);

  const save = async (makeActive: boolean) => {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      setMessage({ ok: false, text: '请先粘贴 Token。' });
      return;
    }

    setBusy(makeActive ? 'save-active' : 'save');
    setMessage(null);
    try {
      await onSaveProfile(normalizedToken, makeActive);
      setMessage({ ok: true, text: makeActive ? 'Token 已保存并切换。' : 'Token 已保存到账户列表。' });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="jwt-tool token-login">
      <div class="jwt-tool-heading">
        <div>
          <span class="jwt-kicker">TOKEN_SIGN_IN</span>
          <h3>Token 登录</h3>
          <p>粘贴已有 Token 即可登录。需要解析、修改或重新签名时，请手动切换到“JWT 工具（高级）”。</p>
        </div>
        {token && (
          <button type="button" class="jwt-secondary-btn" onClick={() => { setToken(''); setMessage(null); }}>
            清空
          </button>
        )}
      </div>

      <label class="jwt-field jwt-encoded-field">
        <span>Token</span>
        <textarea
          class="input-field jwt-token-input"
          value={token}
          spellcheck={false}
          placeholder="粘贴 Token"
          onInput={(event) => setToken(event.currentTarget.value)}
        />
      </label>

      <div class="jwt-toolbar">
        <button type="button" onClick={() => save(false)} disabled={!!busy || !token.trim()}>
          {busy === 'save' ? '校验中' : '保存到账户'}
        </button>
        <button type="button" class="primary" onClick={() => save(true)} disabled={!!busy || !token.trim()}>
          {busy === 'save-active' ? '登录中' : '保存并登录'}
        </button>
      </div>

      {message && <div class={`jwt-message ${message.ok ? 'ok' : 'bad'}`}>{message.text}</div>}
    </section>
  );
}
