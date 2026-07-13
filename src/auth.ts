export interface JwtHeader {
  alg: string;
  typ?: string;
  [key: string]: unknown;
}

export interface JwtPayload {
  appid: string;
  user_id: string;
  nickname: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  encodedHeader: string;
  encodedPayload: string;
}

export interface AuthProfile {
  userId: string;
  nickname: string;
  token: string;
  exp: number;
  updatedAt: number;
}

export interface AuthProfileState {
  version: 1;
  activeUserId: string | null;
  profiles: AuthProfile[];
}

export const AUTH_PROFILE_STORAGE_KEY = 'ac_auth_profiles_v1';
export const LEGACY_AUTH_TOKEN_KEY = 'auth_token';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export function createDefaultJwtHeader(): JwtHeader {
  return {
    alg: 'HS256',
    typ: 'JWT',
  };
}

export function createDefaultJwtPayload(nowMs = Date.now()): JwtPayload {
  const iat = Math.floor(nowMs / 1000);
  return {
    appid: 'A.L.I.R.E.A',
    user_id: '',
    nickname: '',
    iat,
    exp: iat + 3 * 24 * 60 * 60,
  };
}

function encodeBytesBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new Error('JWT 区块包含无效的 Base64URL 字符');
  }
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + '='.repeat(paddingLength));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeJsonBase64Url(value: Record<string, unknown>): string {
  return encodeBytesBase64Url(utf8Encoder.encode(JSON.stringify(value)));
}

function decodeJsonBase64Url(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decoder.decode(decodeBase64UrlBytes(value)));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} 无法解析：${detail}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

export function decodeJwt(token: string): DecodedJwt {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('JWT 必须包含三个非空区块');
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  return {
    header: decodeJsonBase64Url(encodedHeader, 'Header'),
    payload: decodeJsonBase64Url(encodedPayload, 'Payload'),
    signature,
    encodedHeader,
    encodedPayload,
  };
}

export function validateJwtContent(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): asserts header is JwtHeader {
  if (header.alg !== 'HS256') {
    throw new Error('当前仅支持 alg 为 HS256 的 JWT');
  }
  if (header.typ !== undefined && typeof header.typ !== 'string') {
    throw new Error('Header.typ 必须是字符串');
  }

  for (const key of ['appid', 'user_id', 'nickname'] as const) {
    if (typeof payload[key] !== 'string') {
      throw new Error(`Payload.${key} 必须是字符串`);
    }
  }
  for (const key of ['iat', 'exp'] as const) {
    if (!Number.isInteger(payload[key])) {
      throw new Error(`Payload.${key} 必须是整数 Unix 时间戳`);
    }
  }
  if ((payload.exp as number) <= (payload.iat as number)) {
    throw new Error('Payload.exp 必须晚于 Payload.iat');
  }
}

async function importHmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前页面环境不支持 Web Crypto，请使用 HTTPS 或 localhost');
  }
  return crypto.subtle.importKey(
    'raw',
    utf8Encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage,
  );
}

export async function encodeJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  validateJwtContent(header, payload);
  if (!secret) throw new Error('请填写 HS256 签名密钥');

  const encodedHeader = encodeJsonBase64Url(header);
  const encodedPayload = encodeJsonBase64Url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await importHmacKey(secret, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, utf8Encoder.encode(signingInput));
  return `${signingInput}.${encodeBytesBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwt(token: string, secret: string): Promise<boolean> {
  if (!secret) throw new Error('请填写 HS256 签名密钥');
  const decoded = decodeJwt(token);
  if (decoded.header.alg !== 'HS256') {
    throw new Error('当前仅支持验证 HS256 签名');
  }
  const key = await importHmacKey(secret, ['verify']);
  const data = utf8Encoder.encode(`${decoded.encodedHeader}.${decoded.encodedPayload}`);
  const signature = Uint8Array.from(decodeBase64UrlBytes(decoded.signature)).buffer;
  return crypto.subtle.verify('HMAC', key, signature, data);
}

export function profileFromToken(token: string, updatedAt = Date.now()): AuthProfile {
  const { payload } = decodeJwt(token);
  const userId = payload.user_id;
  const nickname = payload.nickname;
  const exp = payload.exp;
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('JWT Payload 缺少有效的 user_id');
  }
  if (typeof nickname !== 'string') {
    throw new Error('JWT Payload 缺少 nickname');
  }
  if (!Number.isInteger(exp)) {
    throw new Error('JWT Payload 缺少有效的 exp');
  }
  return {
    userId: userId.trim(),
    nickname,
    token: token.trim(),
    exp: exp as number,
    updatedAt,
  };
}

function emptyAuthProfileState(): AuthProfileState {
  return { version: 1, activeUserId: null, profiles: [] };
}

function parseStoredState(raw: string | null): AuthProfileState {
  if (!raw) return emptyAuthProfileState();
  try {
    const parsed = JSON.parse(raw) as Partial<AuthProfileState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) {
      return emptyAuthProfileState();
    }
    const profiles = parsed.profiles.filter((profile): profile is AuthProfile => (
      !!profile
      && typeof profile.userId === 'string'
      && typeof profile.nickname === 'string'
      && typeof profile.token === 'string'
      && typeof profile.exp === 'number'
      && typeof profile.updatedAt === 'number'
    ));
    const activeUserId = typeof parsed.activeUserId === 'string'
      && profiles.some((profile) => profile.userId === parsed.activeUserId)
      ? parsed.activeUserId
      : null;
    return { version: 1, activeUserId, profiles };
  } catch {
    return emptyAuthProfileState();
  }
}

export function saveAuthProfileState(storage: Storage, state: AuthProfileState): void {
  storage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify(state));
}

export function loadAuthProfileState(storage: Storage): AuthProfileState {
  let state = parseStoredState(storage.getItem(AUTH_PROFILE_STORAGE_KEY));
  const legacyToken = storage.getItem(LEGACY_AUTH_TOKEN_KEY);

  if (legacyToken) {
    try {
      const legacyProfile = profileFromToken(legacyToken);
      const existingIndex = state.profiles.findIndex((profile) => profile.userId === legacyProfile.userId);
      const profiles = [...state.profiles];
      if (existingIndex >= 0) profiles[existingIndex] = legacyProfile;
      else profiles.push(legacyProfile);
      state = {
        version: 1,
        activeUserId: state.activeUserId ?? legacyProfile.userId,
        profiles,
      };
      saveAuthProfileState(storage, state);
      storage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    } catch {
      // Keep an unparseable legacy token untouched so the user can recover it manually.
    }
  }

  return state;
}

export function upsertAuthProfile(
  state: AuthProfileState,
  profile: AuthProfile,
  makeActive = false,
): AuthProfileState {
  const existingIndex = state.profiles.findIndex((item) => item.userId === profile.userId);
  const profiles = [...state.profiles];
  if (existingIndex >= 0) profiles[existingIndex] = profile;
  else profiles.push(profile);
  profiles.sort((left, right) => left.nickname.localeCompare(right.nickname, 'zh-CN'));
  return {
    version: 1,
    activeUserId: makeActive ? profile.userId : state.activeUserId,
    profiles,
  };
}

export function removeAuthProfile(state: AuthProfileState, userId: string): AuthProfileState {
  return {
    version: 1,
    activeUserId: state.activeUserId === userId ? null : state.activeUserId,
    profiles: state.profiles.filter((profile) => profile.userId !== userId),
  };
}
