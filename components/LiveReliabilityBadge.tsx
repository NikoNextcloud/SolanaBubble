"use client";

import {useEffect,useMemo,useState} from "react";
import styles from "./LiveReliabilityBadge.module.css";

type StatusPayload={
  marketAt?:string|null;
  recentTraffic?:number|null;
  usableTraffic?:number|null;
  recentHolders?:number|null;
  tokens?:number|null;
  worker?:{state?:string;startedAt?:string|null;durationMs?:number|null;holderFailures?:number|null;trafficFailures?:number|null};
};

export default function LiveReliabilityBadge(){
  const [data,setData]=useState<StatusPayload|null>(null);
  const [failed,setFailed]=useState(false);
  const [now,setNow]=useState(()=>Date.now());

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      setNow(Date.now());
      if(document.hidden)return;
      try{
        const response=await fetch("/api/market/status",{cache:"no-store"});
        if(!response.ok)throw new Error("status");
        const json=await response.json();
        if(active){setData(json);setFailed(false);}
      }catch{if(active)setFailed(true);}
    };
    load();
    const timer=window.setInterval(load,60000);
    return()=>{active=false;window.clearInterval(timer);};
  },[]);

  const state=useMemo(()=>{
    if(failed)return {key:"error",label:"DATA OFFLINE",title:"Status endpoint unavailable"};
    if(!data?.marketAt)return {key:"wait",label:"WARMING",title:"Waiting for the first market snapshot"};
    const marketAge=(now-Date.parse(data.marketAt))/60000;
    const worker=data.worker;
    const workerAge=worker?.startedAt?(now-Date.parse(worker.startedAt))/60000:null;
    const stuck=worker?.state==="running"&&workerAge!=null&&workerAge>4;
    const failures=Number(worker?.holderFailures??0)+Number(worker?.trafficFailures??0);
    const usable=Number(data.usableTraffic??0),recent=Number(data.recentTraffic??0);
    if(worker?.state==="error"||stuck||marketAge>15)return {key:"error",label:"DELAYED",title:"Worker or snapshot is delayed"};
    if(marketAge>10||failures>0||(recent>0&&usable/recent<.45))return {key:"partial",label:"PARTIAL",title:"Market is live but traffic coverage is partial"};
    return {key:"healthy",label:"LIVE DATA",title:"Snapshot and worker are healthy"};
  },[data,failed,now]);

  return <details className={styles.wrap}>
    <summary className={styles[state.key]} title={state.title}><i/>{state.label}</summary>
    <div className={styles.popover}>
      <strong>{state.title}</strong>
      <span>Market: {data?.marketAt?new Date(data.marketAt).toLocaleTimeString("bg-BG"):"—"}</span>
      <span>Traffic: {data?.usableTraffic??"—"} usable / {data?.recentTraffic??"—"} fresh</span>
      <span>Holders: {data?.recentHolders??"—"} / {data?.tokens??"—"} recent</span>
      <span>Worker: {data?.worker?.state??"unknown"}{data?.worker?.durationMs!=null?" · "+(data.worker.durationMs/1000).toFixed(1)+"s":""}</span>
      <small>Live coverage is sampled/best-effort. PARTIAL does not mean the market has no trades.</small>
    </div>
  </details>;
}
