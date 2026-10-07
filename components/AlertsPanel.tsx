"use client";
import {useEffect,useMemo,useState} from "react";
import type {SignalAlert} from "@/lib/market/signals";

const SEEN_KEY="solanabubble:alerts:seen:v1";
function readSeen(){try{const rows=JSON.parse(localStorage.getItem(SEEN_KEY)||"[]");return new Set<string>(Array.isArray(rows)?rows.slice(-500):[]);}catch{return new Set<string>();}}
function writeSeen(seen:Set<string>){try{localStorage.setItem(SEEN_KEY,JSON.stringify([...seen].slice(-500)));}catch{}}

export default function AlertsPanel({alerts,onSelect}:{alerts:SignalAlert[];onSelect:(mint:string)=>void}){
  const [kind,setKind]=useState("all");
  const [mode,setMode]=useState<"all"|"new"|"seen">("all");
  const [seen,setSeen]=useState<Set<string>>(new Set());
  useEffect(()=>setSeen(readSeen()),[]);

  const list=useMemo(()=>alerts.filter(alert=>{
    if(kind!=="all"&&alert.kind!==kind)return false;
    const isSeen=seen.has(alert.id);
    return mode==="all"||(mode==="new"&&!isSeen)||(mode==="seen"&&isSeen);
  }),[alerts,kind,mode,seen]);

  const unread=alerts.reduce((sum,alert)=>sum+(seen.has(alert.id)?0:1),0);
  function markSeen(id:string){
    setSeen(current=>{const next=new Set(current);next.add(id);writeSeen(next);return next;});
  }
  function openAlert(alert:SignalAlert){markSeen(alert.id);onSelect(alert.mint);}
  function markAll(){
    setSeen(current=>{const next=new Set(current);for(const alert of alerts)next.add(alert.id);writeSeen(next);return next;});
  }

  return <section className="reference-side-card intelligence-alerts" aria-label="Smart alerts inbox">
    <div className="market-hot-title"><strong>Smart Alerts</strong><span>{unread} new · last 24h</span></div>
    <div className="alert-inbox-tabs" role="tablist" aria-label="Alert status">
      {(["all","new","seen"] as const).map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==="all"?"All":value==="new"?"New":"Seen"}</button>)}
      {unread>0&&<button type="button" onClick={markAll}>Mark all seen</button>}
    </div>
    <select aria-label="Alert type" value={kind} onChange={e=>setKind(e.target.value)}>
      <option value="all">All signals</option>{["smart-opportunity","smart-money-inflow","smart-money-exit","coordinated-buying","coordinated-selling","bullish-divergence","bearish-divergence","opportunity","hype-threshold","hype-velocity","hype-acceleration","hype","holder-growth","buy-pressure","liquidity","liquidity-disappearing","whale-enter","whale-exit","top-holder-selling"].map(k=><option value={k} key={k}>{k.replaceAll("-"," ")}</option>)}
    </select>
    {list.slice(0,30).map(alert=><button key={alert.id} className={seen.has(alert.id)?"alert-seen":"alert-new"} onClick={()=>openAlert(alert)}>
      <strong>{alert.symbol||alert.mint.slice(0,6)}</strong>
      <span className={alert.severity==="critical"?"sell":""}>{alert.kind.replaceAll("-"," ")}</span>
      <small>{alert.message} · {new Date(alert.at).toLocaleTimeString()}</small>
    </button>)}
    {!list.length&&<p className="signal-note">{mode==="new"?"No unread alerts.":"No threshold crossings in this period."}</p>}
  </section>;
}
