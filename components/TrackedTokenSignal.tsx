"use client";
import { useEffect,useState } from 'react';
import type { WatchToken } from '@/lib/watchlist';
import TokenSignalCard from './TokenSignalCard';
export default function TrackedTokenSignal({mint}:{mint:string}) {
  const [token,setToken]=useState<WatchToken>({mint});
  useEffect(()=>{
    setToken({mint});
    const controller=new AbortController();
    const load=()=>fetch(`/api/market/history?mint=${encodeURIComponent(mint)}&hours=24`,{signal:controller.signal})
      .then(r=>r.ok?r.json():Promise.reject()).then(j=>{const latest=j.snapshots?.at(-1);setToken(latest?{...latest.payload,marketObservedAt:latest.observed_at}:{mint});}).catch(()=>{});
    load(); const timer=window.setInterval(load,60_000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[mint]);
  return <TokenSignalCard token={token}/>;
}
