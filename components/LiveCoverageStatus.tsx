"use client";
import {useEffect,useState} from "react";
import {classifyReliability} from "@/lib/market/reliability";

type StatusPayload={
  worker?:{state?:string;durationMs?:number;holderFailures?:number;trafficFailures?:number}|null;
  workerUpdatedAt?:string|null;
  marketAt?:string|null;
  tokens?:number|null;
  recentTraffic?:number|null;
  usableTraffic?:number|null;
  liveEvents20m?:number|null;
  liveBuys20m?:number|null;
  liveSells20m?:number|null;
  liveDirect20m?:number|null;
  liveUniqueMints20m?:number|null;
  liveLatestObservedAt?:string|null;
};

const label={healthy:"HEALTHY",partial:"PARTIAL",degraded:"DEGRADED",warming:"WARMING"} as const;
export default function LiveCoverageStatus(){
  const [data,setData]=useState<StatusPayload|null>(null);
  const [failed,setFailed]=useState(false);
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      setNow(Date.now());
      if(document.hidden)return;
      try{
        const response=await fetch("/api/market/status",{cache:"no-store"});
        if(!response.ok)throw new Error("status");
        const next=await response.json();
        if(active){setData(next);setFailed(false);}
      }catch{if(active)setFailed(true);}
    };
    load();
    const timer=window.setInterval(load,60000);
    const visibility=()=>{if(!document.hidden)void load();};
    document.addEventListener("visibilitychange",visibility);
    return()=>{active=false;window.clearInterval(timer);document.removeEventListener("visibilitychange",visibility);};
  },[]);
  const reliability=classifyReliability({
    workerState:data?.worker?.state,
    workerUpdatedAt:data?.workerUpdatedAt,
    marketAt:data?.marketAt,
    tokens:data?.tokens,
    recentTraffic:data?.recentTraffic,
    usableTraffic:data?.usableTraffic,
    liveEvents20m:data?.liveEvents20m,
    liveUniqueMints20m:data?.liveUniqueMints20m,
    liveLatestObservedAt:data?.liveLatestObservedAt,
  },now);
  const level=failed?"degraded":reliability.level;
  const liveAge=reliability.liveAgeMs==null?"no recent event":reliability.liveAgeMs<60000?`${Math.round(reliability.liveAgeMs/1000)}s ago`:`${Math.round(reliability.liveAgeMs/60000)}m ago`;
  return <details className="reference-side-card live-coverage-status">
    <summary><span>Live data reliability</span><b className={`coverage-${level}`}>{label[level]}</b></summary>
    <div className="coverage-grid">
      <div><span>Worker</span><strong>{failed?"unavailable":data?.worker?.state??"unknown"}</strong><small>{data?.worker?.durationMs!=null?`${(data.worker.durationMs/1000).toFixed(1)}s cycle`:"awaiting cycle"}</small></div>
      <div><span>Fresh traffic</span><strong>{reliability.recentTraffic}/{reliability.tokens||"—"}</strong><small>{reliability.coveragePct.toFixed(0)}% of loaded tokens recently sampled</small></div>
      <div><span>Usable samples</span><strong>{reliability.usableTraffic}</strong><small>direct/routed evidence passing minimum sample gate</small></div>
      <div><span>Live events · 20m</span><strong>{reliability.liveEvents20m}</strong><small>{data?.liveBuys20m??0} BUY · {data?.liveSells20m??0} SELL · {data?.liveDirect20m??0} direct</small></div>
      <div><span>Live token coverage</span><strong>{reliability.liveUniqueMints20m}</strong><small>unique mints with observed arrivals</small></div>
      <div><span>Latest arrival</span><strong>{reliability.liveState}</strong><small>{liveAge}</small></div>
    </div>
    <small className="coverage-note">Coverage is sampled and best-effort. Quiet means no observed event in the recent window; it does not prove zero market activity. Fresh impulses use observed_at arrival time.</small>
  </details>;
}
