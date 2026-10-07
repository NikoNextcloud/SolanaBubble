"use client";
import {useEffect,useMemo,useRef,useState,type PointerEventHandler,type WheelEventHandler} from "react";
import type {LiveMarketEvent} from "@/lib/market/live-events";
import type {TrafficSummary} from "@/lib/market/traffic/summary";
import {buildWalletProfiles,detectCoordinatedWallets,trafficSampleRows} from "@/lib/market/intelligence-core";
import {positionQuickActions} from "@/lib/market/quick-actions";
import {fomoTokenUrl,gmgnTokenUrl} from "@/lib/token-links";
import {activeWaveEvents,buildFlowTrail,selectWaveTokens,waveAmplitude,waveMapLayout,waveMetrics,wavePath,type FlowTrailTrade,type WaveMetrics} from "@/lib/market/wave-map";
import styles from "./MarketWaveMap.module.css";

export type MarketWaveToken={
 mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;marketCap?:number|null;hypeScore?:number|null;
 buys1h?:number|null;sells1h?:number|null;trades1h?:number|null;volume1h?:number|null;trafficSample?:TrafficSummary|null;
};
type Particle={id:string;mint:string;side:"buy"|"sell";wallet:string;evidence:"direct"|"routed";whale:boolean;usdValue:number|null};

export default function MarketWaveMap({tokens,events,width,height,now,selectedMint,quickActionMint,mapView,lod,capitalFlowOnly,animated,maxComets,onSelect,onQuickAction,onDetails,onOpen,onWheel,onPointerDown,onPointerMove,onPointerUp,onPointerCancel}:{
 tokens:MarketWaveToken[];events:LiveMarketEvent[];width:number;height:number;now:number;selectedMint:string|null;quickActionMint:string|null;
 mapView:{x:number;y:number;k:number};lod:"far"|"mid"|"near";capitalFlowOnly:boolean;animated:boolean;maxComets:number;
 onSelect:(token:MarketWaveToken)=>void;onQuickAction:(mint:string|null)=>void;onDetails:(token:MarketWaveToken)=>void;onOpen:(token:MarketWaveToken)=>void;
 onWheel:WheelEventHandler<SVGSVGElement>;onPointerDown:PointerEventHandler<SVGSVGElement>;onPointerMove:PointerEventHandler<SVGSVGElement>;onPointerUp:PointerEventHandler<SVGSVGElement>;onPointerCancel:PointerEventHandler<SVGSVGElement>;
}){
 const safeWidth=Math.max(520,width||900),safeHeight=Math.max(420,height||560);
 const [clock,setClock]=useState(()=>Date.now());
 const [activeParticleId,setActiveParticleId]=useState<string|null>(null);
 const clickTimer=useRef<number|null>(null);
 useEffect(()=>{
   const started=Date.now();setClock(started);
   const timers=events.map(event=>{
     const observed=Date.parse(event.observed_at),block=Date.parse(event.block_at);
     const at=Number.isFinite(observed)?observed:block;
     return at+4200-started;
   }).filter(delay=>Number.isFinite(delay)&&delay>0&&delay<4600).map(delay=>window.setTimeout(()=>setClock(Date.now()),delay+60));
   return()=>timers.forEach(id=>window.clearTimeout(id));
 },[events]);
 useEffect(()=>()=>{if(clickTimer.current!=null)window.clearTimeout(clickTimer.current)},[]);
 const handleTokenClick=(token:MarketWaveToken)=>{onSelect(token);if(clickTimer.current!=null)window.clearTimeout(clickTimer.current);clickTimer.current=window.setTimeout(()=>{onQuickAction(token.mint);clickTimer.current=null},180)};
 const handleTokenDoubleClick=(token:MarketWaveToken)=>{if(clickTimer.current!=null){window.clearTimeout(clickTimer.current);clickTimer.current=null}onQuickAction(null);onOpen(token)};

 const tokenByMint=useMemo(()=>new Map(tokens.map(t=>[t.mint,t])),[tokens]);
 const metrics=useMemo(()=>new Map<string,WaveMetrics>(tokens.map(t=>[t.mint,waveMetrics(t,events,now)])),[tokens,events,now]);
 const maxVisible=safeWidth<700
   ? Math.max(4,Math.min(6,Math.floor((safeHeight-180)/94)))
   : Math.min(9,Math.max(8,Math.floor((safeHeight-180)/82)));
 const visibleTokens=useMemo(()=>selectWaveTokens(tokens,events,metrics,selectedMint,maxVisible,clock),[tokens,events,metrics,selectedMint,maxVisible,clock]);
 const visibleTokenByMint=useMemo(()=>new Map(visibleTokens.map(t=>[t.mint,t])),[visibleTokens]);
 const layout=useMemo(()=>waveMapLayout(visibleTokens,metrics,safeWidth,safeHeight),[visibleTokens,metrics,safeWidth,safeHeight]);
 const layoutByMint=useMemo(()=>new Map(layout.map(p=>[p.mint,p])),[layout]);
 const layoutIndex=useMemo(()=>new Map(layout.map((p,i)=>[p.mint,i])),[layout]);
 const scaleX=safeWidth-88,flowStart=safeWidth<700?280:Math.min(330,Math.max(300,safeWidth*.30)),top=92,bottom=safeHeight-78,usable=Math.max(1,bottom-top);
 const scaleY=(score:number)=>top+(100-Math.max(-100,Math.min(100,score)))/200*usable;

 const walletIntel=useMemo(()=>{
   const map=new Map<string,{profiles:Map<string,{score:number;label:string;netUsd:number|null}>;coordinated:Set<string>}>();
   for(const token of visibleTokens){
     const rows=trafficSampleRows(token.trafficSample);
     const profiles=new Map(buildWalletProfiles(rows,now).map(p=>[p.wallet,{score:p.score,label:p.label,netUsd:p.netUsd}]));
     const coordinated=new Set(detectCoordinatedWallets(rows).filter(c=>c.confidence!=="low").flatMap(c=>c.wallets));
     map.set(token.mint,{profiles,coordinated});
   }
   return map;
 },[visibleTokens,now]);

 const visibleMints=useMemo(()=>new Set(visibleTokens.map(t=>t.mint)),[visibleTokens]);
 const flowTrails=useMemo(()=>{
   const map=new Map<string,ReturnType<typeof buildFlowTrail>>();
   for(const token of visibleTokens){
     const point=layoutByMint.get(token.mint);
     if(!point)continue;
     const retained:FlowTrailTrade[]=trafficSampleRows(token.trafficSample).map((row,index)=>({
       signature:row.signature||[`retained`,token.mint,row.wallet,row.side,row.block_at,index].join(":"),
       side:row.side,usdValue:row.usd_value,at:row.block_at,live:false,
     }));
     const live:FlowTrailTrade[]=events.filter(event=>event.mint===token.mint).map(event=>({
       signature:event.signature,side:event.side,usdValue:event.usd_value,at:event.block_at,live:true,
     }));
     map.set(token.mint,buildFlowTrail([...retained,...live],point.x+point.r+12,point.y,scaleX,point.endY,20));
   }
   return map;
 },[visibleTokens,events,layoutByMint,scaleX]);
 const particles=useMemo<Particle[]>(()=>{
   if(!animated)return [];
   return activeWaveEvents(events,visibleMints,clock,4200,maxComets).map(event=>({
     id:event.mint+":"+event.signature+":"+event.wallet+":"+event.side,
     mint:event.mint,side:event.side,wallet:event.wallet,evidence:event.evidence,whale:event.whale,usdValue:event.usd_value,
   }));
 },[events,visibleMints,clock,maxComets,animated]);
 const maxPulseWeight=Math.max(1,...particles.map(p=>1+Math.log10(1+Math.max(0,p.usdValue??0))*2));
 const activeParticle=activeParticleId?particles.find(p=>p.id===activeParticleId):null;
 const activeParticleProfile=activeParticle?walletIntel.get(activeParticle.mint)?.profiles.get(activeParticle.wallet):null;
 const activeParticleCoordinated=activeParticle?walletIntel.get(activeParticle.mint)?.coordinated.has(activeParticle.wallet)??false:false;
 const quick=quickActionMint?layoutByMint.get(quickActionMint):null;
 const quickToken=quickActionMint?visibleTokenByMint.get(quickActionMint):null;
 const quickLayout=quick?positionQuickActions({nodeX:quick.x,nodeY:quick.y,nodeRadius:quick.r,viewX:mapView.x,viewY:mapView.y,scale:mapView.k,viewportWidth:safeWidth,viewportHeight:safeHeight,preferredWidth:safeWidth<=640?236:224,panelHeight:42}):null;
 const hiddenCount=Math.max(0,tokens.length-visibleTokens.length);

 return <div className={[styles.root,!animated?styles.paused:""].filter(Boolean).join(" ")}>
  <svg className={"market-pan-surface "+styles.svg} data-lod={lod} data-capital-flow-only={capitalFlowOnly?"true":"false"} data-active-pulses={particles.length} data-visible-tokens={visibleTokens.length} viewBox={"0 0 "+safeWidth+" "+safeHeight} preserveAspectRatio="none" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} role="img" aria-label="Live Solana trade impulses toward token strength scale">
   <defs>
    <radialGradient id="waveCoinBuy" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#dffff1"/><stop offset="48%" stopColor="#42c989"/><stop offset="100%" stopColor="#184836"/></radialGradient>
    <radialGradient id="waveCoinSell" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#ffe7ea"/><stop offset="48%" stopColor="#df5d69"/><stop offset="100%" stopColor="#56242d"/></radialGradient>
    <radialGradient id="waveCoinFlat" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#edf2f5"/><stop offset="48%" stopColor="#778591"/><stop offset="100%" stopColor="#2e3740"/></radialGradient>
   </defs>
   <g transform={"translate("+mapView.x+" "+mapView.y+") scale("+mapView.k+")"} className="market-pan-layer">
    <text x="32" y="34" className={styles.axis+" wave-axis-title"}>TOKENS</text>
    <text x={Math.max(flowStart+110,safeWidth*.45)} y="34" className={styles.axis+" wave-axis-title"}>ORDER FLOW</text>
    <text x={scaleX-30} y="34" className={styles.axis+" wave-axis-title"}>STRENGTH</text>
    {[100,75,50,25,0,-25,-50,-75,-100].map(score=><g key={score}>
      <line x1={flowStart} x2={scaleX} y1={scaleY(score)} y2={scaleY(score)} className={score===0?styles.zero:styles.grid}/>
      <text x={scaleX+14} y={scaleY(score)+3} className={[styles.tick,"wave-strength-tick",score>0?styles.tickBuy:score<0?styles.tickSell:""].join(" ")}>{score>0?"+":""}{score}</text>
    </g>)}
    <line x1={scaleX} x2={scaleX} y1={top} y2={bottom} className={styles.scale}/>

    {layout.map((point,index)=>{
      const token=visibleTokenByMint.get(point.mint)!;const m=metrics.get(point.mint)!;
      const selected=selectedMint===token.mint;
      const flowClass=point.strength>8?styles.coinBuy:point.strength<-8?styles.coinSell:"";
      const haloClass=point.strength>8?styles.haloBuy:point.strength<-8?styles.haloSell:styles.haloNeutral;
      const fill=point.strength>8?"url(#waveCoinBuy)":point.strength<-8?"url(#waveCoinSell)":"url(#waveCoinFlat)";
      const label=(token.symbol||token.name||token.mint.slice(0,6)).slice(0,12);
      return <g key={token.mint} className="market-node-group" data-flow-rank={index+1}>
       <g className={styles.token} role="button" tabIndex={0} aria-label={(token.symbol||token.name||token.mint)+": strength "+point.strength} onPointerDown={e=>e.stopPropagation()} onClick={e=>{if(e.detail>=2)handleTokenDoubleClick(token);else handleTokenClick(token)}} onDoubleClick={()=>handleTokenDoubleClick(token)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(token);onQuickAction(token.mint)}}}>
        <circle cx={point.x} cy={point.y} r={point.r+8} className={[styles.pulseHalo,haloClass,"token-pulse-halo"].join(" ")}/>
        <circle cx={point.x} cy={point.y} r={point.r+8} className={[styles.pulseHalo,styles.pulseHaloSecondary,haloClass,"token-pulse-halo"].join(" ")}/>
        <circle cx={point.x} cy={point.y} r={point.r} fill={fill} aria-label={(token.symbol||token.name||token.mint)+": strength "+point.strength} className={["market-token-bubble",styles.coin,flowClass,selected?styles.coinSelected:""].filter(Boolean).join(" ")}><title>{(token.symbol||token.name||token.mint)+" · strength "+point.strength+" · "+m.buys+" buys / "+m.sells+" sells"}</title></circle>
        {token.imageUrl&&<><clipPath id={"wave-clip-"+token.mint}><circle cx={point.x} cy={point.y} r={Math.max(9,point.r-4)}/></clipPath><image href={token.imageUrl} x={point.x-point.r+4} y={point.y-point.r+4} width={(point.r-4)*2} height={(point.r-4)*2} preserveAspectRatio="xMidYMid slice" clipPath={"url(#wave-clip-"+token.mint+")"} className={styles.icon}/></>}
        <text x={point.x+point.r+14} y={point.y-8} className={styles.symbol}>{label}</text>
        <text x={point.x+point.r+14} y={point.y+6} className={styles.meta}>B {m.buys} · S {m.sells}</text>
        <text x={point.x+point.r+14} y={point.y+21} className={[styles.strength,point.strength>0?styles.buyText:point.strength<0?styles.sellText:styles.neutralText].join(" ")}>Strength {point.strength>0?"+":""}{point.strength}</text>
       </g>
      </g>;
    })}

    <g className="flow-history-layer" data-real-swaps-only="true">
     {layout.map(point=>{
       const trail=flowTrails.get(point.mint)??[];
       if(trail.length<2)return null;
       return <g key={"trail-"+point.mint} className="token-flow-trail" data-mint={point.mint}>
        {trail.slice(1).map((current,index)=>{
          const previous=trail[index];
          const dx=current.x-previous.x;
          const c1x=previous.x+dx*.36,c2x=previous.x+dx*.72;
          const d={`M${previous.x.toFixed(1)},${previous.y.toFixed(1)} C${c1x.toFixed(1)},${previous.y.toFixed(1)} ${c2x.toFixed(1)},${current.y.toFixed(1)} ${current.x.toFixed(1)},${current.y.toFixed(1)}`};
          return <path key={"seg-"+current.signature} d={d} className={[styles.flowSegment,current.side==="buy"?styles.flowSegmentBuy:styles.flowSegmentSell,"flow-trace-segment","flow-trace-"+current.side].join(" ")}/>;
        })}
        {trail.slice(1).map((trade,index)=>{
          const radius=Math.max(2.8,Math.min(6,2.8+Math.log10(1+Math.max(0,trade.usdValue??0))*.72));
          return <circle key={"dot-"+trade.signature} cx={trade.x} cy={trade.y} r={radius} className={[styles.flowDot,trade.side==="buy"?styles.flowDotBuy:styles.flowDotSell,trade.live?styles.flowDotLive:"","flow-trade-dot","flow-trade-"+trade.side].filter(Boolean).join(" ")} data-side={trade.side} data-live={trade.live?"true":"false"}><title>{trade.side?.toUpperCase()+" · real swap"+(trade.usdValue!=null?" · $"+Math.round(trade.usdValue).toLocaleString():"")}</title></circle>;
        })}
       </g>;
     })}
    </g>

    <g className="targeted-comet-layer" data-event-only="true">
     {particles.map((particle,index)=>{
       const point=layoutByMint.get(particle.mint);if(!point)return null;
       const weight=1+Math.log10(1+Math.max(0,particle.usdValue??0))*2;
       const amp=waveAmplitude(weight,maxPulseWeight);
       const path=wavePath(point.x+point.r+12,point.y,scaleX,point.endY,amp,(layoutIndex.get(particle.mint)??0)*.7+(particle.side==="sell"?Math.PI:0));
       const intel=walletIntel.get(particle.mint),profile=intel?.profiles.get(particle.wallet),smart=Boolean(profile&&profile.score>=64&&profile.label!=="Bot-like"),coordinated=intel?.coordinated.has(particle.wallet)??false;
       const cls=[styles.event,particle.side==="buy"?styles.eventBuy:styles.eventSell,particle.whale?styles.eventWhale:"",smart?styles.eventSmart:"",coordinated?styles.eventCoordinated:"","targeted-comet","targeted-comet-"+(particle.side==="buy"?"in":"out"),particle.evidence==="routed"?"targeted-comet-routed":"targeted-comet-direct",particle.whale?"targeted-comet-whale":"",smart?"targeted-comet-smart":"",coordinated?"targeted-comet-coordinated":""].filter(Boolean).join(" ");
       return <g key={particle.id} className={cls} onClick={e=>{e.stopPropagation();setActiveParticleId(particle.id)}}>
        <path d={path} className={[styles.eventWave,particle.side==="buy"?styles.eventWaveBuy:styles.eventWaveSell,particle.side==="buy"?"wave-buy-path":"wave-sell-path"].join(" ")}/>
        <circle r={particle.whale?5.5:4.4} className={styles.eventDot+" targeted-comet-body"}><title>{particle.side.toUpperCase()+" · "+particle.wallet.slice(0,5)+"…"+particle.wallet.slice(-4)}{smart?" · Smart Money":""}{coordinated?" · Coordinated":""}</title><animateMotion dur={(1.75+(index%3)*.14)+"s"} repeatCount="1" fill="remove" path={path}/></circle>
       </g>;
     })}
    </g>
   </g>
  </svg>

  <div className={styles.focusInfo}><b>{visibleTokens.length} focus tokens</b>{hiddenCount>0?<span> · {hiddenCount} more available in List</span>:null}<small>live trades are automatically prioritized</small></div>
  {quick&&quickToken&&quickLayout&&<div className={styles.quick+" token-quick-actions token-quick-actions-overlay"} style={{left:quickLayout.left,top:quickLayout.top,width:quickLayout.width}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
    <a href={fomoTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">FoMo ↗</a><a href={gmgnTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">GmGn ↗</a><button className="quick-detail-action" onClick={()=>onDetails(quickToken)}>Details</button><button className="quick-holder-action" onClick={()=>onOpen(quickToken)}>Holders</button>
  </div>}
  {activeParticle&&<div className={styles.detail+" targeted-comet-detail"}><button className="detail-close" onClick={()=>setActiveParticleId(null)} aria-label="Close wallet profile">×</button><strong>{activeParticleProfile?.label??(activeParticle.whale?"Whale":"Wallet")} · {activeParticle.side.toUpperCase()}</strong><span>{activeParticle.wallet.slice(0,6)}…{activeParticle.wallet.slice(-5)}</span><small>{activeParticleProfile?`Wallet score ${activeParticleProfile.score}/100 · Wallet net ${activeParticleProfile.netUsd==null?"—":Math.round(activeParticleProfile.netUsd).toLocaleString()+" USD"}`:"Wallet score unavailable"}{activeParticleCoordinated?" · Coordinated":""}</small></div>}
  <div className={styles.status}><b>LIVE</b> · green dot = BUY · red dot = SELL · recent real swaps form the trajectory · fresh arrival gets a ~4s impulse</div>
 </div>;
}
