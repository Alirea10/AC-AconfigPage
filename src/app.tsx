import { useState, useEffect, useRef } from 'preact/hooks';
import { ArrowLeft20Regular, ChevronRight20Regular, Heart20Regular, WeatherSunny20Regular } from '@fluentui/react-icons';
import './app.css';
import { type Settings, type SeasonMeta, fetchSettings, updateSetting, fetchSeasons, uploadSeason, deleteSeason, fetchCheatStatus, subscribeCheatStatus, fetchChessList, executeCheatAction, kickPlayer, type CheatConnection, type ChessItem, type BondItem, fetchTeams, fetchSnapshots, rollbackToSnapshot, downloadSnapshot, importSnapshot, type TeamInfo, type SnapshotMeta } from './api';
import { CHARACTER_NAME_MAP, MAPS, NAME_CARDS } from './constants';
import { SecretarySelector } from './SecretarySelector';
import { SettlementView } from './SettlementView';
import { AccountCenter } from './AccountCenter';
import { BanStatusPanel } from './BanStatusPanel';
import {
  type AuthProfileState,
  type JwtPayload,
  decodeJwt,
  loadAuthProfileState,
  profileFromToken,
  removeAuthProfile,
  saveAuthProfileState,
  upsertAuthProfile,
} from './auth';

const ORANGE_ASSETS = ['4', '6', '7', '10', '15', '18', '19', '20', '25', '28', '33', '36'];

function shuffleOrangeAssets() {
  const items = [...ORANGE_ASSETS];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function orangeMemeSrc(name: string) {
  return `/orange/${name}.webp`;
}

function createFallingStickers(count: number) {
  const shuffled = shuffleOrangeAssets();
  return Array.from({ length: count }, (_, i) => {
    const name = shuffled[i % shuffled.length];
    const laneWidth = 100 / count;
    const laneCenter = laneWidth * i + laneWidth / 2;
    const jitter = (Math.random() - 0.5) * laneWidth * 0.42;
    const band = i % 4;
    const baseAngles = [-66, -24, 28, 64];
    const rotate = Math.max(-75, Math.min(75, baseAngles[band] + Math.round((Math.random() - 0.5) * 18)));
    const spin = (i % 2 === 0 ? 1 : -1) * Math.round(34 + Math.random() * 28);
    return {
      id: `${name}-${i}`,
      src: `/orange/${name}.webp`,
      left: Number(Math.max(2, Math.min(94, laneCenter + jitter)).toFixed(2)),
      size: Math.round(74 + Math.random() * 78),
      rotate,
      spin,
      drift: Math.round(-34 + Math.random() * 68),
      duration: Math.round(62 + Math.random() * 34),
      delay: Math.round(-(i / count) * 72 - Math.random() * 10),
      opacity: Number((0.16 + Math.random() * 0.2).toFixed(2)),
    };
  });
}

type FallingSticker = ReturnType<typeof createFallingStickers>[number];

type PermissionDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function limitVector(x: number, y: number, max: number) {
  const length = Math.hypot(x, y);
  if (length <= max || length === 0) return { x, y };
  const scale = max / length;
  return { x: x * scale, y: y * scale };
}

function OrangeStickerLayer({ stickers, active }: { stickers: FallingSticker[]; active: boolean }) {
  const motionRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    homeX: number;
    homeY: number;
    vx: number;
    vy: number;
    angle: number;
    angularVelocity: number;
    mass: number;
    fallSpeed: number;
  }>>([]);
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const gyroRef = useRef({ x: 0, y: 0 });
  const activeRef = useRef(active);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const resetParticles = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      particlesRef.current = stickers.map((sticker, index) => ({
        x: width * (sticker.left / 100),
        y: ((index / stickers.length) * height * 1.35) - height * 0.28,
        homeX: width * (sticker.left / 100),
        homeY: ((index / stickers.length) * height * 1.35) - height * 0.28,
        vx: (Math.random() - 0.5) * 18,
        vy: 12 + Math.random() * 18,
        angle: clamp(sticker.rotate, -90, 90),
        angularVelocity: sticker.spin * 0.006,
        mass: 0.82 + sticker.size / 190,
        fallSpeed: 8 + (sticker.duration % 11),
      }));
    };

    resetParticles();

    const applyTransform = (index: number) => {
      const particle = particlesRef.current[index];
      const node = motionRefs.current[index];
      if (!particle || !node) return;

      const sticker = stickers[index];
      const scale = sticker ? 0.96 + (sticker.size % 17) / 180 : 1;
      node.style.transform = `translate3d(${particle.x.toFixed(2)}px, ${particle.y.toFixed(2)}px, 0) rotate(${particle.angle.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    };

    const tick = (time: number) => {
      const previous = lastTimeRef.current ?? time;
      const dt = clamp((time - previous) / 1000, 0.001, 0.034);
      lastTimeRef.current = time;

      if (activeRef.current) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const fieldRadius = Math.min(Math.max(width, height) * 0.22, 260);
        const pointer = pointerRef.current;
        const gyro = gyroRef.current;
        const spring = 1.45;
        const maxSpeed = 170;

        particlesRef.current.forEach((particle, index) => {
          const sticker = stickers[index];
          const size = sticker?.size ?? 100;
          particle.homeY += particle.fallSpeed * dt;
          particle.homeX += Math.sin((time * 0.00018) + index * 1.7) * 0.18;

          if (particle.homeY > height + size + 80) {
            particle.homeY = -size - Math.random() * height * 0.16;
            particle.homeX = width * (((sticker?.left ?? 50) + (Math.random() - 0.5) * 8) / 100);
            particle.x = particle.homeX + (Math.random() - 0.5) * 18;
            particle.y = particle.homeY;
            particle.vx *= 0.25;
            particle.vy = 10 + Math.random() * 18;
          }

          let ax = (particle.homeX - particle.x) * spring + gyro.x * 24;
          let ay = (particle.homeY - particle.y) * spring + gyro.y * 18;

          if (pointer.active) {
            const centerX = particle.x + size * 0.5;
            const centerY = particle.y + size * 0.5;
            const dx = centerX - pointer.x;
            const dy = centerY - pointer.y;
            const distance = Math.hypot(dx, dy) || 1;

            if (distance < fieldRadius) {
              const falloff = (1 - distance / fieldRadius) ** 2;
              const force = (1850 * falloff) / particle.mass;
              const nx = dx / distance;
              const ny = dy / distance;
              ax += nx * force;
              ay += ny * force;
              particle.angularVelocity += (nx * particle.vy - ny * particle.vx) * 0.00022 * falloff;
            }
          }

          particle.vx = (particle.vx + ax * dt) * 0.965;
          particle.vy = (particle.vy + ay * dt) * 0.972;
          particle.angularVelocity *= 0.965;

          const limited = limitVector(particle.vx, particle.vy, maxSpeed);
          particle.vx = limited.x;
          particle.vy = limited.y;

          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.angle += particle.angularVelocity * dt * 60;

          if (particle.angle > 90) {
            particle.angle = 90;
            particle.angularVelocity = Math.min(0, particle.angularVelocity) * 0.35;
          } else if (particle.angle < -90) {
            particle.angle = -90;
            particle.angularVelocity = Math.max(0, particle.angularVelocity) * 0.35;
          }
        });

        for (let i = 0; i < particlesRef.current.length; i += 1) {
          const a = particlesRef.current[i];
          const aSize = stickers[i]?.size ?? 100;
          if (!a) continue;

          for (let j = i + 1; j < particlesRef.current.length; j += 1) {
            const b = particlesRef.current[j];
            const bSize = stickers[j]?.size ?? 100;
            if (!b) continue;

            const ax = a.x + aSize * 0.5;
            const ay = a.y + aSize * 0.5;
            const bx = b.x + bSize * 0.5;
            const by = b.y + bSize * 0.5;
            const dx = bx - ax;
            const dy = by - ay;
            const distance = Math.hypot(dx, dy) || 1;
            const minDistance = (aSize + bSize) * 0.34;
            const overlap = minDistance - distance;

            if (overlap > 0) {
              const nx = dx / distance;
              const ny = dy / distance;
              const totalMass = a.mass + b.mass;
              const aShare = b.mass / totalMass;
              const bShare = a.mass / totalMass;
              const separation = overlap * 0.58;

              a.x -= nx * separation * aShare;
              a.y -= ny * separation * aShare;
              b.x += nx * separation * bShare;
              b.y += ny * separation * bShare;

              const relativeVelocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
              if (relativeVelocity < 0) {
                const impulse = relativeVelocity * -0.42;
                a.vx -= nx * impulse * aShare;
                a.vy -= ny * impulse * aShare;
                b.vx += nx * impulse * bShare;
                b.vy += ny * impulse * bShare;
              }

              a.angularVelocity -= ny * 0.03;
              b.angularVelocity += nx * 0.03;
            }
          }
        }

        particlesRef.current.forEach((particle, index) => {
          const sticker = stickers[index];
          const size = sticker?.size ?? 100;

          if (particle.x < -size - 80) {
            particle.x = -size - 80;
            particle.vx = Math.abs(particle.vx) * 0.36;
          } else if (particle.x > width + 80) {
            particle.x = width + 80;
            particle.vx = -Math.abs(particle.vx) * 0.36;
          }

          if (particle.y > height + size + 100) {
            particle.y = height + size + 100;
            particle.vy = -Math.abs(particle.vy) * 0.22;
          }

          const limited = limitVector(particle.vx, particle.vy, maxSpeed);
          particle.vx = limited.x;
          particle.vy = limited.y;
          particle.angle = clamp(particle.angle, -90, 90);
          applyTransform(index);
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    stickers.forEach((_, index) => applyTransform(index));
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
    };
  }, [stickers]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY, active: true };
    };

    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma === null && event.beta === null) return;
      gyroRef.current = {
        x: clamp((event.gamma ?? 0) / 32, -1, 1),
        y: clamp(((event.beta ?? 0) - 45) / 42, -1, 1),
      };
    };

    const requestOrientationPermission = () => {
      const OrientationEvent = DeviceOrientationEvent as PermissionDeviceOrientationEvent;
      void OrientationEvent.requestPermission?.().then((state) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
        }
      }).catch(() => undefined);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('touchstart', requestOrientationPermission, { once: true, passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('deviceorientation', handleOrientation);
      window.removeEventListener('touchstart', requestOrientationPermission);
    };
  }, []);

  return (
    <div class="orange-sticker-layer" aria-hidden="true">
      {stickers.map((sticker, index) => (
        <span
          key={sticker.id}
          ref={(node) => { motionRefs.current[index] = node; }}
          class="orange-sticker-motion"
          style={{
            width: `${sticker.size}px`,
            '--sticker-opacity': sticker.opacity,
          } as preact.JSX.CSSProperties}
        >
          <img
            class="orange-sticker"
            src={sticker.src}
            alt=""
          />
        </span>
      ))}
    </div>
  );
}

function DeferredNumberInput({
  value,
  min,
  max,
  disabled,
  className,
  style,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  style?: preact.JSX.CSSProperties;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseInt(draft, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }

    const next = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
    if (next !== value) onCommit(next);
    if (String(next) !== draft) setDraft(String(next));
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      class={className}
      style={style}
      value={draft}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        }
      }}
      disabled={disabled}
    />
  );
}

function SettingsSectionItem({
  title,
  code,
  description,
  iconSrc,
  onClick,
}: {
  title: preact.ComponentChildren;
  code?: preact.ComponentChildren;
  description: preact.ComponentChildren;
  iconSrc?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" class="settings-section-item dashboard-panel" onClick={onClick}>
      <span class="settings-section-leading">
        {iconSrc && <img class="settings-section-avatar" src={iconSrc} alt="" />}
        <span class="settings-section-copy">
          <span class="settings-section-title-row">
            <span class="settings-section-title">{title}</span>
            {code && <span class="settings-section-code">{code}</span>}
          </span>
          <span class="settings-section-description">{description}</span>
        </span>
      </span>
      <span class="settings-section-icon"><ChevronRight20Regular /></span>
    </button>
  );
}

function DashboardDetail({
  title,
  code,
  onBack,
  children,
}: {
  title: preact.ComponentChildren;
  code?: preact.ComponentChildren;
  onBack: () => void;
  children: preact.ComponentChildren;
}) {
  return (
    <section class="cyber-section dashboard-detail dashboard-panel">
      <button type="button" class="detail-back" onClick={onBack}>
        <ArrowLeft20Regular />
        <span>返回</span>
      </button>
      <div class="detail-header">
        <h2>{title}</h2>
        {code && <span>{code}</span>}
      </div>
      <div class="detail-body">{children}</div>
    </section>
  );
}

// ─── 赛季管理组件 ─────────────────────────────────────────────────────────────

function SeasonManager({ jwt, myUserId, currentSeasonId, onSeasonChange }: {
  jwt: string;
  myUserId: string;
  currentSeasonId: string;
  onSeasonChange: (id: string) => void;
}) {
  const [seasons, setSeasons] = useState<SeasonMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingActive, setSettingActive] = useState<string | null>(null);
  const [customExpanded, setCustomExpanded] = useState(false);

  const mySeasonId = `user:${myUserId}`;

  const loadSeasons = async () => {
    if (!jwt) return;
    try {
      setLoading(true);
      setError(null);
      setSeasons(await fetchSeasons(jwt));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSeasons(); }, [jwt]);

  const handleFileUpload = async (e: Event) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const file = form.querySelector<HTMLInputElement>('input[type=file]')?.files?.[0];
    if (!file || !uploadName.trim()) { setUploadError('请填写名称并选择文件'); return; }
    try {
      setUploading(true); setUploadError(null); setUploadSuccess(null);
      const result = await uploadSeason(jwt, uploadName.trim(), JSON.parse(await file.text()));
      setUploadSuccess(`上传成功！CRC32: ${result.crc32 >>> 0}`);
      setUploadName(''); form.reset();
      await loadSeasons();
    } catch (e: any) { setUploadError(e.message); }
    finally { setUploading(false); }
  };

  const handleDelete = async () => {
    if (!confirm('确定要删除你上传的自定义赛季吗？')) return;
    try {
      setDeleting(true);
      await deleteSeason(jwt);
      if (currentSeasonId === mySeasonId) {
        await updateSetting(jwt, 'seasonId', 'act1autochess');
        onSeasonChange('act1autochess');
      }
      await loadSeasons();
    } catch (e: any) { setError(e.message); }
    finally { setDeleting(false); }
  };

  const handleSetActive = async (id: string) => {
    try {
      setSettingActive(id);
      await updateSetting(jwt, 'seasonId', id);
      onSeasonChange(id);
    } catch (e: any) { setError(e.message); }
    finally { setSettingActive(null); }
  };

  const formatTs = (ts: number) =>
    ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const myUploadedSeason = seasons.find(s => s.id === mySeasonId);
  const builtinSeasons = seasons.filter(s => s.isBuiltin);
  const customSeasons = seasons.filter(s => !s.isBuiltin);

  const renderSeasonRow = (s: SeasonMeta) => {
    const isActive = s.id === currentSeasonId;
    const isMine = s.id === mySeasonId;

    return (
      <tr key={s.id} style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: isActive ? 'rgba(255,255,255,0.07)' : undefined,
      }}>
        <td style={{ padding: '6px 8px' }}>
          {s.name}
          {isMine && <span style={{ marginLeft: '6px', fontSize: '0.65rem', opacity: 0.5 }}>（我的）</span>}
          {isActive && <span style={{ marginLeft: '6px', fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 'bold' }}>◆ 当前</span>}
        </td>
        <td style={{ padding: '6px 8px', fontFamily: 'monospace', opacity: 0.6 }}>{s.crc32 >>> 0}</td>
        <td style={{ padding: '6px 8px', opacity: 0.6 }}>{s.isBuiltin ? '内置' : formatTs(s.updatedAt)}</td>
        <td style={{ padding: '6px 8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
          {!isActive && (
            <button class="input-field"
              style={{ cursor: 'pointer', padding: '2px 10px', fontSize: '0.7rem' }}
              onClick={() => handleSetActive(s.id)} disabled={!!settingActive}>
              {settingActive === s.id ? '设置中...' : '设为当前'}
            </button>
          )}
          {isMine && (
            <button class="input-field"
              style={{ cursor: 'pointer', padding: '2px 10px', fontSize: '0.7rem', color: '#ff6b6b', border: '1px solid #ff6b6b' }}
              onClick={handleDelete} disabled={deleting}>
              {deleting ? '删除中...' : '删除'}
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <>
      {loading ? (
        <div style={{ opacity: 0.5, fontSize: '0.8rem' }}>加载中...</div>
      ) : error ? (
        <div style={{ color: '#ff4d4d', fontSize: '0.8rem' }}>{error}</div>
      ) : (
        <div style={{ marginBottom: '20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-primary-dim)', opacity: 0.6 }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>名称</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>CRC32</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>更新时间</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {builtinSeasons.map(renderSeasonRow)}
            </tbody>
          </table>

          <div style={{ marginTop: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              class="input-field"
              style={{ width: '100%', cursor: 'pointer', textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setCustomExpanded(v => !v)}
              type="button"
            >
              <span>非内置版本 ({customSeasons.length})</span>
              <span style={{ opacity: 0.6 }}>{customExpanded ? '▲' : '▼'}</span>
            </button>

            {customExpanded && (
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ fontSize: '0.72rem', color: '#ffaa00', marginBottom: '10px', lineHeight: 1.6 }}>
                  这些不是官服版本，可能会有很多 bug 和未完成的地方。
                </div>

                {customSeasons.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <tbody>
                      {customSeasons.map(renderSeasonRow)}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '0.72rem', opacity: 0.45, marginBottom: '12px' }}>
                    当前还没有非内置版本。
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--color-primary-dim)', paddingTop: '16px', marginTop: '14px' }}>
                  <h3 style={{ fontSize: '0.8rem', marginBottom: '4px', opacity: 0.8 }}>
                    {myUploadedSeason ? '替换我的自定义赛季' : '上传自定义赛季'}
                  </h3>
                  {myUploadedSeason && (
                    <div style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '10px' }}>
                      上传新文件会替换现有的「{myUploadedSeason.name}」
                    </div>
                  )}
                  <form onSubmit={handleFileUpload} style={{ display: 'grid', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '4px' }}>赛季显示名称</div>
                      <input class="input-field" type="text" placeholder="e.g. 我的自定义赛季"
                        value={uploadName} onInput={(e) => setUploadName(e.currentTarget.value)}
                        required style={{ width: '100%' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '4px' }}>赛季 JSON 文件</div>
                      <input class="input-field" type="file" accept=".json" required style={{ width: '100%', cursor: 'pointer' }} />
                    </div>
                    {uploadError && <div style={{ color: '#ff4d4d', fontSize: '0.75rem' }}>{uploadError}</div>}
                    {uploadSuccess && <div style={{ color: 'var(--color-primary)', fontSize: '0.75rem' }}>{uploadSuccess}</div>}
                    <button class="input-field" type="submit" disabled={uploading}
                      style={{ cursor: 'pointer', background: 'var(--color-primary-dim)', fontWeight: 'bold', border: '2px solid var(--color-primary)' }}>
                      {uploading ? '上传中...' : (myUploadedSeason ? '替换赛季' : '上传赛季')}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── 作弊控制台组件 ─────────────────────────────────────────────────────────

const SCENE_STATE_LABELS: Record<string, string> = {
  NONE: '未开始',
  LOADING: '加载中',
  SP_PREPARE: '特殊准备',
  PREPARE: '准备阶段',
  BATTLE: '战斗中',
  HELP_BATTLE: '协防战斗',
  BOSS_BATTLE: 'Boss 战',
  SETTLE: '结算中',
  END: '已结束',
  BATTLE_WAITING: '等待开战',
  BOSS_PREPARE_WAITING: 'Boss 战前等待',
  PREPARE_RESTART: '准备重开',
  SP_PREPARE_RESTART: '特殊准备重开',
  BOSS_BATTLE_RESTART: 'Boss 战重开',
};

function sceneLabel(value: string | null | undefined) {
  return value ? (SCENE_STATE_LABELS[value] || value) : '未知状态';
}

function relativeTime(ts: number) {
  const diffMs = Date.now() - ts;
  if (diffMs <= 0) return '刚刚';
  if (diffMs < 60 * 1000) return `${Math.floor(diffMs / 1000)} 秒前`;
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / 60000)} 分钟前`;
  if (diffMs < 24 * 60 * 60 * 1000) return `${Math.floor(diffMs / 3600000)} 小时前`;
  return `${Math.floor(diffMs / 86400000)} 天前`;
}

function chessDisplayName(item: ChessItem) {
  const fallbackName = item.charId ? CHARACTER_NAME_MAP[item.charId] : undefined;
  const name = item.name || fallbackName || item.chessId;
  return name === item.chessId ? name : `${name} (${item.chessId})`;
}

function CheatConsole({ jwt }: { jwt: string }) {
  const [connections, setConnections] = useState<CheatConnection[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chessListCache, setChessListCache] = useState<Record<string, { chars: ChessItem[]; traps: ChessItem[]; bonds: BondItem[] }>>({});
  const [coinValue, setCoinValue] = useState('');
  const [hpValue, setHpValue] = useState('');
  const [roundValue, setRoundValue] = useState('');
  const [bondId, setBondId] = useState('');
  const [bondCount, setBondCount] = useState('1');
  const [chessId, setChessId] = useState('');
  const [chessSearch, setChessSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ key: string; ok: boolean; msg: string } | null>(null);
  const [kickLoading, setKickLoading] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotMeta[]>>({});
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedConn = connections.find(conn => conn.teamId === selectedTeamId) ?? connections[0] ?? null;
  const selectedTeam = selectedConn?.teamId ?? '';
  const chess = selectedTeam ? chessListCache[selectedTeam] : undefined;
  const isAdminView = connections.some(conn => conn.isAdmin);
  const me = selectedConn?.players.find(p => p.userId === selectedConn.userId) ?? selectedConn?.players[0] ?? null;
  const allChess = chess ? [...chess.chars, ...chess.traps] : [];
  const visibleChess = allChess.filter(item => {
    const text = `${item.chessId} ${item.charId ?? ''} ${item.name ?? ''} ${item.charId ? CHARACTER_NAME_MAP[item.charId] ?? '' : ''}`.toLowerCase();
    return text.includes(chessSearch.trim().toLowerCase());
  }).slice(0, 160);

  const showResult = (key: string, ok: boolean, msg: string) => {
    setActionResult({ key, ok, msg });
    window.setTimeout(() => setActionResult(current => current?.key === key ? null : current), 3200);
  };

  const poll = async () => {
    try {
      const data = await fetchCheatStatus(jwt);
      setConnections(data);
      setSelectedTeamId(prev => prev && data.some(conn => conn.teamId === prev) ? prev : (data[0]?.teamId ?? null));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const loadChessList = async (teamId: string) => {
    if (chessListCache[teamId]) return;
    try {
      const data = await fetchChessList(jwt, teamId);
      setChessListCache(prev => ({ ...prev, [teamId]: data }));
      setBondId(current => current || data.bonds[0]?.bondId || '');
      setChessId(current => current || data.chars[0]?.chessId || data.traps[0]?.chessId || '');
    } catch (e: any) {
      showResult('chess-list', false, e.message);
    }
  };

  const loadSnapshots = async (teamId: string) => {
    try {
      const data = await fetchSnapshots(jwt, teamId);
      setSnapshots(prev => ({ ...prev, [teamId]: data }));
    } catch (e: any) {
      showResult('snapshot', false, e.message);
    }
  };

  useEffect(() => {
    poll();
    const source = subscribeCheatStatus(
      jwt,
      (data) => {
        setConnections(data);
        setSelectedTeamId(prev => prev && data.some(conn => conn.teamId === prev) ? prev : (data[0]?.teamId ?? null));
        setError(null);
      },
      (message) => setError(message || null),
    );
    return () => source.close();
  }, [jwt]);

  useEffect(() => {
    if (!selectedTeam) return;
    loadChessList(selectedTeam);
    loadSnapshots(selectedTeam);
  }, [selectedTeam]);

  const doAction = async (key: string, action: string, value?: any) => {
    if (!selectedTeam) return;
    setActionLoading(key);
    try {
      const result = await executeCheatAction(jwt, action as any, value, selectedTeam);
      showResult(key, true, result.message);
      await poll();
    } catch (e: any) {
      showResult(key, false, e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const doKick = async (userId: string) => {
    setKickLoading(userId);
    try {
      const result = await kickPlayer(jwt, userId);
      showResult(`kick:${userId}`, true, result.message);
      await poll();
    } catch (e: any) {
      showResult(`kick:${userId}`, false, e.message);
    } finally {
      setKickLoading(null);
    }
  };

  const doRollback = async (snapshotKey: string) => {
    if (!selectedTeam) return;
    setRollbackLoading(snapshotKey);
    try {
      const res = await rollbackToSnapshot(jwt, selectedTeam, snapshotKey);
      showResult('snapshot', true, res.message);
      await loadSnapshots(selectedTeam);
    } catch (e: any) {
      showResult('snapshot', false, e.message);
    } finally {
      setRollbackLoading(null);
    }
  };

  const doDownloadSnapshot = async (snapshot: SnapshotMeta) => {
    try {
      setTransferLoading(`download:${snapshot.key}`);
      const blob = await downloadSnapshot(jwt, snapshot.key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `snapshot-r${snapshot.round}-${snapshot.sceneState}-${snapshot.ts}.bin`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showResult('snapshot', true, '快照已下载');
    } catch (e: any) {
      showResult('snapshot', false, e.message);
    } finally {
      setTransferLoading(null);
    }
  };

  const doImportSnapshot = async (file: File) => {
    if (!selectedTeam) return;
    try {
      setTransferLoading(`import:${selectedTeam}`);
      const res = await importSnapshot(jwt, selectedTeam, file);
      showResult('snapshot', true, res.message);
      await loadSnapshots(selectedTeam);
    } catch (e: any) {
      showResult('snapshot', false, e.message);
    } finally {
      setTransferLoading(null);
    }
  };

  if (!selectedConn) {
    return (
      <div class="admin-tools admin-tools-v2">
        <div class="admin-empty">{error ? `连接失败：${error}` : '暂无在线队伍'}</div>
      </div>
    );
  }

  const Result = ({ k }: { k: string }) => (
    actionResult?.key === k ? (
      <span class={`admin-result ${actionResult.ok ? 'ok' : 'bad'}`}>
        {actionResult.ok ? '已完成' : '失败'}：{actionResult.msg}
      </span>
    ) : null
  );

  return (
    <div class="admin-tools admin-tools-v2">
      <div class="admin-hero">
        <div>
          <div class="admin-kicker">{isAdminView ? '管理员视图' : '我的队伍'} · 每 2 秒自动刷新</div>
          <h3>{selectedConn.nickname ?? me?.nickName ?? '当前连接'}</h3>
          <div class="admin-hero-meta">
            <span class={selectedConn.inBattle ? 'live' : ''}>{selectedConn.inBattle ? `对局中 · R${selectedConn.round ?? '-'}` : selectedConn.teamState}</span>
            <span>{selectedConn.players.length} 人在线</span>
            {error && <span class="danger">同步失败：{error}</span>}
          </div>
        </div>
        {isAdminView && connections.length > 1 && (
          <div class="admin-team-tabs" role="tablist" aria-label="选择队伍">
            {connections.map(conn => (
              <button
                key={conn.teamId}
                type="button"
                class={conn.teamId === selectedTeam ? 'active' : ''}
                onClick={() => setSelectedTeamId(conn.teamId)}
              >
                {conn.nickname ?? conn.players[0]?.nickName ?? '队伍'}
                <span>队内 {conn.players.length} 人 · {conn.inBattle ? `R${conn.round ?? '-'}` : conn.teamState}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <BanStatusPanel banStatus={selectedConn.banStatus} chessList={chess} />

      <div class="admin-player-strip">
        {selectedConn.players.map(player => (
          <div class="admin-player-chip" key={player.uid}>
            <strong>{player.nickName}</strong>
            <span>生命 {player.hp ?? '-'}</span>
            <span>金币 {player.coin ?? '-'}</span>
            <span>棋子 {player.charChessCount}</span>
            <button
              type="button"
              disabled={kickLoading === player.userId}
              onClick={() => doKick(player.userId)}
            >
              {kickLoading === player.userId ? '移出中' : '移出'}
            </button>
            <Result k={`kick:${player.userId}`} />
          </div>
        ))}
      </div>

      <div class="admin-grid">
        <section class="admin-command-panel">
          <div class="admin-panel-title">
            <h4>常用调整</h4>
            <span>作用于 {me?.nickName ?? '当前玩家'}</span>
          </div>
          <div class="admin-command-list">
            <label>
              <span>金币</span>
              <input class="input-field" type="number" min="0" max="999" placeholder={String(me?.coin ?? '')} value={coinValue} onInput={e => setCoinValue(e.currentTarget.value)} />
              <button type="button" disabled={actionLoading === 'coin'} onClick={() => doAction('coin', 'SET_COIN', Number(coinValue || 0))}>{actionLoading === 'coin' ? '执行中' : '设置'}</button>
              <Result k="coin" />
            </label>
            <label>
              <span>生命</span>
              <input class="input-field" type="number" min="0" max="9999" placeholder={String(me?.hp ?? '')} value={hpValue} onInput={e => setHpValue(e.currentTarget.value)} />
              <button type="button" disabled={actionLoading === 'hp'} onClick={() => doAction('hp', 'SET_HP', Number(hpValue || 0))}>{actionLoading === 'hp' ? '执行中' : '设置'}</button>
              <Result k="hp" />
            </label>
            <label>
              <span>回合</span>
              <input class="input-field" type="number" min="1" max="15" placeholder={String(selectedConn.round ?? '')} value={roundValue} onInput={e => setRoundValue(e.currentTarget.value)} />
              <button type="button" disabled={actionLoading === 'round'} onClick={() => doAction('round', 'SET_ROUND', Number(roundValue || selectedConn.round || 1))}>{actionLoading === 'round' ? '执行中' : '设置'}</button>
              <Result k="round" />
            </label>
            <label>
              <span>盟约层数</span>
              <select class="select-field" value={bondId} onChange={e => setBondId(e.currentTarget.value)}>
                {chess ? chess.bonds.map(b => <option key={b.bondId} value={b.bondId}>{b.name}</option>) : <option value="">加载中</option>}
              </select>
              <input class="input-field compact" type="number" min="0" max="99" value={bondCount} onInput={e => setBondCount(e.currentTarget.value)} />
              <button type="button" disabled={actionLoading === 'bond'} onClick={() => doAction('bond', 'SET_BOND_STACK', { bondId: bondId || chess?.bonds[0]?.bondId || '', count: Number(bondCount || 1) })}>{actionLoading === 'bond' ? '执行中' : '设置'}</button>
              <Result k="bond" />
            </label>
          </div>
        </section>

        <section class="admin-command-panel">
          <div class="admin-panel-title">
            <h4>添加棋子</h4>
            <span>{chess ? `${chess.chars.length} 名干员 · ${chess.traps.length} 件道具` : '正在读取赛季列表'}</span>
          </div>
          <div class="admin-chess-picker">
            <input class="input-field" value={chessSearch} placeholder="搜索真名、道具名或 ID" onInput={e => setChessSearch(e.currentTarget.value)} />
            <div class="admin-chess-results" role="listbox" aria-label="选择要添加的棋子">
              {!chess ? (
                <div class="admin-chess-empty">加载中</div>
              ) : visibleChess.length === 0 ? (
                <div class="admin-chess-empty">没有匹配的棋子</div>
              ) : visibleChess.map(item => {
                const display = chessDisplayName(item);
                const [name, rawId] = display.endsWith(')') ? display.split(' (') : [display, item.chessId];
                return (
                  <button
                    key={item.chessId}
                    type="button"
                    class={`admin-chess-option ${chessId === item.chessId ? 'active' : ''}`}
                    role="option"
                    aria-selected={chessId === item.chessId}
                    onClick={() => setChessId(item.chessId)}
                  >
                    <span class="admin-chess-type">{item.itemType ? (item.itemType === 'MAGIC' ? '法术' : '道具') : '干员'}</span>
                    <strong>{name}</strong>
                    <small>{rawId.replace(/\)$/, '')}</small>
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={actionLoading === 'chess' || !chessId} onClick={() => doAction('chess', 'ADD_CHESS', chessId || visibleChess[0]?.chessId || '')}>
              {actionLoading === 'chess' ? '添加中' : '添加到备战区'}
            </button>
            <Result k="chess" />
          </div>
        </section>
      </div>

      <section class="admin-command-panel">
        <div class="admin-panel-title">
          <h4>流程控制</h4>
          <span>当前阶段：{sceneLabel(selectedConn.players[0]?.state ?? selectedConn.teamState)}</span>
        </div>
        <div class="admin-danger-actions">
          <button type="button" disabled={actionLoading === 'forceend'} onClick={() => doAction('forceend', 'FORCE_END_PHASE')}>结束当前阶段</button>
          <button type="button" disabled={actionLoading === 'forcelogin'} onClick={() => doAction('forcelogin', 'FORCE_LOGIN')}>退回登录页</button>
          <button type="button" disabled={actionLoading === 'dissolve'} onClick={() => doAction('dissolve', 'DISSOLVE_TEAM')}>解散队伍</button>
          <Result k="forceend" />
          <Result k="forcelogin" />
          <Result k="dissolve" />
        </div>
      </section>

      <section class="admin-command-panel">
        <div class="admin-panel-title">
          <h4>快照</h4>
          <span>{(snapshots[selectedTeam] || []).length} 条可用</span>
        </div>
        <div class="admin-snapshot-toolbar">
          <button type="button" onClick={() => loadSnapshots(selectedTeam)}>刷新</button>
          <button type="button" disabled={transferLoading === `import:${selectedTeam}`} onClick={() => uploadInputRef.current?.click()}>
            {transferLoading === `import:${selectedTeam}` ? '导入中' : '导入快照'}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".bin,application/octet-stream"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = (e.currentTarget as HTMLInputElement).files?.[0];
              if (file) doImportSnapshot(file);
              (e.currentTarget as HTMLInputElement).value = '';
            }}
          />
          <Result k="snapshot" />
        </div>
        <div class="admin-snapshot-list">
          {(snapshots[selectedTeam] || []).slice().sort((a, b) => b.ts - a.ts).length === 0 ? (
            <div class="admin-snapshot-empty">暂无快照</div>
          ) : (
            (snapshots[selectedTeam] || []).slice().sort((a, b) => b.ts - a.ts).map(snapshot => (
              <div class="admin-snapshot-item" key={snapshot.key}>
                <div class="admin-snapshot-meta">
                  <strong>第 {snapshot.round} 回合 · {sceneLabel(snapshot.sceneState)}</strong>
                  <span>{relativeTime(snapshot.ts)}</span>
                  <code>{snapshot.key}</code>
                </div>
                <div class="admin-snapshot-actions">
                  <button type="button" disabled={transferLoading === `download:${snapshot.key}`} onClick={() => doDownloadSnapshot(snapshot)}>
                    {transferLoading === `download:${snapshot.key}` ? '下载中' : '下载'}
                  </button>
                  <button type="button" disabled={rollbackLoading === snapshot.key} onClick={() => doRollback(snapshot.key)}>
                    {rollbackLoading === snapshot.key ? '回滚中' : '回滚'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function LegacyCheatConsole({ jwt }: { jwt: string }) {
  const [connections, setConnections] = useState<CheatConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chessListCache, setChessListCache] = useState<Record<string, { chars: ChessItem[]; traps: ChessItem[]; bonds: BondItem[] }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [coinValue, setCoinValue] = useState<Record<string, string>>({});
  const [hpValue, setHpValue] = useState<Record<string, string>>({});
  const [roundValue, setRoundValue] = useState<Record<string, string>>({});
  const [bondId, setBondId] = useState<Record<string, string>>({});
  const [bondCount, setBondCount] = useState<Record<string, string>>({});
  const [chessId, setChessId] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionResult, setActionResult] = useState<Record<string, { ok: boolean; msg: string } | null>>({});
  const [kickLoading, setKickLoading] = useState<Record<string, boolean>>({});
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotMeta[]>>({});
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState<string | null>(null);
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const poll = async () => {
    try {
      const data = await fetchCheatStatus(jwt);
      setConnections(data);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    poll();
    const source = subscribeCheatStatus(
      jwt,
      (data) => {
        setConnections(data);
        setError(null);
      },
      (message) => setError(message || null),
    );
    return () => source.close();
  }, [jwt]);

  const loadChessList = async (teamId: string) => {
    if (chessListCache[teamId]) return;
    try {
      const data = await fetchChessList(jwt, teamId);
      setChessListCache(prev => ({ ...prev, [teamId]: data }));
    } catch (e: any) {
      console.error('Failed to load chess list', e);
    }
  };

  const toggleExpand = (teamId: string) => {
    setExpanded(prev => {
      const next = { ...prev, [teamId]: !prev[teamId] };
      if (next[teamId]) {
        loadChessList(teamId);
        loadSnapshots(teamId);
      }
      return next;
    });
  };

  const showResult = (key: string, ok: boolean, msg: string) => {
    setActionResult(prev => ({ ...prev, [key]: { ok, msg } }));
    setTimeout(() => setActionResult(prev => ({ ...prev, [key]: null })), 3000);
  };

  // 只操作自己（服务端从 JWT 里取 userId）
  const doAction = async (teamId: string, actionKey: string, action: string, value?: any) => {
    const key = `${teamId}_${actionKey}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await executeCheatAction(jwt, action as any, value);
      showResult(key, true, result.message);
    } catch (e: any) {
      showResult(key, false, e.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const doKick = async (userId: string) => {
    const key = `kick_${userId}`;
    setKickLoading(prev => ({ ...prev, [key]: true }));
    try {
      const result = await kickPlayer(jwt, userId);
      showResult(key, true, result.message);
    } catch (e: any) {
      showResult(key, false, e.message);
    } finally {
      setKickLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const SCENE_STATE_LABELS: Record<string, string> = {
    NONE: '未开始',
    LOADING: '加载中',
    SP_PREPARE: '特殊准备',
    PREPARE: '准备阶段',
    BATTLE: '战斗中',
    HELP_BATTLE: '协防战斗',
    BOSS_BATTLE: 'Boss 战',
    SETTLE: '结算中',
    END: '已结束',
    BATTLE_WAITING: '等待开战',
    BOSS_PREPARE_WAITING: 'Boss 战前等待',
    PREPARE_RESTART: '准备阶段重开',
    SP_PREPARE_RESTART: '特殊准备重开',
    BOSS_BATTLE_RESTART: 'Boss 战重开',
  };

  const getSceneStateLabel = (sceneState: string | null | undefined) => (
    sceneState ? (SCENE_STATE_LABELS[sceneState] || sceneState) : '未知状态'
  );

  const formatRelativeTime = (ts: number) => {
    const diffMs = Date.now() - ts;
    if (diffMs <= 0) return '0 秒前';
    if (diffMs < 60 * 1000) return `${Math.floor(diffMs / 1000)} 秒前`;
    if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 1000))} 分钟前`;
    if (diffMs < 24 * 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 60 * 1000))} 小时前`;
    return `${Math.floor(diffMs / (24 * 60 * 60 * 1000))} 天前`;
  };

  const loadSnapshots = async (teamId: string) => {
    try {
      const data = await fetchSnapshots(jwt, teamId);
      setSnapshots(prev => ({ ...prev, [teamId]: data }));
    } catch (e: any) {
      showResult(`${teamId}_snapshot`, false, e.message);
    }
  };

  const doRollback = async (teamId: string, snapshotKey: string) => {
    try {
      setRollbackLoading(snapshotKey);
      const res = await rollbackToSnapshot(jwt, teamId, snapshotKey);
      showResult(`${teamId}_snapshot`, true, res.message);
      await loadSnapshots(teamId);
    } catch (e: any) {
      showResult(`${teamId}_snapshot`, false, e.message);
    } finally {
      setRollbackLoading(null);
    }
  };

  const doDownloadSnapshot = async (snapshot: SnapshotMeta) => {
    try {
      setTransferLoading(`download:${snapshot.key}`);
      const blob = await downloadSnapshot(jwt, snapshot.key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `snapshot-r${snapshot.round}-${snapshot.sceneState}-${snapshot.ts}.bin`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showResult(`${snapshot.teamId}_snapshot`, true, '快照已下载');
    } catch (e: any) {
      showResult(`${snapshot.teamId}_snapshot`, false, e.message);
    } finally {
      setTransferLoading(null);
    }
  };

  const doImportSnapshot = async (teamId: string, file: File) => {
    try {
      setTransferLoading(`import:${teamId}`);
      const res = await importSnapshot(jwt, teamId, file);
      showResult(`${teamId}_snapshot`, true, res.message);
      await loadSnapshots(teamId);
    } catch (e: any) {
      showResult(`${teamId}_snapshot`, false, e.message);
    } finally {
      setTransferLoading(null);
    }
  };

  const ResultBadge = ({ k }: { k: string }) => {
    const r = actionResult[k];
    if (!r) return null;
    return (
      <span style={{ fontSize: '0.65rem', marginLeft: '8px', color: r.ok ? 'var(--color-primary)' : '#ff4d4d' }}>
        {r.ok ? '✓' : '✗'} {r.msg}
      </span>
    );
  };

  return (
    <div class="admin-tools">
      <div class="admin-toolbar" style={{ fontSize: '0.7rem', opacity: 0.5, marginBottom: '12px' }}>
        轮询间隔 2s · 在线连接：{connections.length} 个
        {connections.some(conn => conn.isAdmin) && <span style={{ color: '#7ee7ff', marginLeft: '8px' }}>管理员视图 · 显示全部队伍</span>}
        {error && <span style={{ color: '#ff4d4d', marginLeft: '8px' }}>错误：{error}</span>}
      </div>

      {connections.length === 0 && !error && (
        <div class="admin-empty" style={{ fontSize: '0.8rem', opacity: 0.4, textAlign: 'center', padding: '20px 0' }}>暂无在线连接</div>
      )}

      {connections.map(conn => {
        const isExpanded = expanded[conn.teamId];
        const chess = chessListCache[conn.teamId];

        return (
          <div key={conn.teamId} class="admin-team-card" style={{ marginBottom: '16px', border: '1px solid rgba(255,77,77,0.2)', padding: '12px' }}>
            {/* 连接头部 */}
            <div class="admin-team-header" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '8px' }}
              onClick={() => toggleExpand(conn.teamId)}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                background: conn.inBattle ? 'var(--color-primary)' : '#ffaa00',
                boxShadow: conn.inBattle ? '0 0 8px rgba(255,255,255,0.45)' : '0 0 6px #ffaa00',
              }} />
              <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{conn.nickname ?? conn.players[0]?.nickName ?? 'UNKNOWN'}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>
                {conn.inBattle ? `对局中 R${conn.round}` : conn.teamState}
              </span>
              {conn.isAdmin && <span style={{ fontSize: '0.62rem', color: '#7ee7ff', border: '1px solid rgba(126,231,255,0.45)', padding: '1px 6px' }}>ALL</span>}
              <span style={{ fontSize: '0.6rem', opacity: 0.3, marginLeft: 'auto' }}>
                {conn.teamId.slice(0, 12)}...
              </span>
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* 玩家数据表 */}
            {conn.players.length > 0 && (
              <div class="admin-table-wrap">
              <table class="admin-player-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', marginBottom: '8px' }}>
                <thead>
                  <tr style={{ opacity: 0.4 }}>
                    {['#', '昵称', 'HP', '金币', '回合', '棋子', '状态', '操作'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '2px 6px', fontWeight: 'normal' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conn.players.map(p => (
                    <tr key={p.uid} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '3px 6px', opacity: 0.5 }}>{p.uidIndex}</td>
                      <td style={{ padding: '3px 6px' }}>{p.nickName}</td>
                      <td style={{ padding: '3px 6px', color: p.hp !== null && p.hp < 30 ? '#ff6b6b' : undefined }}>{p.hp ?? '—'}</td>
                      <td style={{ padding: '3px 6px' }}>{p.coin ?? '—'}</td>
                      <td style={{ padding: '3px 6px' }}>{p.round ?? '—'}</td>
                      <td style={{ padding: '3px 6px' }}>{p.charChessCount}</td>
                      <td style={{ padding: '3px 6px', fontSize: '0.6rem', opacity: 0.5 }}>{p.state ?? '—'}</td>
                      <td style={{ padding: '3px 6px' }}>
                        <button
                          style={{ cursor: 'pointer', padding: '1px 6px', fontSize: '0.6rem', color: '#ff4d4d', border: '1px solid #ff4d4d', background: 'transparent', opacity: kickLoading[`kick_${p.userId}`] ? 0.5 : 1 }}
                          disabled={kickLoading[`kick_${p.userId}`]}
                          onClick={(e) => { e.stopPropagation(); doKick(p.userId); }}
                        >
                          {kickLoading[`kick_${p.userId}`] ? '...' : '踢'}
                        </button>
                        <ResultBadge k={`kick_${p.userId}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}

        {/* 展开操作区 */}
            {isExpanded && (
              <div class="admin-expanded" style={{ borderTop: '1px solid rgba(255,77,77,0.2)', paddingTop: '10px', marginTop: '6px' }}>

                {/* 调整金币 */}
                <div class="admin-action-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed var(--color-primary-dim)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>调整金币</span>
                  <input class="input-field" type="number" min="0" max="999"
                    style={{ width: '70px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder={String(conn.players.find(p => p.userId === conn.userId)?.coin ?? '')}
                    value={coinValue[conn.teamId] ?? ''}
                    onInput={e => setCoinValue(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_coin`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_coin`]}
                    onClick={() => doAction(conn.teamId, 'coin', 'SET_COIN', Number(coinValue[conn.teamId] || 0))}>
                    {actionLoading[`${conn.teamId}_coin`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_coin`} />
                </div>

                {/* 调整 HP */}
                <div class="admin-action-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed var(--color-primary-dim)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>调整 HP</span>
                  <input class="input-field" type="number" min="0" max="9999"
                    style={{ width: '70px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder={String(conn.players.find(p => p.userId === conn.userId)?.hp ?? '')}
                    value={hpValue[conn.teamId] ?? ''}
                    onInput={e => setHpValue(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_hp`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_hp`]}
                    onClick={() => doAction(conn.teamId, 'hp', 'SET_HP', Number(hpValue[conn.teamId] || 0))}>
                    {actionLoading[`${conn.teamId}_hp`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_hp`} />
                </div>

                {/* 调整回合（整个 team） */}
                <div class="admin-action-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed var(--color-primary-dim)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>调整回合</span>
                  <input class="input-field" type="number" min="1" max="15"
                    style={{ width: '60px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder={String(conn.round ?? '')}
                    value={roundValue[conn.teamId] ?? ''}
                    onInput={e => setRoundValue(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <span style={{ fontSize: '0.6rem', opacity: 0.4 }}>（对整个队伍生效）</span>
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_round`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_round`]}
                    onClick={() => doAction(conn.teamId, 'round', 'SET_ROUND', Number(roundValue[conn.teamId] || conn.round || 1))}>
                    {actionLoading[`${conn.teamId}_round`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_round`} />
                </div>

                {/* 调整盟约叠层 */}
                <div class="admin-action-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed var(--color-primary-dim)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>盟约叠层</span>
                  <select class="select-field"
                    style={{ flex: 1, padding: '3px 6px', fontSize: '0.7rem', minWidth: '120px' }}
                    value={bondId[conn.teamId] ?? ''}
                    onChange={e => setBondId(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))}>
                    {chess ? chess.bonds.map(b => (
                      <option key={b.bondId} value={b.bondId}>{b.name}</option>
                    )) : <option value="">加载中...</option>}
                  </select>
                  <input class="input-field" type="number" min="0" max="99"
                    style={{ width: '55px', padding: '3px 6px', fontSize: '0.75rem' }}
                    placeholder="叠层"
                    value={bondCount[conn.teamId] ?? ''}
                    onInput={e => setBondCount(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))} />
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_bond`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_bond`]}
                    onClick={() => doAction(conn.teamId, 'bond', 'SET_BOND_STACK', {
                      bondId: bondId[conn.teamId] || (chess?.bonds[0]?.bondId ?? ''),
                      count: Number(bondCount[conn.teamId] ?? 1),
                    })}>
                    {actionLoading[`${conn.teamId}_bond`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_bond`} />
                </div>

                {/* 添加棋子 */}
                <div class="admin-action-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px dashed var(--color-primary-dim)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', opacity: 0.6, minWidth: '70px' }}>添加棋子</span>
                  <select class="select-field"
                    style={{ flex: 1, padding: '3px 6px', fontSize: '0.7rem', minWidth: '140px' }}
                    value={chessId[conn.teamId] ?? ''}
                    onChange={e => setChessId(prev => ({ ...prev, [conn.teamId]: e.currentTarget.value }))}>
                    {chess ? [
                      ...chess.chars.map(c => <option key={c.chessId} value={c.chessId}>{c.chessId}</option>),
                      ...chess.traps.map(c => <option key={c.chessId} value={c.chessId}>[装备] {c.chessId}</option>),
                    ] : <option value="">加载中...</option>}
                  </select>
                  <button class="input-field"
                    style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem', opacity: actionLoading[`${conn.teamId}_chess`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_chess`]}
                    onClick={() => doAction(conn.teamId, 'chess', 'ADD_CHESS',
                      chessId[conn.teamId] || (chess?.chars[0]?.chessId ?? ''))}>
                    {actionLoading[`${conn.teamId}_chess`] ? '执行中...' : '执行'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_chess`} />
                </div>

                {/* 危险操作区 */}
                <div class="admin-danger-row" style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    class="input-field"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: '0.7rem', color: '#ffaa00', border: '1px solid #ffaa00', opacity: actionLoading[`${conn.teamId}_forceend`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_forceend`]}
                    onClick={() => doAction(conn.teamId, 'forceend', 'FORCE_END_PHASE')}
                  >
                    {actionLoading[`${conn.teamId}_forceend`] ? '执行中...' : '强制结束当前阶段'}
                  </button>
                  <button
                    class="input-field"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: '0.7rem', color: '#ff4d4d', border: '1px solid #ff4d4d', opacity: actionLoading[`${conn.teamId}_forcelogin`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_forcelogin`]}
                    onClick={() => doAction(conn.teamId, 'forcelogin', 'FORCE_LOGIN')}
                  >
                    {actionLoading[`${conn.teamId}_forcelogin`] ? '执行中...' : '⚠ 强制退出到登录页'}
                  </button>
                  <button
                    class="input-field"
                    style={{ cursor: 'pointer', padding: '4px 12px', fontSize: '0.7rem', color: '#ff4d4d', border: '1px solid #ff4d4d', opacity: actionLoading[`${conn.teamId}_dissolve`] ? 0.5 : 1 }}
                    disabled={actionLoading[`${conn.teamId}_dissolve`]}
                    onClick={() => doAction(conn.teamId, 'dissolve', 'DISSOLVE_TEAM')}
                  >
                    {actionLoading[`${conn.teamId}_dissolve`] ? '执行中...' : '⚠ 强制解散队伍'}
                  </button>
                  <ResultBadge k={`${conn.teamId}_forceend`} />
                  <ResultBadge k={`${conn.teamId}_forcelogin`} />
                  <ResultBadge k={`${conn.teamId}_dissolve`} />
                </div>
                <div class="admin-snapshot-panel">
                  <div class="admin-snapshot-head">
                    <div>
                      <strong>Snapshot</strong>
                      <span>{(snapshots[conn.teamId] || []).length} 条可用快照</span>
                    </div>
                    <div class="admin-snapshot-actions">
                      <button class="input-field" type="button" onClick={() => loadSnapshots(conn.teamId)}>刷新</button>
                      <button
                        class="input-field"
                        type="button"
                        disabled={transferLoading === `import:${conn.teamId}`}
                        onClick={() => uploadInputRefs.current[conn.teamId]?.click()}
                      >
                        {transferLoading === `import:${conn.teamId}` ? '上传中...' : '上传快照'}
                      </button>
                      <input
                        ref={(el) => { uploadInputRefs.current[conn.teamId] = el; }}
                        type="file"
                        accept=".bin,application/octet-stream"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = (e.currentTarget as HTMLInputElement).files?.[0];
                          if (file) doImportSnapshot(conn.teamId, file);
                          (e.currentTarget as HTMLInputElement).value = '';
                        }}
                      />
                    </div>
                  </div>
                  <ResultBadge k={`${conn.teamId}_snapshot`} />
                  <div class="admin-snapshot-list">
                    {(snapshots[conn.teamId] || []).slice().sort((a, b) => b.ts - a.ts).length === 0 ? (
                      <div class="admin-snapshot-empty">无可用快照</div>
                    ) : (
                      (snapshots[conn.teamId] || []).slice().sort((a, b) => b.ts - a.ts).map(s => (
                        <div class="admin-snapshot-item" key={s.key}>
                          <div class="admin-snapshot-meta">
                            <strong>R{s.round} · {getSceneStateLabel(s.sceneState)}</strong>
                            <span>{formatRelativeTime(s.ts)}</span>
                            <code>{s.key}</code>
                          </div>
                          <div class="admin-snapshot-actions">
                            <button
                              class="input-field"
                              type="button"
                              disabled={transferLoading === `download:${s.key}`}
                              onClick={() => doDownloadSnapshot(s)}
                            >
                              {transferLoading === `download:${s.key}` ? '下载中...' : '下载'}
                            </button>
                            <button
                              class="input-field"
                              type="button"
                              disabled={rollbackLoading === s.key}
                              onClick={() => doRollback(conn.teamId, s.key)}
                            >
                              {rollbackLoading === s.key ? '回滚中...' : '回滚'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

void LegacyCheatConsole;

// ─── 快照回滚组件 ─────────────────────────────────────────────────────────

export function SnapshotRollback({ jwt }: { jwt: string }) {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotMeta[]>>({});
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null);
  const [transferLoading, setTransferLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [, setNow] = useState(Date.now());
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const SCENE_STATE_LABELS: Record<string, string> = {
    NONE: '未开始',
    LOADING: '加载中',
    SP_PREPARE: '特殊准备',
    PREPARE: '准备阶段',
    BATTLE: '战斗中',
    HELP_BATTLE: '协防战斗',
    BOSS_BATTLE: 'Boss 战',
    SETTLE: '结算中',
    END: '已结束',
    BATTLE_WAITING: '等待开战',
    BOSS_PREPARE_WAITING: 'Boss 战前等待',
    PREPARE_RESTART: '准备阶段重开',
    SP_PREPARE_RESTART: '特殊准备重开',
    BOSS_BATTLE_RESTART: 'Boss 战重开',
  };

  const getSceneStateLabel = (sceneState: string | null | undefined) => {
    if (!sceneState) return '未知状态';
    return SCENE_STATE_LABELS[sceneState] || sceneState;
  };

  const formatRelativeTime = (ts: number) => {
    const diffMs = Date.now() - ts;
    if (diffMs <= 0) return '0 秒前';

    const second = 1000;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) return `${Math.floor(diffMs / second)} 秒前`;
    if (diffMs < hour) return `${Math.floor(diffMs / minute)} 分钟前`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)} 小时前`;
    return `${Math.floor(diffMs / day)} 天前`;
  };

  const formatSnapshotState = (round: number, sceneState: string) => `R${round} · ${getSceneStateLabel(sceneState)}`;

  const loadTeams = async () => {
    try {
      setLoading(true);
      setTeams(await fetchTeams(jwt));
      if (expandedTeam) {
        const snapshotData = await fetchSnapshots(jwt, expandedTeam);
        setSnapshots(prev => ({ ...prev, [expandedTeam]: snapshotData }));
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTeams(); }, [jwt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const toggleTeam = async (teamId: string) => {
    if (expandedTeam === teamId) {
      setExpandedTeam(null);
      return;
    }
    setExpandedTeam(teamId);
    try {
      const data = await fetchSnapshots(jwt, teamId);
      setSnapshots(prev => ({ ...prev, [teamId]: data }));
    } catch (e: any) {
      console.error(e);
    }
  };

  const doRollback = async (teamId: string, snapshotKey: string) => {
    try {
      setRollbackLoading(snapshotKey);
      const res = await rollbackToSnapshot(jwt, teamId, snapshotKey);
      setResult({ ok: true, msg: res.message });
      setTimeout(() => {
        setResult(null);
        loadTeams();
        fetchSnapshots(jwt, teamId).then(data => {
          setSnapshots(prev => ({ ...prev, [teamId]: data }));
        }).catch(console.error);
      }, 2000);
    } catch (e: any) {
      setResult({ ok: false, msg: e.message });
      setTimeout(() => setResult(null), 4000);
    } finally {
      setRollbackLoading(null);
    }
  };

  const doDownloadSnapshot = async (snapshot: SnapshotMeta) => {
    try {
      setTransferLoading(`download:${snapshot.key}`);
      const blob = await downloadSnapshot(jwt, snapshot.key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `snapshot-r${snapshot.round}-${snapshot.sceneState}-${snapshot.ts}.bin`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setResult({ ok: true, msg: '快照已下载' });
      setTimeout(() => setResult(null), 2500);
    } catch (e: any) {
      setResult({ ok: false, msg: e.message });
      setTimeout(() => setResult(null), 4000);
    } finally {
      setTransferLoading(null);
    }
  };

  const doImportSnapshot = async (teamId: string, file: File) => {
    try {
      setTransferLoading(`import:${teamId}`);
      const res = await importSnapshot(jwt, teamId, file);
      setResult({ ok: true, msg: res.message });
      setTimeout(() => {
        setResult(null);
        loadTeams();
        fetchSnapshots(jwt, teamId).then(data => {
          setSnapshots(prev => ({ ...prev, [teamId]: data }));
        }).catch(console.error);
      }, 2500);
    } catch (e: any) {
      setResult({ ok: false, msg: e.message });
      setTimeout(() => setResult(null), 4000);
    } finally {
      setTransferLoading(null);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>活跃队伍：{teams.length} 个</span>
        {teams.some(team => team.isAdmin) && <span style={{ fontSize: '0.7rem', color: '#7ee7ff' }}>管理员视图 · 显示全部队伍</span>}
        <button class="input-field" style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.7rem' }}
          onClick={loadTeams} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </button>
        {result && (
          <span style={{ fontSize: '0.7rem', color: result.ok ? 'var(--color-primary)' : '#ff4d4d' }}>
            {result.ok ? '✓' : '✗'} {result.msg}
          </span>
        )}
      </div>

      {teams.length === 0 && !loading && (
        <div style={{ fontSize: '0.8rem', opacity: 0.4, textAlign: 'center', padding: '20px 0' }}>暂无活跃队伍</div>
      )}

      {teams.map(team => {
        const isExpanded = expandedTeam === team.teamId;
        const teamSnapshots = (snapshots[team.teamId] || []).slice().sort((a, b) => b.ts - a.ts);
        return (
          <div key={team.teamId} style={{ marginBottom: '12px', border: '1px solid var(--color-primary-dim)', borderRadius: 10, padding: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              onClick={() => toggleTeam(team.teamId)}>
              <span style={{
                display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
                background: team.state === 'IN_BATTLE' ? 'var(--color-primary)' : '#ffaa00',
                boxShadow: team.state === 'IN_BATTLE' ? '0 0 8px rgba(255,255,255,0.45)' : '0 0 6px #ffaa00',
              }} />
              <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{team.teamId.slice(0, 12)}...</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>
                  {team.state === 'IN_BATTLE' ? `R${team.round} ${getSceneStateLabel(team.sceneState)}` : team.state}
                </span>
              <span style={{ fontSize: '0.65rem', opacity: 0.4, marginLeft: 'auto' }}>
                {team.players.map(p => p.nickName).join(', ')}
              </span>
              <button
                class="input-field"
                style={{ cursor: 'pointer', padding: '3px 10px', fontSize: '0.68rem', color: '#7ee7ff', border: '1px solid #7ee7ff' }}
                disabled={transferLoading === `import:${team.teamId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  uploadInputRefs.current[team.teamId]?.click();
                }}>
                {transferLoading === `import:${team.teamId}` ? '导入中...' : '上传快照'}
              </button>
              <input
                ref={(el) => { uploadInputRefs.current[team.teamId] = el; }}
                type="file"
                accept=".bin,application/octet-stream"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = (e.currentTarget as HTMLInputElement).files?.[0];
                  if (file) doImportSnapshot(team.teamId, file);
                  (e.currentTarget as HTMLInputElement).value = '';
                }}
              />
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {isExpanded && (
              <div style={{ marginTop: '10px', borderTop: '1px solid var(--color-primary-dim)', paddingTop: '8px' }}>
                {teamSnapshots.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>无可用快照（快照在 20 分钟后过期）</div>
                ) : (
                  teamSnapshots.map(s => (
                    <div
                      key={s.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        background: 'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                        border: '1px solid var(--color-primary-dim)',
                        borderRadius: 10,
                        marginBottom: '6px',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 'bold', letterSpacing: '0.04em' }}>
                            {formatSnapshotState(s.round, s.sceneState)}
                          </span>
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '1px 8px',
                            border: '1px solid var(--color-primary-mid)',
                            background: 'var(--color-primary-dim)',
                            color: 'var(--color-primary)',
                          }}>
                            {formatRelativeTime(s.ts)}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.65rem', opacity: 0.45, fontFamily: 'monospace' }}>
                          snapshot: {s.key}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button class="input-field"
                          style={{
                            cursor: 'pointer',
                            padding: '4px 12px',
                            fontSize: '0.68rem',
                            color: '#7ee7ff',
                            border: '1px solid #7ee7ff',
                          }}
                          disabled={transferLoading === `download:${s.key}`}
                          onClick={() => doDownloadSnapshot(s)}>
                          {transferLoading === `download:${s.key}` ? '下载中...' : '下载'}
                        </button>
                        <button class="input-field"
                          style={{
                            cursor: 'pointer',
                            padding: '4px 12px',
                            fontSize: '0.68rem',
                            color: 'var(--color-primary)',
                            border: '1px solid var(--color-primary-mid)',
                          }}
                          disabled={rollbackLoading === s.key}
                          onClick={() => doRollback(team.teamId, s.key)}>
                          {rollbackLoading === s.key ? '回滚中...' : '回滚'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function App() {
  const [authState, setAuthState] = useState<AuthProfileState>(() => loadAuthProfileState(localStorage));
  const [theme, setTheme] = useState<'mono' | 'pink'>((localStorage.getItem('ui_theme') as 'mono' | 'pink') || 'pink');
  const [panelIcons] = useState(() => shuffleOrangeAssets().slice(0, 7));
  const [fallingStickers] = useState(() => createFallingStickers(16));
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(() => authState.activeUserId !== null);
  const [error, setError] = useState<string | null>(null);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [userData, setUserData] = useState<JwtPayload | null>(null);
  const [page, setPage] = useState<'dashboard' | 'settlement'>('dashboard');
  const [dashboardPanel, setDashboardPanel] = useState<'core' | 'maps' | 'skins' | 'season' | 'accounts' | 'tools' | null>(null);
  const [accountCenterRequest, setAccountCenterRequest] = useState<{ tab: 'accounts' | 'jwt'; key: number }>({ tab: 'accounts', key: 0 });
  const activeProfile = authState.profiles.find((profile) => profile.userId === authState.activeUserId) ?? null;
  const jwt = activeProfile?.token ?? '';

  const persistAuthState = (nextState: AuthProfileState) => {
    saveAuthProfileState(localStorage, nextState);
    setAuthState(nextState);
  };

  const payloadFromToken = (token: string): JwtPayload => (
    decodeJwt(token).payload as unknown as JwtPayload
  );

  const switchProfile = async (userId: string) => {
    const profile = authState.profiles.find((item) => item.userId === userId);
    if (!profile) throw new Error('找不到要切换的本地账户');

    try {
      const nextSettings = await fetchSettings(profile.token);
      const nextState: AuthProfileState = { ...authState, activeUserId: userId };
      persistAuthState(nextState);
      setSettings(nextSettings);
      setUserData(payloadFromToken(profile.token));
      setError(null);
      setAccountActionError(null);
    } catch (switchError) {
      const message = switchError instanceof Error ? switchError.message : String(switchError);
      setAccountActionError(`切换失败：${message}`);
      throw new Error(`账户校验失败：${message}`);
    }
  };

  const saveProfile = async (token: string, makeActive: boolean) => {
    const profile = profileFromToken(token);
    const validatedSettings = await fetchSettings(profile.token);
    const nextState = upsertAuthProfile(authState, profile, makeActive);
    persistAuthState(nextState);
    setAccountActionError(null);
    if (makeActive) {
      setSettings(validatedSettings);
      setUserData(payloadFromToken(profile.token));
      setError(null);
    }
  };

  const deleteProfile = (userId: string) => {
    const deletingActive = authState.activeUserId === userId;
    const nextState = removeAuthProfile(authState, userId);
    persistAuthState(nextState);
    if (deletingActive) {
      setSettings(null);
      setUserData(null);
      setError(null);
    }
  };

  const openAccountCenter = (tab: 'accounts' | 'jwt') => {
    setAccountCenterRequest((current) => ({ tab, key: current.key + 1 }));
    setPage('dashboard');
    setDashboardPanel('accounts');
  };

  useEffect(() => {
    if (!jwt) {
      setSettings(null);
      setUserData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    try {
      setUserData(payloadFromToken(jwt));
    } catch {
      setUserData(null);
    }
    fetchSettings(jwt)
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (cancelled) return;
        setError('认证失败：身份令牌无效或已过期，请切换账户或更新 Token');
        setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jwt]);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('ui_theme', theme);
  }, [theme]);

  const handleUpdate = async (key: keyof Settings, value: any) => {
    if (!settings || !jwt) return;
    const previous = settings;
    try {
      setUpdating(key);
      setSettings({ ...settings, [key]: value });
      const updated = await updateSetting(jwt, key, value);
      setSettings(updated);
    } catch (err) {
      console.error(err);
      setSettings(previous);
    } finally {
      setUpdating(null);
    }
  };

  const handleTurnTimeLimitUpdate = async (
    key: keyof Settings['turnTimeLimitSettings'],
    value: boolean | number,
  ) => {
    if (!settings) return;
    await handleUpdate('turnTimeLimitSettings', {
      ...settings.turnTimeLimitSettings,
      [key]: value,
    });
  };

  const toggleMap = (mapId: string) => {
    if (!settings) return;
    const currentMaps = settings.enabledMaps || [];
    const nextMaps = currentMaps.includes(mapId)
      ? currentMaps.filter(id => id !== mapId)
      : [...currentMaps, mapId];
    handleUpdate('enabledMaps', nextMaps);
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const logout = () => {
    persistAuthState({ ...authState, activeUserId: null });
    setSettings(null);
    setUserData(null);
    setError(null);
    setAccountActionError(null);
  };

  const toggleTheme = () => setTheme(prev => prev === 'mono' ? 'pink' : 'mono');

  if (!jwt || error) {
    return (
      <div class="auth-container auth-workspace-container">
        <div class="bg-text bg-text-1">RHODES</div>
        <div class="cyber-section auth-workspace">
          <h2 class="section-title">身份认证 <span>AUTH_REQUIRED</span></h2>
          {error && <div class="auth-error-banner">{error}</div>}
          {accountActionError && <div class="auth-error-banner">{accountActionError}</div>}
          <AccountCenter
            profiles={authState.profiles}
            activeUserId={error ? null : authState.activeUserId}
            initialTab={authState.profiles.length === 0 ? 'jwt' : 'accounts'}
            onSwitchProfile={switchProfile}
            onDeleteProfile={deleteProfile}
            onSaveProfile={saveProfile}
          />
        </div>
      </div>
    );
  }

  if (loading && !settings) {
    return (
      <div class="loading-screen">
        <div class="spinner"></div>
        <img class="loading-meme" src={orangeMemeSrc(panelIcons[0])} alt="" />
        <div style={{ letterSpacing: '4px', fontSize: '0.8rem', marginTop: '20px' }}>PRTS_SYNCING...</div>
      </div>
    );
  }

  return (
    <>
      <div class="bg-text bg-text-1">RHODES</div>
      <div class="bg-text bg-text-2">ISLAND</div>
      <OrangeStickerLayer stickers={fallingStickers} active={theme === 'pink'} />

      <header class="top-header">
        <h1>
          <img class="title-mascot" src={orangeMemeSrc(panelIcons[6])} alt="" />
          明日方舟·橘戍协议
          <span style={{ fontSize: '0.5rem', opacity: '0.5', fontWeight: '400', marginTop: '2px', display: 'block' }}>TERMINAL_INTERFACE // v2.0.4</span>
        </h1>
        <div class="user-info">
          <div class="header-account-switch">
            <span>活动账户</span>
            <select
              value={authState.activeUserId ?? ''}
              disabled={loading}
              onChange={(event) => {
                const userId = event.currentTarget.value;
                if (userId && userId !== authState.activeUserId) {
                  switchProfile(userId).catch(() => undefined);
                }
              }}
            >
              {authState.profiles.map((profile) => (
                <option key={profile.userId} value={profile.userId}>
                  {profile.nickname || profile.userId}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => openAccountCenter('accounts')}>
              管理账户
            </button>
            <button type="button" class="new-token" onClick={() => openAccountCenter('jwt')}>
              登录新 Token
            </button>
          </div>
          <div class="info-item">
            <span>Operator</span>
            <span>{userData?.nickname || 'UNKNOWN'}</span>
          </div>
          <div class="info-item">
            <span>UID</span>
            <span>{userData?.user_id || 'N/A'}</span>
          </div>
          <div class="info-item">
            <span>Session_Exp</span>
            <span>{formatTime(userData?.exp)}</span>
          </div>
          <button class="theme-toggle" type="button" onClick={toggleTheme} aria-label="切换主题">
            {theme === 'pink' ? <Heart20Regular /> : <WeatherSunny20Regular />}
            <span>{theme === 'pink' ? '粉色主题' : '黑白主题'}</span>
          </button>
          <div class="info-item" style={{ cursor: 'pointer', opacity: 1, color: '#ff4d4d' }} onClick={logout}>
            <span>Action</span>
            <span>退出当前</span>
          </div>
        </div>
        {accountActionError && <div class="header-account-error">{accountActionError}</div>}
      </header>

      {/* Page Navigation */}
      <nav class="page-nav">
        <button
          class={`page-nav-btn ${page === 'dashboard' ? 'active' : ''}`}
          onClick={() => { setPage('dashboard'); setDashboardPanel(null); }}
        >
          控制面板 <span>DASHBOARD</span>
        </button>
        <button
          class={`page-nav-btn ${page === 'settlement' ? 'active' : ''}`}
          onClick={() => setPage('settlement')}
        >
          结算统计 <span>SETTLEMENT</span>
        </button>
      </nav>

      {page === 'dashboard' ? (
        <div class="container dashboard-container">
          {dashboardPanel === null ? (
            <section class="cyber-section settings-home">
              <SettingsSectionItem
                title="核心参数"
                code="CORE_V1.0"
                description="配置回合限时、共享池、公开权限、人数上限、重复盟约和助理干员。"
                iconSrc={orangeMemeSrc(panelIcons[0])}
                onClick={() => setDashboardPanel('core')}
              />
              <SettingsSectionItem
                title="授权战区地图"
                code="MAP_AUTH"
                description="选择当前房间允许出现的地图池。"
                iconSrc={orangeMemeSrc(panelIcons[1])}
                onClick={() => setDashboardPanel('maps')}
              />
              <SettingsSectionItem
                title="身份标识涂装"
                code="ID_SKINS"
                description="切换房间使用的身份牌和展示外观。"
                iconSrc={orangeMemeSrc(panelIcons[2])}
                onClick={() => setDashboardPanel('skins')}
              />
              <SettingsSectionItem
                title="赛季管理"
                code="SEASON_MGR"
                description="查看内置赛季、启用赛季版本，并上传或替换自定义赛季。"
                iconSrc={orangeMemeSrc(panelIcons[3])}
                onClick={() => setDashboardPanel('season')}
              />
              <SettingsSectionItem
                title="账户与令牌"
                code="AUTH_PROFILES"
                description="保存并切换多个用户，逐用户上传赛季，并在本地生成或解析 JWT。"
                iconSrc={orangeMemeSrc(panelIcons[4])}
                onClick={() => openAccountCenter('accounts')}
              />
              <SettingsSectionItem
                title="管理工具"
                code="ADMIN_TOOLS"
                description="集中处理作弊控制台、在线队伍操作、快照下载和回滚。"
                iconSrc={orangeMemeSrc(panelIcons[5])}
                onClick={() => setDashboardPanel('tools')}
              />
            </section>
          ) : dashboardPanel === 'core' ? (
          <DashboardDetail title="核心参数" code="CORE_V1.0" onBack={() => setDashboardPanel(null)}>
            <div style={{ display: 'grid', gap: '12px', paddingBottom: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '6px' }}>
              <div class="setting-info">
                <h3>分阶段限时</h3>
                <p>分别控制准备、特殊准备、Boss 战和普通战斗的时限</p>
              </div>

              {[
                ['prepareEnabled', 'prepareTimeLimit', '准备阶段'],
                ['spPrepareEnabled', 'spPrepareTimeLimit', '特殊准备'],
                ['bossBattleEnabled', 'bossBattleTimeLimit', 'Boss 战斗'],
                ['normalBattleEnabled', 'normalBattleTimeLimit', '普通战斗'],
              ].map(([enabledKey, timeKey, label]) => (
                <div key={enabledKey} class="setting-item" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                  <div class="setting-info">
                    <h3>{label}</h3>
                  </div>
                  <div class="switch-control-group">
                    <div class="switch-card">
                      <label class="switch">
                      <input
                        type="checkbox"
                        checked={settings?.turnTimeLimitSettings?.[enabledKey as keyof Settings['turnTimeLimitSettings']] as boolean}
                        onChange={(e) => handleTurnTimeLimitUpdate(
                          enabledKey as keyof Settings['turnTimeLimitSettings'],
                          e.currentTarget.checked,
                        )}
                        disabled={!!updating}
                      />
                      <span class="slider"></span>
                      </label>
                    </div>
                    <DeferredNumberInput
                      min={5}
                      max={1000}
                      className="input-field"
                      style={{ width: '85px' }}
                      value={settings?.turnTimeLimitSettings?.[timeKey as keyof Settings['turnTimeLimitSettings']] as number}
                      onCommit={(nextValue) => handleTurnTimeLimitUpdate(
                        timeKey as keyof Settings['turnTimeLimitSettings'],
                        nextValue,
                      )}
                      disabled={updating === 'turnTimeLimitSettings'}
                    />
                    <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>秒</span>
                  </div>
                </div>
              ))}
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h3>全局共享卡池</h3>
                <p>所有玩家共用资源池</p>
              </div>
              <div class="switch-card compact">
                <label class="switch">
                  <input 
                  type="checkbox" 
                  checked={settings?.isSharedPoolEnabled} 
                  onChange={(e) => handleUpdate('isSharedPoolEnabled', e.currentTarget.checked)}
                  disabled={!!updating}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h3>公开访问权限</h3>
                <p>是否在大厅公开广播</p>
              </div>
              <div class="switch-card compact">
                <label class="switch">
                  <input 
                  type="checkbox" 
                  checked={settings?.isRoomVisibleInLobby} 
                  onChange={(e) => handleUpdate('isRoomVisibleInLobby', e.currentTarget.checked)}
                  disabled={!!updating}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h3>允许 4 人以上组队</h3>
                <p>放开队伍人数上限</p>
              </div>
              <div class="switch-card compact">
                <label class="switch">
                  <input
                  type="checkbox"
                  checked={settings?.allowMoreThanFourPlayers}
                  onChange={(e) => handleUpdate('allowMoreThanFourPlayers', e.currentTarget.checked)}
                  disabled={!!updating}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <h3>允许重复盟约</h3>
                <p>选盟约时不向客户端广播别人的选择</p>
              </div>
              <div class="switch-card compact">
                <label class="switch">
                  <input
                  type="checkbox"
                  checked={settings?.allowDuplicateStrategySelection}
                  onChange={(e) => handleUpdate('allowDuplicateStrategySelection', e.currentTarget.checked)}
                  disabled={!!updating}
                  />
                  <span class="slider"></span>
                </label>
              </div>
            </div>

            <div class="setting-item" style={{ marginTop: '20px', flexDirection: 'column', alignItems: 'stretch', gap: '10px', borderBottom: 'none' }}>
              <div class="setting-info">
                <h3>助理干员委派</h3>
              </div>
              <SecretarySelector
                value={settings?.secretary}
                onChange={(value) => handleUpdate('secretary', value)}
                disabled={!!updating}
              />
            </div>
          </DashboardDetail>
          ) : dashboardPanel === 'maps' ? (
          <DashboardDetail title="授权战区地图" code="MAP_AUTH" onBack={() => setDashboardPanel(null)}>
              <div class="maps-grid">
                {MAPS.map(map => (
                  <div 
                    key={map.id} 
                    class={`map-card ${settings?.enabledMaps?.includes(map.id) ? 'active' : ''}`}
                    onClick={() => !updating && toggleMap(map.id)}
                  >
                    <img src={map.image} alt={map.name} loading="lazy" />
                    <div class="map-label">{map.name}</div>
                  </div>
                ))}
              </div>
          </DashboardDetail>
          ) : dashboardPanel === 'skins' ? (
          <DashboardDetail title="身份标识涂装" code="ID_SKINS" onBack={() => setDashboardPanel(null)}>
              <div class="nc-grid">
                {Object.entries(NAME_CARDS).map(([id, info]) => (
                  <div
                    key={id}
                    class={`nc-card ${settings?.nameCardSkinId === id ? 'active' : ''}`}
                    title={info.name}
                    onClick={() => !updating && handleUpdate('nameCardSkinId', id)}
                  >
                    <img src={info.image} alt={info.name} loading="lazy" />
                  </div>
                ))}
              </div>
          </DashboardDetail>
          ) : dashboardPanel === 'season' ? (
          <DashboardDetail title="赛季管理" code="SEASON_MGR" onBack={() => setDashboardPanel(null)}>
            <SeasonManager
              jwt={jwt}
              myUserId={userData?.user_id ?? ''}
              currentSeasonId={settings?.seasonId ?? 'act1autochess'}
              onSeasonChange={(id) => setSettings(s => s ? { ...s, seasonId: id } : s)}
            />
          </DashboardDetail>
          ) : dashboardPanel === 'accounts' ? (
          <DashboardDetail title="账户与令牌" code="AUTH_PROFILES" onBack={() => setDashboardPanel(null)}>
            <AccountCenter
              key={accountCenterRequest.key}
              profiles={authState.profiles}
              activeUserId={authState.activeUserId}
              initialTab={accountCenterRequest.tab}
              onSwitchProfile={switchProfile}
              onDeleteProfile={deleteProfile}
              onSaveProfile={saveProfile}
            />
          </DashboardDetail>
          ) : (
          <DashboardDetail title="管理工具" code="ADMIN_TOOLS" onBack={() => setDashboardPanel(null)}>
            <CheatConsole jwt={jwt} />
          </DashboardDetail>
          )}
        </div>
      ) : (
        <div class="container container-wide">
          <SettlementView jwt={jwt} />
        </div>
      )}
    </>
  );
}
