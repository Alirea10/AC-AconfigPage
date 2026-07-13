import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  createDefaultJwtHeader,
  createDefaultJwtPayload,
  decodeJwt,
  encodeJwt,
  verifyJwt,
} from './auth';

interface JwtToolProps {
  initialToken?: string;
  onSaveProfile: (token: string, makeActive: boolean) => Promise<void>;
}

function formatJson(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} JSON 语法错误：${detail}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

function defaultEditorState() {
  return {
    header: formatJson(createDefaultJwtHeader()),
    payload: formatJson(createDefaultJwtPayload()),
  };
}

export function JwtTool({ initialToken = '', onSaveProfile }: JwtToolProps) {
  const defaults = useMemo(defaultEditorState, []);
  const [encodedToken, setEncodedToken] = useState(initialToken);
  const [headerText, setHeaderText] = useState(defaults.header);
  const [payloadText, setPayloadText] = useState(defaults.payload);
  const [passwordUsername, setPasswordUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const cryptoSupported = !!globalThis.crypto?.subtle;

  const decodeToken = (token: string) => {
    const decoded = decodeJwt(token);
    setHeaderText(formatJson(decoded.header));
    setPayloadText(formatJson(decoded.payload));
    setPasswordUsername(typeof decoded.payload.user_id === 'string' ? decoded.payload.user_id : '');
    setMessage({ ok: true, text: 'JWT 已拆分为 Header、Payload 和 Signature。' });
  };

  useEffect(() => {
    if (!initialToken) return;
    setEncodedToken(initialToken);
    try {
      decodeToken(initialToken);
    } catch {
      // Leave the token available for manual repair.
    }
  }, [initialToken]);

  const run = async (key: string, action: () => Promise<void> | void) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const handleDecode = () => run('decode', () => {
    if (!encodedToken.trim()) throw new Error('请先粘贴 JWT');
    decodeToken(encodedToken.trim());
  });

  const handleSign = () => run('sign', async () => {
    const nextToken = await encodeJwt(
      parseJsonObject(headerText, 'Header'),
      parseJsonObject(payloadText, 'Payload'),
      secret,
    );
    setEncodedToken(nextToken);
    setMessage({ ok: true, text: 'HS256 JWT 已生成。' });
  });

  const handleVerify = () => run('verify', async () => {
    if (!encodedToken.trim()) throw new Error('请先生成或粘贴 JWT');
    const valid = await verifyJwt(encodedToken.trim(), secret);
    setMessage({
      ok: valid,
      text: valid ? 'Signature Verification：签名有效。' : 'Signature Verification：签名不匹配。',
    });
  });

  const handleCopy = () => run('copy', async () => {
    if (!encodedToken.trim()) throw new Error('当前没有可复制的 JWT');
    await navigator.clipboard.writeText(encodedToken.trim());
    setMessage({ ok: true, text: 'JWT 已复制到剪贴板。' });
  });

  const handleSave = (makeActive: boolean) => run(makeActive ? 'save-active' : 'save', async () => {
    if (!encodedToken.trim()) throw new Error('请先生成或粘贴 JWT');
    await onSaveProfile(encodedToken.trim(), makeActive);
    setMessage({ ok: true, text: makeActive ? '账户已保存并切换。' : '账户已保存。' });
  });

  const updatePasswordUsername = (value: string) => {
    setPasswordUsername(value);
    try {
      const payload = parseJsonObject(payloadText, 'Payload');
      payload.user_id = value;
      setPayloadText(formatJson(payload));
    } catch {
      // Do not overwrite invalid JSON while the user is repairing it.
    }
  };

  const refreshTime = () => run('time', () => {
    const payload = parseJsonObject(payloadText, 'Payload');
    const now = Math.floor(Date.now() / 1000);
    payload.iat = now;
    payload.exp = now + 3 * 24 * 60 * 60;
    setPayloadText(formatJson(payload));
    setMessage({ ok: true, text: 'iat 已更新为当前时间，exp 已更新为三天后。' });
  });

  const reset = () => {
    const next = defaultEditorState();
    setHeaderText(next.header);
    setPayloadText(next.payload);
    setPasswordUsername('');
    setEncodedToken('');
    setSecret('');
    setShowSecret(false);
    setMessage(null);
  };

  const signature = encodedToken.trim().split('.')[2] ?? '';

  return (
    <section class="jwt-tool">
      <div class="jwt-tool-heading">
        <div>
          <span class="jwt-kicker">LOCAL_JWT_WORKBENCH</span>
          <h3>JWT Decode / Encode</h3>
          <p>登录新账户时，把 JWT 粘贴到下方并点击“保存并切换”；所有解析与 HS256 运算均在当前浏览器完成。</p>
        </div>
        <button type="button" class="jwt-secondary-btn" onClick={reset}>重置</button>
      </div>

      <label class="jwt-field jwt-encoded-field">
        <span>Encoded JWT</span>
        <textarea
          class="input-field jwt-token-input"
          value={encodedToken}
          spellcheck={false}
          placeholder="粘贴现有 JWT，或填写下方内容后生成"
          onInput={(event) => setEncodedToken(event.currentTarget.value)}
        />
      </label>

      <div class="jwt-toolbar">
        <button type="button" onClick={handleDecode} disabled={!!busy}>
          {busy === 'decode' ? '解析中' : '解析 JWT'}
        </button>
        <button type="button" onClick={handleCopy} disabled={!!busy || !encodedToken.trim()}>
          {busy === 'copy' ? '复制中' : '复制 JWT'}
        </button>
        <button type="button" onClick={() => handleSave(false)} disabled={!!busy || !encodedToken.trim()}>
          {busy === 'save' ? '校验中' : '保存到账户'}
        </button>
        <button type="button" class="primary" onClick={() => handleSave(true)} disabled={!!busy || !encodedToken.trim()}>
          {busy === 'save-active' ? '校验中' : '保存并切换'}
        </button>
      </div>

      <div class="jwt-sections">
        <label class="jwt-field">
          <span>Header</span>
          <textarea
            class="input-field jwt-json-input"
            value={headerText}
            spellcheck={false}
            onInput={(event) => setHeaderText(event.currentTarget.value)}
          />
        </label>

        <label class="jwt-field">
          <span class="jwt-field-title">
            Payload
            <button type="button" onClick={refreshTime} disabled={!!busy}>刷新时间</button>
          </span>
          <textarea
            class="input-field jwt-json-input payload"
            value={payloadText}
            spellcheck={false}
            onInput={(event) => {
              const value = event.currentTarget.value;
              setPayloadText(value);
              try {
                const payload = parseJsonObject(value, 'Payload');
                if (typeof payload.user_id === 'string') setPasswordUsername(payload.user_id);
              } catch {
                // Syntax feedback is shown when an action is requested.
              }
            }}
          />
        </label>

        <form class="jwt-signature-panel" onSubmit={(event) => { event.preventDefault(); handleSign(); }}>
          <div class="jwt-field-title">
            <span>Signature Verification</span>
            <code>{signature ? `${signature.slice(0, 18)}…` : '尚未生成签名'}</code>
          </div>

          <label class="jwt-field compact">
            <span>密码管理器账户（同步 user_id）</span>
            <input
              class="input-field"
              type="text"
              name="username"
              autocomplete="username"
              value={passwordUsername}
              onInput={(event) => updatePasswordUsername(event.currentTarget.value)}
            />
          </label>

          <label class="jwt-field compact">
            <span>HS256 密钥</span>
            <div class="jwt-secret-row">
              <input
                class="input-field"
                type={showSecret ? 'text' : 'password'}
                name="password"
                autocomplete="current-password"
                value={secret}
                placeholder="留空，等待用户或密码管理器填写"
                onInput={(event) => setSecret(event.currentTarget.value)}
              />
              <button type="button" onClick={() => setShowSecret((value) => !value)}>
                {showSecret ? '隐藏' : '显示'}
              </button>
            </div>
          </label>

          {!cryptoSupported && (
            <div class="jwt-message bad">当前来源不支持 Web Crypto；解码可用，签名与验证需要 HTTPS 或 localhost。</div>
          )}

          <div class="jwt-toolbar signature-actions">
            <button type="submit" class="primary" disabled={!!busy || !cryptoSupported}>
              {busy === 'sign' ? '签名中' : '生成 / 重新签名'}
            </button>
            <button type="button" onClick={handleVerify} disabled={!!busy || !cryptoSupported || !encodedToken.trim()}>
              {busy === 'verify' ? '验证中' : '验证签名'}
            </button>
          </div>
        </form>
      </div>

      {message && <div class={`jwt-message ${message.ok ? 'ok' : 'bad'}`}>{message.text}</div>}
    </section>
  );
}
