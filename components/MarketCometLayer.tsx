"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import type {TrafficSummary,TrafficRecentSwap} from "@/lib/market/traffic/summary";
import type {LiveMarketEvent} from "@/lib/market/live-events";

type TargetNode = {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  x: number;
  y: number;
  r: number;
  trafficSample?: TrafficSummary | null;
};

type ActivityEvent = {
  mint: string;
  symbol: string | null;
  kind: "surge" | "cooldown" | "buy-pressure" | "sell-pressure";
  deltaTrades: number;
  deltaVolume: number;
  hypeDelta: number;
  at: string;
};

type Comet = {
  key: string;
  target: TargetNode;
  label: string;
  wallet: string | null;
  signature: string | null;
  program: string | null;
  source: "live" | "snapshot" | "activity";
  direction: "in" | "out";
  evidence: "direct" | "routed" | "aggregate";
  whale: boolean;
  amountLabel: string;
  strength: number;
  headRadius: number;
  delay: number;
  duration: number;
  path: string;
  labelOffsetY: number;
};

const WSOL="So11111111111111111111111111111111111111112";
const shortWallet=(wallet:string)=>wallet.length>10?`${wallet.slice(0,4)}…${wallet.slice(-4)}`:wallet;
const fmtUsd=(n:number)=>n>=1000?`$${(n/1000).toFixed(n>=10000?0:1)}K`:`$${Math.max(0,n).toFixed(n>=100?0:2)}`;

function hash(value:string){
  let h=2166136261;
  for(let i=0;i<value.length;i+=1){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}

function outerPoint(node:TargetNode,key:string){
  const seed=hash(key);
  const angle=((seed%360)/180)*Math.PI;
  const distance=260+(seed%210);
  return {x:node.x+Math.cos(angle)*distance,y:node.y+Math.sin(angle)*distance,seed};
}

function createPath(node:TargetNode,key:string,index:number,direction:"in"|"out"){
  const outer=outerPoint(node,key);
  const sx=direction==="in"?outer.x:node.x;
  const sy=direction==="in"?outer.y:node.y;
  const ex=direction==="in"?node.x:outer.x;
  const ey=direction==="in"?node.y:outer.y;
  const dx=ex-sx,dy=ey-sy,length=Math.max(1,Math.hypot(dx,dy));
  const px=-dy/length,py=dx/length;
  const bend=(index%2?-1:1)*(55+((outer.seed>>8)%95));
  const cx=(sx+ex)/2+px*bend,cy=(sy+ey)/2+py*bend;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function amountLabel(swap:{usdValue:number|null;quoteMint:string;quoteAmount:number},direction:"in"|"out"){
  const sign=direction==="in"?"+":"−";
  if(swap.usdValue!=null&&Number.isFinite(swap.usdValue))return `${sign}${fmtUsd(swap.usdValue)}`;
  if(swap.quoteMint===WSOL)return `${sign}${swap.quoteAmount.toFixed(swap.quoteAmount>=10?1:2)} SOL`;
  return `${sign}${swap.quoteAmount.toFixed(2)}`;
}

function strengthFor(usdValue:number|null,quoteAmount:number){
  const basis=usdValue!=null&&usdValue>0?usdValue:Math.max(1,quoteAmount*10);
  return Math.max(0,Math.min(1,(Math.log10(basis+1)-1)/4));
}

function AnimatedComet({
  comet,
  quality,
  cycle,
  onSelect,
}:{
  comet:Comet;
  quality:"full"|"reduced";
  cycle:number;
  onSelect:(comet:Comet)=>void;
}){
  const impactOpacity=useRef<SVGElement|null>(null);
  const impactRadius=useRef<SVGElement|null>(null);
  const bodyMotion=useRef<SVGElement|null>(null);
  const bodyOpacity=useRef<SVGElement|null>(null);
  const labelMotion=useRef<SVGElement|null>(null);
  const labelOpacity=useRef<SVGElement|null>(null);

  useEffect(()=>{
    const begin=(ref:{current:SVGElement|null})=>{
      const animation=ref.current as (SVGElement&{beginElement?:()=>void})|null;
      animation?.beginElement?.();
    };
    const bodyTimer=window.setTimeout(()=>{
      begin(bodyMotion);begin(bodyOpacity);begin(labelMotion);begin(labelOpacity);
    },Math.max(0,comet.delay*1000));
    const impactDelay=comet.direction==="in"
      ? (comet.delay+comet.duration*.78)*1000
      : comet.delay*1000;
    const impactTimer=window.setTimeout(()=>{
      begin(impactOpacity);begin(impactRadius);
    },Math.max(0,impactDelay));
    return()=>{window.clearTimeout(bodyTimer);window.clearTimeout(impactTimer);};
  },[cycle,comet.key,comet.delay,comet.duration,comet.direction,quality]);

  const cls=[
    "targeted-comet",`targeted-comet-${comet.direction}`,`targeted-comet-${comet.evidence}`,
    comet.whale?"targeted-comet-whale":"",comet.source==="live"?"targeted-comet-live":"",
  ].filter(Boolean).join(" ");

  return <g className={cls} data-comet-key={comet.key} data-comet-cycle={cycle}>
    <circle cx={comet.target.x} cy={comet.target.y} r={comet.target.r+4} className="targeted-comet-impact" opacity="0" pointerEvents="none">
      <animate ref={impactOpacity as any} attributeName="opacity" values={comet.direction==="in"?"0;.95;0":".9;.35;0"} keyTimes="0;.35;1" dur=".65s" begin="indefinite" fill="freeze"/>
      <animate ref={impactRadius as any} attributeName="r" values={`${comet.target.r+2};${comet.target.r+15};${comet.target.r+21}`} keyTimes="0;.55;1" dur=".65s" begin="indefinite" fill="freeze"/>
    </circle>

    <g className="targeted-comet-body" opacity="0" role="button" tabIndex={0}
      onClick={e=>{e.stopPropagation();onSelect(comet);}}
      onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect(comet);}}}>
      <line x1={quality==="reduced"?-18:-32} y1="0" x2="-3" y2="0" className="targeted-comet-tail"/>
      <circle cx="0" cy="0" r={comet.headRadius} className="targeted-comet-head"/>
      <circle cx="0" cy="0" r={comet.headRadius+7} className="targeted-comet-hit"/>
      <animateMotion ref={bodyMotion as any} path={comet.path} dur={`${comet.duration}s`} begin="indefinite" rotate="auto" fill="freeze"/>
      <animate ref={bodyOpacity as any} attributeName="opacity" values="0;1;1;0" keyTimes="0;.06;.87;1" dur={`${comet.duration}s`} begin="indefinite" fill="freeze"/>
    </g>

    {quality==="full"&&<g className="targeted-comet-label" opacity="0" pointerEvents="all" onClick={e=>{e.stopPropagation();onSelect(comet);}}>
      <rect x="9" y={-22+comet.labelOffsetY} rx="4" width={Math.min(170,Math.max(84,comet.label.length*6.2))} height="18"/>
      <text x="14" y={-9+comet.labelOffsetY}>{comet.label}</text>
      <animateMotion ref={labelMotion as any} path={comet.path} dur={`${comet.duration}s`} begin="indefinite" rotate="0" fill="freeze"/>
      <animate ref={labelOpacity as any} attributeName="opacity" values="0;.88;.82;0" keyTimes="0;.16;.72;1" dur={`${comet.duration}s`} begin="indefinite" fill="freeze"/>
    </g>}
    <title>{`${comet.direction==="in"?"BUY →":"SELL ←"} ${comet.target.symbol||comet.target.name||comet.target.mint} · ${comet.label} · ${comet.evidence}`}</title>
  </g>;
}

export default function MarketCometLayer({
  nodes,
  events,
  liveEvents=[],
  active,
  maxComets=15,
}:{
  nodes:TargetNode[];
  events:ActivityEvent[];
  liveEvents?:LiveMarketEvent[];
  active:boolean;
  maxComets?:number;
}){
  const [cycle,setCycle]=useState(0);
  const [quality,setQuality]=useState<"full"|"reduced">("full");
  const [selected,setSelected]=useState<Comet|null>(null);

  useEffect(()=>{
    if(!active)return;
    const timer=window.setInterval(()=>setCycle(v=>v+1),3200);
    return()=>window.clearInterval(timer);
  },[active]);

  useEffect(()=>{
    if(!active)return;
    let raf=0,frames=0,started=performance.now(),closed=false;
    const sample=(now:number)=>{
      frames++;
      if(now-started>=2200){
        const fps=frames*1000/(now-started);
        setQuality(current=>fps<42?"reduced":fps>52?"full":current);
        frames=0;started=now;
      }
      if(!closed)raf=requestAnimationFrame(sample);
    };
    raf=requestAnimationFrame(sample);
    return()=>{closed=true;cancelAnimationFrame(raf);};
  },[active]);

  const comets=useMemo(()=>{
    if(!active)return [] as Comet[];
    const byMint=new Map(nodes.map(n=>[n.mint,n]));
    const candidates:Comet[]=[];
    const seen=new Set<string>();
    const now=Date.now();

    const addSwap=(node:TargetNode,swap:TrafficRecentSwap|LiveMarketEvent,source:"live"|"snapshot",side:"buy"|"sell")=>{
      const age=now-Date.parse("blockAt" in swap?swap.blockAt:swap.block_at);
      if(!Number.isFinite(age)||age< -60_000||age>20*60_000)return;
      const signature=swap.signature,wallet=swap.wallet;
      const stable=`${node.mint}:${signature}:${wallet}:${side}`;
      if(seen.has(stable))return;
      seen.add(stable);
      const direction=side==="buy"?"in":"out";
      const usdValue="usdValue" in swap?swap.usdValue:swap.usd_value;
      const quoteMint="quoteMint" in swap?swap.quoteMint:swap.quote_mint;
      const quoteAmount="quoteAmount" in swap?swap.quoteAmount:swap.quote_amount;
      const evidence=swap.evidence??"direct";
      const whale=Boolean(swap.whale);
      const amount=amountLabel({usdValue,quoteMint,quoteAmount},direction);
      const strength=strengthFor(usdValue,quoteAmount);
      const prefix=whale?"Whale · ":"";
      const label=`${prefix}${shortWallet(wallet)} · ${amount}`;
      const index=candidates.length;
      candidates.push({
        key:stable,target:node,label,wallet,signature,program:swap.program,source,direction,evidence,whale,
        amountLabel:amount,strength,headRadius:4+strength*2,
        delay:(index%Math.max(1,maxComets))*.14,
        duration:1.85+(hash(stable)%85)/100,
        path:createPath(node,stable,index,direction),
        labelOffsetY:((index%5)-2)*12,
      });
    };

    for(const live of liveEvents){
      const node=byMint.get(live.mint);if(!node)continue;
      addSwap(node,live,"live",live.side);
    }
    for(const node of nodes){
      for(const buy of node.trafficSample?.recentBuys??[])addSwap(node,buy,"snapshot","buy");
      for(const sell of node.trafficSample?.recentSells??[])addSwap(node,sell,"snapshot","sell");
    }

    // Aggregate activity fills spare visual capacity without inventing wallet identities.
    for(const event of events){
      const node=byMint.get(event.mint);if(!node||!event.deltaTrades)continue;
      const direction=event.kind==="surge"||event.kind==="buy-pressure"?"in":"out";
      const count=Math.min(4,Math.max(1,Math.ceil(Math.abs(event.deltaTrades)/8)));
      for(let n=0;n<count;n++){
        const stable=`${event.mint}:${event.kind}:${event.at}:${n}`;
        if(seen.has(stable))continue;seen.add(stable);
        const index=candidates.length;
        candidates.push({
          key:stable,target:node,label:`${node.symbol||event.symbol||node.mint.slice(0,5)} · ${direction==="in"?"+":"−"}${Math.abs(event.deltaTrades)} tx`,
          wallet:null,signature:null,program:null,source:"activity",direction,evidence:"aggregate",whale:false,
          amountLabel:`${direction==="in"?"+":"−"}${Math.abs(event.deltaTrades)} tx`,strength:.22,headRadius:4.2,
          delay:(index%Math.max(1,maxComets))*.16,duration:2.25+(hash(stable)%65)/100,
          path:createPath(node,stable,index,direction),
          labelOffsetY:((index%5)-2)*12,
        });
      }
    }

    candidates.sort((a,b)=>{
      const liveDelta=(b.source==="live"?2:b.source==="snapshot"?1:0)-(a.source==="live"?2:a.source==="snapshot"?1:0);
      if(liveDelta)return liveDelta;
      if(a.whale!==b.whale)return Number(b.whale)-Number(a.whale);
      return b.strength-a.strength;
    });
    const capacity=Math.max(1,maxComets);
    if(candidates.length<=capacity)return candidates;

    // Keep both directions visible when the market has both BUY and SELL evidence.
    const inbound=candidates.filter(c=>c.direction==="in");
    const outbound=candidates.filter(c=>c.direction==="out");
    if(inbound.length&&outbound.length){
      const outQuota=Math.min(outbound.length,Math.max(1,Math.floor(capacity*.3)));
      const inQuota=Math.min(inbound.length,capacity-outQuota);
      const remaining=capacity-inQuota-outQuota;
      const extraIn=Math.min(remaining,Math.max(0,inbound.length-inQuota));
      const extraOut=Math.min(remaining-extraIn,Math.max(0,outbound.length-outQuota));
      const take=(list:Comet[],count:number,offsetSeed:number)=>Array.from({length:count},(_,i)=>list[(offsetSeed+i)%list.length]);
      const selected=[
        ...take(inbound,inQuota+extraIn,(cycle*(inQuota+extraIn))%inbound.length),
        ...take(outbound,outQuota+extraOut,(cycle*(outQuota+extraOut))%outbound.length),
      ];
      return selected.sort((a,b)=>hash(`${a.key}:${cycle}`)-hash(`${b.key}:${cycle}`));
    }

    const offset=(cycle*capacity)%candidates.length;
    return Array.from({length:capacity},(_,i)=>candidates[(offset+i)%candidates.length]);
  },[active,nodes,events,liveEvents,maxComets,cycle]);

  if(!active)return null;

  const flowByMint=new Map<string,{node:TargetNode;inCount:number;outCount:number}>();
  for(const comet of comets){
    const state=flowByMint.get(comet.target.mint)??{node:comet.target,inCount:0,outCount:0};
    if(comet.direction==="in")state.inCount++;else state.outCount++;
    flowByMint.set(comet.target.mint,state);
  }

  return <g className="targeted-comet-layer" data-comet-cycle={cycle} data-comet-quality={quality}>
    {[...flowByMint.values()].map(({node,inCount,outCount})=><g key={`flow-halo:${node.mint}`} pointerEvents="none">
      {inCount>0&&<circle cx={node.x} cy={node.y} r={node.r+18+Math.min(12,inCount*1.5)} className="capital-flow-halo capital-flow-halo-in" style={{opacity:Math.min(.72,.18+inCount*.07)}}/>}
      {outCount>0&&<circle cx={node.x} cy={node.y} r={node.r+13+Math.min(10,outCount*1.4)} className="capital-flow-halo capital-flow-halo-out" style={{opacity:Math.min(.7,.16+outCount*.08)}}/>}
    </g>)}

    {comets.map((comet)=><AnimatedComet
      key={comet.key}
      comet={comet}
      quality={quality}
      cycle={cycle}
      onSelect={setSelected}
    />)}

    {selected&&<g className="targeted-comet-detail" transform={`translate(${Math.max(18,selected.target.x-100)} ${Math.max(34,selected.target.y-selected.target.r-108)})`} onClick={e=>e.stopPropagation()}>
      <rect width="212" height="86" rx="7"/>
      <text x="12" y="18" className="detail-title">{selected.direction==="in"?"BUY →":"SELL ←"} {selected.target.symbol||selected.target.name||selected.target.mint.slice(0,6)}</text>
      <text x="12" y="36">{selected.whale?"Whale · ":""}{selected.wallet?shortWallet(selected.wallet):"Aggregate activity"} · {selected.amountLabel}</text>
      <text x="12" y="52">{selected.evidence==="direct"?"Verified direct":selected.evidence==="routed"?"Jupiter routed":"Activity estimate"}{selected.program?` · ${selected.program}`:""}</text>
      <text x="12" y="68">{selected.signature?`${selected.signature.slice(0,10)}…`:"No transaction signature"}</text>
      <text x="196" y="18" className="detail-close" role="button" tabIndex={0} onClick={()=>setSelected(null)}>×</text>
    </g>}
  </g>;
}
