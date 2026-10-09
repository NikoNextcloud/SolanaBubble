"use client";
import {useEffect,useMemo,useState} from "react";
import {fomoTokenUrl,gmgnTokenUrl} from "@/lib/token-links";
type Pool={id:string;mint:string|null;name:string;ageMinutes:number|null;liquidityUsd:number|null;buys5m:number|null;sells5m:number|null;priceChange5m:number|null;sourceUrl:string;stage:"early-watch"|"insufficient-data"|"late-risk"|"liquidity-risk";reasons:string[]};
type Feed={ok:boolean;pools:Pool[];observedAt:string};
const fmt=(n:number|null)=>n==null?"няма данни":new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);
const valid=(n:number|null)=>typeof n==="number"&&Number.isFinite(n);
function label(p:Pool){
 if(p.stage==="liquidity-risk")return {text:"Ниска ликвидност",color:"#ffa79d"};
 if(p.stage==="late-risk")return {text:"Възможно закъснял",color:"#f2ba7c"};
 if(p.stage==="insufficient-data")return {text:"Недостатъчни данни",color:"#9ba9b8"};
 return {text:"Ранен интерес",color:"#f4d18d"};
}
export default function EarlyPoolBubbles(){
 const [expanded,setExpanded]=useState(true),[feed,setFeed]=useState<Feed|null>(null),[error,setError]=useState(false),[active,setActive]=useState<string|null>(null),[filter,setFilter]=useState<"all"|"watch">("all");
 useEffect(()=>{let alive=true;let controller:AbortController|null=null;const load=async()=>{controller?.abort();const next=new AbortController();controller=next;try{const r=await fetch("/api/market/early",{signal:next.signal,cache:"no-store"});if(!r.ok)throw Error("unavailable");const data:Feed=await r.json();if(alive){setFeed(data);setError(false)}}catch(e){if(alive&&!(e instanceof Error&&e.name==="AbortError"))setError(true)}};void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load()},60000);return()=>{alive=false;controller?.abort();clearInterval(timer)}},[]);
 const pools=useMemo(()=>(feed?.pools??[]).filter(p=>p.ageMinutes!==null&&p.ageMinutes<=60&&(!filter||filter==="all"||p.stage==="early-watch")).slice(0,8),[feed,filter]);
 const selected=pools.find(p=>p.id===active)??null;
 const s:Record<string,React.CSSProperties>={
  card:{border:"1px solid #516356",borderRadius:18,background:"linear-gradient(145deg,rgba(31,39,34,.98),rgba(16,25,23,.98))",color:"#f0f5ed",boxShadow:"0 12px 35px #0005",overflow:"hidden"},
  button:{border:"1px solid #526f60",borderRadius:9,background:"#21362e",color:"#e7f6e9",padding:"7px 11px",cursor:"pointer",fontSize:12},
  badge:{border:"1px solid #76644a",borderRadius:25,color:"#f4d18d",padding:"3px 8px",fontSize:10,fontWeight:700}
 };
 return <section aria-label="Early Radar в SolanaBubble" style={{...s.card,width:"min(340px,100%)",flex:"0 1 340px",maxHeight:320,overflowY:"auto",minWidth:0}}>
 <div style={{padding:"12px 15px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap",background:"linear-gradient(90deg,#24352d,#192723)"}}>
  <div><strong style={{fontSize:16,color:"#c2f5d4"}}>◉ EARLY RADAR</strong><div style={{fontSize:12,color:"#b5c9bd"}}>Открий младите токени, преди да станат шумни</div></div>
  <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={s.badge}>НАБЛЮДЕНИЕ · НЕ GOOD</span><button type="button" style={s.button} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?"Скрий":"Покажи"} {expanded?"⌃":"⌄"}</button></div>
 </div>
 {expanded&&<div style={{padding:14}}>
  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"space-between",marginBottom:12}}>
   <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
    <button type="button" style={{...s.button,background:filter==="all"?"#43614b":"#21362e"}} aria-pressed={filter==="all"} onClick={()=>setFilter("all")}>Всички нови</button>
    <button type="button" style={{...s.button,background:filter==="watch"?"#43614b":"#21362e"}} aria-pressed={filter==="watch"} onClick={()=>setFilter("watch")}>С ранен интерес</button>
   </div>
   <span style={{fontSize:11,color:"#b1bfb6"}}>{feed?new Date(feed.observedAt).toLocaleTimeString("bg-BG"):"Зареждане"} · обновяване 60 сек.</span>
  </div>
  <p style={{fontSize:12,color:"#e6c68d",margin:"0 0 12px"}}>Жълто = ново / непотвърдено · Червено = риск · Размерът показва ликвидност, не шанс за печалба</p>
  {error&&<p role="alert" style={{color:"#ffaaa3",fontSize:13}}>Връзката с източника е прекъсната. Не приемай липсата на данни за спокоен пазар.</p>}
  {!feed&&!error&&<p style={{fontSize:13}}>Търся нови Solana пулове…</p>}
  {feed&&pools.length===0&&<p style={{fontSize:13}}>Няма подходящи пулове в тази извадка. Може да има други извън покритието.</p>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(98px,1fr))",gap:12}}>
   {pools.map((p,i)=>{const l=label(p),total=(p.buys5m??0)+(p.sells5m??0),pressure=total?Math.round((p.buys5m??0)/total*100):null,size=54+Math.min(22,Math.sqrt(Math.max(0,p.liquidityUsd??0))/14);
    return <button key={p.id} type="button" aria-pressed={active===p.id} title={p.name} onClick={()=>setActive(v=>v===p.id?null:p.id)} style={{border:active===p.id?"1px solid #f7db97":"1px solid #526055",borderRadius:14,background:active===p.id?"#364739":"#202e29",color:"#f4f4ed",minHeight:144,padding:"10px 5px",display:"flex",alignItems:"center",flexDirection:"column",gap:6,cursor:"pointer"}}>
      <span style={{display:"grid",placeItems:"center",width:size,height:size,borderRadius:"50%",border:"2px solid "+l.color,background:"radial-gradient(circle at 35% 24%,#566247,#23362a 70%)",boxShadow:"0 0 14px "+l.color+"42",fontWeight:800,fontSize:12,overflow:"hidden"}}>{p.name.split(" / ")[0].slice(0,7)||"NEW"}</span>
      <strong style={{fontSize:11}}>{p.ageMinutes} мин · ${fmt(p.liquidityUsd)}</strong>
      <span style={{fontSize:10,color:l.color,textAlign:"center"}}>{l.text}</span>
      <span style={{height:4,width:"80%",borderRadius:8,background:"#53605b",overflow:"hidden"}}><span style={{display:"block",height:"100%",width:(pressure??0)+"%",background:pressure===null?"#899a95":"#83d9aa"}}/></span>
      <span style={{fontSize:10,color:"#b7c9be"}}>BUY {pressure===null?"?":pressure+"%"} / 5 мин</span>
    </button>
   })}
  </div>
  {selected&&<div style={{marginTop:12,padding:13,borderRadius:13,border:"1px solid #5c675a",background:"#1c3027"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:9,flexWrap:"wrap"}}><strong style={{fontSize:15,overflowWrap:"anywhere"}}>{selected.name}</strong><span style={{fontSize:12,color:label(selected).color}}>{label(selected).text}</span></div>
   <p style={{fontSize:12,margin:"8px 0"}}>Пул: {selected.ageMinutes} мин · Ликвидност: ${fmt(selected.liquidityUsd)} · Покупки / продажби (5 мин): {selected.buys5m??"?"} / {selected.sells5m??"?"}</p>
   <p style={{fontSize:12,color:"#e7c7a0",margin:"8px 0"}}>{selected.reasons.join(" · ")}</p>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    {selected.mint?<><a style={s.button} href={fomoTokenUrl(selected.mint)} target="_blank" rel="noopener noreferrer">FoMo ↗</a><a style={s.button} href={gmgnTokenUrl(selected.mint)} target="_blank" rel="noopener noreferrer">GmGn ↗</a></>:<span style={{fontSize:12,color:"#ffb6a6"}}>Няма проверен mint — външните бутони са изключени.</span>}
    <a style={s.button} href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Виж пула ↗</a>
   </div>
  </div>}
  <p style={{fontSize:11,color:"#b7c4bc",margin:"12px 0 0"}}>Данни: публична извадка от нови пулове. BUY процентът е от агрегирани сделки, не доказателство за независими купувачи. Липсват проверка на token security и пълен live поток. Няма потвърдени EARLY GOOD сигнали.</p>
 </div>}
 </section>;
}
