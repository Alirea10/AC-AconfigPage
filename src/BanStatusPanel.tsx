import type { BanStatus, BondItem, ChessItem } from './api';

interface BanStatusPanelProps {
  banStatus?: BanStatus;
  chessList?: {
    chars: ChessItem[];
    traps: ChessItem[];
    bonds: BondItem[];
  };
}

export function BanStatusPanel({ banStatus, chessList }: BanStatusPanelProps) {
  const charById = new Map((chessList?.chars ?? []).map((item) => [item.chessId, item]));
  const bondById = new Map((chessList?.bonds ?? []).map((item) => [item.bondId, item]));

  return (
    <section class="ban-status-panel">
      <div class="ban-status-heading">
        <div>
          <span>CURRENT_MATCH_BANS</span>
          <h4>当前战局已禁用角色</h4>
        </div>
        {banStatus && <strong>{banStatus.bannedCharacters.length} 名</strong>}
      </div>

      {!banStatus ? (
        <div class="ban-status-placeholder">
          <span class="ban-placeholder-icon">◌</span>
          <div>
            <strong>等待后端接口接入</strong>
            <p>此位置已预留；后端在实时状态中返回 banStatus 后会自动显示角色和禁用原因。</p>
          </div>
        </div>
      ) : banStatus.bannedCharacters.length === 0 ? (
        <div class="ban-status-empty">本局没有禁用角色</div>
      ) : (
        <div class="ban-character-grid">
          {banStatus.bannedCharacters.map((entry) => {
            const character = charById.get(entry.chessId);
            const name = character?.name || character?.charId || entry.chessId;
            return (
              <article class="ban-character-card" key={entry.chessId}>
                <div class="ban-character-mark">BAN</div>
                <div class="ban-character-copy">
                  <strong>{name}</strong>
                  <code>{entry.chessId}</code>
                  <div class="ban-reason-list">
                    {entry.reasonBondIds.map((bondId) => (
                      <span key={bondId}>{bondById.get(bondId)?.name || bondId}</span>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {banStatus && banStatus.bannedBondIds.length > 0 && (
        <div class="ban-bond-summary">
          <span>本局禁用羁绊</span>
          {banStatus.bannedBondIds.map((bondId) => (
            <code key={bondId}>{bondById.get(bondId)?.name || bondId}</code>
          ))}
        </div>
      )}
    </section>
  );
}
