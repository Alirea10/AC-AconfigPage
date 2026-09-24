import type { ComponentChildren } from 'preact';
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

type JsonFieldType = 'string' | 'number' | 'boolean' | 'null' | 'json';

interface JsonFieldEntry {
  id: number;
  key: string;
  type: JsonFieldType;
  value: string;
}

interface KeyValueEditorProps {
  label: string;
  fields: JsonFieldEntry[];
  actions?: ComponentChildren;
  onChange: (fields: JsonFieldEntry[]) => void;
  onCopy: (field: JsonFieldEntry) => void;
}

let nextFieldId = 0;

function createField(key = '', type: JsonFieldType = 'string', value = ''): JsonFieldEntry {
  nextFieldId += 1;
  return { id: nextFieldId, key, type, value };
}

function fieldTypeOf(value: unknown): JsonFieldType {
  if (value === null) return 'null';
  if (Array.isArray(value) || typeof value === 'object') return 'json';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function fieldValueOf(value: unknown, type: JsonFieldType): string {
  if (type === 'null') return 'null';
  if (type === 'json') return JSON.stringify(value);
  return String(value ?? '');
}

function recordToFields(value: Record<string, unknown>): JsonFieldEntry[] {
  return Object.entries(value).map(([key, fieldValue]) => {
    const type = fieldTypeOf(fieldValue);
    return createField(key, type, fieldValueOf(fieldValue, type));
  });
}

function parseFieldValue(field: JsonFieldEntry, label: string): unknown {
  switch (field.type) {
    case 'string':
      return field.value;
    case 'number': {
      if (!field.value.trim()) throw new Error(`${label}.${field.key} 的数字值不能为空`);
      const value = Number(field.value);
      if (!Number.isFinite(value)) throw new Error(`${label}.${field.key} 必须是有效数字`);
      return value;
    }
    case 'boolean':
      if (field.value === 'true') return true;
      if (field.value === 'false') return false;
      throw new Error(`${label}.${field.key} 的布尔值必须是 true 或 false`);
    case 'null':
      return null;
    case 'json': {
      let value: unknown;
      try {
        value = JSON.parse(field.value);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`${label}.${field.key} JSON 语法错误：${detail}`);
      }
      if (!value || typeof value !== 'object') {
        throw new Error(`${label}.${field.key} 必须是 JSON 对象或数组`);
      }
      return value;
    }
  }
}

function fieldsToRecord(fields: JsonFieldEntry[], label: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keys = new Set<string>();

  for (const field of fields) {
    const key = field.key.trim();
    if (!key) throw new Error(`${label} 包含空键名`);
    if (keys.has(key)) throw new Error(`${label} 包含重复键名：${key}`);
    keys.add(key);
    Object.defineProperty(result, key, {
      value: parseFieldValue({ ...field, key }, label),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return result;
}

function valueForType(type: JsonFieldType, current: string): string {
  switch (type) {
    case 'boolean':
      return current === 'true' || current === 'false' ? current : 'true';
    case 'null':
      return 'null';
    case 'number':
      return current.trim() && Number.isFinite(Number(current)) ? current : '0';
    case 'json': {
      try {
        const parsed = JSON.parse(current);
        return parsed && typeof parsed === 'object' ? current : '{}';
      } catch {
        return '{}';
      }
    }
    case 'string':
      return current === 'null' ? '' : current;
  }
}

function upsertNumberField(fields: JsonFieldEntry[], key: string, value: number): JsonFieldEntry[] {
  const index = fields.findIndex((field) => field.key.trim() === key);
  if (index < 0) return [...fields, createField(key, 'number', String(value))];
  return fields.map((field, fieldIndex) => (
    fieldIndex === index ? { ...field, key, type: 'number', value: String(value) } : field
  ));
}

function defaultEditorState() {
  return {
    header: recordToFields(createDefaultJwtHeader()),
    payload: recordToFields(createDefaultJwtPayload()),
  };
}

function KeyValueEditor({ label, fields, actions, onChange, onCopy }: KeyValueEditorProps) {
  const updateField = (id: number, patch: Partial<JsonFieldEntry>) => {
    onChange(fields.map((field) => field.id === id ? { ...field, ...patch } : field));
  };

  return (
    <section class="jwt-kv-panel">
      <div class="jwt-field-title">
        <span>{label}</span>
        <span class="jwt-field-actions">
          {actions}
          <button type="button" onClick={() => onChange([...fields, createField()])}>添加字段</button>
        </span>
      </div>

      <div class="jwt-kv-list">
        {fields.length === 0 ? (
          <div class="jwt-kv-empty">暂无字段</div>
        ) : fields.map((field) => (
          <div class="jwt-kv-row" key={field.id}>
            <input
              class="input-field jwt-key-input"
              type="text"
              value={field.key}
              aria-label={`${label} 键名`}
              placeholder="键名"
              spellcheck={false}
              onInput={(event) => updateField(field.id, { key: event.currentTarget.value })}
            />
            <select
              class="select-field jwt-type-select"
              value={field.type}
              aria-label={`${label}.${field.key || '新字段'} 类型`}
              onChange={(event) => {
                const type = event.currentTarget.value as JsonFieldType;
                updateField(field.id, { type, value: valueForType(type, field.value) });
              }}
            >
              <option value="string">字符串</option>
              <option value="number">数字</option>
              <option value="boolean">布尔</option>
              <option value="null">null</option>
              <option value="json">对象/数组</option>
            </select>
            <input
              class="input-field jwt-value-input"
              type="text"
              value={field.value}
              aria-label={`${label}.${field.key || '新字段'} 值`}
              placeholder="值"
              spellcheck={false}
              disabled={field.type === 'null'}
              onInput={(event) => updateField(field.id, { value: event.currentTarget.value })}
            />
            <button type="button" class="jwt-row-action" onClick={() => onCopy(field)}>复制值</button>
            <button
              type="button"
              class="jwt-row-action danger"
              onClick={() => onChange(fields.filter((item) => item.id !== field.id))}
            >
              删除
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function JwtTool({ initialToken = '', onSaveProfile }: JwtToolProps) {
  const defaults = useMemo(defaultEditorState, []);
  const [encodedToken, setEncodedToken] = useState(initialToken);
  const [headerFields, setHeaderFields] = useState(defaults.header);
  const [payloadFields, setPayloadFields] = useState(defaults.payload);
  const [passwordUsername, setPasswordUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const usesWebCrypto = !!globalThis.crypto?.subtle;

  const setPayloadAndSyncUsername = (fields: JsonFieldEntry[]) => {
    setPayloadFields(fields);
    const userId = fields.find((field) => field.key.trim() === 'user_id');
    setPasswordUsername(userId?.type === 'string' ? userId.value : '');
  };

  const decodeToken = (token: string) => {
    const decoded = decodeJwt(token);
    setHeaderFields(recordToFields(decoded.header));
    const nextPayload = recordToFields(decoded.payload);
    setPayloadAndSyncUsername(nextPayload);
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
      fieldsToRecord(headerFields, 'Header'),
      fieldsToRecord(payloadFields, 'Payload'),
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

  const handleCopyValue = (section: string, field: JsonFieldEntry) => run(`copy-value-${field.id}`, async () => {
    const value = field.type === 'null' ? 'null' : field.value;
    await navigator.clipboard.writeText(value);
    setMessage({ ok: true, text: `${section}.${field.key || '新字段'} 的值已复制。` });
  });

  const handleSave = (makeActive: boolean) => run(makeActive ? 'save-active' : 'save', async () => {
    if (!encodedToken.trim()) throw new Error('请先生成或粘贴 JWT');
    await onSaveProfile(encodedToken.trim(), makeActive);
    setMessage({ ok: true, text: makeActive ? '账户已保存并切换。' : '账户已保存。' });
  });

  const updatePasswordUsername = (value: string) => {
    setPasswordUsername(value);
    setPayloadFields((current) => {
      const index = current.findIndex((field) => field.key.trim() === 'user_id');
      if (index < 0) return [...current, createField('user_id', 'string', value)];
      return current.map((field, fieldIndex) => (
        fieldIndex === index ? { ...field, key: 'user_id', type: 'string', value } : field
      ));
    });
  };

  const refreshTime = (days: number, label: string) => run(`time-${days}`, () => {
    const now = Math.floor(Date.now() / 1000);
    setPayloadFields((current) => upsertNumberField(
      upsertNumberField(current, 'iat', now),
      'exp',
      now + days * 24 * 60 * 60,
    ));
    setMessage({ ok: true, text: `iat 已更新为当前时间，exp 已更新为${label}后。` });
  });

  const reset = () => {
    const next = defaultEditorState();
    setHeaderFields(next.header);
    setPayloadFields(next.payload);
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
          <p>高级用户可在本地解析、编辑、生成和验证 JWT；所有 Header、Payload 与 HS256 运算均在当前浏览器完成。</p>
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
        <KeyValueEditor
          label="Header"
          fields={headerFields}
          onChange={setHeaderFields}
          onCopy={(field) => { void handleCopyValue('Header', field); }}
        />

        <KeyValueEditor
          label="Payload"
          fields={payloadFields}
          onChange={setPayloadAndSyncUsername}
          onCopy={(field) => { void handleCopyValue('Payload', field); }}
          actions={(
            <>
              <button type="button" onClick={() => refreshTime(3, '三天')} disabled={!!busy}>刷新三天</button>
              <button type="button" onClick={() => refreshTime(7, '七天')} disabled={!!busy}>刷新七天</button>
              <button type="button" onClick={() => refreshTime(90, '九十天')} disabled={!!busy}>刷新三月</button>
            </>
          )}
        />

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

          {!usesWebCrypto && (
            <div class="jwt-message">当前为 HTTP，将使用本地兼容签名实现；密钥和 JWT 不会上传。</div>
          )}

          <div class="jwt-toolbar signature-actions">
            <button type="submit" class="primary" disabled={!!busy}>
              {busy === 'sign' ? '签名中' : '生成 / 重新签名'}
            </button>
            <button type="button" onClick={handleVerify} disabled={!!busy || !encodedToken.trim()}>
              {busy === 'verify' ? '验证中' : '验证签名'}
            </button>
          </div>
        </form>
      </div>

      {message && <div class={`jwt-message ${message.ok ? 'ok' : 'bad'}`}>{message.text}</div>}
    </section>
  );
}
