"use client";
import {useState} from 'react';
import type {TrafficSummary} from '@/lib/market/traffic/summary';
const n=(v:number|null|undefined,s='')=>v==null?'—':`${v.toLocaleString(undefined,{maximumFractionDigits:1})}${s}`;
export default function TrafficCard({sample}:{sample?:TrafficSummary|null}){
 const [window,setWindow]=useState('15');
 if(!sample)return <div className="signal-comparisons"><strong>Swap Traffic · partial sample</strong><p className="signal-note">Awaiting a background scan of this token’s selected pool. Direct PumpSwap and Raydium CPMM only.</p></div>;
 const w=sample.windows[window];
 const rows:[string,string][]=[['Buyer / seller wallets',`${n(w.buyers)} / ${n(w.sellers)}`],['Buy / sell swaps',`${n(w.buys)} / ${n(w.sells)}`],['Buy / sell USD · sample',`${n(w.buyUsd,' $')} / ${n(w.sellUsd,' $')}`],['Net USD · sample',n(w.netUsd,' $')],['First seen / returning buyers',`${n(w.newSampleBuyers)} / ${n(w.repeatSampleBuyers)}`],['Median / largest buy',`${n(w.medianBuyUsd,' $')} / ${n(w.largestBuyUsd,' $')}`],['Top 3 buyer share',n(w.top3BuyerSharePct,'%')],['Quick resale wallets ≤15m',n(w.quickResellers)],['Buyers still holding · checked',`${n(w.retainedBuyers)} / ${n(w.retentionChecked)}`],['Linked buyers · sampled evidence',n(w.linkedBuyers)]];
 return <div className="signal-comparisons"><strong>Swap Traffic · partial sample</strong><label> Window <select aria-label="Swap sample interval" value={window} onChange={e=>setWindow(e.target.value)}><option value="5">5m</option><option value="15">15m</option><option value="60">1h</option></select></label>
 <p className="signal-note">Window ends at scan: {new Date(sample.observedAt).toLocaleString()}. This is a sampled pool, not the whole token market.</p>
 <dl className="market-token-stats">{rows.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
 <details className="signal-note"><summary>Coverage and interpretation</summary><p>Pool: {sample.pool}</p><p>Retained scans: {sample.scans}; parsed transactions: {sample.parsedTransactions}; recognized: {sample.recognizedTransactions}; unsupported: {sample.unrecognizedTransactions}; unavailable: {sample.unavailableTransactions}. Limited scans: {sample.limitedScans}{sample.rowLimitReached?'; row limit reached':''}.</p><p>RPC diagnostics: {Object.entries(sample.failures??{}).map(([k,v])=>`${k}: ${v}`).join(" · ")||"No recorded error classifications"}</p><p>{sample.note}</p><p>Returning buyers were seen before this window in retained samples. Retention is checked only against a recent holder observation after the purchase; unknown values remain —. Related wallets are evidence of a relationship, not proof of coordinated trading. Median/largest buys use only priced swaps.</p></details></div>;
}
