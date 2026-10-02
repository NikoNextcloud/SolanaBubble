"use client";
import { useEffect,useState } from 'react';
import type { SignalToken } from '@/lib/market/signals';
import TokenSignalCard from './TokenSignalCard';
export default function TrackedTokenSignal({mint}:{mint:string}) {
  const [token,setToken]=useState<SignalToken>({mint});
  useEffect(()=>{
    setToken({mint});
    const controller=new AbortController();
    const load=()=>fetch(`/api/market/history?mint=${encodeURIComponent(mint)}&hours=24`,{signal:controller.signal})
      .then(r=>r.ok?r.json():Promise.reject()).then(j=>setToken(j.snapshots?.at(-1)?.payload ?? {mint})).catch(()=>{});
    load(); const timer=window.setInterval(load,60_000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[mint]);
  return <TokenSignalCard token={token}/>;
}
