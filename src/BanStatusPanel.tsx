import { useEffect, useId, useState } from 'preact/hooks';
import type { BanStatus, BondItem, ChessItem } from './api';
import { groupBanStatus } from './banStatusGroups';

/**
 * PRTS 的干员头像文件遵循“头像_干员名.png”命名。MediaWiki 文件存储路径
 * 使用该 UTF-8 文件名 MD5 的第 1 位和前 2 位作目录，例如示例头像为 /c/c0/。
 */
export function getPrtsOperatorAvatarUrl(name: string): string {
  const filename = `头像_${name}.png`;
  const hash = md5(filename);
  return `https://media.prts.wiki/${hash.slice(0, 1)}/${hash.slice(0, 2)}/${encodeURIComponent(filename)}`;
}

function md5(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const words: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] = (words[index >> 2] ?? 0) | (bytes[index] << ((index % 4) * 8));
  }
  const bitLength = bytes.length * 8;
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (bitLength % 32));
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  const rotateLeft = (number: number, amount: number) => (number << amount) | (number >>> (32 - amount));
  const add = (x: number, y: number) => (x + y) | 0;
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  for (let offset = 0; offset < words.length; offset += 16) {
    const originalA = a;
    const originalB = b;
    const originalC = c;
    const originalD = d;
    for (let index = 0; index < 64; index += 1) {
      let f: number;
      let g: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const constant = Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) | 0;
      const nextD = d;
      d = c;
      c = b;
      b = add(b, rotateLeft(add(add(a, f), add(constant, words[offset + g] ?? 0)), shifts[index]));
      a = nextD;
    }
    a = add(a, originalA);
    b = add(b, originalB);
    c = add(c, originalC);
    d = add(d, originalD);
  }

  return [a, b, c, d]
    .flatMap((word) => Array.from({ length: 4 }, (_, index) => ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, '0')))
    .join('');
}

interface BanStatusPanelProps {
  banStatus?: BanStatus;
  chessList?: {
    chars: ChessItem[];
    traps: ChessItem[];
    bonds: BondItem[];
  };
}

function OperatorAvatar({ name }: { name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (loaded) return undefined;
    const timeoutId = window.setTimeout(() => setExpired(true), 60_000);
    return () => window.clearTimeout(timeoutId);
  }, [loaded]);

  return (
    <span class="ban-character-avatar">
      <span aria-hidden="true">{name.slice(0, 1)}</span>
      <img
        class={loaded && !expired ? 'is-loaded' : ''}
        src={getPrtsOperatorAvatarUrl(name)}
        alt={`${name}头像`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setExpired(true)}
      />
    </span>
  );
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
                            <OperatorAvatar name={name} />
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
