import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { Group } from '@visx/group';
import { BarStackHorizontal, LinePath, Pie } from '@visx/shape';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { withTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { localPoint } from '@visx/event';
import { ParentSize } from '@visx/responsive';
import {
  type Settlement, type SettlementSummary,
  fetchLatestSettlement, fetchSettlementByTeamId, fetchSettlements,
} from './api';
import { CHARACTER_NAME_MAP } from './constants';

const GREEN_SHADES = [
  '#00ff9d', '#00e88a', '#00d078', '#00b866', '#00a055',
  '#40ffb8', '#33cc80', '#00994d', '#008040', '#006633',
  '#20d090', '#50e0a0', '#60f0b0', '#80ffc0', '#a0ffd0',
];
function playerColor(i: number) { return GREEN_SHADES[i % GREEN_SHADES.length]; }

const LINE_COLORS = [
  '#00ff9d', '#66ff66', '#00e5ff', '#448aff', '#b388ff', '#ff80ab', '#ffab40', '#69f0ae',
  '#ffd740', '#40c4ff', '#ea80fc', '#ff8a80', '#b2ff59', '#ff6e40', '#84ffff', '#ff4081',
];

const BG = '#010805';
const FG = '#00ff9d';
const FG_DIM = 'rgba(0,255,157,0.2)';
const FG_GRID = 'rgba(0,255,157,0.06)';
const ttStyles = { ...defaultStyles, background: BG, border: `1px solid ${FG}`, borderRadius: 0, color: FG, fontSize: '0.7rem', fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif" };
const axisLabel = { fill: FG, fontSize: '0.6rem' as const, fontFamily: "'PingFang SC','Microsoft YaHei',sans-serif" as const };
const axisLabelLeft = { ...axisLabel, textAnchor: 'end' as const, dy: '0.3em' as const, dx: -4 };

function entityName(id: string) { return CHARACTER_NAME_MAP[id] || id.replace(/^char_/, '').replace(/^trap_/, ''); }
function formatMs(ms: number) { const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); return m > 0 ? `${m}m ${s % 60}s` : `${s}s`; }
function formatDamage(d: number) { if (d >= 1e6) return `${(d / 1e6).toFixed(2)}M`; if (d >= 1e3) return `${(d / 1e3).toFixed(1)}K`; return String(d); }
function formatTime(ts: number) { return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

// ─── Stacked Bar (with HOC tooltip) ────────────────────────────────────────

type StackedTooltip = { player: string; char: string; damage: number };

const StackedBarInner = ({
  players, width, height, margin = { top: 10, right: 20, bottom: 40, left: 70 },
  tooltipOpen, tooltipLeft, tooltipTop, tooltipData, hideTooltip, showTooltip,
}: { players: Settlement['players']; width: number; height: number; margin?: { top: number; right: number; bottom: number; left: number }; tooltipOpen: boolean; tooltipLeft?: number; tooltipTop?: number; tooltipData?: StackedTooltip; hideTooltip: () => void; showTooltip: (args: { tooltipLeft?: number; tooltipTop?: number; tooltipData?: StackedTooltip }) => void }) => {
  const { stackedData, charKeys, colorScale } = useMemo(() => {
    const allKeys = new Set<string>();
    const rows: Record<string, number | string>[] = [];
    players.forEach(p => {
      const row: Record<string, number | string> = { player: p.nickName };
      p.characters.forEach(c => { const n = entityName(c.charId); allKeys.add(n); row[n] = c.totalDamage; });
      rows.push(row);
    });
    return { stackedData: rows, charKeys: Array.from(allKeys), colorScale: scaleOrdinal({ domain: Array.from(allKeys), range: GREEN_SHADES }) };
  }, [players]);

  if (width < 10) return null;
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;
  const xScale = scaleLinear({ domain: [0, Math.max(1, ...stackedData.map(d => charKeys.reduce((s, k) => s + ((d[k] as number) || 0), 0)))], range: [0, xMax], nice: true });
  const yScale = scaleBand({ domain: stackedData.map(d => d.player as string), range: [0, yMax], padding: 0.2 });

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          <GridRows scale={yScale} width={xMax} stroke={FG_GRID} strokeDasharray="3 3" />
          <AxisLeft scale={yScale} tickLabelProps={() => axisLabelLeft} stroke={FG_DIM} tickStroke={FG_DIM} />
          <AxisBottom top={yMax} scale={xScale} tickFormat={v => formatDamage(v as number)} tickLabelProps={() => axisLabel} stroke={FG_DIM} tickStroke={FG_DIM} numTicks={5} />
          <BarStackHorizontal data={stackedData} keys={charKeys} height={yMax} y={d => d.player as string} xScale={xScale} yScale={yScale} color={colorScale}>
            {barStacks => barStacks.map(bs => bs.bars.map(bar => {
              if (bar.width <= 0) return null;
              const dmg = (bar.bar.data[bar.key] as number) || 0;
              const label = `${bar.key} ${formatDamage(dmg)}`;
              const minW = label.length * 5.5 + 6;
              return (
                <g key={`${bs.index}-${bar.index}`}>
                  <rect x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={bar.color} stroke={BG} strokeWidth={1}
                    onMouseMove={e => { const pt = localPoint(e); if (pt) showTooltip({ tooltipLeft: pt.x + margin.left, tooltipTop: pt.y + margin.top, tooltipData: { player: bar.bar.data.player as string, char: bar.key, damage: dmg } }); }}
                    onMouseLeave={hideTooltip} />
                  {bar.width >= minW && (
                    <text x={bar.x + bar.width / 2} y={bar.y + bar.height / 2} textAnchor="middle" dominantBaseline="central" fill={BG} fontSize={Math.min(11, bar.height * 0.65)} fontFamily="'PingFang SC','Microsoft YaHei',sans-serif" pointerEvents="none">{label}</text>
                  )}
                </g>
              );
            }))}
          </BarStackHorizontal>
        </Group>
      </svg>
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds top={tooltipTop} left={tooltipLeft} style={ttStyles}>
          <div><strong>{tooltipData.player}</strong></div>
          <div>{tooltipData.char}: {formatDamage(tooltipData.damage)}</div>
        </TooltipWithBounds>
      )}
    </div>
  );
};

const StackedBarChart = withTooltip<{ players: Settlement['players']; width: number; height: number }, StackedTooltip>(StackedBarInner);

// ─── Pie Chart ─────────────────────────────────────────────────────────────

function DonutChart({ players }: { players: Settlement['players'] }) {
  const total = players.reduce((s, p) => s + p.totalDamage, 0);
  const data = players.map((p, i) => ({ label: p.nickName, value: p.totalDamage, pct: p.totalDamage / total, color: playerColor(i) }));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  return (
    <div style={{ width: '100%', height: 320 }}>
      <ParentSize>
        {({ width, height }) => {
          const dim = Math.min(width, height);
          const radius = dim / 2 - 50;
          const inner = radius * 0.55;
          const labelRadius = radius + 22;
          const cx = width / 2;
          const cy = height / 2;
          return (
            <svg width={width} height={height}>
              <Group top={cy} left={cx}>
                <Pie data={data} pieValue={d => d.value} outerRadius={radius} innerRadius={inner} padAngle={0.02}>
                  {pie => pie.arcs.map((arc, i) => {
                    const isHover = hoverIdx === i;
                    const [cx2, cy2] = pie.path.centroid(arc);
                    const len = Math.hypot(cx2, cy2) || 1;
                    const ux = cx2 / len;
                    const uy = cy2 / len;
                    const lx = ux * labelRadius;
                    const ly = uy * labelRadius;
                    const tx = ux * (labelRadius + 4);
                    const textAnchor = ux < 0 ? 'end' : 'start';
                    return (
                      <g key={arc.data.label} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: 'pointer' }}>
                        <path d={pie.path(arc) || ''} fill={arc.data.color} stroke={isHover ? '#fff' : BG} strokeWidth={isHover ? 3 : 2} />
                        <text x={cx2} y={cy2} textAnchor="middle" dominantBaseline="central" fill={isHover ? '#fff' : BG} fontSize={9} fontWeight="bold" pointerEvents="none">
                          {(arc.data.pct * 100).toFixed(1)}%
                        </text>
                        {/* callout line */}
                        <line x1={ux * (inner + radius) / 2} y1={uy * (inner + radius) / 2}
                          x2={lx} y2={ly} stroke={arc.data.color} strokeWidth={1} opacity={0.6} />
                        <text x={tx} y={ly} textAnchor={textAnchor} dominantBaseline="central" fill={FG} fontSize={10} pointerEvents="none">
                          {arc.data.label}
                        </text>
                      </g>
                    );
                  })}
                </Pie>
              </Group>
              {hoverIdx !== null && (
                <TooltipWithBounds top={cy - 50} left={cx} style={ttStyles}>
                  <div style={{ color: data[hoverIdx].color }}><strong>{data[hoverIdx].label}</strong></div>
                  <div>{formatDamage(data[hoverIdx].value)} ({(data[hoverIdx].pct * 100).toFixed(1)}%)</div>
                </TooltipWithBounds>
              )}
            </svg>
          );
        }}
      </ParentSize>
    </div>
  );
}

// ─── Line Chart ────────────────────────────────────────────────────────────

function LineChartToggle({ settlement }: { settlement: Settlement }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedPlayer, setSelectedPlayer] = useState(settlement.players[0]?.nickName ?? '');
  const margin = { top: 10, right: 20, bottom: 30, left: 50 };
  const [tooltipData, setTooltipData] = useState<{ x: number; y: number; items: { key: string; value: number; color: string }[] } | null>(null);

  useEffect(() => {
    if (!settlement.players.some(p => p.nickName === selectedPlayer)) {
      setSelectedPlayer(settlement.players[0]?.nickName ?? '');
      setHidden(new Set());
      setTooltipData(null);
    }
  }, [selectedPlayer, settlement]);

  const { lines, lineData, bucketMs } = useMemo(() => {
    const interval = settlement.bucketIntervalMs;
    const maxB = Math.max(...settlement.players.flatMap(p => p.characters.map(c => c.buckets.length)));
    const pts: { time: number; [k: string]: number }[] = [];
    for (let i = 0; i < maxB; i++) {
      const pt: { time: number; [k: string]: number } = { time: i };
      settlement.players.forEach(p => p.characters.forEach(c => { pt[`${p.nickName}:${entityName(c.charId)}`] = c.buckets[i] || 0; }));
      pts.push(pt);
    }
    const ls: { key: string; charName: string; playerName: string; color: string }[] = [];
    settlement.players.forEach((p, pi) => p.characters.forEach((c, ci) => {
      const name = entityName(c.charId);
      ls.push({ key: `${p.nickName}:${name}`, charName: name, playerName: p.nickName, color: LINE_COLORS[(pi * 4 + ci) % LINE_COLORS.length] });
    }));
    return { lines: ls, lineData: pts, bucketMs: interval };
  }, [settlement]);

  const filteredLines = lines.filter(l => l.playerName === selectedPlayer);
  const visibleLines = filteredLines.filter(l => !hidden.has(l.key));

  if (lineData.length === 0) return null;
  const maxVal = Math.max(1, ...lineData.flatMap(d => visibleLines.map(l => (d[l.key] as number) || 0)));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: '0.6rem' }}>
          {filteredLines.map(l => { const isH = hidden.has(l.key); return (
            <div key={l.key} onClick={() => setHidden(p => { const n = new Set(p); isH ? n.delete(l.key) : n.add(l.key); return n; })}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', opacity: isH ? 0.3 : 1, userSelect: 'none' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: isH ? '#444' : l.color }} />
              <span style={{ color: isH ? '#666' : l.color, textDecoration: isH ? 'line-through' : 'none' }}>{l.charName}</span>
            </div>
          ); })}
        </div>
        <select class="input-field" style={{ padding: '2px 8px', fontSize: '0.7rem', borderColor: FG_DIM, background: BG, color: FG }}
          value={selectedPlayer} onChange={e => { setSelectedPlayer(e.currentTarget.value); setHidden(new Set()); }}>
          {settlement.players.map(p => <option key={p.uid} value={p.nickName}>{p.nickName}</option>)}
        </select>
      </div>
      <div style={{ width: '100%', height: 300, position: 'relative' }}>
        <ParentSize>
          {({ width, height }) => {
            const xMax = width - margin.left - margin.right;
            const yMax = height - margin.top - margin.bottom;
            const xScale = scaleLinear({ domain: [0, lineData.length - 1], range: [0, xMax] });
            const yScale = scaleLinear({ domain: [0, maxVal], range: [yMax, 0], nice: true });
            return (
              <svg width={width} height={height}>
                <Group left={margin.left} top={margin.top}>
                  <GridRows scale={yScale} width={xMax} stroke={FG_GRID} strokeDasharray="3 3" />
                  <AxisLeft scale={yScale} tickFormat={v => formatDamage(v as number)} tickLabelProps={() => axisLabelLeft} stroke={FG_DIM} tickStroke={FG_DIM} numTicks={5} />
                  <AxisBottom top={yMax} scale={xScale} tickFormat={v => `${(v as number) * bucketMs / 1000}s`} tickLabelProps={() => axisLabel} stroke={FG_DIM} tickStroke={FG_DIM} numTicks={Math.min(8, lineData.length)} />
                  {visibleLines.map(l => (
                    <LinePath key={l.key} data={lineData} x={d => xScale(d.time) ?? 0} y={d => yScale(d[l.key] as number) ?? 0} stroke={l.color} strokeWidth={1.5} shapeRendering="crispEdges" />
                  ))}
                  <rect x={0} y={0} width={xMax} height={yMax} fill="transparent"
                    onMouseMove={e => {
                      const pt = localPoint(e);
                      if (!pt) return;
                      const idx = Math.round(xScale.invert(pt.x - margin.left));
                      const clamped = Math.max(0, Math.min(lineData.length - 1, idx));
                      const row = lineData[clamped];
                       const items = visibleLines.map(l => ({ key: l.key, value: (row[l.key] as number) || 0, color: l.color }));
                      setTooltipData({ x: xScale(clamped) ?? 0, y: pt.y, items });
                    }}
                    onMouseLeave={() => setTooltipData(null)} />
                  {tooltipData && (
                    <line x1={tooltipData.x} x2={tooltipData.x} y1={0} y2={yMax} stroke={FG} strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />
                  )}
                </Group>
              </svg>
            );
          }}
        </ParentSize>
        {tooltipData && (
          <TooltipWithBounds top={margin.top + 10} left={margin.left + tooltipData.x + 10} style={ttStyles}>
            {tooltipData.items.sort((a, b) => b.value - a.value).map(item => (
              <div key={item.key} style={{ color: item.color, fontSize: '0.65rem' }}>{item.key.split(':')[1] || item.key}: {formatDamage(item.value)}</div>
            ))}
          </TooltipWithBounds>
        )}
      </div>
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────

function BoardLayout({ player, color }: { player: Settlement['players'][number]; color: string }) {
  const coords = player.onBoardChars.map(c => ({ x: c.x, y: c.y, cid: c.charId, equips: c.equips }));
  if (!coords.length) return <div style={{ opacity: 0.5, textAlign: 'center', padding: '20px' }}>无棋盘数据</div>;
  const minX = Math.min(...coords.map(c => c.x)), maxX = Math.max(...coords.map(c => c.x));
  const minY = Math.min(...coords.map(c => c.y)), maxY = Math.max(...coords.map(c => c.y));
  const cols = maxX - minX + 1, rows = maxY - minY + 1;
  const cs = Math.min(60, Math.max(28, 600 / Math.max(cols, rows)));
  const map = new Map<string, { cid: string; equips: Settlement['players'][number]['onBoardChars'][number]['equips'] }>();
  coords.forEach(c => map.set(`${c.x},${c.y}`, { cid: c.cid, equips: c.equips }));

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cs}px)`, gap: '2px' }}>
        {Array.from({ length: rows }, (_, row) => Array.from({ length: cols }, (_, col) => {
          const x = minX + col, y = minY + row;
          const it = map.get(`${x},${y}`); const empty = !it;
          const equips = it?.equips.map(eq => entityName(eq.charId)) ?? [];
          return <div key={`${x},${y}`} title={empty ? `(${x},${y})` : `${entityName(it.cid)} (${player.nickName})${equips.length ? `\n装备: ${equips.join(' / ')}` : ''}`}
            style={{ width: cs, minHeight: cs, border: `1px solid ${empty ? 'rgba(0,255,157,0.1)' : color}`, background: empty ? 'rgba(0,255,157,0.02)' : `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(7, cs * 0.2), color: empty ? 'rgba(0,255,157,0.3)' : color, overflow: 'hidden', textAlign: 'center', lineHeight: 1.15, padding: empty ? 0 : '3px' }}>
            {empty ? `${x},${y}` : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <span>{entityName(it.cid)}</span>
                {equips.length > 0 && <span style={{ fontSize: Math.max(6, cs * 0.14), opacity: 0.8 }}>{equips.join(' / ')}</span>}
              </div>
            )}</div>;
        }))}
      </div>
    </div>
  );
}

function BoardLayoutToggle({ players }: { players: Settlement['players'] }) {
  const [selectedPlayer, setSelectedPlayer] = useState(players[0]?.nickName ?? '');

  useEffect(() => {
    if (!players.some(p => p.nickName === selectedPlayer)) {
      setSelectedPlayer(players[0]?.nickName ?? '');
    }
  }, [players, selectedPlayer]);

  const playerIndex = players.findIndex(p => p.nickName === selectedPlayer);
  const player = players[playerIndex >= 0 ? playerIndex : 0];

  if (!player) return <div style={{ opacity: 0.5, textAlign: 'center', padding: '20px' }}>无棋盘数据</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '4px' }}>
        <select class="input-field" style={{ padding: '2px 8px', fontSize: '0.7rem', borderColor: FG_DIM, background: BG, color: FG }}
          value={selectedPlayer} onChange={e => setSelectedPlayer(e.currentTarget.value)}>
          {players.map(p => <option key={p.uid} value={p.nickName}>{p.nickName}</option>)}
        </select>
      </div>
      <BoardLayout player={player} color={playerColor(Math.max(playerIndex, 0))} />
    </div>
  );
}

// ─── Boss Selector ─────────────────────────────────────────────────────────

function BossSelector({ settlements, selectedIdx, onChange }: { settlements: Settlement[]; selectedIdx: number; onChange: (idx: number) => void }) {
  if (settlements.length === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
      <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>Boss:</span>
      <select class="input-field" style={{ padding: '4px 12px', fontSize: '0.75rem', borderColor: FG_DIM, background: BG, color: FG, opacity: settlements.length <= 1 ? 0.5 : 1, cursor: settlements.length <= 1 ? 'default' : 'pointer' }}
        value={selectedIdx} onChange={e => onChange(parseInt(e.currentTarget.value))} disabled={settlements.length <= 1}>
        {settlements.map((s, i) => (
          <option key={i} value={i}>{s.bossId} {i === 0 ? '(主)' : ''}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function SettlementView({ jwt }: { jwt: string }) {
  const [tab, setTab] = useState<'latest' | 'history' | 'search'>('latest');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [selectedBossIdx, setSelectedBossIdx] = useState(0);
  const [summaries, setSummaries] = useState<SettlementSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamIdInput, setTeamIdInput] = useState('');

  const loadLatest = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const s = await fetchLatestSettlement(jwt);
      setSettlements([s]);
      setSelectedBossIdx(0);
    } catch (e: any) { setError(e.message); setSettlements([]); }
    finally { setLoading(false); }
  }, [jwt]);
  const loadHistory = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSummaries(await fetchSettlements(jwt)); } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [jwt]);
  const searchById = useCallback(async () => {
    if (!teamIdInput.trim()) return;
    setLoading(true); setError(null);
    try {
      const s = await fetchSettlementByTeamId(jwt, teamIdInput.trim());
      setSettlements(s);
      setSelectedBossIdx(0);
    } catch (e: any) { setError(e.message); setSettlements([]); }
    finally { setLoading(false); }
  }, [jwt, teamIdInput]);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  const onTab = (t: typeof tab) => { setTab(t); setError(null); setSettlements([]); if (t === 'latest') loadLatest(); else if (t === 'history') loadHistory(); };

  const settlement = settlements.length > 0 ? settlements[selectedBossIdx] : null;
  const totalDmg = settlement?.players.reduce((s, p) => s + p.totalDamage, 0) || 0;

  const bondMap = useMemo(() => {
    const m = new Map<string, { bid: string; layers: Record<string, number> }>();
    settlement?.players.forEach(p => p.bonds.forEach(b => { if (!m.has(b.bondId)) m.set(b.bondId, { bid: b.bondId, layers: {} }); m.get(b.bondId)!.layers[p.nickName] = b.layer; }));
    return m;
  }, [settlement]);

  const TABS = { latest: '最新结算', history: '历史记录', search: '按队伍ID查询' } as const;

  return (
    <section class="cyber-section" style={{ overflow: 'visible' }}>
      <h2 class="section-title">结算数据 <span>SETTLEMENT_DB</span></h2>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(Object.keys(TABS) as (keyof typeof TABS)[]).map(k => (
          <button key={k} class="input-field" style={{ cursor: 'pointer', padding: '6px 16px', fontSize: '0.75rem', background: tab === k ? 'var(--color-primary-dim)' : 'transparent', borderColor: tab === k ? 'var(--color-primary)' : 'var(--color-primary-mid)' }} onClick={() => onTab(k)}>{TABS[k]}</button>
        ))}
      </div>
      {tab === 'search' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input class="input-field" type="text" placeholder="输入 Team ID" value={teamIdInput} onInput={e => setTeamIdInput(e.currentTarget.value)} style={{ flex: 1 }} />
          <button class="input-field" style={{ cursor: 'pointer', padding: '6px 20px', fontSize: '0.75rem', background: 'var(--color-primary-dim)' }} onClick={searchById} disabled={loading || !teamIdInput.trim()}>{loading ? '查询中...' : '查询'}</button>
        </div>
      )}
      {loading && <div style={{ textAlign: 'center', padding: '30px', opacity: 0.5, fontSize: '0.8rem' }}>加载中...</div>}
      {error && <div style={{ color: '#ff4d4d', padding: '12px', border: '1px solid #ff4d4d', marginBottom: '16px', fontSize: '0.8rem' }}>{error}</div>}

      {tab === 'history' && !loading && !error && (
        <div>
          {summaries.length === 0 ? <div style={{ opacity: 0.5, textAlign: 'center', padding: '20px', fontSize: '0.8rem' }}>暂无结算记录</div> : <div style={{ marginBottom: '16px', fontSize: '0.7rem', opacity: 0.5 }}>共 {summaries.length} 条记录（最多保留20条）</div>}
          {summaries.map(s => (
            <div key={s.teamId} class="settlement-history-row" style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid rgba(0,255,157,0.06)', cursor: 'pointer' }}
              onClick={async () => { setLoading(true); setError(null); try { const data = await fetchSettlementByTeamId(jwt, s.teamId); setSettlements(data); setSelectedBossIdx(0); setTab('search'); setTeamIdInput(s.teamId); } catch (e: any) { setError(e.message); } finally { setLoading(false); } }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', opacity: 0.6, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.teamId.slice(0, 24)}...</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{s.modeId}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{s.bossIds.join(', ')}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{s.playerCount}人</span><span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{formatMs(s.durationMs)}</span>
              <span style={{ fontSize: '0.65rem', opacity: 0.4 }}>{formatTime(s.savedAt)}</span>
            </div>
          ))}
        </div>
      )}

      {settlement && (
        <div>
          <BossSelector settlements={settlements} selectedIdx={selectedBossIdx} onChange={setSelectedBossIdx} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', padding: '12px', marginBottom: '20px', background: 'rgba(0,255,157,0.03)', border: '1px solid rgba(0,255,157,0.1)', fontSize: '0.7rem' }}>
            <div><span style={{ opacity: 0.5 }}>Team:</span> <span style={{ fontFamily: 'monospace' }}>{settlement.teamId.slice(0, 16)}...</span></div>
            <div><span style={{ opacity: 0.5 }}>Mode:</span> {settlement.modeId}</div>
            <div><span style={{ opacity: 0.5 }}>Boss:</span> {settlement.bossId}</div>
            <div><span style={{ opacity: 0.5 }}>HP:</span> {formatDamage(settlement.bossHpMax)}</div>
            <div><span style={{ opacity: 0.5 }}>时长:</span> {formatMs(settlement.durationMs)}</div>
            <div><span style={{ opacity: 0.5 }}>桶:</span> {settlement.bucketIntervalMs}ms</div>
            <div><span style={{ opacity: 0.5 }}>总伤:</span> {formatDamage(totalDmg)}</div>
            <div><span style={{ opacity: 0.5 }}>人数:</span> {settlement.players.length}</div>
            <div><span style={{ opacity: 0.5 }}>开始:</span> {formatTime(settlement.bossStartTime)}</div>
            <div><span style={{ opacity: 0.5 }}>结束:</span> {formatTime(settlement.bossEndTime)}</div>
          </div>

          <div class="settlement-charts-grid">
            <div class="settlement-chart-card" style={{ gridColumn: '1 / -1' }}>
              <div class="settlement-chart-header"><span>角色伤害堆叠图</span><span class="settlement-chart-sub">{settlement.players.reduce((s, p) => s + p.characters.length, 0)} 个角色</span></div>
              <div style={{ width: '100%', height: Math.max(200, settlement.players.length * 50 + 60) }}>
                <ParentSize>{({ width, height }) => <StackedBarChart players={settlement.players} width={width} height={height} />}</ParentSize>
              </div>
            </div>

            <div class="settlement-chart-card" style={{ gridColumn: '1 / -1' }}>
              <div class="settlement-chart-header"><span>角色伤害折线图</span><span class="settlement-chart-sub">每{settlement.bucketIntervalMs}ms</span></div>
              <LineChartToggle settlement={settlement} />
            </div>

            <div class="settlement-chart-card" style={{ gridColumn: '1 / -1' }}>
              <div class="settlement-chart-header"><span>玩家伤害占比</span><span class="settlement-chart-sub">{formatDamage(totalDmg)}</span></div>
              <DonutChart players={settlement.players} />
            </div>
          </div>

          {settlement.players.some(p => p.onBoardChars.length > 0) && (
            <div class="settlement-chart-card" style={{ marginTop: '16px' }}>
              <div class="settlement-chart-header"><span>棋盘布局</span><span class="settlement-chart-sub">按玩家查看站位</span></div>
              <BoardLayoutToggle players={settlement.players.filter(p => p.onBoardChars.length > 0)} />
            </div>
          )}

          {bondMap.size > 0 && (
            <div class="settlement-chart-card" style={{ marginTop: '16px' }}>
              <div class="settlement-chart-header"><span>盟约叠层</span><span class="settlement-chart-sub">{bondMap.size} 种盟约</span></div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                <thead><tr style={{ borderBottom: '1px solid rgba(0,255,157,0.15)', opacity: 0.6 }}><th style={{ textAlign: 'left', padding: '4px 8px' }}>盟约</th>{settlement.players.map((p, i) => <th key={p.uid} style={{ textAlign: 'center', padding: '4px 8px', color: playerColor(i) }}>{p.nickName}</th>)}</tr></thead>
                <tbody>{Array.from(bondMap.values()).map(b => <tr key={b.bid} style={{ borderBottom: '1px solid rgba(0,255,157,0.04)' }}><td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{b.bid}</td>{settlement.players.map(p => <td key={p.uid} style={{ textAlign: 'center', padding: '4px 8px' }}>{b.layers[p.nickName] ?? 0}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab !== 'history' && !loading && !error && !settlement && <div style={{ opacity: 0.5, textAlign: 'center', padding: '30px', fontSize: '0.8rem' }}>暂无数据</div>}
    </section>
  );
}
