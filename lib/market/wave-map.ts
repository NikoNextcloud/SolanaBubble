import type {LiveMarketEvent} from './live-events';
import type {TrafficSummary} from './traffic/summary';

export type WaveTokenInput={
  mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;
  marketCap?:number|null;hypeScore?:number|null;buys1h?:number|null;sells1h?:number|null;
  trades1h?:number|null;volume1h?:number|null;trafficSample?:TrafficSummary|null;
};
export type WaveMetrics={buys:number;sells:number;buyUsd:number|null;sellUsd:number|null;strength:number;buyIntensity:number;sellIntensity:number;liveCount:number;lastEventAt:string|null};
export type WaveLayout={mint:string;x:number;y:number;r:number;strength:number;endY:number};
export type ActiveWaveEvent=Pick<LiveMarketEvent,'mint'|'signature'|'wallet'|'side'|'usd_value'|'evidence'|'whale'|'block_at'|'observed_at'>;

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
    const y=y1+(y2-y1)*smooth+Math.sin(t*Math.PI*6+phase)*Math.sin(t*Math.PI)*amplitude;
    return (i===0?'M':'L')+x.toFixed(1)+','+y.toFixed(1);
  }).join(' ');
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
  return [...tokens].sort((a,b)=>{
    const score=(token:WaveTokenInput)=>{
      const recent=recentEventAt.get(token.mint);
      const liveBonus=recent?120_000-Math.min(60_000,now-recent):0;
      const selectedBonus=token.mint===selectedMint?250_000:0;
      const strength=Math.abs(metrics.get(token.mint)?.strength??0)*210;
      const hype=clamp(Number(token.hypeScore??0),0,100)*45;
      const activity=Math.log10(1+Math.max(0,Number(token.volume1h??0))+Math.max(0,Number(token.trades1h??0))*100)*900;
      return selectedBonus+liveBonus+strength+hype+activity;
    };
    return score(b)-score(a);
  }).slice(0,Math.max(1,maxVisible));
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
  const rowGap=tokens.length<=1?0:usable/(tokens.length-1);
  const scaleY=(score:number)=>top+(100-clamp(score,-100,100))/200*usable;
  const x=width<700?70:82;
  const rowRadius=tokens.length<=1?31:clamp((rowGap-24)/2,20,31);
  return tokens.map((token,index)=>{
    const hype=clamp(Number(token.hypeScore??50),0,100);
    const r=Math.min(clamp(22+hype*.08,22,30),rowRadius);
    const strength=metrics.get(token.mint)?.strength??0;
    const y=tokens.length<=1?(top+bottom)/2:top+index*rowGap;
    return {mint:token.mint,x,y,r,strength,endY:scaleY(strength)};
  });
}
