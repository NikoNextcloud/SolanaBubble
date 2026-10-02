"use client";
import {useEffect,useState} from 'react';
import {observationQuality} from '@/lib/market/quality';
export default function WorkerStatus(){
 const [data,setData]=useState<any>(null),[failed,setFailed]=useState(false),[now,setNow]=useState<number|null>(null);
 useEffect(()=>{const controller=new AbortController();const load=()=>{setNow(Date.now());if(document.hidden)return;fetch('/api/market/status',{signal:controller.signal}).then(r=>r.ok?r.json():Promise.reject()).then(d=>{if(!controller.signal.aborted){setData(d);setFailed(false);}}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});};load();const id=setInterval(load,120000);return()=>{controller.abort();clearInterval(id);};},[]);
 const q=observationQuality(data?.marketAt,now??NaN),w=data?.worker;
 const stuck=w?.state==='running'&&now!=null&&now-Date.parse(w.startedAt)>240000;
 return <details className="reference-side-card data-quality"><summary>Background worker · {failed?'недостъпен':stuck?'забавен':w?.state==='error'?'грешка':q.status==='recent'?'snapshot актуален':q.status==='stale'?'snapshot стар':'изчакване'}</summary><p>Последен успешен snapshot: {data?.marketAt?new Date(data.marketAt).toLocaleString('bg-BG'):'—'}</p><p>Изпълнение: {w?.state??'unknown'}{w?.durationMs!=null?` · ${(w.durationMs/1000).toFixed(1)} s`:''} · holder откази: {w?.holderFailures??'—'} · traffic откази: {w?.trafficFailures??'—'}</p><p>Актуални holders при snapshot: {data?.recentHolders??'—'} / {data?.tokens??'—'} токена. Непълно покритие.</p><p>RPC причини в задържаните извадки: {Object.entries(data?.trafficFailures??{}).map(([k,v])=>`${k}: ${v}`).join(' · ')||'няма класифицирани откази'}</p><small>Кеширан статус; не проверява RPC при отваряне. Няма измерване на Vercel CPU квотата.</small></details>;
}
