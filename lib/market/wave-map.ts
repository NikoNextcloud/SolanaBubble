import type {LiveMarketEvent} from './live-events';
import type {TrafficSummary} from './traffic/summary';

export type WaveTokenInput={
  mint:string;symbol?:string|null;name?:string|null;imageUrl?:string|null;
  marketCap?:number|null;hypeScore?:number|null;buys1h?:number|null;sells1h?:number|null;
  trafficSample?:TrafficSummary|null;
};
export type WaveMetrics={buys:number;sells:number;buyUsd:number|null;sellUsd:number|null;strength:number;buyIntensity:number;sellIntensity:number;liveCount:number;lastEventAt:string|null};
export type WaveLayout={mint:string;x:number;y:number;r:number;strength:number;endY:number};
export type ActiveWaveEvent=Pick<LiveMarketEvent,'mint'|'signature'|'wallet'|'side'|'usd_value'|'evidence'|'whale'|'block_at'>;

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

// Lovable visual rule preserved: equal flow is neutral, all-buy/all-sell are +/-100.
export function tokenStrength(buys:number,sells:number,buyUsd:number|null=null,sellUsd:number|null=null){
  const countTotal=Math.max(0,buys)+Math.max(0,sells);
  const countBalance=countTotal? (Math.max(0,buys)-Math.max(0,sells))/countTotal:0;
  const priced=finite(buyUsd)&&finite(sellUsd)&&(buyUsd!+sellUsd!)>0;
  const usdBalance=priced?(buyUsd!-sellUsd!)/(buyUsd!+sellUsd!):countBalance;
  return Math.round(clamp((countBalance*.7+usdBalance*.3)*100,-100,100));
}

export function waveAmplitude(intensity:number,maxIntensity:number){
  const normalized=maxIntensity>0?clamp(intensity/maxIntensity,0,1):0;
  return 3+Math.pow(normalized,.62)*28;
}

export function wavePath(x1:number,y1:number,x2:number,y2:number,amplitude:number,phase=0){
  return Array.from({length:65},(_,i)=>{
    const t=i/64,x=x1+(x2-x1)*t;
    const smooth=t*t*(3-2*t);
    const y=y1+(y2-y1)*smooth+Math.sin(t*Math.PI*8+phase)*Math.sin(t*Math.PI)*amplitude;
    return (i===0?'M':'L')+x.toFixed(2)+','+y.toFixed(2);
  }).join(' ');
}

export function activeWaveEvents(events:LiveMarketEvent[],visibleMints:Set<string>,now=Date.now(),ttlMs=2800,maxEvents=15):ActiveWaveEvent[]{
  return events
    .filter(event=>{
      if(!visibleMints.has(event.mint))return false;
      const at=Date.parse(event.block_at),age=now-at;
      return Number.isFinite(at)&&age>=0&&age<=ttlMs;
    })
    .sort((a,b)=>Date.parse(b.block_at)-Date.parse(a.block_at))
    .slice(0,maxEvents)
    .map(({mint,signature,wallet,side,usd_value,evidence,whale,block_at})=>({mint,signature,wallet,side,usd_value,evidence,whale,block_at}));
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
  const mobile=width<700;
  const columns=mobile?(tokens.length>8?2:1):(tokens.length>11?2:1);
  const rows=Math.ceil(tokens.length/columns);
  const top=84,bottom=Math.max(top+1,height-68),usable=Math.max(1,bottom-top);
  const rowGap=rows<=1?0:usable/(rows-1);
  const scaleY=(score:number)=>top+(100-clamp(score,-100,100))/200*usable;
  const firstX=72,lastX=columns===1?firstX:Math.min(width*.38,mobile?224:286);
  const colGap=columns<=1?0:(lastX-firstX)/(columns-1);
  const rowRadius=rows<=1?29:clamp((rowGap-20)/2,15,29);
  return tokens.map((token,index)=>{
    const row=Math.floor(index/columns),col=index%columns;
    const hype=clamp(Number(token.hypeScore??50),0,100);
    const r=Math.min(clamp(19+hype*.1,19,29),rowRadius);
    const strength=metrics.get(token.mint)?.strength??0;
    const y=rows<=1?(top+bottom)/2:top+row*rowGap;
    return {mint:token.mint,x:firstX+col*colGap,y,r,strength,endY:scaleY(strength)};
  });
}
