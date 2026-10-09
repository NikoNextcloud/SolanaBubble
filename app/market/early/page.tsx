"use client";
import {useEffect,useState} from "react";
type Pool={id:string;name:string;createdAt:string|null;ageMinutes:number|null;liquidityUsd:number|null;volume5m:number|null;buys5m:number|null;sells5m:number|null;priceChange5m:number|null;priceChange1h:number|null;sourceUrl:string;stage:"early-watch"|"insufficient-data"|"late-risk"|"liquidity-risk";reasons:string[]};
type Payload={ok:boolean;observedAt:string;source?:string;error?:string;pools:Pool[]};
const usd=(n:number|null)=>n===null?"Unknown":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n);
export default function EarlyRadar(){
 const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(false),[minLiquidity,setMinLiquidity]=useState(30000),[maxAge,setMaxAge]=useState(60);
 useEffect(()=>{let alive=true;const refresh=async()=>{try{const r=await fetch("/api/market/early",{cache:"no-store"});if(!r.ok)throw Error("unavailable");const payload:Payload=await r.json();if(alive){setData(payload);setError(false)}}catch{if(alive)setError(true)}};void refresh();const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh()},60000);return()=>{alive=false;clearInterval(timer)}},[]);
 const filtered=(data?.pools??[]).filter(p=>(p.ageMinutes??999)>0&&(p.ageMinutes??999)<=maxAge&&(p.liquidityUsd??0)>=minLiquidity);
 return <main style={{background:"#0b0f14",color:"#eaf4ee",minHeight:"100vh",padding:"clamp(16px,4vw,52px)",fontFamily:"system-ui"}}>
  <header style={{maxWidth:1100,margin:"auto"}}><a href="/" style={{color:"#8ce8bf"}}>← SolanaBubble Map</a><h1 style={{fontSize:"clamp(28px,4vw,44px)",marginBottom:8}}>Early Opportunity Radar <span style={{fontSize:14,color:"#d3b77b"}}>BETA</span></h1>
  <p style={{color:"#abb9b6",lineHeight:1.6}}>Откриване на нови Solana пулове преди големия Hype. Това е discovery feed, НЕ потвърден GOOD сигнал. Неизвестната безопасност и недостатъчните trade данни никога не се интерпретират като безопасност.</p>
  <p style={{color:"#e8c688"}}>Източник: GeckoTerminal public new-pools · периодично обновяване 60s · непълно покритие · без verified independent buyers / mint security.</p>
  <nav style={{display:"flex",gap:18,flexWrap:"wrap",margin:"22px 0"}}><label>Min liquidity <select value={minLiquidity} onChange={e=>setMinLiquidity(Number(e.target.value))} style={{background:"#17241f",color:"white",padding:9}}><option value={15000}>$15K</option><option value={30000}>$30K</option><option value={50000}>$50K</option><option value={100000}>$100K</option></select></label><label>Max age <select value={maxAge} onChange={e=>setMaxAge(Number(e.target.value))} style={{background:"#17241f",color:"white",padding:9}}><option value={15}>15m</option><option value={30}>30m</option><option value={60}>60m</option><option value={120}>120m</option></select></label></nav>
  {error&&<p role="alert" style={{color:"#ffb0a9"}}>Discovery upstream unavailable. No live data — no safe-market assumption.</p>}
  {!data&&!error&&<p>Loading newly discovered pools…</p>}
  {data&&<p style={{color:"#8da9a1"}}>{filtered.length} candidates · last fetched {new Date(data.observedAt).toLocaleTimeString("bg-BG")}. No tokens currently qualify as verified EARLY GOOD.</p>}
  <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,290px),1fr))",gap:14}}>
   {filtered.map(p=>{const total=(p.buys5m??0)+(p.sells5m??0);const pressure=total?Math.round((p.buys5m??0)/total*100):null;return <article key={p.id} style={{border:"1px solid #30423b",borderRadius:16,padding:18,background:"#14211c"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12}}><strong style={{overflowWrap:"anywhere"}}>{p.name}</strong><small style={{color:p.stage==="early-watch"?"#e7c786":"#f3a6a6"}}>{p.stage.replaceAll("-"," ").toUpperCase()}</small></div>
    <p>Age <b>{p.ageMinutes??"?"}m</b> · Liquidity <b>{usd(p.liquidityUsd)}</b></p>
    <p>5m BUY/SELL: <b>{p.buys5m??"?"} / {p.sells5m??"?"}</b> · buy count share <b>{pressure===null?"unknown":pressure+"%"}</b></p>
    <p>5m volume: {usd(p.volume5m)} · 5m price: {p.priceChange5m===null?"unknown":p.priceChange5m+"%"}</p>
    <p style={{fontSize:13,color:"#e7bb98"}}>{p.reasons.join(" · ")}</p>
    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" style={{color:"#83ecc0"}}>Inspect pool ↗</a>
   </article>})}
  </section>
  {data&&filtered.length===0&&<p>Няма нови пулове, които отговарят на тези филтри. Това не означава, че няма движение на пазара.</p>}
  </header>
 </main>;
}
