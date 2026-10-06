"use client";
import { useState } from 'react';
import type { SignalAlert } from '@/lib/market/signals';
export default function AlertsPanel({ alerts, onSelect }: { alerts: SignalAlert[]; onSelect: (mint:string) => void }) {
  const [kind,setKind] = useState('all');
  const list = alerts.filter(a => kind === 'all' || a.kind === kind);
  return <section className="reference-side-card intelligence-alerts">
    <div className="market-hot-title"><strong>Alerts</strong><span>Last 24h</span></div>
    <select aria-label="Alert type" value={kind} onChange={e=>setKind(e.target.value)}>
      <option value="all">All signals</option>{['smart-opportunity','smart-money-inflow','smart-money-exit','coordinated-buying','coordinated-selling','bullish-divergence','bearish-divergence','opportunity','hype-threshold','hype-velocity','hype-acceleration','hype','holder-growth','buy-pressure','liquidity','liquidity-disappearing','whale-enter','whale-exit','top-holder-selling'].map(k=><option value={k} key={k}>{k.replaceAll('-',' ')}</option>)}
    </select>
    {list.slice(0,30).map(a=><button key={a.id} onClick={()=>onSelect(a.mint)}><strong>{a.symbol || a.mint.slice(0,6)}</strong><span className={a.severity==='critical'?'sell':''}>{a.kind.replaceAll('-',' ')}</span><small>{a.message} · {new Date(a.at).toLocaleTimeString()}</small></button>)}
    {!list.length && <p className="signal-note">No threshold crossings in this period.</p>}
  </section>;
}
