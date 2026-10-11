import { useEffect, useState } from 'preact/hooks';
import { executeCheatAction, fetchBountyList, type BountyCatalog, type CheatConnection } from './api';

// Season markup is displayed as text, never interpreted as HTML.
function plainText(value: string) {
  return value.replace(/<[^>]*>/g, '').replace(/\\n/g, '\n');
}

export function BountyPanel({ jwt, connection, onChanged }: {
  jwt: string;
  connection: CheatConnection;
  onChanged: () => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<BountyCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [effectId, setEffectId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const requestUserId = connection.requestUserId ?? connection.userId;
  const playerKey = connection.players.map(p => `${p.userId}:${!!p.isEliminated}`).join('|');
  const targets = connection.players.filter(p =>
    !p.isEliminated && (connection.isAdmin || p.userId === requestUserId));
  const target = targets.find(p => p.userId === targetUserId);

  useEffect(() => {
    setTargetUserId(current => targets.some(p => p.userId === current)
      ? current
      : (targets.find(p => p.userId === requestUserId)?.userId ?? targets[0]?.userId ?? ''));
  }, [connection.teamId, connection.isAdmin, requestUserId, playerKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCatalog(null);
    setResult(null);
    fetchBountyList(jwt, connection.teamId).then(data => {
      if (cancelled) return;
      setCatalog(data);
      setEffectId(current => data.bounties.some(b => b.effectId === current)
        ? current : (data.bounties.find(b => b.selectable)?.effectId ?? data.bounties[0]?.effectId ?? ''));
    }).catch((error: Error) => {
      if (!cancelled) setResult({ ok: false, text: error.message });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [jwt, connection.teamId, connection.round, connection.sceneState, connection.seasonHash, connection.inBattle]);

  const selected = catalog?.bounties.find(b => b.effectId === effectId);
  const query = search.trim().toLowerCase();
  const visible = catalog?.bounties.filter(b =>
    `${b.effectId} ${plainText(b.name)} ${plainText(b.description)} ${b.spawns.map(s => s.enemyId).join(' ')}`
      .toLowerCase().includes(query)) ?? [];

  const add = async () => {
    if (!selected?.selectable || !target || saving) return;
    setSaving(true);
    setResult(null);
    try {
      const response = await executeCheatAction(jwt, 'ADD_BOUNTY', {
        effectId: selected.effectId, targetUserId: target.userId,
      }, connection.teamId);
      setResult({ ok: true, text: response.message });
      await onChanged();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : '添加悬赏失败' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="admin-command-panel admin-bounty-panel">
      <div class="admin-panel-title">
        <h4>为下局添加指定悬赏</h4>
        <span>免费 · 下一场普通战斗 · 仅一次</span>
      </div>
      <div class="admin-bounty-target">
        <label>
          作用玩家
          {connection.isAdmin ? (
            <select class="select-field" aria-label="悬赏作用玩家" value={targetUserId} onChange={e => setTargetUserId(e.currentTarget.value)}>
              {!targets.length && <option value="">没有存活玩家</option>}
              {targets.map(p => <option key={p.userId} value={p.userId}>{p.nickName}</option>)}
            </select>
          ) : <strong>{target?.nickName ?? '本人已淘汰或不在对局中'}</strong>}
        </label>
        <span>{catalog?.targetRound != null ? `第 ${catalog.targetRound} 回合生效` : '没有后续普通战斗'}</span>
      </div>
      <div class="admin-bounty-layout">
        <div class="admin-chess-picker">
          <input class="input-field" aria-label="搜索悬赏" placeholder="搜索悬赏名称、描述或 ID" value={search} onInput={e => setSearch(e.currentTarget.value)} />
          <div class="admin-chess-results" role="listbox" aria-label="选择指定悬赏">
            {loading ? <div class="admin-chess-empty">正在读取当前赛季悬赏</div>
              : !visible.length ? <div class="admin-chess-empty">没有匹配的悬赏</div>
              : visible.map(b => (
                <button key={b.effectId} type="button" role="option" aria-selected={b.effectId === effectId}
                  class={`admin-chess-option ${b.effectId === effectId ? 'active' : ''}`} onClick={() => setEffectId(b.effectId)}>
                  <strong>{plainText(b.name)}</strong>
                  <small>{b.effectId}{!b.selectable ? ' · 不可添加' : ''}</small>
                </button>
              ))}
          </div>
        </div>
        <div class="admin-bounty-detail">
          {selected ? <>
            <strong>{plainText(selected.name)}</strong>
            <p class="admin-bounty-description">{plainText(selected.description)}</p>
            <span>赛季选择费用：{selected.price} 资金；本工具免费，持续次数覆盖为一次。</span>
            <ul>
              {selected.spawns.map((s, i) => <li key={i}>
                <code>{s.enemyId}</code> × {s.count}：
                {s.rewardType === 'kill' ? '击倒者获得' : '本人行动阶段完美作战获得'} {s.coin} 资金／只，
                合计 {s.count * s.coin} 资金
              </li>)}
            </ul>
            <strong>理论奖励合计：{selected.spawns.reduce((sum, s) => sum + s.count * s.coin, 0)} 资金</strong>
            {selected.unavailableReason && <p class="admin-result bad">{selected.unavailableReason}</p>}
          </> : <span>请选择悬赏查看敌人和资金奖励。</span>}
          <button type="button" disabled={saving || loading || !selected?.selectable || !target || !connection.inBattle}
            onClick={add}>{saving ? '添加中' : '添加到下一场普通战斗'}</button>
          {result && <span class={`admin-result ${result.ok ? 'ok' : 'bad'}`} role="status">{result.text}</span>}
        </div>
      </div>
    </section>
  );
}
