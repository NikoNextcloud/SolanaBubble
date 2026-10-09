"use client";
import {useEffect,useMemo,useState} from "react";
import {fomoTokenUrl,gmgnTokenUrl} from "@/lib/token-links";
type Good={mint:string;symbol?:string|null;name?:string|null;opportunityScore?:number|null;signalConfidenceScore?:number|null};
type Early={id:string;mint:string|null;name:string;ageMinutes:number|null;liquidityUsd:number|null;buys5m:number|null;sells5m:number|null;stage:string;reasons:string[];sourceUrl:string};
const cash=(n:number|null)=>n==null?"?":"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);
const label=(n:string)=>n.split(" / ")[0].slice(0,9)||"TOKEN";
export default function DualOpportunityMap({tokens}:{tokens:Good[]}){
 const [early,setEarly]=useState<Early[]>([]),[failed,setFailed]=useState(false),[selection,setSelection]=useState<{kind:"good"|"early";id:string}|null>(null);
 useEffect(()=>{let mounted=true,controller:AbortController|null=null;async function load(){controller?.abort();controller=new AbortController();try{const r=await fetch("/api/market/early",{cache:"no-store",signal:controller.signal});if(!r.ok)throw Error("source");const j=await r.json() as {pools:Early[]};if(mounted){setEarly(j.pools??[]);setFailed(false)}}catch(e){if(mounted&&!(e instanceof Error&&e.name==="AbortError"))setFailed(true)}}void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load()},60000);return()=>{mounted=false;controller?.abort();clearInterval(timer)}},[]);
 const good=useMemo(()=>[...tokens].sort((a,b)=>(b.opportunityScore??0)-(a.opportunityScore??0)).slice(0,5),[tokens]);
 const fresh=useMemo(()=>early.filter(p=>p.ageMinutes!==null&&p.ageMinutes<=60).slice(0,5),[early]);
 const pickedGood=selection?.kind==="good"?good.find(p=>p.mint===selection.id):null;
 const pickedEarly=selection?.kind==="early"?fresh.find(p=>p.id===selection.id):null;
 const mint=pickedGood?.mint??pickedEarly?.mint;
 const rows=Math.max(3,good.length,fresh.length);
 const h=100+rows*110;
 return <div style={{position:"absolute",inset:0,background:"linear-gradient(110deg,#10231e,#101a1a 50%,#231c17)",color:"#e9f4ed",overflow:"auto",zIndex:3}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"12px 20px 0"}}>
    <strong style={{fontSize:16}}>DUAL OPPORTUNITY MAP</strong>
    <span style={{fontSize:12,color:"#b0bdba"}}>Зелено = GOOD setup · Златно = ранен кандидат · червено = риск</span>
  </div>
  {failed&&<p role="alert" style={{padding:"0 20px",color:"#ffaaa3",fontSize:12}}>EARLY данните са недостъпни. Няма потвърден спокоен пазар.</p>}
  <svg viewBox={`0 0 1000 ${h}`} style={{width:"100%",minWidth:440,display:"block"}} aria-label="GOOD токени вляво и EARLY токени вдясно">
    <text x="50" y="46" fill="#91eab5" fontSize="24" fontWeight="800">GOOD</text>
    <text x="735" y="46" fill="#edc081" fontSize="24" fontWeight="800">EARLY RADAR</text>
    <line x1="500" y1="66" x2="500" y2={h-16} stroke="#9ab3a8" strokeDasharray="8 10" opacity=".6"/>
    {Array.from({length:rows},(_,i)=>{const y=110+i*110;const g=good[i],e=fresh[i],earlyColor=e?.stage==="liquidity-risk"?"#f29e97":e?.stage==="insufficient-data"?"#a2aca8":"#e4b972";const buys=(e?.buys5m??0),sells=(e?.sells5m??0),ratio=buys+sells>0?buys/(buys+sells):null;return <g key={i}>
      <line x1="35" x2="965" y1={y+53} y2={y+53} stroke="#7d958b" strokeWidth="1" opacity=".18" strokeDasharray="7 13"/>
      {g&&<g><path d={`M 145 ${y} C 240 ${y-38} 348 ${y+42} 490 ${y-6}`} fill="none" stroke="#65d6a5" strokeWidth="4" opacity=".92"/>
       <circle cx="105" cy={y} r="40" fill="#123d2b" stroke="#70dda7" strokeWidth="4"/><text x="105" y={y+5} fill="#d5ffe8" textAnchor="middle" fontSize="15" fontWeight="bold">{label(g.symbol||g.name||g.mint)}</text>
       <text x="162" y={y-28} fill="#baf7d3" fontSize="12">Score {g.opportunityScore??"?"}</text>
       <circle role="button" tabIndex={0} aria-label={`Избери GOOD ${g.symbol||g.name}`} cx="105" cy={y} r="44" fill="transparent" style={{cursor:"pointer"}} onClick={()=>setSelection({kind:"good",id:g.mint})} onKeyDown={ev=>{if(ev.key==="Enter")setSelection({kind:"good",id:g.mint})}}/>
      </g>}
      {e&&<g><path d={`M 510 ${y+6} C 635 ${y+42-(ratio??.5)*28} 730 ${y-30+(ratio??.5)*25} 855 ${y}`} fill="none" stroke={earlyColor} strokeWidth="4" strokeDasharray={ratio===null?"7 9":undefined} opacity=".88"/>
       <circle cx="895" cy={y} r="40" fill="#3b2c1c" stroke={earlyColor} strokeWidth="4"/><text x="895" y={y+5} textAnchor="middle" fill="#ffe7c3" fontSize="15" fontWeight="bold">{label(e.name)}</text>
       <text x="815" y={y-48} fill="#f1c992" fontSize="12">{e.ageMinutes} мин · {cash(e.liquidityUsd)}</text>
       <circle role="button" tabIndex={0} aria-label={`Избери EARLY ${e.name}`} cx="895" cy={y} r="44" fill="transparent" style={{cursor:"pointer"}} onClick={()=>setSelection({kind:"early",id:e.id})} onKeyDown={ev=>{if(ev.key==="Enter")setSelection({kind:"early",id:e.id})}}/>
      </g>}
    </g>})}
  </svg>
  {selection&&<div style={{position:"sticky",bottom:0,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,padding:"12px 18px",background:"#172d25",borderTop:"1px solid #5b7b69"}}>
    <div><strong>{pickedGood?.symbol||pickedGood?.name||pickedEarly?.name||"Токенът не е в текущата извадка"}</strong><div style={{fontSize:12,color:"#d5bca0"}}>{pickedEarly?"EARLY — непотвърдена сигурност":pickedGood?"GOOD setup — не е гаранция за печалба":""}</div></div>
    <div style={{display:"flex",gap:9}}>{mint&&<><a href={fomoTokenUrl(mint)} target="_blank" rel="noopener noreferrer" style={{color:"#e8f7e9",padding:8,border:"1px solid #638e76",borderRadius:8}}>FoMo ↗</a><a href={gmgnTokenUrl(mint)} target="_blank" rel="noopener noreferrer" style={{color:"#e8f7e9",padding:8,border:"1px solid #638e76",borderRadius:8}}>GmGn ↗</a></>}{pickedEarly&&<a href={pickedEarly.sourceUrl} target="_blank" rel="noopener noreferrer" style={{color:"#e8f7e9",padding:8}}>Pool ↗</a>}<button onClick={()=>setSelection(null)} style={{background:"#263b30",color:"white",border:"1px solid #638e76",borderRadius:8,padding:8}}>✕</button></div>
  </div>}
  <p style={{padding:"0 20px 15px",fontSize:11,color:"#a4b9ae"}}>GOOD линиите са моделни криви; EARLY линиите показват само агрегирана BUY активност, не individual live trades. Source coverage е sampled и рискът не е напълно проверен.</p>
 </div>
}
