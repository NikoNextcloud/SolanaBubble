"use client";
import { useEffect, useState } from 'react';
import type { SignalToken } from '@/lib/market/signals';
const number = (v: number | null | undefined, suffix = '') => v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString(undefined,{maximumFractionDigits:2})}${suffix}`;
type History = { observed_at: string; payload: SignalToken };
export default function TokenSignalCard({ token }: { token: SignalToken }) {
  const [history, setHistory] = useState<History[]>([]);
  const [status, setStatus] = useState('Loading history…');
  useEffect(() => {
    const controller = new AbortController();
    setHistory([]); setStatus('Loading history…');
    fetch(`/api/market/history?mint=${encodeURIComponent(token.mint)}&hours=24`,{signal:controller.signal})
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(j => { setHistory(j.snapshots ?? []); setStatus(j.snapshots?.length > 1 ? '' : 'History accumulates after the worker runs.'); })
      .catch(() => { if (!controller.signal.aborted) setStatus('History temporarily unavailable.'); });
    return () => controller.abort();
  },[token.mint,token.baselineAt]);
  const start = history.length ? Date.parse(history[0].observed_at) : 0;
  const duration = history.length ? Math.max(1,Date.parse(history.at(-1)!.observed_at)-start) : 1;
  const path = history.map(h => `${10+(Date.parse(h.observed_at)-start)/duration*260},${90-Math.max(0,Math.min(100,h.payload.hypeScore ?? 0))*.8}`).join(' ');
  const rows: [string, string][] = [
    ['Hype Δ',number(token.hypeDelta,' H')], ['Hype Velocity',number(token.hypeVelocity,' H/min')],
    ['Holders',number(token.holderCount)], ['Holder Growth',`${number(token.holderGrowth)} (${number(token.holderGrowthPct,'%')})`],
    ['Fresh holders',number(token.freshWallets)], ['Top 10 supply',number(token.top10SupplyPct,'%')],
    ['Volume acceleration',number(token.volumeAcceleration,' $/min²')], ['Liquidity Δ',number(token.liquidityChangePct,'%')],
    ['Buy pressure (count)',number(token.buyPressure,'%')], ['Linked wallets',number(token.linkedWallets)],
    ['Suspicious wallets',number(token.suspiciousWallets)], ['Whale enter / exit',`${number(token.whaleEnter)} / ${number(token.whaleExit)}`],
    ['Whale balance Δ',number(token.smartMoneyFlowUsd,' $')],
  ];
  return <section className="signal-card reference-side-card" aria-label="Token Signal Card">
    <div className="market-hot-title"><strong>Token Signal Card</strong><b className={(token.riskScore ?? 0) >= 50 ? 'sell' : ''}>Risk {number(token.riskScore)} / 100</b></div>
    {token.liquidityWarning && <p className="signal-warning" role="alert">⚠ Liquidity disappearing: {number(token.liquidityChangePct,'%')}</p>}
    <dl className="market-token-stats">{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <small className="signal-note">{token.riskCoverage ?? 'Awaiting server observation'}</small>
    {!!token.riskReasons?.length && <ul className="signal-reasons">{token.riskReasons.map(r => <li key={r}>{r}</li>)}</ul>}
    <small className="signal-note">Holder observation: {token.holderObservedAt ? new Date(token.holderObservedAt).toLocaleString() : 'not available'}. Fresh = newly observed token holders. Whale signals include pool/program owners; balance changes are not verified buys/sells. Linked funding/timing indicates a relationship, not proof of abuse.</small>
    <small className="signal-note">Relationships: {token.relationshipCoverage ?? 'not yet sampled'}</small>
    {!!token.walletEvidence?.length && <details className="signal-note"><summary>Wallet relationship evidence</summary>{token.walletEvidence.map((e,i) => <p key={i}>{e.kind}: {e.wallets.map(w => `${w.slice(0,4)}…${w.slice(-4)}`).join(' ↔ ')}<br />{e.evidence.map(v=>v.startsWith('funder:') ? v : `tx:${v}`).join(' · ')}</p>)}</details>}
    <div className="signal-history"><strong>Hype history · 24h</strong>
      {history.length > 1 && <svg viewBox="0 0 280 100" role="img" aria-label="Hype score over time, last 24 hours"><title>Hype 0–100 over time</title><line x1="10" y1="90" x2="270" y2="90" stroke="#444"/><polyline points={path} fill="none" stroke="#a391ef" strokeWidth="2"/></svg>}
      <small>{status || `${history.length} snapshots · ${new Date(start).toLocaleTimeString()} → ${new Date(history.at(-1)!.observed_at).toLocaleTimeString()}`}</small>
    </div>
  </section>;
}
