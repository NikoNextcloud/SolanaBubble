"use client";
import {useEffect,useMemo,useState,type PointerEventHandler,type WheelEventHandler} from "react";
import type {LiveMarketEvent} from "@/lib/market/live-events";
import type {TrafficSummary} from "@/lib/market/traffic/summary";
import {buildWalletProfiles,detectCoordinatedWallets,trafficSampleRows} from "@/lib/market/intelligence-core";
import {positionQuickActions} from "@/lib/market/quick-actions";
import {fomoTokenUrl,gmgnTokenUrl} from "@/lib/token-links";
import {activeWaveEvents,waveAmplitude,waveMapLayout,waveMetrics,wavePath,type WaveMetrics} from "@/lib/market/wave-map";
import styles from "./MarketWaveMap.module.css";

export type MarketWaveToken={
 mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;marketCap?:number|null;hypeScore?:number|null;
 buys1h?:number|null;sells1h?:number|null;trafficSample?:TrafficSummary|null;
};

type Particle={id:string;mint:string;side:"buy"|"sell";wallet:string;evidence:"direct"|"routed";whale:boolean;blockAt:string;usdValue:number|null};

export default function MarketWaveMap({tokens,events,width,height,now,selectedMint,quickActionMint,mapView,lod,capitalFlowOnly,animated,maxComets,onSelect,onQuickAction,onDetails,onOpen,onWheel,onPointerDown,onPointerMove,onPointerUp,onPointerCancel}:{
 tokens:MarketWaveToken[];events:LiveMarketEvent[];width:number;height:number;now:number;selectedMint:string|null;quickActionMint:string|null;
 mapView:{x:number;y:number;k:number};lod:"far"|"mid"|"near";capitalFlowOnly:boolean;animated:boolean;maxComets:number;
 onSelect:(token:MarketWaveToken)=>void;onQuickAction:(mint:string|null)=>void;onDetails:(token:MarketWaveToken)=>void;onOpen:(token:MarketWaveToken)=>void;
 onWheel:WheelEventHandler<SVGSVGElement>;onPointerDown:PointerEventHandler<SVGSVGElement>;onPointerMove:PointerEventHandler<SVGSVGElement>;onPointerUp:PointerEventHandler<SVGSVGElement>;onPointerCancel:PointerEventHandler<SVGSVGElement>;
}){
 const safeWidth=Math.max(520,width||900),safeHeight=Math.max(420,height||560);
 const [clock,setClock]=useState(()=>Date.now());
 const [activeParticleId,setActiveParticleId]=useState<string|null>(null);
 useEffect(()=>{\n   const started=Date.now();setClock(started);\n   const timers=events.map(event=>Date.parse(event.block_at)+2800-started).filter(delay=>Number.isFinite(delay)&&delay>0&&delay<3000).map(delay=>window.setTimeout(()=>setClock(Date.now()),delay+40));\n   return()=>timers.forEach(id=>window.clearTimeout(id));\n },[events]);
 const tokenByMint=useMemo(()=>new Map(tokens.map(t=>[t.mint,t])),[tokens]);
 const metrics=useMemo(()=>new Map<string,WaveMetrics>(tokens.map(t=>[t.mint,waveMetrics(t,events,now)])),[tokens,events,now]);
 const layout=useMemo(()=>waveMapLayout(tokens,metrics,safeWidth,safeHeight),[tokens,metrics,safeWidth,safeHeight]);
 const layoutByMint=useMemo(()=>new Map(layout.map(p=>[p.mint,p])),[layout]);
 const layoutIndex=useMemo(()=>new Map(layout.map((p,i)=>[p.mint,i])),[layout]);
 const scaleX=safeWidth-72,top=84,bottom=safeHeight-68,usable=Math.max(1,bottom-top);
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
 const visibleMints=useMemo(()=>new Set(tokens.map(t=>t.mint)),[tokens]);
 const particles=useMemo<Particle[]>(()=>{
   if(!animated)return [];
   return activeWaveEvents(events,visibleMints,clock,2800,maxComets).map(event=>({
     id:event.mint+":"+event.signature+":"+event.wallet+":"+event.side,
     mint:event.mint,side:event.side,wallet:event.wallet,evidence:event.evidence,whale:event.whale,blockAt:event.block_at,usdValue:event.usd_value,
   }));
 },[events,visibleMints,clock,maxComets,animated]);
 const maxPulseWeight=Math.max(1,...particles.map(p=>1+Math.log10(1+Math.max(0,p.usdValue??0))*2));
 const activeParticle=activeParticleId?particles.find(p=>p.id===activeParticleId):null;
 const activeParticleProfile=activeParticle?walletIntel.get(activeParticle.mint)?.profiles.get(activeParticle.wallet):null;
 const activeParticleCoordinated=activeParticle?walletIntel.get(activeParticle.mint)?.coordinated.has(activeParticle.wallet)??false:false;
 const quick=quickActionMint?layoutByMint.get(quickActionMint):null;
 const quickToken=quickActionMint?tokenByMint.get(quickActionMint):null;
 const quickLayout=quick?positionQuickActions({nodeX:quick.x,nodeY:quick.y,nodeRadius:quick.r,viewX:mapView.x,viewY:mapView.y,scale:mapView.k,viewportWidth:safeWidth,viewportHeight:safeHeight,preferredWidth:safeWidth<=640?236:224,panelHeight:42}):null;

 return <div className={[styles.root,!animated?styles.paused:""].filter(Boolean).join(" ")}>
  <svg className={"market-pan-surface "+styles.svg} data-lod={lod} data-capital-flow-only={capitalFlowOnly?"true":"false"} data-active-pulses={particles.length} viewBox={"0 0 "+safeWidth+" "+safeHeight} preserveAspectRatio="none" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} role="img" aria-label="Live Solana trade impulses toward token strength scale">
   <defs>
    <radialGradient id="waveCoinBuy" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#dffff1"/><stop offset="50%" stopColor="#54cf92"/><stop offset="100%" stopColor="#1c5b42"/></radialGradient>
    <radialGradient id="waveCoinSell" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#ffe7ea"/><stop offset="50%" stopColor="#e56672"/><stop offset="100%" stopColor="#642832"/></radialGradient>
    <radialGradient id="waveCoinFlat" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#edf2f5"/><stop offset="50%" stopColor="#7c8995"/><stop offset="100%" stopColor="#313b45"/></radialGradient>
   </defs>
   <g transform={"translate("+mapView.x+" "+mapView.y+") scale("+mapView.k+")"} className="market-pan-layer">
    <text x="26" y="28" className={styles.axis+" wave-axis-title"}>COINS</text><text x={Math.max(270,safeWidth*.45)} y="28" className={styles.axis+" wave-axis-title"}>LIVE TRADES</text><text x={scaleX-20} y="28" className={styles.axis+" wave-axis-title"}>STRENGTH</text>
    {[100,75,50,25,0,-25,-50,-75,-100].map(score=><g key={score}><line x1={Math.min(285,safeWidth*.46)} x2={scaleX} y1={scaleY(score)} y2={scaleY(score)} className={score===0?styles.zero:styles.grid}/><text x={scaleX+14} y={scaleY(score)+3} className={[styles.tick,"wave-strength-tick",score>0?styles.tickBuy:score<0?styles.tickSell:""].join(" ")}>{score>0?"+":""}{score}</text></g>)}
    <line x1={scaleX} x2={scaleX} y1={top} y2={bottom} className={styles.scale}/>
    {layout.map(point=>{
      const token=tokenByMint.get(point.mint)!;const m=metrics.get(point.mint)!;
      const selected=selectedMint===token.mint;
      const flowClass=point.strength>8?styles.coinBuy:point.strength<-8?styles.coinSell:"";
      const haloClass=point.strength>8?styles.haloBuy:point.strength<-8?styles.haloSell:styles.haloNeutral;
      const fill=point.strength>8?"url(#waveCoinBuy)":point.strength<-8?"url(#waveCoinSell)":"url(#waveCoinFlat)";
      const label=(token.symbol||token.name||token.mint.slice(0,6)).slice(0,9);
      return <g key={token.mint} className="market-node-group">
       <g className={styles.token} role="button" tabIndex={0} aria-label={(token.symbol||token.name||token.mint)+": strength "+point.strength} onPointerDown={e=>e.stopPropagation()} onClick={()=>{onSelect(token);onQuickAction(token.mint)}} onDoubleClick={()=>onOpen(token)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(token);onQuickAction(token.mint)}}}>
        <circle cx={point.x} cy={point.y} r={point.r+7} className={[styles.pulseHalo,haloClass,"token-pulse-halo"].join(" ")}/>
        <circle cx={point.x} cy={point.y} r={point.r} fill={fill} aria-label={(token.symbol||token.name||token.mint)+": strength "+point.strength} className={["market-token-bubble",styles.coin,flowClass,selected?styles.coinSelected:""].filter(Boolean).join(" ")}><title>{(token.symbol||token.name||token.mint)+" · strength "+point.strength+" · "+m.buys+" buys / "+m.sells+" sells"}</title></circle>
        {token.imageUrl&&<><clipPath id={"wave-clip-"+token.mint}><circle cx={point.x} cy={point.y} r={Math.max(8,point.r-3)}/></clipPath><image href={token.imageUrl} x={point.x-point.r+3} y={point.y-point.r+3} width={(point.r-3)*2} height={(point.r-3)*2} preserveAspectRatio="xMidYMid slice" clipPath={"url(#wave-clip-"+token.mint+")"} className={styles.icon}/></>}
        <rect x={point.x-31} y={point.y+point.r+6} width="62" height="16" rx="8" className={styles.labelPlate}/>
        <text x={point.x} y={point.y+point.r+17} textAnchor="middle" className={styles.symbol}>{label}</text>
        <text x={point.x+point.r+7} y={point.y+3} className={[styles.strength,point.strength>0?styles.buyText:point.strength<0?styles.sellText:styles.neutralText].join(" ")}>{point.strength>0?"+":""}{point.strength}</text>
       </g>
      </g>;
    })}
    <g className="targeted-comet-layer" data-event-only="true">
     {particles.map((particle,index)=>{
       const point=layoutByMint.get(particle.mint);if(!point)return null;
       const weight=1+Math.log10(1+Math.max(0,particle.usdValue??0))*2;
       const amp=waveAmplitude(weight,maxPulseWeight);
       const path=wavePath(point.x+point.r+6,point.y,scaleX,point.endY,amp,(layoutIndex.get(particle.mint)??0)*.73+(particle.side==="sell"?Math.PI:0));
       const intel=walletIntel.get(particle.mint),profile=intel?.profiles.get(particle.wallet),smart=Boolean(profile&&profile.score>=64&&profile.label!=="Bot-like"),coordinated=intel?.coordinated.has(particle.wallet)??false;
       const cls=[styles.event,particle.side==="buy"?styles.eventBuy:styles.eventSell,particle.whale?styles.eventWhale:"",smart?styles.eventSmart:"",coordinated?styles.eventCoordinated:"","targeted-comet","targeted-comet-"+(particle.side==="buy"?"in":"out"),particle.evidence==="routed"?"targeted-comet-routed":"targeted-comet-direct",particle.whale?"targeted-comet-whale":"",smart?"targeted-comet-smart":"",coordinated?"targeted-comet-coordinated":""].filter(Boolean).join(" ");
       return <g key={particle.id} className={cls} onClick={e=>{e.stopPropagation();setActiveParticleId(particle.id)}}>
        <path d={path} className={[styles.eventWave,particle.side==="buy"?styles.eventWaveBuy:styles.eventWaveSell,particle.side==="buy"?"wave-buy-path":"wave-sell-path"].join(" ")}/>
        <circle r={particle.whale?4.5:3.4} className={styles.eventDot+" targeted-comet-body"}><title>{particle.side.toUpperCase()+" · "+particle.wallet.slice(0,5)+"…"+particle.wallet.slice(-4)}{smart?" · Smart Money":""}{coordinated?" · Coordinated":""}</title><animateMotion dur={(1.55+(index%4)*.12)+"s"} repeatCount="1" fill="remove" path={path}/></circle>
       </g>;
     })}
    </g>
   </g>
  </svg>
  {quick&&quickToken&&quickLayout&&<div className={styles.quick+" token-quick-actions token-quick-actions-overlay"} style={{left:quickLayout.left,top:quickLayout.top,width:quickLayout.width}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
    <a href={fomoTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">FoMo ↗</a><a href={gmgnTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">GmGn ↗</a><button className="quick-detail-action" onClick={()=>onDetails(quickToken)}>Details</button><button className="quick-holder-action" onClick={()=>onOpen(quickToken)}>Holders</button>
  </div>}
  {activeParticle&&<div className={styles.detail+" targeted-comet-detail"}><button className="detail-close" onClick={()=>setActiveParticleId(null)} aria-label="Close wallet profile">×</button><strong>{activeParticleProfile?.label??(activeParticle.whale?"Whale":"Wallet")} · {activeParticle.side.toUpperCase()}</strong><span>{activeParticle.wallet.slice(0,6)}…{activeParticle.wallet.slice(-5)}</span><small>{activeParticleProfile?`Wallet score ${activeParticleProfile.score}/100 · Wallet net ${activeParticleProfile.netUsd==null?"—":Math.round(activeParticleProfile.netUsd).toLocaleString()+" USD"}`:"Wallet score unavailable"}{activeParticleCoordinated?" · Coordinated":""}</small></div>}
  <div className={styles.status}><b>Event-only flow</b> · импулс има само при нов BUY/SELL · без празен replay</div>
 </div>;
}
