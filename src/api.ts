export interface TurnTimeLimitSettings {
  prepareEnabled: boolean;
  prepareTimeLimit: number;
  spPrepareEnabled: boolean;
  spPrepareTimeLimit: number;
  bossBattleEnabled: boolean;
  bossBattleTimeLimit: number;
  normalBattleEnabled: boolean;
  normalBattleTimeLimit: number;
}

export interface Settings {
  turnTimeLimitSettings: TurnTimeLimitSettings;
  isSharedPoolEnabled: boolean;
  enabledMaps: string[];
  nameCardSkinId: string;
  secretary: string;
  isRoomVisibleInLobby: boolean;
  allowMoreThanFourPlayers: boolean;
  allowDuplicateStrategySelection: boolean;
  /** 玩家选择的赛季 ID */
  seasonId: string;
}

export interface SettingsResponse {
  settings: Settings;
}

export interface SeasonMeta {
  id: string;
  name: string;
  ownerId: string;
  crc32: number;
  createdAt: number;
  updatedAt: number;
  isBuiltin: boolean;
}

const BASE_URL = import.meta.env.PROD ? '' : '/api';

export const fetchSettings = async (jwt: string): Promise<Settings> => {
  const response = await fetch(`${BASE_URL}/user/settings?jwt=${jwt}`);
  if (!response.ok) throw new Error('Authentication Failed');
  const data: SettingsResponse = await response.json();
  return data.settings;
};

export const updateSetting = async (jwt: string, key: keyof Settings, value: any): Promise<Settings> => {
  const response = await fetch(`${BASE_URL}/user/settings/update?jwt=${jwt}&key=${key}&value=${encodeURIComponent(JSON.stringify(value))}`);
  if (!response.ok) throw new Error('Update Failed');
  const data: SettingsResponse = await response.json();
  return data.settings;
};

/** 获取所有可用的赛季列表（内置 + 所有人上传的自定义赛季） */
export const fetchSeasons = async (jwt: string): Promise<SeasonMeta[]> => {
  const response = await fetch(`${BASE_URL}/seasons?jwt=${jwt}`);
  if (!response.ok) throw new Error('Failed to fetch seasons');
  const data = await response.json();
  return data.seasons;
};

/** 上传/替换当前用户的自定义赛季（每人只有一个，ID 由服务端生成） */
export const uploadSeason = async (jwt: string, name: string, data: any): Promise<{ id: string; crc32: number }> => {
  const response = await fetch(`${BASE_URL}/seasons?jwt=${jwt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Upload failed');
  }
  return response.json();
};

/** 删除当前用户自己上传的自定义赛季 */
export const deleteSeason = async (jwt: string): Promise<void> => {
  const response = await fetch(`${BASE_URL}/seasons?jwt=${jwt}`, { method: 'DELETE' });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Delete failed');
  }
};

// ─── 作弊 API ──────────────────────────────────────────────────────────────

export interface CheatPlayer {
  uid: string;
  userId: string;
  nickName: string;
  uidIndex: number;
  hp: number | null;
  coin: number | null;
  round: number | null;
  shopLevel: number | null;
  charChessCount: number;
  bondStacks: Record<string, number>;
  state: string | null;
}

export interface CheatConnection {
  userId: string | null;
  nickname: string | null;
  teamId: string;
  teamState: string;
  inBattle: boolean;
  round: number | null;
  isAdmin: boolean;
  players: CheatPlayer[];
}

export interface ChessItem {
  chessId: string;
  charId?: string | null;
  name?: string | null;
  itemType?: 'EQUIP' | 'MAGIC';
  identifier: number;
}

export interface BondItem {
  bondId: string;
  name: string;
  identifier: number;
}

export type CheatAction = 'SET_COIN' | 'SET_HP' | 'SET_ROUND' | 'SET_BOND_STACK' | 'ADD_CHESS' | 'FORCE_END_PHASE' | 'FORCE_LOGIN' | 'DISSOLVE_TEAM';

/** 获取所有在线连接及其战斗状态 */
export const fetchCheatStatus = async (jwt: string): Promise<CheatConnection[]> => {
  const response = await fetch(`${BASE_URL}/cheat/status?jwt=${jwt}`);
  if (!response.ok) throw new Error('Failed to fetch cheat status');
  const data = await response.json();
  return data.connections;
};

export const subscribeCheatStatus = (
  jwt: string,
  onStatus: (connections: CheatConnection[]) => void,
  onError: (message: string) => void,
): EventSource => {
  const source = new EventSource(`${BASE_URL}/cheat/status/stream?jwt=${jwt}`);
  source.addEventListener('status', (event) => {
    const data = JSON.parse((event as MessageEvent<string>).data) as { connections: CheatConnection[] };
    onStatus(data.connections);
  });
  source.onerror = () => {
    onError('Cheat status stream disconnected, reconnecting...');
  };
  source.onopen = () => {
    onError('');
  };
  return source;
};

/** 获取指定 team 的赛季棋子和盟约列表 */
export const fetchChessList = async (jwt: string, teamId: string): Promise<{ chars: ChessItem[]; traps: ChessItem[]; bonds: BondItem[] }> => {
  const response = await fetch(`${BASE_URL}/cheat/chess-list?jwt=${jwt}&teamId=${encodeURIComponent(teamId)}`);
  if (!response.ok) throw new Error('Failed to fetch chess list');
  return response.json();
};

// ─── 结算 API ──────────────────────────────────────────────────────────────

export interface SettlementEquip {
  instId: number;
  charId: string;
}

export interface SettlementOnBoardChar {
  instId: number;
  charId: string;
  x: number;
  y: number;
  equips: SettlementEquip[];
}

export interface SettlementCharacter {
  charId: string;
  totalDamage: number;
  buckets: number[];
}

export interface SettlementBond {
  bondId: string;
  layer: number;
}

export interface SettlementPlayer {
  uid: string;
  nickName: string;
  uidIndex: number;
  totalDamage: number;
  damagePercentage: number;
  characters: SettlementCharacter[];
  onBoardChars: SettlementOnBoardChar[];
  bonds: SettlementBond[];
}

export interface Settlement {
  teamId: string;
  seasonId: string;
  modeId: string;
  bossId: string;
  bossHpMax: number;
  bossStartTime: number;
  bossEndTime: number;
  durationMs: number;
  bucketIntervalMs: number;
  players: SettlementPlayer[];
}

export interface SettlementSummary {
  teamId: string;
  modeId: string;
  bossIds: string[];
  savedAt: number;
  playerCount: number;
  durationMs: number;
}

export interface SettlementListResponse {
  settlements: SettlementSummary[];
}

export interface TeamSettlementsResponse {
  settlements: Settlement[];
}

export const fetchLatestSettlement = async (jwt: string): Promise<Settlement> => {
  const response = await fetch(`${BASE_URL}/settlement/latest?jwt=${jwt}`);
  if (!response.ok) throw new Error('Failed to fetch latest settlement');
  return response.json();
};

export const fetchSettlementByTeamId = async (jwt: string, teamId: string): Promise<Settlement[]> => {
  const response = await fetch(`${BASE_URL}/settlement/${encodeURIComponent(teamId)}?jwt=${jwt}`);
  if (!response.ok) throw new Error('Failed to fetch settlement');
  const data: TeamSettlementsResponse = await response.json();
  return data.settlements;
};

export const fetchSettlements = async (jwt: string): Promise<SettlementSummary[]> => {
  const response = await fetch(`${BASE_URL}/settlements?jwt=${jwt}`);
  if (!response.ok) throw new Error('Failed to fetch settlements');
  const data: SettlementListResponse = await response.json();
  return data.settlements;
};

// ─── 快照回滚 API ──────────────────────────────────────────────────────────

export interface SnapshotMeta {
  key: string;
  teamId: string;
  ts: number;
  round: number;
  sceneState: string;
}

export interface TeamInfo {
  teamId: string;
  state: string;
  round: number | null;
  sceneState: string | null;
  playerCount: number;
  isAdmin: boolean;
  players: { uid: string; nickName: string; hp: number | null }[];
}

export const fetchTeams = async (jwt: string): Promise<TeamInfo[]> => {
  const response = await fetch(`${BASE_URL}/cheat/teams?jwt=${jwt}`);
  if (!response.ok) throw new Error('Failed to fetch teams');
  const data = await response.json();
  return data.teams;
};

export const fetchSnapshots = async (jwt: string, teamId: string): Promise<SnapshotMeta[]> => {
  const response = await fetch(`${BASE_URL}/cheat/snapshots?jwt=${jwt}&teamId=${encodeURIComponent(teamId)}`);
  if (!response.ok) throw new Error('Failed to fetch snapshots');
  const data = await response.json();
  return data.snapshots;
};

export const rollbackToSnapshot = async (jwt: string, teamId: string, snapshotKey: string): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${BASE_URL}/cheat/rollback?jwt=${jwt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, snapshotKey }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Rollback failed');
  }
  return response.json();
};

export const downloadSnapshot = async (jwt: string, snapshotKey: string): Promise<Blob> => {
  const response = await fetch(`${BASE_URL}/cheat/snapshot/export?jwt=${jwt}&snapshotKey=${encodeURIComponent(snapshotKey)}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Snapshot download failed');
  }
  return response.blob();
};

export const importSnapshot = async (jwt: string, teamId: string, file: File): Promise<{ success: boolean; message: string }> => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

  const response = await fetch(`${BASE_URL}/cheat/snapshot/import?jwt=${jwt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamId,
      payloadBase64: btoa(binary),
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Snapshot import failed');
  }
  return response.json();
};

/** 踢出指定玩家 */
export const kickPlayer = async (jwt: string, userId: string): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${BASE_URL}/kick?jwt=${jwt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Kick failed');
  }
  return response.json();
};

/** 执行作弊操作（只操作自己的角色/队伍） */
export const executeCheatAction = async (
  jwt: string,
  action: CheatAction,
  value?: any,
  teamId?: string,
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${BASE_URL}/cheat/action?jwt=${jwt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, value, teamId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Action failed');
  }
  return response.json();
};
