"use client";
import {useEffect,useState} from "react";
import {fomoTokenUrl,gmgnTokenUrl} from "@/lib/token-links";
type Pool={id:string;mint:string|null;name:string;ageMinutes:number|null;liquidityUsd:number|null;buys5m:number|null;sells5m:number|null;priceChange5m:number|null;sourceUrl:string;stage:string;reasons:string[]};
type Feed={ok:boolean;pools:Pool[];observedAt:string};
const money=(v:number|null)=>v==null?"unknown":"$"+Math.round(v).toLocaleString("en-US");
export default function EarlyPoolBubbles(){
 const [enabled,setEnabled]=useState(true),[feed,setFeed]=useState<Feed|null>(null),[failed,setFailed]=useState(false),[active,setActive]=useState<string|null>(null);
 useEffect(()=>{let mounted=true;const load=async()=>{try{const r=await fetch("/api/market/early",{cache:"no-store"});if(!r.ok)throw Error("upstream");const j:Feed=await r.json();if(mounted){setFeed(j);setFailed(false)}}catch{if(mounted)setFailed(true)}};void load();const id=setInterval(()=>{if(document.visibilityState==="visible")void load()},60000);return()=>{mounted=false;clearInterval(id)}},[]);
 const pools=(feed?.pools??[]).filter(p=>p.ageMinutes!==null&&p.ageMinutes<=60).slice(0,8);
 return <aside aria-label="Early pool discovery inside market map" style={{position:"relative",zIndex:2,width:"min(340px,100%)",maxHeight:320,flex:"0 1 340px",overflowY:"auto",background:"rgba(8,21,19,.93)",border:"1px solid #3e6656",borderRadius:14,padding:12,boxShadow:"0 8px 28px #0009"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
   <strong style={{fontSize:13,color:"#a4f2c7"}}>◎ EARLY · New pool bubbles</strong>
   <button type="button" onClick={()=>setEnabled(v=>!v)} aria-expanded={enabled} style={{color:"#d6eee1",background:"transparent",border:"1px solid #426556",borderRadius:7,padding:"4px 8px",cursor:"pointer"}}>{enabled?"Hide":"Show"}</button>
  </div>
  {enabled&&<><p style={{fontSize:11,color:"#bdc7c2",margin:"6px 0 10px"}}>Young pools · public discovery · NOT verified GOOD / not safety audited</p>
    {failed&&<p role="alert" style={{fontSize:12,color:"#ffadad"}}>Discovery unavailable — data not assumed calm.</p>}
    {!feed&&!failed&&<p style={{fontSize:12}}>Loading early pools…</p>}
    {feed&&pools.length===0&&<p style={{fontSize:12,color:"#ccd8d1"}}>No recent pools in the sampled feed.</p>}
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
    {pools.map((p,i)=>{const total=(p.buys5m??0)+(p.sells5m??0),pressure=total?Math.round((p.buys5m??0)/total*100):null;return <button type="button" key={p.id} onClick={()=>setActive(v=>v===p.id?null:p.id)} title={p.name+" · "+p.reasons.join("; ")} style={{width:66,height:66,borderRadius:"50%",border:"2px solid "+(p.stage==="early-watch"?"#d0b67b":"#976e67"),background:"radial-gradient(circle at 35% 25%,#316651,#14241e 68%)",color:"#e7f7ed",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",cursor:"pointer",boxShadow:"0 0 12px #62d29b22"}}>
      <span style={{fontSize:10,fontWeight:750,maxWidth:58,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name.split(" / ")[0].slice(0,10)||"POOL"}</span>
      <span style={{fontSize:10}}>{p.ageMinutes}m</span>
      <span style={{fontSize:9,color:"#a8d8c2"}}>{money(p.liquidityUsd)}</span>
     </button>})}
    </div>
    {pools.filter(p=>p.id===active).map(p=><div key={p.id} style={{marginTop:10,padding:10,borderRadius:8,background:"#172c24",fontSize:12}}>
      <strong>{p.name}</strong><div>Pool age: {p.ageMinutes}m · Liquidity: {money(p.liquidityUsd)}</div>
      <div>5m BUY share: {(()=>{const n=(p.buys5m??0)+(p.sells5m??0);return n?Math.round((p.buys5m??0)/n*100)+"%":"unknown"})()}</div>
      <div style={{color:"#e8c6a0",margin:"6px 0"}}>{p.reasons.join(" · ")}</div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:9}}>
       {p.mint?<><a href={fomoTokenUrl(p.mint)} target="_blank" rel="noopener noreferrer" style={{color:"#8deac1",fontWeight:700}}>FoMo ↗</a><a href={gmgnTokenUrl(p.mint)} target="_blank" rel="noopener noreferrer" style={{color:"#8deac1",fontWeight:700}}>GmGn ↗</a></>:<span style={{color:"#ffc2a9"}}>Token mint not verified — links disabled</span>}
       <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" style={{color:"#8deac1"}}>Pool ↗</a>
      </div>
    </div>)}
  </>}
 </aside>
}
