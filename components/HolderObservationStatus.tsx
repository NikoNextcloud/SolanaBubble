"use client";
import {useEffect,useState} from 'react';
import {observationQuality} from '@/lib/market/quality';
export default function HolderObservationStatus({at,loading,error,shown,total}:{at:string|null;loading:boolean;error:boolean;shown:number;total:number}){
 const [now,setNow]=useState<number|null>(null);useEffect(()=>{setNow(Date.now());const id=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(id);},[]);
 const q=observationQuality(at,now??NaN,60);
 return <div className="holder-observation-status" role="status"><b className={`quality-${q.status}`}>{loading?'Зареждане':q.status==='recent'?'Актуално holder наблюдение':q.status==='stale'?'Стари holder данни':'Няма актуално наблюдение'}</b><span>{at?`Последна извадка: ${new Date(at).toLocaleString('bg-BG')}`:'Показани са наличните записани holdings; актуалността им е неизвестна.'}{q.ageMinutes!=null?` · преди ${Math.round(q.ageMinutes)} мин`:''}</span><small>{shown} показани / {total} holders · карта до 500 адреса · непълна wallet визуализация.{error?' Обновяването е недостъпно; предходните данни са запазени.':''}</small></div>;
}
