"use client";
import { useState } from 'react';
import { moverCategories, rankMovers, type SignalToken } from '@/lib/market/signals';
export default function MoversPanel<T extends SignalToken>({ tokens, onSelect, limit = 8 }: { tokens: T[]; onSelect: (token: T) => void; limit?: number }) {
  const [category, setCategory] = useState(0);
  const selected = moverCategories[category];
  const movers = rankMovers(tokens,selected.key).slice(0,limit);
  return <section className="reference-side-card intelligence-movers">
    <div className="market-hot-title"><strong>Top Movers</strong></div>
    <select aria-label="Top Movers category" value={category} onChange={e => setCategory(Number(e.target.value))}>{moverCategories.map((c,i) => <option key={c.key} value={i}>{c.label}</option>)}</select>
    <small className="signal-note">{selected.unit} · sorted by magnitude{selected.key === 'holderGrowthPct' ? ' · per holder observation' : ''}</small>
    {movers.map(t => <button key={t.mint} onClick={() => onSelect(t)}><strong>{t.symbol || t.mint.slice(0,6)}</strong><b className={(t[selected.key] ?? 0) >= 0 ? 'buy' : 'sell'}>{(t[selected.key] ?? 0).toLocaleString(undefined,{maximumFractionDigits:2})}</b></button>)}
    {!movers.length && <p className="signal-note">Waiting for comparable observations.</p>}
  </section>;
}
