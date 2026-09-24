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

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value: number, amount: number) => (value >>> amount) | (value << (32 - amount));

function sha256(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  new DataView(padded.buffer).setUint32(paddedLength - 4, bitLength, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);
  const view = new DataView(padded.buffer);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const value1 = words[index - 15];
      const s0 = rotateRight(value1, 7) ^ rotateRight(value1, 18) ^ (value1 >>> 3);
      const value2 = words[index - 2];
      const s1 = rotateRight(value2, 17) ^ rotateRight(value2, 19) ^ (value2 >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choose + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((value, index) => digestView.setUint32(index * 4, value, false));
  return digest;
}

function hmacSha256(message: Uint8Array, secret: Uint8Array): Uint8Array {
  let key = secret;
  if (key.length > 64) key = sha256(key);
  const innerPad = new Uint8Array(64);
  const outerPad = new Uint8Array(64);
  for (let index = 0; index < 64; index += 1) {
    const keyByte = key[index] ?? 0;
    innerPad[index] = keyByte ^ 0x36;
    outerPad[index] = keyByte ^ 0x5c;
  }
  const innerMessage = new Uint8Array(innerPad.length + message.length);
  innerMessage.set(innerPad);
  innerMessage.set(message, innerPad.length);
  const innerDigest = sha256(innerMessage);
  const outerMessage = new Uint8Array(outerPad.length + innerDigest.length);
  outerMessage.set(outerPad);
  outerMessage.set(innerDigest, outerPad.length);
  return sha256(outerMessage);
}

async function signHmacSha256(signingInput: string, secret: string): Promise<Uint8Array> {
  const message = utf8Encoder.encode(signingInput);
  const keyBytes = utf8Encoder.encode(secret);
  if (globalThis.crypto?.subtle) {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  }
  return hmacSha256(message, keyBytes);
}

async function verifyHmacSha256(signingInput: string, secret: string, expected: Uint8Array): Promise<boolean> {
  const actual = await signHmacSha256(signingInput, secret);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
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
  const signature = await signHmacSha256(signingInput, secret);
  return `${signingInput}.${encodeBytesBase64Url(signature)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<boolean> {
  if (!secret) throw new Error('请填写 HS256 签名密钥');
  const decoded = decodeJwt(token);
  if (decoded.header.alg !== 'HS256') {
    throw new Error('当前仅支持验证 HS256 签名');
  }
  const signingInput = `${decoded.encodedHeader}.${decoded.encodedPayload}`;
  const signature = decodeBase64UrlBytes(decoded.signature);
  return verifyHmacSha256(signingInput, secret, signature);
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
