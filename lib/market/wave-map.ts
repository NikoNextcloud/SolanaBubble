import type {LiveMarketEvent} from './live-events';
import type {TrafficSummary} from './traffic/summary';

export type WaveTokenInput={
  mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;
  marketCap?:number|null;hypeScore?:number|null;buys1h?:number|null;sells1h?:number|null;
  trades1h?:number|null;volume1h?:number|null;trafficSample?:TrafficSummary|null;
  opportunityScore?:number|null;signalConfidenceScore?:number|null;manipulationRiskScore?:number|null;riskScore?:number|null;
  capitalFlowScore?:number|null;momentumScore?:number|null;liquidityWarning?:boolean|null;divergenceSignal?:'bullish'|'bearish'|'none'|null;
};
export type WaveMetrics={buys:number;sells:number;buyUsd:number|null;sellUsd:number|null;strength:number;buyIntensity:number;sellIntensity:number;liveCount:number;lastEventAt:string|null};
export type WaveLayout={mint:string;x:number;y:number;r:number;strength:number;endY:number};
export type ActiveWaveEvent=Pick<LiveMarketEvent,'mint'|'signature'|'wallet'|'side'|'usd_value'|'evidence'|'whale'|'block_at'|'observed_at'>;
export type FlowTrailTrade={signature:string;side:'buy'|'sell';usdValue:number|null;at:string;live?:boolean};
export type FlowTrailPoint={x:number;y:number;side:'buy'|'sell'|null;usdValue:number|null;signature:string|null;live:boolean};
export type LivingWaveDynamics={amplitude:number;frequency:number;duration:number;activity:number};
export type OpportunityWaveSignal={active:boolean;strength:'none'|'developing'|'strong';score:number;intensity:number;partial:boolean;reasons:string[]};

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const eventSeenAt=(event:Pick<LiveMarketEvent,'observed_at'|'block_at'>)=>{
  const observed=Date.parse(event.observed_at);
  if(Number.isFinite(observed))return observed;
  return Date.parse(event.block_at);
};

// Equal flow is neutral, all-buy/all-sell are +/-100.
export function tokenStrength(buys:number,sells:number,buyUsd:number|null=null,sellUsd:number|null=null){
  const countTotal=Math.max(0,buys)+Math.max(0,sells);
  const countBalance=countTotal?(Math.max(0,buys)-Math.max(0,sells))/countTotal:0;
  const priced=finite(buyUsd)&&finite(sellUsd)&&(buyUsd!+sellUsd!)>0;
  const usdBalance=priced?(buyUsd!-sellUsd!)/(buyUsd!+sellUsd!):countBalance;
  return Math.round(clamp((countBalance*.7+usdBalance*.3)*100,-100,100));
}

export function waveAmplitude(intensity:number,maxIntensity:number){
  const normalized=maxIntensity>0?clamp(intensity/maxIntensity,0,1):0;
  return 5+Math.pow(normalized,.58)*34;
}

export function wavePath(x1:number,y1:number,x2:number,y2:number,amplitude:number,phase=0){
  return Array.from({length:49},(_,i)=>{
    const t=i/48,x=x1+(x2-x1)*t;
    const smooth=t*t*(3-2*t);
    const y=y1+(y2-y1)*smooth+Math.sin(t*Math.PI*8+phase)*Math.sin(t*Math.PI)*amplitude;
    return (i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
}

export function livingWaveDynamics(hypeScore:number|null|undefined,buys:number,sells:number):LivingWaveDynamics{
  const hype=clamp(Number(hypeScore??0),0,100)/100;
  const trades=Math.max(0,buys)+Math.max(0,sells);
  const activity=clamp(Math.log1p(trades)/Math.log(31),0,1);
  return {
    amplitude:6+hype*10+activity*18,
    frequency:2.4+hype*1.8+activity*4.8,
    duration:clamp(3.1-hype*.75-activity*1.55,.72,3.1),
    activity,
  };
}

export function opportunityWaveSignal(token:WaveTokenInput):OpportunityWaveSignal{
  const opportunity=finite(token.opportunityScore)?clamp(token.opportunityScore!,0,100):0;
  const confidence=finite(token.signalConfidenceScore)?clamp(token.signalConfidenceScore!,0,100):0;
  const risk=finite(token.manipulationRiskScore)?clamp(token.manipulationRiskScore!,0,100):finite(token.riskScore)?clamp(token.riskScore!,0,100):100;
  const capital=finite(token.capitalFlowScore)?clamp(token.capitalFlowScore!,0,100):50;
  const momentum=finite(token.momentumScore)?clamp(token.momentumScore!,0,100):50;
  const constructive=capital>=55||token.divergenceSignal==='bullish';
  const active=opportunity>=75&&confidence>=65&&risk<=55&&constructive&&!token.liquidityWarning;
  const score=Math.round(clamp(opportunity*.36+confidence*.26+capital*.18+momentum*.10+(100-risk)*.10,0,100));
  const partial=!finite(token.capitalFlowScore)||!finite(token.momentumScore);
  const intensity=active?clamp((score-65)/30,.22,1):0;
  const strength:OpportunityWaveSignal['strength']=!active?'none':score>=78&&confidence>=75&&risk<=40?'strong':'developing';
  const reasons:string[]=[];
  if(opportunity>=75)reasons.push('Opportunity '+Math.round(opportunity));
  if(confidence>=65)reasons.push('Confidence '+Math.round(confidence));
  if(capital>=55)reasons.push('Capital Flow '+Math.round(capital));
  if(token.divergenceSignal==='bullish')reasons.push('Bullish divergence');
  if(risk<=55)reasons.push('Risk '+Math.round(risk));
  return {active,strength,score,intensity,partial,reasons};
}

export function livingWavePath(x1:number,y1:number,x2:number,y2:number,dynamics:LivingWaveDynamics,phase=0){
  return Array.from({length:65},(_,i)=>{
    const t=i/64,x=x1+(x2-x1)*t;
    const smooth=t*t*(3-2*t);
    const base=y1+(y2-y1)*smooth;
    const envelope=Math.sin(Math.PI*t);
    const primary=Math.sin(t*Math.PI*dynamics.frequency*2+phase);
    const nervous=Math.sin(t*Math.PI*dynamics.frequency*4.6+phase*1.7)*(.18+.3*dynamics.activity);
    const y=base+(primary+nervous)*envelope*dynamics.amplitude;
    return (i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
}

export function buildFlowTrail(trades:FlowTrailTrade[],x1:number,y1:number,x2:number,endY:number,maxPoints=18):FlowTrailPoint[]{
  const deduped=new Map<string,FlowTrailTrade>();
  for(const trade of trades){
    const at=Date.parse(trade.at);
    if(!trade.signature||!Number.isFinite(at))continue;
    const previous=deduped.get(trade.signature);
    if(!previous||trade.live)deduped.set(trade.signature,trade);
  }
  const ordered=[...deduped.values()]
    .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))
    .slice(-Math.max(1,maxPoints));
  if(!ordered.length)return [];
  const points:FlowTrailPoint[]=[{x:x1,y:y1,side:null,usdValue:null,signature:null,live:false}];
  let momentum=0,offset=0;
  for(let index=0;index<ordered.length;index++){
    const trade=ordered[index],progress=(index+1)/ordered.length;
    const priced=finite(trade.usdValue)&&trade.usdValue!>=0;
    const weight=priced?clamp(.72+Math.log10(1+trade.usdValue!)/3.2,.72,2.15):1;
    const signed=trade.side==='buy'?-1:1;
    momentum=momentum*.58+signed*weight;
    offset=clamp(offset+momentum*8.5,-72,72);
    const trendY=y1+(endY-y1)*progress;
    const envelope=.35+.65*Math.sin(Math.PI*progress);
    const y=trendY+offset*envelope;
    points.push({
      x:x1+(x2-x1)*progress,
      y,
      side:trade.side,
      usdValue:trade.usdValue,
      signature:trade.signature,
      live:Boolean(trade.live),
    });
  }
  return points;
}

export function activeWaveEvents(events:LiveMarketEvent[],visibleMints:Set<string>,now=Date.now(),ttlMs=4200,maxEvents=12):ActiveWaveEvent[]{
  return events
    .filter(event=>{
      if(!visibleMints.has(event.mint))return false;
      const at=eventSeenAt(event),age=now-at;
      return Number.isFinite(at)&&age>=0&&age<=ttlMs;
    })
    .sort((a,b)=>eventSeenAt(b)-eventSeenAt(a))
    .slice(0,maxEvents)
    .map(({mint,signature,wallet,side,usd_value,evidence,whale,block_at,observed_at})=>({mint,signature,wallet,side,usd_value,evidence,whale,block_at,observed_at}));
}

export function selectWaveTokens(tokens:WaveTokenInput[],events:LiveMarketEvent[],metrics:Map<string,WaveMetrics>,selectedMint:string|null,maxVisible:number,now=Date.now()){
  const recentEventAt=new Map<string,number>();
  for(const event of events){
    const at=eventSeenAt(event);
    if(!Number.isFinite(at)||now-at>60_000||now-at<0)continue;
    recentEventAt.set(event.mint,Math.max(recentEventAt.get(event.mint)??0,at));
  }
  const score=(token:WaveTokenInput)=>{
    const recent=recentEventAt.get(token.mint);
    const liveBonus=recent?120_000-Math.min(60_000,now-recent):0;
    const strength=Math.abs(metrics.get(token.mint)?.strength??0)*210;
    const hype=clamp(Number(token.hypeScore??0),0,100)*45;
    const activity=Math.log10(1+Math.max(0,Number(token.volume1h??0))+Math.max(0,Number(token.trades1h??0))*100)*900;
    return liveBonus+strength+hype+activity;
  };
  const ranked=[...tokens].sort((a,b)=>score(b)-score(a));
  const limit=Math.max(1,maxVisible);
  const visible=ranked.slice(0,limit);
  if(selectedMint&&!visible.some(token=>token.mint===selectedMint)){
    const selected=tokens.find(token=>token.mint===selectedMint);
    if(selected)visible[Math.max(0,visible.length-1)]=selected;
  }
  return visible;
}

export function waveMetrics(token:WaveTokenInput,events:LiveMarketEvent[],now=Date.now(),windowMs=5*60_000):WaveMetrics{
  const sample=token.trafficSample?.windows?.['5'];
  const sampleObserved=token.trafficSample?.observedAt?Date.parse(token.trafficSample.observedAt):NaN;
  let buys=sample?.buys??0,sells=sample?.sells??0;
  let buyUsd=sample?.buyUsd??null,sellUsd=sample?.sellUsd??null;
  let liveCount=0,lastEventAt:string|null=null;
  let addBuyUsd=0,addSellUsd=0,addUsdComplete=true;
  for(const event of events){
    if(event.mint!==token.mint)continue;
    const at=Date.parse(event.block_at);
    if(!Number.isFinite(at)||now-at<0||now-at>windowMs)continue;
    if(Number.isFinite(sampleObserved)&&at<=sampleObserved)continue;
    liveCount++;
    if(!lastEventAt||at>Date.parse(lastEventAt))lastEventAt=event.block_at;
    if(event.side==='buy')buys++;else sells++;
    if(event.usd_value==null||!Number.isFinite(event.usd_value))addUsdComplete=false;
    else if(event.side==='buy')addBuyUsd+=event.usd_value;else addSellUsd+=event.usd_value;
  }
  if(addUsdComplete&&liveCount>0&&buyUsd!=null&&sellUsd!=null){buyUsd+=addBuyUsd;sellUsd+=addSellUsd;}
  else if(liveCount>0&&(buyUsd==null||sellUsd==null||!addUsdComplete)){buyUsd=null;sellUsd=null;}
  if(!sample&&!liveCount){buys=Math.max(0,Number(token.buys1h??0));sells=Math.max(0,Number(token.sells1h??0));}
  const strength=tokenStrength(buys,sells,buyUsd,sellUsd);
  const buyIntensity=buys+(buyUsd!=null?Math.log10(1+Math.max(0,buyUsd))*2:0);
  const sellIntensity=sells+(sellUsd!=null?Math.log10(1+Math.max(0,sellUsd))*2:0);
  return {buys,sells,buyUsd,sellUsd,strength,buyIntensity,sellIntensity,liveCount,lastEventAt};
}

export function waveMapLayout(tokens:WaveTokenInput[],metrics:Map<string,WaveMetrics>,width:number,height:number):WaveLayout[]{
  if(!tokens.length)return [];
  const top=92,bottom=Math.max(top+1,height-78),usable=Math.max(1,bottom-top);
  const mobile=width<700;
  const columns=mobile?1:2;
  const rows=Math.max(1,Math.ceil(tokens.length/columns));
  const rowGap=rows<=1?0:usable/(rows-1);
  const scaleY=(score:number)=>top+(100-clamp(score,-100,100))/200*usable;
  const leftX=mobile?72:72;
  const rightX=mobile?72:Math.min(228,Math.max(188,width*.185));
  const rowRadius=rows<=1?31:clamp((rowGap-26)/2,22,31);
  return tokens.map((token,index)=>{
    const hype=clamp(Number(token.hypeScore??50),0,100);
    const r=Math.min(clamp(23+hype*.075,23,30),rowRadius);
    const strength=metrics.get(token.mint)?.strength??0;
    const column=mobile?0:index%2;
    const row=mobile?index:Math.floor(index/2);
    const x=column===0?leftX:rightX;
    const y=rows<=1?(top+bottom)/2:top+row*rowGap;
    return {mint:token.mint,x,y,r,strength,endY:scaleY(strength)};
  });
}
