export interface Settings {
  isTurnTimeLimitEnabled: boolean;
  turnTimeLimit: number;
  isSharedPoolEnabled: boolean;
  enabledMaps: string[];
  nameCardSkinId: string;
  secretary: string;
  isRoomVisibleInLobby: boolean;
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

const BASE_URL = '/api';

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
  userId: string;
  nickname: string;
  teamId: string;
  teamState: string;
  inBattle: boolean;
  round: number | null;
  players: CheatPlayer[];
}

export interface ChessItem {
  chessId: string;
  identifier: number;
}

export interface BondItem {
  bondId: string;
  name: string;
  identifier: number;
}

export type CheatAction = 'SET_COIN' | 'SET_HP' | 'SET_ROUND' | 'SET_BOND_STACK' | 'ADD_CHESS' | 'FORCE_LOGIN' | 'DISSOLVE_TEAM';

/** 获取所有在线连接及其战斗状态 */
export const fetchCheatStatus = async (jwt: string): Promise<CheatConnection[]> => {
  const response = await fetch(`${BASE_URL}/cheat/status?jwt=${jwt}`);
  if (!response.ok) throw new Error('Failed to fetch cheat status');
  const data = await response.json();
  return data.connections;
};

/** 获取指定 team 的赛季棋子和盟约列表 */
export const fetchChessList = async (jwt: string, teamId: string): Promise<{ chars: ChessItem[]; traps: ChessItem[]; bonds: BondItem[] }> => {
  const response = await fetch(`${BASE_URL}/cheat/chess-list?jwt=${jwt}&teamId=${encodeURIComponent(teamId)}`);
  if (!response.ok) throw new Error('Failed to fetch chess list');
  return response.json();
};

/** 执行作弊操作（只操作自己的角色/队伍） */
export const executeCheatAction = async (
  jwt: string,
  action: CheatAction,
  value?: any,
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${BASE_URL}/cheat/action?jwt=${jwt}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, value }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || 'Action failed');
  }
  return response.json();
};
