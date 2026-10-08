import type {LiveMarketEvent} from './live-events';
import type {TrafficSummary} from './traffic/summary';

export type WaveTokenInput={
  mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;
  marketCap?:number|null;hypeScore?:number|null;buys1h?:number|null;sells1h?:number|null;
  trades1h?:number|null;volume1h?:number|null;trafficSample?:TrafficSummary|null;
  opportunityScore?:number|null;signalConfidenceScore?:number|null;manipulationRiskScore?:number|null;riskScore?:number|null;
  capitalFlowScore?:number|null;momentumScore?:number|null;liquidityWarning?:boolean|null;divergenceSignal?:'bullish'|'bearish'|'none'|null;
  hypeVelocity?:number|null;hypeAcceleration?:number|null;observedBuyPressure15m?:number|null;buyPressure?:number|null;
  liquidityChangePct?:number|null;trendPersistenceScore?:number|null;holderGrowthPct?:number|null;smartMoneyFlowUsd?:number|null;
  trafficEvidence?:'warming'|'sparse'|'usable'|'degraded'|null;
};
export type WaveMetrics={buys:number;sells:number;buyUsd:number|null;sellUsd:number|null;strength:number;buyIntensity:number;sellIntensity:number;liveCount:number;lastEventAt:string|null};
export type WaveLayout={mint:string;x:number;y:number;r:number;strength:number;endY:number};
export type ActiveWaveEvent=Pick<LiveMarketEvent,'mint'|'signature'|'wallet'|'side'|'usd_value'|'evidence'|'whale'|'block_at'|'observed_at'>;
export type FlowTrailTrade={signature:string;side:'buy'|'sell';usdValue:number|null;at:string;live?:boolean};
export type FlowTrailPoint={x:number;y:number;side:'buy'|'sell'|null;usdValue:number|null;signature:string|null;live:boolean};
export type LivingWaveDynamics={amplitude:number;frequency:number;duration:number;activity:number;hypeTrend:'rising'|'falling'|'flat'|'unknown';hypeSlope:number};
export type GoodOpportunitySignal={active:boolean;tier:'avoid'|'watch'|'good'|'strong';score:number;hypeTrend:'rising'|'falling'|'flat'|'unknown';reasons:string[];blockers:string[]};
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

export function livingWaveDynamics(hypeScore:number|null|undefined,buys:number,sells:number,hypeVelocity:number|null|undefined=null):LivingWaveDynamics{
  const hype=clamp(Number(hypeScore??0),0,100)/100;
  const trades=Math.max(0,buys)+Math.max(0,sells);
  const activity=clamp(Math.log1p(trades)/Math.log(31),0,1);
  const velocity=finite(hypeVelocity)?hypeVelocity:null;
  const hypeSlope=velocity==null?0:clamp(velocity/3.5,-1,1);
  const hypeTrend:LivingWaveDynamics['hypeTrend']=velocity==null?'unknown':velocity>.25?'rising':velocity<-.25?'falling':'flat';
  return {
    amplitude:6+hype*10+activity*18,
    frequency:2.4+hype*1.8+activity*4.8+Math.max(0,hypeSlope)*.7,
    duration:clamp(3.1-hype*.75-activity*1.55-Math.max(0,hypeSlope)*.22,.68,3.1),
    activity,
    hypeTrend,
    hypeSlope,
  };
}

export function goodOpportunitySignal(token:WaveTokenInput,strength=0):GoodOpportunitySignal{
  const opportunity=finite(token.opportunityScore)?clamp(token.opportunityScore!,0,100):0;
  const confidence=finite(token.signalConfidenceScore)?clamp(token.signalConfidenceScore!,0,100):0;
  const risk=finite(token.manipulationRiskScore)?clamp(token.manipulationRiskScore!,0,100):finite(token.riskScore)?clamp(token.riskScore!,0,100):100;
  const capital=finite(token.capitalFlowScore)?clamp(token.capitalFlowScore!,0,100):50;
  const momentum=finite(token.momentumScore)?clamp(token.momentumScore!,0,100):50;
  const velocity=finite(token.hypeVelocity)?token.hypeVelocity!:null;
  const acceleration=finite(token.hypeAcceleration)?token.hypeAcceleration!:0;
  const hypeTrend:GoodOpportunitySignal['hypeTrend']=velocity==null?'unknown':velocity>.25?'rising':velocity<-.25?'falling':'flat';
  const pressure=finite(token.observedBuyPressure15m)?clamp(token.observedBuyPressure15m!,0,100):finite(token.buyPressure)?clamp(token.buyPressure!,0,100):clamp(50+strength/2,0,100);
  const persistence=finite(token.trendPersistenceScore)?clamp(token.trendPersistenceScore!,0,100):50;
  const liquidityTrend=finite(token.liquidityChangePct)?clamp(token.liquidityChangePct!,-100,100):0;
  const traffic=token.trafficEvidence??token.trafficSample?.evidence??null;
  const strengthScore=clamp(50+strength/2,0,100);
  const velocityScore=velocity==null?45:clamp(50+velocity*9+acceleration*12,0,100);
  let score=opportunity*.24+confidence*.17+capital*.16+momentum*.12+(100-risk)*.11+strengthScore*.08+velocityScore*.07+persistence*.05;
  if(token.divergenceSignal==='bullish')score+=4;
  if(token.divergenceSignal==='bearish')score-=14;
  if(token.liquidityWarning)score-=24;
  if(liquidityTrend<=-12)score-=8;
  if(traffic==='degraded')score-=7;
  if(strength<0)score-=Math.min(14,Math.abs(strength)*.14);
  if(velocity!=null&&velocity<0)score-=Math.min(14,Math.abs(velocity)*4);
  score=Math.round(clamp(score,0,100));

  const blockers:string[]=[];
  if(opportunity<68)blockers.push('Opportunity below 68');
  if(confidence<60)blockers.push('Confidence below 60');
  if(risk>55)blockers.push('Risk above 55');
  if(capital<55)blockers.push('Capital Flow below 55');
  if(momentum<58)blockers.push('Momentum below 58');
  if(strength<8)blockers.push('BUY strength below +8');
  if(pressure<54)blockers.push('Buy pressure below 54%');
  if(token.liquidityWarning)blockers.push('Liquidity warning');
  if(token.divergenceSignal==='bearish')blockers.push('Bearish divergence');
  if(velocity!=null&&velocity<-.15)blockers.push('Hype is falling');
  const hypeConstructive=velocity!=null?velocity>=.15:token.divergenceSignal==='bullish'&&momentum>=70;
  if(!hypeConstructive)blockers.push(velocity==null?'Hype direction unconfirmed':'Hype not rising yet');

  const active=score>=72&&blockers.length===0;
  const strong=active&&score>=82&&confidence>=72&&risk<=40&&capital>=65&&strength>=18&&(velocity??0)>=.5;
  const tier:GoodOpportunitySignal['tier']=strong?'strong':active?'good':score>=60&&risk<=65?'watch':'avoid';
  const reasons:string[]=[];
  if(opportunity>=68)reasons.push('Opportunity '+Math.round(opportunity));
  if(confidence>=60)reasons.push('Confidence '+Math.round(confidence));
  if(capital>=55)reasons.push('Capital Flow '+Math.round(capital));
  if(momentum>=58)reasons.push('Momentum '+Math.round(momentum));
  if(strength>=8)reasons.push('BUY Strength +'+Math.round(strength));
  if(pressure>=54)reasons.push('Buy Pressure '+Math.round(pressure)+'%');
  if(velocity!=null&&velocity>=.15)reasons.push('Hype rising '+velocity.toFixed(2)+'/min');
  if(token.divergenceSignal==='bullish')reasons.push('Bullish divergence');
  if(risk<=55)reasons.push('Risk '+Math.round(risk));
  return {active,tier,score,hypeTrend,reasons,blockers};
}

export function opportunityWaveSignal(token:WaveTokenInput,strength=0):OpportunityWaveSignal{
  const good=goodOpportunitySignal(token,strength);
  const partial=!finite(token.capitalFlowScore)||!finite(token.momentumScore)||!finite(token.hypeVelocity);
  const intensity=good.active?clamp((good.score-68)/28,.22,1):0;
  const waveStrength:OpportunityWaveSignal['strength']=!good.active?'none':good.tier==='strong'?'strong':'developing';
  return {active:good.active,strength:waveStrength,score:good.score,intensity,partial,reasons:good.reasons};
}

export function livingWavePath(x1:number,y1:number,x2:number,y2:number,dynamics:LivingWaveDynamics,phase=0){
  const points=Array.from({length:25},(_,i)=>{
    const t=i/24,x=x1+(x2-x1)*t;
    const smooth=t*t*(3-2*t);
    const base=y1+(y2-y1)*smooth;
    const envelope=Math.sin(Math.PI*t);
    const primary=Math.sin(t*Math.PI*dynamics.frequency*2+phase);
    const nervous=Math.sin(t*Math.PI*dynamics.frequency*4.2+phase*1.55)*(.14+.26*dynamics.activity);
    const micro=Math.sin(t*Math.PI*dynamics.frequency*7.4+phase*.72)*(.04+.12*dynamics.activity);
    const directionalEnergy=clamp(1+dynamics.hypeSlope*(t-.5)*.9,.58,1.42);
    const y=base+(primary+nervous+micro)*envelope*dynamics.amplitude*directionalEnergy;
    return {x,y};
  });
  let path='M'+points[0].x.toFixed(1)+','+points[0].y.toFixed(1);
  for(let i=1;i<points.length-1;i++){
    const p=points[i],next=points[i+1];
    const mx=(p.x+next.x)/2,my=(p.y+next.y)/2;
    path+=' Q'+p.x.toFixed(1)+','+p.y.toFixed(1)+' '+mx.toFixed(1)+','+my.toFixed(1);
  }
  const last=points[points.length-1];
  return path+' L'+last.x.toFixed(1)+','+last.y.toFixed(1);
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
    const strength=metrics.get(token.mint)?.strength??0;
    const good=goodOpportunitySignal(token,strength);
    const liveBonus=recent?30_000-Math.min(20_000,(now-recent)/3):0;
    const qualityBonus=good.score*3_000+(good.active?150_000:good.tier==='watch'?35_000:0);
    const directionalStrength=strength>=0?strength*520:strength*360;
    const velocity=finite(token.hypeVelocity)?clamp(token.hypeVelocity!,-4,4):0;
    const hype=clamp(Number(token.hypeScore??0),0,100)*28;
    const risk=finite(token.manipulationRiskScore)?token.manipulationRiskScore!:finite(token.riskScore)?token.riskScore!:60;
    const riskPenalty=Math.max(0,risk-45)*900;
    const activity=Math.log10(1+Math.max(0,Number(token.volume1h??0))+Math.max(0,Number(token.trades1h??0))*100)*420;
    return qualityBonus+liveBonus+directionalStrength+velocity*7_000+hype+activity-riskPenalty;
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
  const columns=mobile?1:tokens.length>12?3:2;
  const rows=Math.max(1,Math.ceil(tokens.length/columns));
  const rowGap=rows<=1?0:usable/(rows-1);
  const scaleY=(score:number)=>top+(100-clamp(score,-100,100))/200*usable;
  const xs=mobile
    ? [72]
    : columns===3
      ? [62,Math.min(150,Math.max(132,width*.145)),Math.min(242,Math.max(212,width*.235))]
      : [72,Math.min(228,Math.max(188,width*.185))];
  const minimumRadius=columns===3?18:22;
  const rowRadius=rows<=1?31:clamp((rowGap-(columns===3?18:26))/2,minimumRadius,31);
  return tokens.map((token,index)=>{
    const hype=clamp(Number(token.hypeScore??50),0,100);
    const r=Math.min(clamp((columns===3?20:23)+hype*(columns===3?.065:.075),columns===3?20:23,columns===3?27:30),rowRadius);
    const strength=metrics.get(token.mint)?.strength??0;
    const column=mobile?0:index%columns;
    const row=mobile?index:Math.floor(index/columns);
    const x=xs[column]??xs[0];
    const y=rows<=1?(top+bottom)/2:top+row*rowGap;
    return {mint:token.mint,x,y,r,strength,endY:scaleY(strength)};
  });
}
