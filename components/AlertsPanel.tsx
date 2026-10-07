"use client";
import {useEffect,useMemo,useState} from "react";
import type {SignalAlert} from "@/lib/market/signals";

const READ_KEY="solanabubble:alerts-read:v1";
function loadRead(){try{const raw=JSON.parse(localStorage.getItem(READ_KEY)||"[]");return new Set<string>(Array.isArray(raw)?raw.slice(0,500):[]);}catch{return new Set<string>();}}
function saveRead(read:Set<string>){try{localStorage.setItem(READ_KEY,JSON.stringify([...read].slice(-500)));}catch{}}

export default function AlertsPanel({alerts,onSelect}:{alerts:SignalAlert[];onSelect:(mint:string)=>void}){
  const [kind,setKind]=useState("all");
  const [severity,setSeverity]=useState("all");
  const [read,setRead]=useState<Set<string>>(()=>new Set());
  useEffect(()=>setRead(loadRead()),[]);
  const list=useMemo(()=>alerts.filter(a=>(kind==="all"||a.kind===kind)&&(severity==="all"||a.severity===severity)),[alerts,kind,severity]);
  const unread=alerts.filter(a=>!read.has(a.id)).length;
  const mark=(id:string)=>setRead(current=>{const next=new Set(current);next.add(id);saveRead(next);return next;});
  const markAll=()=>{const next=new Set(read);for(const alert of alerts)next.add(alert.id);saveRead(next);setRead(next);};
  return <section className="reference-side-card intelligence-alerts">
    <div className="market-hot-title"><strong>Alerts <i className="alert-unread-count">{unread}</i></strong><span>Last 24h</span></div>
    <div className="alert-controls">
      <select aria-label="Alert type" value={kind} onChange={e=>setKind(e.target.value)}>
        <option value="all">All signals</option>{["smart-opportunity","smart-money-inflow","smart-money-exit","coordinated-buying","coordinated-selling","bullish-divergence","bearish-divergence","opportunity","hype-threshold","hype-velocity","hype-acceleration","hype","holder-growth","buy-pressure","liquidity","liquidity-disappearing","whale-enter","whale-exit","top-holder-selling"].map(k=><option value={k} key={k}>{k.replaceAll("-"," ")}</option>)}
      </select>
      <select aria-label="Alert severity" value={severity} onChange={e=>setSeverity(e.target.value)}>
        <option value="all">All severity</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
      </select>
      <button type="button" onClick={markAll} disabled={!unread}>Mark all read</button>
    </div>
    {list.slice(0,40).map(a=>{
      const isUnread=!read.has(a.id);
      return <button key={a.id} className={isUnread?"alert-row is-unread":"alert-row"} onClick={()=>{mark(a.id);onSelect(a.mint);}}>
        <strong>{a.symbol||a.mint.slice(0,6)}{isUnread&&<i className="alert-new-dot" aria-label="New alert"/>}</strong>
        <span className={a.severity==="critical"?"sell":a.severity==="warning"?"alert-warning":""}>{a.kind.replaceAll("-"," ")}</span>
        <small>{a.message} · {new Date(a.at).toLocaleTimeString()}</small>
      </button>;
    })}
    {!list.length&&<p className="signal-note">No threshold crossings in this period.</p>}
  </section>;
}
