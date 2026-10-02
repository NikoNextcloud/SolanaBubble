"use client";
import {useEffect,useState} from 'react';
import {observationQuality} from '@/lib/market/quality';
import type {WatchToken} from '@/lib/watchlist';
export default function DataQuality({token,marketAt}:{token?:WatchToken;marketAt?:string|null}){
  const [now,setNow]=useState<number|null>(null);useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const row=(label:string,at?:string|null,limit=10)=>{const q=observationQuality(at,now??NaN,limit);return <div><dt>{label}</dt><dd><span className={`quality-${q.status}`}>{now?q.label:'Checking'}</span> · {at&&Number.isFinite(Date.parse(at))?new Date(at).toLocaleString():'not observed'}{q.ageMinutes!=null&&` · ${Math.round(q.ageMinutes)}m ago`}</dd></div>;};
  return <details className="data-quality reference-side-card" open={!!token}><summary>Data Quality</summary><dl>{row('Market · DexScreener aggregates',marketAt??token?.marketObservedAt??token?.windows?.['5']?.observedAt)}{token&&row('Holders · RPC observation',token.holderObservedAt,60)}{token&&row('Swaps · selected pool sample',token.trafficSample?.observedAt)}</dl>
    {token&&<p>Traffic evidence: {token.trafficEvidence??'awaiting scan'}{token.trafficSample?` · ${token.trafficSample.recognizedTransactions} recognized / ${token.trafficSample.parsedTransactions} parsed`:''}. Wallet coverage: {token.relationshipCoverage??'not sampled'}. Window baselines: market {Object.keys(token.windows??{}).length}/4; holders {Object.keys(token.holderWindows??{}).length}/4.</p>}
    <p><b>Observed:</b> reported price, liquidity and volume; RPC holder balances.<br/><b>Computed:</b> Hype, deltas, holder growth and concentration.<br/><b>Estimates:</b> Net Flow from trade counts; Smart Money from whale balance changes.<br/><b>Heuristics:</b> Risk and linked/suspicious wallets; not proof of abuse.</p>
    <small>Market becomes stale after 10m; holders after 60m. Fresh wallets = newly observed token holders, not wallet creation age. Pool/program owners can be included. Missing data remains unknown.</small>
  </details>;
}
