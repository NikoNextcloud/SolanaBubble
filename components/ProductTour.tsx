"use client";

import {useEffect,useState} from "react";
import styles from "./ProductTour.module.css";

const KEY="solanabubble:onboarding:v1";

const STEPS=[
  {title:"Live Market Map",body:"Всяка focus монета има жива order-flow вълна. BUY натискът я дърпа нагоре, SELL надолу, а реалните сделки се движат по нея като зелени/червени точки."},
  {title:"Данни и доверие",body:"Следи Live Data badge-а. Healthy означава актуален snapshot и worker; Partial/Delayed означава, че покритието е ограничено или остаряло — не го приемай като липса на сделки."},
  {title:"Watchlist + Alerts",body:"Добавяй токени във Watchlist, настройвай прагове и включвай browser push. Alerts се dedupe-ват и имат cooldown, за да не те заливат."},
  {title:"Research flow",body:"Клик върху монета за детайли/FoMo/GmGn. Двоен клик отваря Holder Map. Research / DB показва production health, worker и traffic coverage."},
];

export default function ProductTour({forceOpen=0}:{forceOpen?:number}){
  const [open,setOpen]=useState(false);
  const [step,setStep]=useState(0);

  useEffect(()=>{
    if(process.env.NEXT_PUBLIC_BROWSER_SMOKE==="1")return;
    try{if(localStorage.getItem(KEY)!=="done")setOpen(true);}catch{}
  },[]);
  useEffect(()=>{if(forceOpen>0){setStep(0);setOpen(true);}},[forceOpen]);

  function finish(){
    try{localStorage.setItem(KEY,"done");}catch{}
    setOpen(false);
  }
  if(!open)return null;
  const item=STEPS[step];
  return <aside className={styles.card} role="dialog" aria-modal="false" aria-label="SolanaBubble quick start">
    <div className={styles.top}><span>QUICK START</span><button type="button" onClick={finish} aria-label="Затвори">×</button></div>
    <strong>{item.title}</strong>
    <p>{item.body}</p>
    <div className={styles.progress} aria-label={"Стъпка "+(step+1)+" от "+STEPS.length}>
      {STEPS.map((_,i)=><i key={i} className={i===step?styles.active:""}/>)}
    </div>
    <div className={styles.actions}>
      <button type="button" onClick={()=>setStep(v=>Math.max(0,v-1))} disabled={step===0}>Назад</button>
      {step<STEPS.length-1
        ?<button type="button" className={styles.primary} onClick={()=>setStep(v=>v+1)}>Напред</button>
        :<button type="button" className={styles.primary} onClick={finish}>Готово</button>}
    </div>
  </aside>;
}
