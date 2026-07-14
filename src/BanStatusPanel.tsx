import { useId, useState } from 'preact/hooks';
import type { BanStatus, BondItem, ChessItem } from './api';
import { groupBanStatus } from './banStatusGroups';

interface BanStatusPanelProps {
  banStatus?: BanStatus;
  chessList?: {
    chars: ChessItem[];
    traps: ChessItem[];
    bonds: BondItem[];
  };
}

export function BanStatusPanel({ banStatus, chessList }: BanStatusPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const charById = new Map((chessList?.chars ?? []).map((item) => [item.chessId, item]));
  const bondById = new Map((chessList?.bonds ?? []).map((item) => [item.bondId, item]));
  const bondGroups = banStatus ? groupBanStatus(banStatus) : [];

  return (
    <section class={`ban-status-panel ${expanded ? 'expanded' : 'collapsed'}`}>
      <button
        type="button"
        class="ban-status-heading ban-status-toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        title={expanded ? '折叠本局禁用信息' : '展开本局禁用信息'}
        onClick={() => setExpanded((current) => !current)}
      >
        <div>
          <span>CURRENT_MATCH_BANS</span>
          <h4>本局禁用盟约与干员</h4>
        </div>
        <div class="ban-status-heading-actions">
          {banStatus && (
            <div class="ban-status-count">
              <strong>{bondGroups.length} 个盟约</strong>
              <span>{banStatus.bannedCharacters.length} 名角色</span>
            </div>
          )}
          <span class="ban-status-toggle-label" aria-hidden="true">
            {expanded ? '收起' : '展开'}
          </span>
        </div>
      </button>

      <div class="ban-status-content" id={contentId} hidden={!expanded}>
        {!banStatus ? (
          <div class="ban-status-placeholder">
            <span class="ban-placeholder-icon">◌</span>
            <div>
              <strong>等待后端接口接入</strong>
              <p>此位置已预留；后端在实时状态中返回 banStatus 后会自动显示角色和禁用原因。</p>
            </div>
          </div>
        ) : bondGroups.length === 0 ? (
          <div class="ban-status-empty">本局没有禁用盟约或角色</div>
        ) : (
          <div class="ban-bond-groups">
            {bondGroups.map((group, groupIndex) => {
              const bond = bondById.get(group.bondId);
              const bondName = bond?.name || group.bondId;
              return (
                <article class="ban-bond-group" key={group.bondId}>
                  <div class="ban-bond-identity">
                    <span class="ban-bond-sequence">{String(groupIndex + 1).padStart(2, '0')}</span>
                    <span class="ban-bond-emblem" aria-hidden="true">{bondName.slice(0, 1)}</span>
                    <strong>{bondName}</strong>
                    <code>{group.bondId}</code>
                  </div>
                  <div class="ban-group-characters">
                    {group.characters.length === 0 ? (
                      <span class="ban-group-empty">无完全禁用角色</span>
                    ) : (
                      group.characters.map((entry) => {
                        const character = charById.get(entry.chessId);
                        const name = character?.name || character?.charId || entry.chessId;
                        return (
                          <div
                            class="ban-character-chip"
                            key={`${group.bondId}:${entry.chessId}`}
                            title={`${name} · ${entry.chessId}`}
                          >
                            <span class="ban-character-avatar" aria-hidden="true">
                              {name.slice(0, 1)}
                            </span>
                            <span class="ban-character-label">
                              <strong>{name}</strong>
                              <code>{entry.chessId}</code>
                            </span>
                            <span class="ban-character-cross" aria-label="已禁用">×</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
