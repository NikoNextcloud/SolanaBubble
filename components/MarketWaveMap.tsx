"use client";
import {useEffect,useMemo,useRef,useState,type PointerEventHandler,type WheelEventHandler} from "react";
import type {LiveMarketEvent} from "@/lib/market/live-events";
import type {TrafficSummary} from "@/lib/market/traffic/summary";
import {buildWalletProfiles,detectCoordinatedWallets,trafficSampleRows} from "@/lib/market/intelligence-core";
import {positionQuickActions} from "@/lib/market/quick-actions";
import {fomoTokenUrl,gmgnTokenUrl} from "@/lib/token-links";
import {activeWaveEvents,buildFlowTrail,goodOpportunitySignal,livingWaveDynamics,livingWavePath,opportunityWaveSignal,selectWaveTokens,waveAmplitude,waveMapLayout,waveMetrics,wavePath,type FlowTrailTrade,type WaveMetrics} from "@/lib/market/wave-map";
import styles from "./MarketWaveMap.module.css";

export type MarketWaveToken={
 mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;marketCap?:number|null;hypeScore?:number|null;
 buys1h?:number|null;sells1h?:number|null;trades1h?:number|null;volume1h?:number|null;trafficSample?:TrafficSummary|null;
 opportunityScore?:number|null;signalConfidenceScore?:number|null;manipulationRiskScore?:number|null;riskScore?:number|null;
 capitalFlowScore?:number|null;momentumScore?:number|null;liquidityWarning?:boolean|null;divergenceSignal?:'bullish'|'bearish'|'none'|null;
 hypeVelocity?:number|null;hypeAcceleration?:number|null;observedBuyPressure15m?:number|null;buyPressure?:number|null;
 liquidityChangePct?:number|null;trendPersistenceScore?:number|null;holderGrowthPct?:number|null;smartMoneyFlowUsd?:number|null;
 trafficEvidence?:'warming'|'sparse'|'usable'|'degraded'|null;
};
type EarlyPool={id:string;mint:string|null;name:string;ageMinutes:number|null;liquidityUsd:number|null;buys5m:number|null;sells5m:number|null;stage:"early-watch"|"insufficient-data"|"late-risk"|"liquidity-risk";reasons:string[];sourceUrl:string};
type EarlyFeed={ok:boolean;observedAt:string;pools:EarlyPool[]};
const earlyMoney=(usd:number|null)=>usd===null?"?":"$"+new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(usd);
type Particle={id:string;mint:string;side:"buy"|"sell";wallet:string;evidence:"direct"|"routed";whale:boolean;usdValue:number|null};

export default function MarketWaveMap({tokens,events,width,height,now,selectedMint,quickActionMint,mapView,lod,capitalFlowOnly,animated,liveEnabled,maxComets,onSelect,onQuickAction,onDetails,onOpen,onWheel,onPointerDown,onPointerMove,onPointerUp,onPointerCancel}:{
 tokens:MarketWaveToken[];events:LiveMarketEvent[];width:number;height:number;now:number;selectedMint:string|null;quickActionMint:string|null;
 mapView:{x:number;y:number;k:number};lod:"far"|"mid"|"near";capitalFlowOnly:boolean;animated:boolean;liveEnabled:boolean;maxComets:number;
 onSelect:(token:MarketWaveToken)=>void;onQuickAction:(mint:string|null)=>void;onDetails:(token:MarketWaveToken)=>void;onOpen:(token:MarketWaveToken)=>void;
 onWheel:WheelEventHandler<SVGSVGElement>;onPointerDown:PointerEventHandler<SVGSVGElement>;onPointerMove:PointerEventHandler<SVGSVGElement>;onPointerUp:PointerEventHandler<SVGSVGElement>;onPointerCancel:PointerEventHandler<SVGSVGElement>;
}){
 const safeWidth=Math.max(520,width||900),safeHeight=Math.max(420,height||560);
 const [clock,setClock]=useState(()=>Date.now());
 const [activeParticleId,setActiveParticleId]=useState<string|null>(null);
 const [earlyPools,setEarlyPools]=useState<EarlyPool[]>([]);
 const [earlySelected,setEarlySelected]=useState<string|null>(null);
 const [earlyError,setEarlyError]=useState(false);
 const [earlyObservedAt,setEarlyObservedAt]=useState<string|null>(null);
 const [earlyReload,setEarlyReload]=useState(0);
 useEffect(()=>{
   if(!liveEnabled)return;
   let alive=true;
   let controller:AbortController|null=null;
   const fetchEarly=async()=>{
     controller?.abort();
     const request=new AbortController();controller=request;
     try{
       const response=await fetch("/api/market/early",{cache:"no-store",signal:request.signal});
       if(!response.ok)throw new Error("early feed failed");
       const data=await response.json() as EarlyFeed;
       if(!data.ok||!Array.isArray(data.pools))throw new Error("invalid early feed");
       if(alive){setEarlyPools(data.pools);setEarlyObservedAt(data.observedAt);setEarlyError(false);}
     }catch(e){if(alive&&!(e instanceof Error&&e.name==="AbortError"))setEarlyError(true);}
   };
   void fetchEarly();
   const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void fetchEarly()},60000);
   return()=>{alive=false;controller?.abort();window.clearInterval(timer)};
 },[liveEnabled,earlyReload]);
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
   : mapView.k<.58?30
     : mapView.k<.68?24
       : mapView.k<.78?18
         : mapView.k>1.55?8
           : 12;
 const visibleTokens=useMemo(()=>selectWaveTokens(tokens,events,metrics,selectedMint,maxVisible,clock),[tokens,events,metrics,selectedMint,maxVisible,clock]);
 const visibleTokenByMint=useMemo(()=>new Map(visibleTokens.map(t=>[t.mint,t])),[visibleTokens]);
 const combinedCenter=safeWidth<700?Math.round(safeWidth*.53):Math.min(Math.round(safeWidth*.54),safeWidth-190);
 const earlyMaxCount=Math.max(2,Math.min(5,Math.floor((safeHeight-155)/100)));
 const earlyVisible=useMemo(()=>{
   const seen=new Set<string>(tokens.map(t=>t.mint));
   const quality=(p:EarlyPool)=>{
     const trades=(p.buys5m??0)+(p.sells5m??0);
     const pressure=trades>0?(p.buys5m??0)/trades:0;
     const qualified=p.stage==="early-watch"&&p.liquidityUsd!==null&&p.liquidityUsd>=30000&&trades>=15&&pressure>=.6;
     return (qualified?1000:0)+(p.stage==="late-risk"?-500:0)+(p.stage==="liquidity-risk"?-400:0)+Math.min(150,p.liquidityUsd??0)/1000+pressure*40;
   };
   return [...earlyPools].filter(p=>p.id&&p.ageMinutes!==null&&p.ageMinutes<=60&&(!p.mint||!seen.has(p.mint)))
      .sort((a,b)=>quality(b)-quality(a)).slice(0,earlyMaxCount);
 },[earlyPools,tokens,earlyMaxCount]);
 const layout=useMemo(()=>waveMapLayout(visibleTokens,metrics,safeWidth,safeHeight),[visibleTokens,metrics,safeWidth,safeHeight]);
 const layoutByMint=useMemo(()=>new Map(layout.map(p=>[p.mint,p])),[layout]);
 const layoutIndex=useMemo(()=>new Map(layout.map((p,i)=>[p.mint,i])),[layout]);
 const denseFocus=safeWidth>=700&&visibleTokens.length>12;
 const scaleX=combinedCenter,flowStart=Math.min(scaleX-50,safeWidth<700?115:denseFocus?Math.min(370,Math.max(270,safeWidth*.30)):Math.min(315,Math.max(235,safeWidth*.28))),top=92,bottom=safeHeight-78,usable=Math.max(1,bottom-top);
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
 const livingWaves=useMemo(()=>layout.map((point,index)=>{
   const m=metrics.get(point.mint);
   const token=visibleTokenByMint.get(point.mint);
   const dynamics=livingWaveDynamics(token?.hypeScore,m?.buys??0,m?.sells??0,token?.hypeVelocity);
   const side=point.strength>4?"buy":point.strength<-4?"sell":"neutral";
   const opportunity=opportunityWaveSignal(token??{mint:point.mint},point.strength);
   const goodOpportunity=goodOpportunitySignal(token??{mint:point.mint},point.strength);
   const phase=index*.73;
   const x1=point.x+point.r+12;
   const frames=[
     livingWavePath(x1,point.y,scaleX,point.endY,dynamics,phase),
     livingWavePath(x1,point.y,scaleX,point.endY,dynamics,phase+1.7),
     livingWavePath(x1,point.y,scaleX,point.endY,dynamics,phase+3.4),
     livingWavePath(x1,point.y,scaleX,point.endY,dynamics,phase),
   ];
   return {
     mint:point.mint,
     side,
     d:frames[0],
     morphValues:frames.join(";"),
     morphDuration:Math.max(1.6,dynamics.duration*1.7),
     x:scaleX,
     y:point.endY,
     dynamics,
     opportunity,
     goodOpportunity,
   };
 }),[layout,metrics,visibleTokenByMint,scaleX]);
 const livingWaveByMint=useMemo(()=>new Map(livingWaves.map(wave=>[wave.mint,wave])),[livingWaves]);
 const earlyLayout=useMemo(()=>{
   const start=111,end=Math.max(120,safeHeight-106),gap=earlyVisible.length>1?(end-start)/(earlyVisible.length-1):0;
   return earlyVisible.map((pool,index)=>{
     const buys=pool.buys5m??0,sells=pool.sells5m??0,total=buys+sells;
     const pressure=total>0?buys/total:null;
     const activity=livingWaveDynamics(null,buys,sells,null);
     const startX=safeWidth-69-31;
     const endX=scaleX+43;
     const y=earlyVisible.length===1?(start+end)/2:start+gap*index;
     const endY=scaleY(pressure===null?0:(pressure-.5)*120);
     const frames=[0,1.7,3.4,0].map(phase=>livingWavePath(startX,y,endX,endY,activity,index*.72+phase));
     return {pool,x:safeWidth-69,y,r:30,endY,pressure,activity,frames,d:frames[0],morphValues:frames.join(";"),duration:Math.max(1.8,activity.duration*1.7)};
   });
 },[earlyVisible,safeWidth,safeHeight,scaleX]);
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
 const chosenEarly=earlySelected?earlyLayout.find(p=>p.pool.id===earlySelected):null;
 const earlyQuickLayout=chosenEarly?positionQuickActions({nodeX:chosenEarly.x,nodeY:chosenEarly.y,nodeRadius:chosenEarly.r,viewX:mapView.x,viewY:mapView.y,scale:mapView.k,viewportWidth:safeWidth,viewportHeight:safeHeight,preferredWidth:safeWidth<=640?225:270,panelHeight:75}):null;
 const hiddenCount=Math.max(0,tokens.length-visibleTokens.length);
 const goodCount=visibleTokens.reduce((count,token)=>count+(goodOpportunitySignal(token,metrics.get(token.mint)?.strength??0).active?1:0),0);

 return <div className={[styles.root,!animated?styles.paused:""].filter(Boolean).join(" ")}>
  <svg className={"market-pan-surface "+styles.svg} data-lod={lod} data-focus-capacity={maxVisible} data-zoom={mapView.k.toFixed(2)} data-capital-flow-only={capitalFlowOnly?"true":"false"} data-active-pulses={particles.length} data-visible-tokens={visibleTokens.length} data-map-mode="unified" data-early-visible={earlyVisible.length} viewBox={"0 0 "+safeWidth+" "+safeHeight} preserveAspectRatio="none" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} role="img" aria-label="Live Solana trade impulses toward token strength scale">
   <defs>
    <radialGradient id="waveCoinBuy" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#dffff1"/><stop offset="48%" stopColor="#42c989"/><stop offset="100%" stopColor="#184836"/></radialGradient>
    <radialGradient id="waveCoinSell" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#ffe7ea"/><stop offset="48%" stopColor="#df5d69"/><stop offset="100%" stopColor="#56242d"/></radialGradient>
    <radialGradient id="waveCoinFlat" cx="34%" cy="27%" r="78%"><stop offset="0%" stopColor="#edf2f5"/><stop offset="48%" stopColor="#778591"/><stop offset="100%" stopColor="#2e3740"/></radialGradient>
    <linearGradient id="waveFlowBuy" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#1d5b42" stopOpacity=".3"/><stop offset="48%" stopColor="#42e69a" stopOpacity=".82"/><stop offset="100%" stopColor="#9affc7"/></linearGradient>
    <linearGradient id="waveFlowSell" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#612a32" stopOpacity=".3"/><stop offset="48%" stopColor="#ff6574" stopOpacity=".82"/><stop offset="100%" stopColor="#ffabb3"/></linearGradient>
    <linearGradient id="waveFlowNeutral" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#53606b" stopOpacity=".22"/><stop offset="55%" stopColor="#aab7c2" stopOpacity=".64"/><stop offset="100%" stopColor="#d7e0e6" stopOpacity=".72"/></linearGradient>
    <linearGradient id="waveOpportunity" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fff" stopOpacity=".08"/><stop offset="38%" stopColor="#fff" stopOpacity=".72"/><stop offset="72%" stopColor="#fff" stopOpacity="1"/><stop offset="100%" stopColor="#fff" stopOpacity=".35"/></linearGradient>
    <radialGradient id="hypeFlareFill" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#effff6" stopOpacity=".26"/><stop offset="34%" stopColor="#8dffc0" stopOpacity=".16"/><stop offset="72%" stopColor="#54e99d" stopOpacity=".07"/><stop offset="100%" stopColor="#54e99d" stopOpacity="0"/></radialGradient>
   </defs>
   <g transform={"translate("+mapView.x+" "+mapView.y+") scale("+mapView.k+")"} className="market-pan-layer">
    <text x="32" y="34" className={styles.axis+" wave-axis-title"}>TOKENS · GOOD / ORDER FLOW</text>
    <text x={scaleX+Math.max(55,(safeWidth-scaleX)*.35)} y="34" className={styles.axis+" wave-axis-title"}>EARLY RADAR</text>
    <text x={scaleX-24} y="34" className={styles.axis+" wave-axis-title"}>STRENGTH</text>
    {[100,75,50,25,0,-25,-50,-75,-100].map(score=><g key={score}>
      <line x1={flowStart} x2={scaleX} y1={scaleY(score)} y2={scaleY(score)} className={score===0?styles.zero:styles.grid}/>
      <text x={scaleX+14} y={scaleY(score)+3} className={[styles.tick,"wave-strength-tick",score>0?styles.tickBuy:score<0?styles.tickSell:""].join(" ")}>{score>0?"+":""}{score}</text>
    </g>)}
    <line x1={scaleX} x2={scaleX} y1={top} y2={bottom} className={styles.scale} strokeDasharray="8 8"/>
    <text x={safeWidth-69} y="66" textAnchor="middle" className={styles.earlyLegend}>NEW / UNVERIFIED</text>

    {layout.map((point,index)=>{
      const token=visibleTokenByMint.get(point.mint)!;const m=metrics.get(point.mint)!;
      const selected=selectedMint===token.mint;
      const flowClass=point.strength>8?styles.coinBuy:point.strength<-8?styles.coinSell:"";
      const haloClass=point.strength>8?styles.haloBuy:point.strength<-8?styles.haloSell:styles.haloNeutral;
      const fill=point.strength>8?"url(#waveCoinBuy)":point.strength<-8?"url(#waveCoinSell)":"url(#waveCoinFlat)";
      const label=(token.symbol||token.name||token.mint.slice(0,6)).slice(0,12);
      const hype=Math.max(0,Math.min(100,Number(token.hypeScore??0)));
      const hypeVelocity=typeof token.hypeVelocity==="number"&&Number.isFinite(token.hypeVelocity)?token.hypeVelocity:null;
      const hypeArrow=hypeVelocity==null?"?":hypeVelocity>.25?"↑":hypeVelocity<-.25?"↓":"→";
      const hypeClass=hype>=92?styles.coinHypeExtreme:hype>=85?styles.coinHypeHot:hype>=65?styles.coinHypeWarm:"";
      const good=goodOpportunitySignal(token,point.strength);
      return <g key={token.mint} className="market-node-group" data-flow-rank={index+1}>
       <g className={styles.token} data-hype={Math.round(hype)} role="button" tabIndex={0} aria-label={(token.symbol||token.name||token.mint)+": strength "+point.strength} onPointerDown={e=>e.stopPropagation()} onClick={e=>{if(e.detail>=2)handleTokenDoubleClick(token);else handleTokenClick(token)}} onDoubleClick={()=>handleTokenDoubleClick(token)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(token);onQuickAction(token.mint)}}}>
        {hype>=85&&<circle cx={point.x} cy={point.y} r={point.r+30} fill="url(#hypeFlareFill)" className={[styles.hypeFlare,hype>=92?styles.hypeFlareExtreme:styles.hypeFlareHot,"token-hype-flare"].join(" ")} style={{animationDuration:(2.55-hype*.014)+"s"}}/>}
        {hype>=60&&<circle cx={point.x} cy={point.y} r={point.r+12} className={[styles.hypeAura,hype>=92?styles.hypeAuraExtreme:hype>=85?styles.hypeAuraHot:styles.hypeAuraWarm,"token-hype-aura"].join(" ")} style={{animationDuration:(2.75-hype*.018)+"s"}}/>}
        {hype>=85&&<circle cx={point.x} cy={point.y} r={point.r+18} className={[styles.hypeAura,styles.hypeAuraSecondary,hype>=92?styles.hypeAuraExtreme:styles.hypeAuraHot,"token-hype-aura-secondary"].join(" ")} style={{animationDuration:(3.15-hype*.017)+"s"}}/>}
        <circle cx={point.x} cy={point.y} r={point.r+8} className={[styles.pulseHalo,haloClass,"token-pulse-halo"].join(" ")}/>
        <circle cx={point.x} cy={point.y} r={point.r+8} className={[styles.pulseHalo,styles.pulseHaloSecondary,haloClass,"token-pulse-halo"].join(" ")}/>
        <circle cx={point.x} cy={point.y} r={point.r} fill={fill} aria-label={(token.symbol||token.name||token.mint)+": strength "+point.strength} className={["market-token-bubble",styles.coin,flowClass,hypeClass,good.active?styles.coinGoodOpportunity:"",selected?styles.coinSelected:""].filter(Boolean).join(" ")}><title>{(token.symbol||token.name||token.mint)+" · Hype "+Math.round(hype)+" "+hypeArrow+(hypeVelocity!=null?" "+hypeVelocity.toFixed(2)+"/min":"")+" · strength "+point.strength+" · opportunity "+good.score+"/100 · "+m.buys+" buys / "+m.sells+" sells"}</title></circle>
        {token.imageUrl&&<><clipPath id={"wave-clip-"+token.mint}><circle cx={point.x} cy={point.y} r={Math.max(9,point.r-4)}/></clipPath><image href={token.imageUrl} x={point.x-point.r+4} y={point.y-point.r+4} width={(point.r-4)*2} height={(point.r-4)*2} preserveAspectRatio="xMidYMid slice" clipPath={"url(#wave-clip-"+token.mint+")"} className={styles.icon}/></>}
        {denseFocus?<><text x={point.x} y={point.y+point.r+13} textAnchor="middle" className={styles.symbolDense}>{label}</text>{good.active&&<text x={point.x} y={point.y-point.r-10} textAnchor="middle" className={styles.goodDense}>GOOD {good.score}</text>}</>:<>
          <text x={point.x+point.r+14} y={point.y-11} className={styles.symbol}>{label}{good.active?" · GOOD "+good.score:""}</text>
          <text x={point.x+point.r+14} y={point.y+4} className={styles.meta}>Hype {Math.round(hype)} {hypeArrow}{hypeVelocity!=null?" "+hypeVelocity.toFixed(2)+"/m":""}</text>
          <text x={point.x+point.r+14} y={point.y+19} className={[styles.strength,point.strength>0?styles.buyText:point.strength<0?styles.sellText:styles.neutralText].join(" ")}>Strength {point.strength>0?"+":""}{point.strength} · B {m.buys}/S {m.sells}</text>
        </>}
       </g>
      </g>;
    })}

    <g className="living-wave-layer" data-all-focus-tokens="true" data-wave-motion="continuous">
     {livingWaves.map(wave=>{
       const stroke=wave.side==="buy"?"url(#waveFlowBuy)":wave.side==="sell"?"url(#waveFlowSell)":"url(#waveFlowNeutral)";
       const opportunity=wave.opportunity;
       return <g key={"live-wave-"+wave.mint} className="living-wave-group" data-mint={wave.mint} data-opportunity={opportunity.strength} data-good-opportunity={wave.goodOpportunity.tier} data-hype-trend={wave.dynamics.hypeTrend}>
       <path d={wave.d} className={styles.livingWaveBase} stroke={stroke} style={{opacity:.24+wave.dynamics.activity*.22}}>
         {animated&&<animate attributeName="d" dur={wave.morphDuration+"s"} values={wave.morphValues} keyTimes="0;0.33;0.66;1" calcMode="spline" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1" repeatCount="indefinite"/>}
       </path>
       <path id={"living-wave-"+wave.mint} d={wave.d} className={[
         styles.livingWave,
         wave.side==="buy"?styles.livingWaveBuy:wave.side==="sell"?styles.livingWaveSell:styles.livingWaveNeutral,
         "living-wave-path",
         "living-wave-"+wave.side,
       ].join(" ")} data-mint={wave.mint} data-activity={wave.dynamics.activity.toFixed(3)} data-shape-motion={animated?"morph":"static"}
       style={{animationDuration:wave.dynamics.duration+"s",stroke}}
       strokeDasharray={(8+wave.dynamics.activity*12).toFixed(1)+" "+(14-wave.dynamics.activity*5).toFixed(1)}>
         {animated&&<animate attributeName="d" dur={wave.morphDuration+"s"} values={wave.morphValues} keyTimes="0;0.33;0.66;1" calcMode="spline" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1" repeatCount="indefinite"/>}
       </path>
       {opportunity.active&&<g className="opportunity-wave-group" data-mint={wave.mint} data-strength={opportunity.strength}>
         <path d={wave.d} className={[styles.opportunityAura,opportunity.partial?styles.opportunityPartial:""].filter(Boolean).join(" ")} style={{opacity:.16+opportunity.intensity*.22}}>{animated&&<animate attributeName="d" dur={wave.morphDuration+"s"} values={wave.morphValues} keyTimes="0;0.33;0.66;1" repeatCount="indefinite"/>}</path>
         <path d={wave.d} className={[styles.opportunityWave,opportunity.strength==="strong"?styles.opportunityWaveStrong:"","opportunity-wave-path"].filter(Boolean).join(" ")} stroke="url(#waveOpportunity)" style={{opacity:.45+opportunity.intensity*.45,animationDuration:(2.8-opportunity.intensity*1.2)+"s"}}>{animated&&<animate attributeName="d" dur={wave.morphDuration+"s"} values={wave.morphValues} keyTimes="0;0.33;0.66;1" repeatCount="indefinite"/>}<title>{"Opportunity setup · score "+opportunity.score+" · "+opportunity.reasons.join(" · ")}</title></path>
         {animated&&<circle r={opportunity.strength==="strong"?3.7:3} className={styles.opportunitySpark}><animateMotion dur={(3.2-opportunity.intensity*1.15)+"s"} repeatCount="indefinite"><mpath href={"#living-wave-"+wave.mint}/></animateMotion></circle>}
       </g>}
       <circle cx={wave.x} cy={wave.y} r={5.5} className={[
         styles.livingHead,
         wave.side==="buy"?styles.livingHeadBuy:wave.side==="sell"?styles.livingHeadSell:styles.livingHeadNeutral,
         "living-wave-head",
       ].join(" ")}/>
     </g>})}
    </g>

    <g className="early-wave-layer" data-wave-motion={animated?"continuous":"paused"} data-coverage={earlyError?"degraded":"sampled"}>
      {earlyLayout.map(({pool,x,y,r,endY,pressure,activity,frames,d,morphValues,duration})=>{
        const color=pool.stage==="liquidity-risk"?"#f89a9a":pool.stage==="late-risk"?"#f2a76e":pool.stage==="insufficient-data"?"#a5aaae":"#edc47d";
        const uncertain=pressure===null||pool.stage==="insufficient-data";
        return <g key={pool.id} className="early-wave-group" data-pool={pool.id} data-stage={pool.stage}>
          <path d={d} className={styles.earlyWaveAura} stroke={color} opacity={uncertain?0.16:0.33}>
            {animated&&<animate attributeName="d" dur={duration+"s"} values={morphValues} keyTimes="0;0.33;0.66;1" repeatCount="indefinite"/>}
          </path>
          <path d={d} className={styles.earlyLivingWave+" early-living-wave"} stroke={color} strokeDasharray={uncertain?"5 13":"13 11"} data-shape-motion={animated?"morph":"static"} style={{animationDuration:activity.duration+"s",opacity:uncertain?0.38:0.9}}>
            {animated&&<animate attributeName="d" dur={duration+"s"} values={morphValues} keyTimes="0;0.33;0.66;1" repeatCount="indefinite"/>}
          </path>
          <g role="button" tabIndex={0} aria-label={"EARLY "+pool.name+": "+pool.stage} className={styles.earlyToken} onPointerDown={ev=>ev.stopPropagation()} onClick={ev=>{ev.stopPropagation();setEarlySelected(v=>v===pool.id?null:pool.id);onQuickAction(null)}} onKeyDown={ev=>{if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();setEarlySelected(pool.id);onQuickAction(null)}}}>
            <circle cx={x} cy={y} r={r+5} className={styles.earlyHalo} stroke={color}/>
            <circle cx={x} cy={y} r={r} className={styles.earlyCoin} stroke={color}/>
            <text x={x} y={y+4} className={styles.earlySymbol} textAnchor="middle">{pool.name.split(" / ")[0].slice(0,8)}</text>
            <text x={x} y={y-r-12} className={styles.earlyMeta} textAnchor="middle">{pool.ageMinutes}m · {earlyMoney(pool.liquidityUsd)}</text>
            <title>{pool.name+" · "+(pool.reasons.join(" · ")||"EARLY; not verified GOOD")}</title>
          </g>
        </g>;
      })}
    </g>

    <g className="flow-history-layer" data-real-swaps-only="true" data-particles-follow-wave="true">
     {layout.map(point=>{
       const trail=flowTrails.get(point.mint)??[];
       const wave=livingWaveByMint.get(point.mint);
       if(!wave||trail.length<2)return null;
       const trades=trail.slice(1);
       const travel=Math.max(1.5,wave.dynamics.duration*2.15);
       return <g key={"trail-"+point.mint} className="token-flow-trail" data-mint={point.mint}>
        {trades.map((trade,index)=>{
          const radius=Math.max(2.4,Math.min(5.4,2.4+Math.log10(1+Math.max(0,trade.usdValue??0))*.62));
          const begin=-(index/Math.max(1,trades.length))*travel;
          return <circle key={"dot-"+trade.signature} r={radius}
           className={[styles.flowDot,trade.side==="buy"?styles.flowDotBuy:styles.flowDotSell,trade.live?styles.flowDotLive:"","flow-trade-dot","moving-flow-particle","flow-trade-"+trade.side].filter(Boolean).join(" ")}
           data-side={trade.side} data-live={trade.live?"true":"false"}>
            <title>{trade.side?.toUpperCase()+" · real swap"+(trade.usdValue!=null?" · $"+Math.round(trade.usdValue).toLocaleString():"")}</title>
            {animated&&<animateMotion dur={travel+"s"} begin={begin+"s"} repeatCount="indefinite"><mpath href={"#living-wave-"+wave.mint}/></animateMotion>}
           </circle>;
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

  <div className={styles.earlyInfo} data-early-source={earlyError?"degraded":earlyObservedAt?"sampled":"warming"}>
    <span>EARLY · {earlyError?"данните са забавени":earlyObservedAt?earlyVisible.length+" нови пула":"зареждане"} · sampled</span>
    <button type="button" aria-label="Обнови EARLY" title="Обнови новите пулове" disabled={!liveEnabled} onClick={()=>setEarlyReload(v=>v+1)}>↻</button>
  </div>
  <div className={styles.focusInfo}><b>{visibleTokens.length} bullish-ranked · {earlyVisible.length} EARLY</b><span> · {goodCount} GOOD</span><span> · {Math.round(mapView.k*100)}% zoom</span>{hiddenCount>0?<span> · {hiddenCount} more available in List</span>:null}<small>{lod==="far"?"zoom out reveals more candidates":lod==="near"?"detail mode keeps the strongest setups":"GOOD setups, rising Hype and BUY pressure are prioritized"}</small></div>
  {quick&&quickToken&&quickLayout&&<div className={styles.quick+" token-quick-actions token-quick-actions-overlay"} style={{left:quickLayout.left,top:quickLayout.top,width:quickLayout.width}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
    <a href={fomoTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">FoMo ↗</a><a href={gmgnTokenUrl(quickToken.mint)} target="_blank" rel="noreferrer">GmGn ↗</a><button className="quick-detail-action" onClick={()=>onDetails(quickToken)}>Details</button><button className="quick-holder-action" onClick={()=>onOpen(quickToken)}>Holders</button>
  </div>}
  {chosenEarly&&earlyQuickLayout&&<div className={styles.quick+" early-token-quick-actions"} style={{left:earlyQuickLayout.left,top:earlyQuickLayout.top,width:earlyQuickLayout.width,flexWrap:"wrap"}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
    <strong style={{width:"100%",fontSize:11,color:"#f2d4a3"}}>{chosenEarly.pool.name.slice(0,55)} · {chosenEarly.pool.stage==="early-watch"?"Ранен интерес":"Непотвърден / риск"}</strong>
    {chosenEarly.pool.mint?<><a href={fomoTokenUrl(chosenEarly.pool.mint)} target="_blank" rel="noopener noreferrer">FoMo ↗</a><a href={gmgnTokenUrl(chosenEarly.pool.mint)} target="_blank" rel="noopener noreferrer">GmGn ↗</a></>:<span style={{fontSize:10}}>Mint not verified</span>}
    <a href={chosenEarly.pool.sourceUrl} target="_blank" rel="noopener noreferrer">Pool ↗</a><button onClick={()=>setEarlySelected(null)} aria-label="Затвори EARLY меню">×</button>
    <small style={{width:"100%",fontSize:9,color:"#d5b8a4"}}>Агрегирани сделки · без проверка на token security</small>
  </div>}
  {activeParticle&&<div className={styles.detail+" targeted-comet-detail"}><button className="detail-close" onClick={()=>setActiveParticleId(null)} aria-label="Close wallet profile">×</button><strong>{activeParticleProfile?.label??(activeParticle.whale?"Whale":"Wallet")} · {activeParticle.side.toUpperCase()}</strong><span>{activeParticle.wallet.slice(0,6)}…{activeParticle.wallet.slice(-5)}</span><small>{activeParticleProfile?`Wallet score ${activeParticleProfile.score}/100 · Wallet net ${activeParticleProfile.netUsd==null?"—":Math.round(activeParticleProfile.netUsd).toLocaleString()+" USD"}`:"Wallet score unavailable"}{activeParticleCoordinated?" · Coordinated":""}</small></div>}
  <div className={styles.status}><b>{liveEnabled?"LIVE · sampled":"DATA PAUSED · visual motion"}</b> · GOOD = observed swaps · EARLY = aggregate discovery · wave shape shows Hype direction: ↑ gains energy, ↓ fades · GOOD = bullish quality filter · white wave = qualified opportunity, never a guarantee</div>
 </div>;
}
