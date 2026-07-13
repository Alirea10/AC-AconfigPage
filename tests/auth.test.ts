import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTH_PROFILE_STORAGE_KEY,
  LEGACY_AUTH_TOKEN_KEY,
  createDefaultJwtHeader,
  createDefaultJwtPayload,
  decodeJwt,
  encodeJwt,
  loadAuthProfileState,
  profileFromToken,
  saveAuthProfileState,
  upsertAuthProfile,
  verifyJwt,
} from '../src/auth.ts';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test('default payload uses current Unix time and expires exactly three days later', () => {
  const payload = createDefaultJwtPayload(1_700_000_000_999);
  assert.equal(payload.iat, 1_700_000_000);
  assert.equal(payload.exp, payload.iat + 259_200);
  assert.equal(payload.appid, 'A.L.I.R.E.A');
  assert.equal(payload.user_id, '');
  assert.equal(payload.nickname, '');
});

test('HS256 signing round-trips Unicode payloads and rejects the wrong secret', async () => {
  const payload = {
    ...createDefaultJwtPayload(1_700_000_000_000),
    user_id: '10001',
    nickname: '测试用户',
    role: '管理员',
  };
  const token = await encodeJwt(createDefaultJwtHeader(), payload, 'test-secret');
  const decoded = decodeJwt(token);

  assert.equal(decoded.payload.nickname, '测试用户');
  assert.equal(decoded.payload.role, '管理员');
  assert.equal(await verifyJwt(token, 'test-secret'), true);
  assert.equal(await verifyJwt(token, 'wrong-secret'), false);
});

test('verifies a known HS256 compact JWT vector', async () => {
  const token = [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ',
    'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  ].join('.');
  assert.equal(await verifyJwt(token, 'your-256-bit-secret'), true);
});

test('rejects malformed compact JWTs and unsupported signing algorithms', async () => {
  assert.throws(() => decodeJwt('only.two'), /三个非空区块/);
  await assert.rejects(
    encodeJwt(
      { alg: 'none', typ: 'JWT' },
      { ...createDefaultJwtPayload(), user_id: '1', nickname: 'n' },
      'secret',
    ),
    /仅支持 alg 为 HS256/,
  );
});

test('migrates the legacy auth_token into the versioned profile store', async () => {
  const storage = new MemoryStorage();
  const token = await encodeJwt(
    createDefaultJwtHeader(),
    { ...createDefaultJwtPayload(1_700_000_000_000), user_id: 'user-a', nickname: '用户A' },
    'secret',
  );
  storage.setItem(LEGACY_AUTH_TOKEN_KEY, token);

  const state = loadAuthProfileState(storage);
  assert.equal(state.activeUserId, 'user-a');
  assert.equal(state.profiles.length, 1);
  assert.equal(state.profiles[0]?.nickname, '用户A');
  assert.equal(storage.getItem(LEGACY_AUTH_TOKEN_KEY), null);
  assert.ok(storage.getItem(AUTH_PROFILE_STORAGE_KEY));
});

test('upserts one token per user and never persists a signing secret field', async () => {
  const storage = new MemoryStorage();
  const firstToken = await encodeJwt(
    createDefaultJwtHeader(),
    { ...createDefaultJwtPayload(1_700_000_000_000), user_id: 'same-user', nickname: '旧昵称' },
    'secret',
  );
  const secondToken = await encodeJwt(
    createDefaultJwtHeader(),
    { ...createDefaultJwtPayload(1_700_100_000_000), user_id: 'same-user', nickname: '新昵称' },
    'secret',
  );

  let state = upsertAuthProfile(
    { version: 1, activeUserId: null, profiles: [] },
    profileFromToken(firstToken, 1),
    true,
  );
  state = upsertAuthProfile(state, profileFromToken(secondToken, 2), false);
  saveAuthProfileState(storage, state);

  assert.equal(state.profiles.length, 1);
  assert.equal(state.profiles[0]?.nickname, '新昵称');
  assert.equal(state.activeUserId, 'same-user');
  assert.doesNotMatch(storage.getItem(AUTH_PROFILE_STORAGE_KEY) ?? '', /secret/i);
});

test('recovers safely from corrupt profile storage', () => {
  const storage = new MemoryStorage();
  storage.setItem(AUTH_PROFILE_STORAGE_KEY, '{not-json');
  assert.deepEqual(loadAuthProfileState(storage), {
    version: 1,
    activeUserId: null,
    profiles: [],
  });
});
