"use client";
import {useEffect,useState} from "react";
import type {AdaptiveOpportunity,CoordinatedCluster,WalletProfile,ValidationSummary} from "@/lib/market/intelligence-core";

type Payload={
 observedAt:string;trafficWindowHours:number;walletProfiles:WalletProfile[];
 smartMoney:{wallets:WalletProfile[];smartWalletCount:number;entering:number;exiting:number;netUsd:number|null;confidence:number};
 coordinatedClusters:CoordinatedCluster[];
 adaptiveOpportunity:AdaptiveOpportunity;
 validation:ValidationSummary;
 evidence:{recognizedSwaps:number;historicalSnapshots:number;note:string};
};
const usd=(v:number|null)=>v==null?"—":`${v>=0?"+":"−"}$${Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:0})}`;
const pct=(v:number|null)=>v==null?"—":`${v>=0?"+":""}${v.toFixed(1)}%`;
const wallet=(v:string)=>v.length>12?`${v.slice(0,5)}…${v.slice(-4)}`:v;

export default function TokenIntelligenceV4({mint}:{mint:string}){
 const [data,setData]=useState<Payload|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let stopped=false;setLoading(true);
  fetch(`/api/market/intelligence?mint=${encodeURIComponent(mint)}`,{cache:"no-store"})
   .then(r=>r.ok?r.json():Promise.reject())
   .then(j=>{if(!stopped)setData(j)})
   .catch(()=>{if(!stopped)setData(null)})
   .finally(()=>{if(!stopped)setLoading(false)});
  return()=>{stopped=true};
 },[mint]);
 if(loading)return <details className="signal-disclosure signal-comparisons"><summary>Intelligence Core v4 · loading…</summary></details>;
 if(!data)return <details className="signal-disclosure signal-comparisons"><summary>Intelligence Core v4 · insufficient data</summary><p className="signal-note">No retained wallet/validation evidence is available for this token yet.</p></details>;
 const sm=data.smartMoney,v=data.validation,adaptive=data.adaptiveOpportunity,clusters=data.coordinatedClusters??[];
 return <div className="intelligence-v4" aria-label="Intelligence Core v4.1">
  <div className="opportunity-score adaptive-opportunity">
   <div><span>Adaptive Opportunity</span><strong>{adaptive.score} / 100</strong></div>
   <small>Base {adaptive.baseScore} · Δ {adaptive.delta>=0?"+":""}{adaptive.delta} · confidence {adaptive.confidence}/100</small>
   {adaptive.reasons.length>0&&<details><summary>Adaptive weighting</summary><ul>{adaptive.reasons.map(reason=><li key={reason}><span>{reason}</span></li>)}</ul></details>}
  </div>
  <div className="opportunity-score">
   <div><span>Smart Money</span><strong>{sm.smartWalletCount} wallets</strong></div>
   <small>Confidence {sm.confidence}/100 · {sm.entering} entering / {sm.exiting} exiting · net {usd(sm.netUsd)}</small>
   <details>
    <summary>Wallet intelligence</summary>
    <ul>{data.walletProfiles.slice(0,8).map(p=><li key={p.wallet}>
      <span><b>{wallet(p.wallet)} · {p.label} {p.score}/100</b><small>{p.buys} buys / {p.sells} sells · direct {p.directSharePct.toFixed(0)}% · net {usd(p.netUsd)}</small>{p.reasons[0]&&<small>{p.reasons[0]}</small>}</span>
      <b className={(p.netUsd??0)>=0?"buy":"sell"}>{p.label}</b>
    </li>)}</ul>
   </details>
   {clusters.length>0&&<details><summary>Coordinated wallet activity · {clusters.length}</summary><ul>{clusters.slice(0,5).map(c=><li key={c.id}><span><b>{c.side.toUpperCase()} · {c.wallets.length} wallets · {c.confidence}</b><small>{c.swaps} swaps · direct {c.directSharePct.toFixed(0)}% · score {c.score}/100{c.totalUsd!=null?` · ${usd(c.side==="buy"?c.totalUsd:-c.totalUsd)}`:""}</small></span><b className={c.side==="buy"?"buy":"sell"}>{c.side==="buy"?"IN":"OUT"}</b></li>)}</ul></details>}
  </div>
  <details className="signal-disclosure signal-comparisons" open={v.calibrationLabel==="validated"}>
   <summary><span>Signal Validation · {v.calibrationLabel}</span><b>{v.samples} samples</b></summary>
   <dl className="market-token-stats">
    {(["15","60","360"] as const).map(key=>{const w=v.windows[key];return <div key={key}><dt>{key==="60"?"1h":key==="360"?"6h":"15m"} outcome</dt><dd>{w?.samples? `${(w.calibratedWinRate??w.winRate)?.toFixed(0)}% calibrated · ${pct(w.medianReturnPct)} median`:"—"}</dd></div>})}
   </dl>
   <p className="signal-note">{v.note}</p>
  </details>
  <small className="signal-note">{data.evidence.recognizedSwaps} retained recognized swaps · {data.evidence.historicalSnapshots} historical snapshots. {data.evidence.note}</small>
 </div>;
}
