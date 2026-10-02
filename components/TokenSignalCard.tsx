"use client";
import { useEffect, useState } from 'react';
import type { SignalToken, WindowMinutes } from '@/lib/market/signals';
const number = (v: number | null | undefined, suffix = '') => v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString(undefined,{maximumFractionDigits:2})}${suffix}`;
import FavoriteButton from './FavoriteButton';
import DataQuality from './DataQuality';
import TrafficCard from './TrafficCard';
import type {WatchToken} from '@/lib/watchlist';
type History = { observed_at: string; payload: SignalToken };
export default function TokenSignalCard({ token }: { token: WatchToken }) {
  const [windowMinutes,setWindowMinutes]=useState<WindowMinutes>('5');
  const [chartMetric,setChartMetric]=useState<'hypeScore'|'volume1h'|'liquidityUsd'|'priceUsd'|'holderCount'>('hypeScore');
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
  const samples=history.filter(h=>typeof h.payload[chartMetric]==='number' && Number.isFinite(h.payload[chartMetric]));
  const start = samples.length ? Date.parse(samples[0].observed_at) : 0;
  const duration = samples.length ? Math.max(1,Date.parse(samples.at(-1)!.observed_at)-start) : 1;
  const values=samples.map(h=>Number(h.payload[chartMetric]));
  const low=chartMetric==='hypeScore'?0:Math.min(...values),high=chartMetric==='hypeScore'?100:Math.max(...values);
  const path = samples.map(h => `${10+(Date.parse(h.observed_at)-start)/duration*260},${90-(Number(h.payload[chartMetric])-low)/Math.max(high-low,Math.abs(high)*.001,1e-12)*80}`).join(' ');
  const marketWindow=token.windows?.[windowMinutes], holderWindow=token.holderWindows?.[windowMinutes];
  const windowRows:[string,string][]=[['Hype Δ',number(marketWindow?.hypeDelta,' H')],['Volume Δ (rolling 1h)',number(marketWindow?.volumeChangePct,'%')],['Liquidity Δ',number(marketWindow?.liquidityChangePct,'%')],['Price Δ',number(marketWindow?.priceChangePct,'%')],['Holder growth',`${number(holderWindow?.holderGrowth)} (${number(holderWindow?.holderGrowthPct,'%')})`],['New / exited holders',`${number(holderWindow?.newHolders)} / ${number(holderWindow?.exitedHolders)}`]];
  const rows: [string, string][] = [
    ['Hype',number(token.hypeScore,' / 100')], ['Hype Δ',number(token.hypeDelta,' H')], ['Hype Velocity',number(token.hypeVelocity,' H/min')],
    ['Hype acceleration',number(token.hypeAcceleration,' H/min²')], ['Net Flow · 1h (estimate)',number(token.netFlowUsd1h,' $')],
    ['Holders',number(token.holderCount)], ['Holder Growth',`${number(token.holderGrowth)} (${number(token.holderGrowthPct,'%')})`],
    ['New / exited holders',`${number(token.newHolders)} / ${number(token.exitedHolders)}`],
    ['Whale supply',number(token.whaleConcentrationPct,'%')], ['Largest holder',number(token.largestHolderPct,'%')], ['Linked supply (sample)',number(token.linkedSupplyPct,'%')], ['FDV / liquidity',number(token.fdvLiquidityRatio,'×')],
    ['Fresh holders',number(token.freshWallets)], ['Top 10 supply',number(token.top10SupplyPct,'%')],
    ['Volume acceleration',number(token.volumeAcceleration,' $/min²')], ['Liquidity Δ',number(token.liquidityChangePct,'%')],
    ['Buy pressure (count)',number(token.buyPressure,'%')], ['Linked wallets',number(token.linkedWallets)],
    ['Suspicious wallets',number(token.suspiciousWallets)], ['Whale enter / exit',`${number(token.whaleEnter)} / ${number(token.whaleExit)}`],
    ['Whale balance Δ',number(token.smartMoneyFlowUsd,' $')],
  ];
  return <section className="signal-card reference-side-card" aria-label="Token Signal Card">
    <div className="market-hot-title"><strong>Token Signal Card</strong><b className={(token.riskScore ?? 0) >= 50 ? 'sell' : ''}>Risk {number(token.riskScore)} / 100</b></div>
    <FavoriteButton token={token}/>
    <DataQuality token={token}/>
    <TrafficCard sample={token.trafficSample}/>
    {token.liquidityWarning && <p className="signal-warning" role="alert">⚠ Liquidity disappearing: {number(token.liquidityChangePct,'%')}</p>}
    <dl className="market-token-stats">{rows.map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="signal-comparisons">
      <label>Compare <select aria-label="Signal comparison interval" value={windowMinutes} onChange={e=>setWindowMinutes(e.target.value as WindowMinutes)}>{(['5','15','60','360'] as const).map((w,i)=><option key={w} value={w}>{['5m','15m','1h','6h'][i]}</option>)}</select></label>
      <dl className="market-token-stats">{windowRows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <small className="signal-note">{marketWindow ? `Market interval: ${number(marketWindow.elapsedMinutes)} min` : 'No comparable market baseline yet.'} · {holderWindow ? `Holder interval: ${number(holderWindow.elapsedMinutes)} min; observed ${new Date(holderWindow.observedAt).toLocaleTimeString()}` : 'Holder baseline unavailable for this interval.'}</small>
    </div>
    <small className="signal-note">{token.riskCoverage ?? 'Awaiting server observation'}</small>
    {!!token.riskReasons?.length && <ul className="signal-reasons">{token.riskReasons.map(r => <li key={r}>{r}{token.riskFactors?.find(f=>f.label===r) ? ` · +${token.riskFactors.find(f=>f.label===r)!.points} risk` : ''}</li>)}</ul>}
    <small className="signal-note">Holder observation: {token.holderObservedAt ? new Date(token.holderObservedAt).toLocaleString() : 'not available'}. Fresh = newly observed token holders. Whale signals include pool/program owners; balance changes are not verified buys/sells. Linked funding/timing indicates a relationship, not proof of abuse.</small>
    <small className="signal-note">Relationships: {token.relationshipCoverage ?? 'not yet sampled'}</small>
    {!!token.walletEvidence?.length && <details className="signal-note"><summary>Wallet relationship evidence</summary>{token.walletEvidence.map((e,i) => <p key={i}>{e.kind}: {e.wallets.map(w => `${w.slice(0,4)}…${w.slice(-4)}`).join(' ↔ ')}<br />{e.evidence.map(v=>v.startsWith('funder:') ? v : `tx:${v}`).join(' · ')}</p>)}</details>}
    {!!token.topHolderSales?.length && <details className="signal-note"><summary>Top owner swap-like outflows</summary>{token.topHolderSales.map(s=><p key={`${s.wallet}:${s.signature}`}>{s.wallet.slice(0,6)}… · {number(s.amount)} tokens · {new Date(s.at).toLocaleString()}<br />Transaction: {s.signature}</p>)}</details>}
    <div className="signal-history"><strong>History · 24h</strong>
      <select aria-label="History metric" value={chartMetric} onChange={e=>setChartMetric(e.target.value as typeof chartMetric)}><option value="hypeScore">Hype</option><option value="volume1h">Volume · rolling 1h</option><option value="liquidityUsd">Liquidity</option><option value="priceUsd">Price</option><option value="holderCount">Holders · sampled</option></select>
      {samples.length > 1 && <svg viewBox="0 0 280 100" role="img" aria-label={`${chartMetric} over time, last 24 hours`}><title>{chartMetric}: {number(low)}–{number(high)}</title><line x1="10" y1="90" x2="270" y2="90" stroke="#444"/><polyline points={path} fill="none" stroke="#a391ef" strokeWidth="2"/></svg>}
      <small>{status || (samples.length>1 ? `${samples.length} snapshots · ${new Date(start).toLocaleTimeString()} → ${new Date(samples.at(-1)!.observed_at).toLocaleTimeString()}` : 'Not enough observations for this metric.')}</small>
    </div>
  </section>;
}
