"use client";
import {useEffect,useMemo,useState,type PointerEventHandler,type WheelEventHandler} from "react";
import type {LiveMarketEvent} from "@/lib/market/live-events";
import type {TrafficSummary} from "@/lib/market/traffic/summary";
import {buildWalletProfiles,detectCoordinatedWallets,trafficSampleRows} from "@/lib/market/intelligence-core";
import {positionQuickActions} from "@/lib/market/quick-actions";
import {fomoTokenUrl,gmgnTokenUrl} from "@/lib/token-links";
import {waveAmplitude,waveMapLayout,waveMetrics,wavePath,type WaveMetrics} from "@/lib/market/wave-map";
import styles from "./MarketWaveMap.module.css";

export type MarketWaveToken={
 mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;marketCap?:number|null;hypeScore?:number|null;
 buys1h?:number|null;sells1h?:number|null;trafficSample?:TrafficSummary|null;
};

type Particle={id:string;mint:string;side:"buy"|"sell";wallet:string;evidence:"direct"|"routed";whale:boolean;blockAt:string};

export default function MarketWaveMap({tokens,events,width,height,now,selectedMint,quickActionMint,mapView,lod,capitalFlowOnly,animated,maxComets,onSelect,onQuickAction,onDetails,onOpen,onWheel,onPointerDown,onPointerMove,onPointerUp,onPointerCancel}:{
 tokens:MarketWaveToken[];events:LiveMarketEvent[];width:number;height:number;now:number;selectedMint:string|null;quickActionMint:string|null;
 mapView:{x:number;y:number;k:number};lod:"far"|"mid"|"near";capitalFlowOnly:boolean;animated:boolean;maxComets:number;
 onSelect:(token:MarketWaveToken)=>void;onQuickAction:(mint:string|null)=>void;onDetails:(token:MarketWaveToken)=>void;onOpen:(token:MarketWaveToken)=>void;
 onWheel:WheelEventHandler<SVGSVGElement>;onPointerDown:PointerEventHandler<SVGSVGElement>;onPointerMove:PointerEventHandler<SVGSVGElement>;onPointerUp:PointerEventHandler<SVGSVGElement>;onPointerCancel:PointerEventHandler<SVGSVGElement>;
}){
 const safeWidth=Math.max(520,width||900),safeHeight=Math.max(420,height||560);
 const [cycle,setCycle]=useState(0);
 const [activeParticleId,setActiveParticleId]=useState<string|null>(null);
 useEffect(()=>{if(!animated)return;const id=window.setInterval(()=>setCycle(v=>v+1),3200);return()=>window.clearInterval(id)},[animated]);
 const tokenByMint=useMemo(()=>new Map(tokens.map(t=>[t.mint,t])),[tokens]);
 const metrics=useMemo(()=>new Map<string,WaveMetrics>(tokens.map(t=>[t.mint,waveMetrics(t,events,now)])),[tokens,events,now]);
 const layout=useMemo(()=>waveMapLayout(tokens,metrics,safeWidth,safeHeight),[tokens,metrics,safeWidth,safeHeight]);
 const layoutByMint=useMemo(()=>new Map(layout.map(p=>[p.mint,p])),[layout]);
 const layoutIndex=useMemo(()=>new Map(layout.map((p,i)=>[p.mint,i])),[layout]);
 const maxIntensity=Math.max(1,...[...metrics.values()].flatMap(m=>[m.buyIntensity,m.sellIntensity]));
 const scaleX=safeWidth-72,top=70,bottom=safeHeight-54,usable=Math.max(1,bottom-top);
 const scaleY=(score:number)=>top+(100-Math.max(-100,Math.min(100,score)))/200*usable;
 const walletIntel=useMemo(()=>{
   const map=new Map<string,{profiles:Map<string,{score:number;label:string;netUsd:number|null}>;coordinated:Set<string>}>();
   for(const token of tokens){
     const rows=trafficSampleRows(token.trafficSample);
     const profiles=new Map(buildWalletProfiles(rows,now).map(p=>[p.wallet,{score:p.score,label:p.label,netUsd:p.netUsd}]));
     const coordinated=new Set(detectCoordinatedWallets(rows).filter(c=>c.confidence!=="low").flatMap(c=>c.wallets));
     map.set(token.mint,{profiles,coordinated});
   }
   return map;
 },[tokens,now]);
 const particles=useMemo(()=>{
   const out=new Map<string,Particle>();
   const visible=new Set(tokens.map(t=>t.mint));
   for(const event of events){
     if(!visible.has(event.mint))continue;
     const key=event.mint+":"+event.signature+":"+event.wallet+":"+event.side;
     out.set(key,{id:key,mint:event.mint,side:event.side,wallet:event.wallet,evidence:event.evidence,whale:event.whale,blockAt:event.block_at});
   }
   for(const token of tokens){
     const sample=token.trafficSample;
     if(!sample)continue;
     for(const swap of [...sample.recentBuys.map(s=>({...s,side:"buy" as const})),...sample.recentSells.map(s=>({...s,side:"sell" as const}))]){
       const key=token.mint+":"+swap.signature+":"+swap.wallet+":"+swap.side;
       if(!out.has(key))out.set(key,{id:key,mint:token.mint,side:swap.side,wallet:swap.wallet,evidence:swap.evidence,whale:swap.whale,blockAt:swap.blockAt});
     }
   }
   return [...out.values()].sort((a,b)=>Date.parse(b.blockAt)-Date.parse(a.blockAt)).slice(0,maxComets);
 },[tokens,events,maxComets]);
  const activeParticle=activeParticleId?particles.find(p=>p.id===activeParticleId):null;\n  const activeParticleProfile=activeParticle?walletIntel.get(activeParticle.mint)?.profiles.get(activeParticle.wallet):null;\n  const activeParticleCoordinated=activeParticle?walletIntel.get(activeParticle.mint)?.coordinated.has(activeParticle.wallet)??false:false;\n const quick=quickActionMint?layoutByMint.get(quickActionMint):null;
 const quickToken=quickActionMint?tokens.find(t=>t.mint===quickActionMint):null;
 const quickLayout=quick?positionQuickActions({nodeX:quick.x,nodeY:quick.y,nodeRadius:quick.r,viewX:mapView.x,viewY:mapView.y,scale:mapView.k,viewportWidth:safeWidth,viewportHeight:safeHeight,preferredWidth:safeWidth<=640?236:224,panelHeight:42}):null;
 return <div className={[styles.root,!animated?styles.paused:""].filter(Boolean).join(" ")}>
  <svg className={"market-pan-surface "+styles.svg} data-lod={lod} data-capital-flow-only={capitalFlowOnly?"true":"false"} viewBox={"0 0 "+safeWidth+" "+safeHeight} preserveAspectRatio="none" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} role="img" aria-label="Live Solana buy and sell waves toward token strength scale">
   <defs>
    <radialGradient id="waveCoinBuy" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#dffff1"/><stop offset="50%" stopColor="#54cf92"/><stop offset="100%" stopColor="#1c5b42"/></radialGradient>
    <radialGradient id="waveCoinSell" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#ffe7ea"/><stop offset="50%" stopColor="#e56672"/><stop offset="100%" stopColor="#642832"/></radialGradient>
    <radialGradient id="waveCoinFlat" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#edf2f5"/><stop offset="50%" stopColor="#7c8995"/><stop offset="100%" stopColor="#313b45"/></radialGradient>
   </defs>
   <g transform={"translate("+mapView.x+" "+mapView.y+") scale("+mapView.k+")"} className="market-pan-layer">
    <text x="26" y="28" className={styles.axis+" wave-axis-title"}>COINS</text><text x={Math.max(270,safeWidth*.45)} y="28" className={styles.axis+" wave-axis-title"}>LIVE ORDER FLOW</text><text x={scaleX-20} y="28" className={styles.axis+" wave-axis-title"}>STRENGTH</text>
    {[100,75,50,25,0,-25,-50,-75,-100].map(score=><g key={score}><line x1={Math.min(250,safeWidth*.31)} x2={scaleX} y1={scaleY(score)} y2={scaleY(score)} className={score===0?styles.zero:styles.grid}/><text x={scaleX+14} y={scaleY(score)+3} className={[styles.tick,"wave-strength-tick",score>0?styles.tickBuy:score<0?styles.tickSell:""].join(" ")}>{score>0?"+":""}{score}</text></g>)}
    <line x1={scaleX} x2={scaleX} y1={top} y2={bottom} className={styles.scale}/>
    {layout.map((point,index)=>{
      const token=tokenByMint.get(point.mint)!;const m=metrics.get(point.mint)!;
      const buyAmp=waveAmplitude(m.buyIntensity,maxIntensity),sellAmp=waveAmplitude(m.sellIntensity,maxIntensity);
      const buyPath=wavePath(point.x+point.r+3,point.y,scaleX,point.endY,buyAmp,index*.71);
      const sellPath=wavePath(point.x+point.r+3,point.y,scaleX,point.endY,sellAmp,index*.71+Math.PI);
      const selected=selectedMint===token.mint,flowClass=point.strength>8?styles.coinBuy:point.strength<-8?styles.coinSell:"";
      const fill=point.strength>8?"url(#waveCoinBuy)":point.strength<-8?"url(#waveCoinSell)":"url(#waveCoinFlat)";
      return <g key={token.mint} className="market-node-group">
       {m.buyIntensity>0&&<><path d={buyPath} className={[styles.wave,styles.buyBase,"wave-buy-path"].join(" ")}/><path d={buyPath} className={[styles.wave,styles.activeWave,styles.buyActive,"wave-buy-path","wave-active-path"].join(" ")}/></>}
       {m.sellIntensity>0&&<><path d={sellPath} className={[styles.wave,styles.sellBase,"wave-sell-path"].join(" ")}/><path d={sellPath} className={[styles.wave,styles.activeWave,styles.sellActive,"wave-sell-path","wave-active-path"].join(" ")}/></>}
       <circle cx={scaleX} cy={point.endY} r={selected?4.8:3} fill={point.strength>=0?"#68dda0":"#f0737c"} className={styles.endpoint}/>
       <g className={styles.token} role="button" tabIndex={0} aria-label={(token.symbol||token.name||token.mint)+": strength "+point.strength} onPointerDown={e=>e.stopPropagation()} onClick={()=>{onSelect(token);onQuickAction(token.mint)}} onDoubleClick={()=>onOpen(token)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(token);onQuickAction(token.mint)}}}>
        <circle cx={point.x} cy={point.y} r={point.r} fill={fill} className={["market-token-bubble",styles.coin,flowClass,selected?styles.coinSelected:""].filter(Boolean).join(" ")}><title>{(token.symbol||token.name||token.mint)+" · strength "+point.strength+" · "+m.buys+" buys / "+m.sells+" sells"}</title></circle>
        {token.imageUrl&&<><clipPath id={"wave-clip-"+token.mint}><circle cx={point.x} cy={point.y} r={Math.max(7,point.r-3)}/></clipPath><image href={token.imageUrl} x={point.x-point.r+3} y={point.y-point.r+3} width={(point.r-3)*2} height={(point.r-3)*2} preserveAspectRatio="xMidYMid slice" clipPath={"url(#wave-clip-"+token.mint+")"} className={styles.icon}/></>}
        <text x={point.x+point.r+7} y={point.y-3} className={styles.symbol}>{(token.symbol||token.name||token.mint.slice(0,6)).slice(0,10)}</text>
        <text x={point.x+point.r+7} y={point.y+10} className={styles.meta+" wave-token-meta"}>B {m.buys} · S {m.sells}</text>
        <text x={point.x} y={point.y+point.r+13} textAnchor="middle" className={[styles.strength,point.strength>0?styles.buyText:point.strength<0?styles.sellText:styles.neutralText].join(" ")}>{point.strength>0?"+":""}{point.strength}</text>
       </g>
      </g>;
    })}
    <g className="targeted-comet-layer" data-comet-cycle={cycle}>
     {particles.map((particle,index)=>{
       const point=layoutByMint.get(particle.mint),m=metrics.get(particle.mint);if(!point||!m)return null;
       const intensity=particle.side==="buy"?m.buyIntensity:m.sellIntensity,amp=waveAmplitude(intensity,maxIntensity);
       const path=wavePath(point.x+point.r+3,point.y,scaleX,point.endY,amp,(layoutIndex.get(particle.mint)??0)*.71+(particle.side==="sell"?Math.PI:0));
       const intel=walletIntel.get(particle.mint),profile=intel?.profiles.get(particle.wallet),smart=Boolean(profile&&profile.score>=64&&profile.label!=="Bot-like"),coordinated=intel?.coordinated.has(particle.wallet)??false;
       const cls=[styles.event,particle.side==="buy"?styles.eventBuy:styles.eventSell,particle.whale?styles.eventWhale:"",smart?styles.eventSmart:"",coordinated?styles.eventCoordinated:"","targeted-comet","targeted-comet-"+(particle.side==="buy"?"in":"out"),particle.evidence==="routed"?"targeted-comet-routed":"targeted-comet-direct",particle.whale?"targeted-comet-whale":"",smart?"targeted-comet-smart":"",coordinated?"targeted-comet-coordinated":""].filter(Boolean).join(" ");
       return <g key={particle.id+":"+cycle+":"+index} className={cls} onClick={e=>{e.stopPropagation();setActiveParticleId(particle.id)}}><circle r={particle.whale?4:3} className={styles.eventDot+" targeted-comet-body"}><title>{particle.side.toUpperCase()+" · "+particle.wallet.slice(0,5)+"…"+particle.wallet.slice(-4)}{smart?" · Smart Money":""}{coordinated?" · Coordinated":""}</title><animateMotion dur={(2.1+(index%5)*.18)+"s"} begin={(index*.08)+"s"} repeatCount="1" fill="freeze" path={path}/></circle></g>;
     })}
    </g>
   </g>
  </svg>
  {quick&&quickToken&&quickLayout&&<div className={styles.quick+" token-quick-actions token-quick-actions-overlay"} style={{left:quickLayout.left,top:quickLayout.top,width:quickLayout.width}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
    <a href={fomoTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">FoMo ↗</a><a href={gmgnTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">GmGn ↗</a><button className="quick-detail-action" onClick={()=>onDetails(quickToken)}>Details</button><button className="quick-holder-action" onClick={()=>onOpen(quickToken)}>Holders</button>
  </div>}
  {activeParticle&&<div className={styles.detail+" targeted-comet-detail"}><button className="detail-close" onClick={()=>setActiveParticleId(null)} aria-label="Close wallet profile">×</button><strong>{activeParticleProfile?.label??(activeParticle.whale?"Whale":"Wallet")} · {activeParticle.side.toUpperCase()}</strong><span>{activeParticle.wallet.slice(0,6)}…{activeParticle.wallet.slice(-5)}</span><small>{activeParticleProfile?`Wallet score ${activeParticleProfile.score}/100 · Wallet net ${activeParticleProfile.netUsd==null?"—":Math.round(activeParticleProfile.netUsd).toLocaleString()+" USD"}`:"Wallet score unavailable"}{activeParticleCoordinated?" · Coordinated":""}</small></div>}\n  <div className={styles.status}><b>5m order flow</b> · green BUY · red SELL · curve = intensity · scale = buy/sell strength</div>
 </div>;
}
