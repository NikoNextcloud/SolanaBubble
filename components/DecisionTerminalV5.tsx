"use client";
import {useEffect,useMemo,useState} from "react";
import type {CoordinatedCluster,ValidationSummary,WalletProfile,AdaptiveOpportunity} from "@/lib/market/intelligence-core";
import type {DecisionTerminal,ReplayPoint,WalletNetwork} from "@/lib/market/decision-terminal";

type Payload={
 observedAt:string;walletProfiles:WalletProfile[];coordinatedClusters:CoordinatedCluster[];adaptiveOpportunity:AdaptiveOpportunity;
 validation:ValidationSummary;decision:DecisionTerminal;replay:ReplayPoint[];walletNetwork:WalletNetwork;
 smartMoney:{smartWalletCount:number;entering:number;exiting:number;netUsd:number|null;confidence:number};
 evidence:{recognizedSwaps:number;historicalSnapshots:number;note:string};
};
const finite=(v:number|null|undefined):v is number=>typeof v==="number"&&Number.isFinite(v);
const usd=(v:number|null)=>v==null?"—":(v>=0?"+":"−")+"$"+Math.abs(v).toLocaleString(undefined,{maximumFractionDigits:0});
const fmt=(v:number|null,suffix="")=>v==null||!Number.isFinite(v)?"—":v.toLocaleString(undefined,{maximumFractionDigits:2})+suffix;
const short=(v:string)=>v.length>12?v.slice(0,5)+"…"+v.slice(-4):v;

function normalizedPoints(points:ReplayPoint[],key:"price"|"opportunity"){
 const values=points.map(p=>p[key]).filter(finite);if(!values.length)return "";
 const min=Math.min(...values),max=Math.max(...values),span=Math.max(.000001,max-min);
 return points.map((p,i)=>{const v=p[key];if(!finite(v))return null;const x=4+i*(112/Math.max(1,points.length-1)),y=44-(v-min)/span*36;return x.toFixed(1)+","+y.toFixed(1)}).filter(Boolean).join(" ");
}

function WalletNetworkView({network}:{network:WalletNetwork}){
 const nodes=network.nodes.slice(0,9);if(nodes.length<2)return <p className="signal-note">Not enough wallet-network evidence yet.</p>;
 const center={x:80,y:58},wallets=nodes.filter(n=>n.kind==="wallet");
 const pos=new Map<string,{x:number;y:number}>([[nodes[0].id,center]]);
 wallets.forEach((n,i)=>{const a=(Math.PI*2*i)/Math.max(1,wallets.length)-Math.PI/2;pos.set(n.id,{x:center.x+Math.cos(a)*50,y:center.y+Math.sin(a)*42})});
 return <svg viewBox="0 0 160 116" role="img" aria-label="Wallet network graph" style={{width:"100%",height:116}}>
  {network.links.filter(l=>pos.has(l.source)&&pos.has(l.target)).map((l,i)=>{const a=pos.get(l.source)!,b=pos.get(l.target)!;return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={l.kind==="distribution"?"#ed7278":l.kind==="coordinated"?"#d18cf4":"#70d9a0"} strokeWidth={Math.max(1,Math.min(3,l.weight/35))} opacity=".65"/>})}
  {nodes.map(n=>{const p=pos.get(n.id)!;return <g key={n.id}><circle cx={p.x} cy={p.y} r={n.kind==="token"?10:5+(n.score??40)/35} fill={n.kind==="token"?"#88a8ff":(n.netUsd??0)>=0?"#4caa7a":"#b95d65"} stroke="#d8e0e8" strokeWidth=".7"/><text x={p.x} y={p.y+(n.kind==="token"?17:14)} textAnchor="middle" fill="#b9c2ca" fontSize="6">{n.label}</text><title>{n.label+(n.score!=null?" · score "+n.score:"")+(n.netUsd!=null?" · net "+usd(n.netUsd):"")}</title></g>})}
 </svg>;
}

export default function DecisionTerminalV5({mint}:{mint:string}){
 const [data,setData]=useState<Payload|null>(null),[loading,setLoading]=useState(true),[index,setIndex]=useState(0);
 useEffect(()=>{let stopped=false;setLoading(true);fetch("/api/market/intelligence?mint="+encodeURIComponent(mint),{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{if(stopped)return;setData(j);setIndex(Math.max(0,(j.replay?.length??1)-1))}).catch(()=>{if(!stopped)setData(null)}).finally(()=>{if(!stopped)setLoading(false)});return()=>{stopped=true}},[mint]);
 const replay=data?.replay??[],point=replay[index]??replay.at(-1)??null;
 const priceLine=useMemo(()=>normalizedPoints(replay,"price"),[replay]),oppLine=useMemo(()=>normalizedPoints(replay,"opportunity"),[replay]);
 if(loading)return <section className="opportunity-score" aria-label="Decision Terminal v5"><div><span>Decision Terminal v5</span><strong>Loading…</strong></div></section>;
 if(!data)return <section className="opportunity-score" aria-label="Decision Terminal v5"><div><span>Decision Terminal v5</span><strong>Insufficient data</strong></div><small>Waiting for retained market intelligence.</small></section>;
 const d=data.decision,verdictClass=d.verdict==="STRONG BUY"?"buy":d.verdict==="EXIT RISK"?"sell":"";
 const jump=(hours:number)=>{if(!replay.length)return;const target=Date.now()-hours*3600000;let best=0;for(let i=0;i<replay.length;i++)if(Date.parse(replay[i].at)<=target)best=i;setIndex(best)};
 return <section className="decision-terminal-v5" aria-label="Decision Terminal v5">
  <div className="opportunity-score">
   <div><span>Decision Terminal v5</span><strong className={verdictClass}>{d.verdict}</strong></div>
   <small>Decision {d.score}/100 · confidence {d.confidence}/100 · data {d.freshness.status}{d.freshness.ageMinutes!=null?" "+d.freshness.ageMinutes+"m":""}</small>
   <p className="signal-note">{d.brief}</p>
   <div className="signal-summary-grid">
    <div><span>Adaptive</span><strong>{data.adaptiveOpportunity.score}</strong></div>
    <div><span>Smart wallets</span><strong>{data.smartMoney.smartWalletCount}</strong></div>
    <div><span>Smart flow</span><strong className={(data.smartMoney.netUsd??0)>=0?"buy":"sell"}>{usd(data.smartMoney.netUsd)}</strong></div>
    <div><span>Validation</span><strong>{data.validation.calibrationLabel}</strong></div>
   </div>
   {!!d.whyNow.length&&<div className="signal-thesis buy"><b>Why now</b><p>{d.whyNow.slice(0,3).join(" · ")}</p></div>}
   {!!d.risks.length&&<div className="signal-thesis sell"><b>Watch risk</b><p>{d.risks.slice(0,2).join(" · ")}</p></div>}
  </div>

  <div className="token-sparkline decision-replay" aria-label="Time Machine replay">
   <div><strong>Time Machine</strong><span>{point?new Date(point.at).toLocaleString():"—"}</span></div>
   <svg viewBox="0 0 120 48" preserveAspectRatio="none" role="img" aria-label="Price and Opportunity replay chart">
    {priceLine&&<polyline points={priceLine} fill="none" stroke="#70d9a0" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>}
    {oppLine&&<polyline points={oppLine} fill="none" stroke="#89a8ff" strokeWidth="1.3" strokeDasharray="3 2" vectorEffect="non-scaling-stroke"/>}
   </svg>
   <input aria-label="Time Machine position" type="range" min="0" max={Math.max(0,replay.length-1)} value={Math.min(index,Math.max(0,replay.length-1))} onChange={e=>setIndex(Number(e.target.value))} style={{width:"100%"}}/>
   <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><button type="button" onClick={()=>jump(1)}>1h</button><button type="button" onClick={()=>jump(6)}>6h</button><button type="button" onClick={()=>jump(24)}>24h</button><button type="button" onClick={()=>setIndex(Math.max(0,replay.length-1))}>NOW</button></div>
   <small>Price {fmt(point?.price??null," $")} · Opportunity {fmt(point?.opportunity??null)} · Flow {fmt(point?.capitalFlow??null)} · Hype {fmt(point?.hype??null)} · Risk {fmt(point?.risk??null)}</small>
  </div>

  <details className="signal-disclosure">
   <summary>Backtest & wallet network</summary>
   <dl className="market-token-stats">
    {(["15","60","360"] as const).map(k=>{const w=data.validation.windows[k];return <div key={k}><dt>{k==="15"?"15m":k==="60"?"1h":"6h"} validation</dt><dd>{w?.samples?Math.round(w.winRate??0)+"% positive · "+fmt(w.avgReturnPct,"% avg"):"—"}</dd></div>})}
   </dl>
   <WalletNetworkView network={data.walletNetwork}/>
   <small className="signal-note">{data.evidence.recognizedSwaps} recognized swaps · {data.evidence.historicalSnapshots} snapshots. Historical outcomes are calibration evidence, not a guarantee.</small>
  </details>
 </section>;
}
