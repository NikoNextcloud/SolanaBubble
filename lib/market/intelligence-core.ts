export type WalletSwap={wallet:string;side:'buy'|'sell';usd_value:number|null;block_at:string;evidence?:'direct'|'routed';program?:string|null};
export type WalletProfile={wallet:string;score:number;label:'Smart'|'Constructive'|'Neutral'|'Risky'|'Bot-like';swaps:number;buys:number;sells:number;buyUsd:number|null;sellUsd:number|null;netUsd:number|null;avgTradeUsd:number|null;repeatEntries:number;quickFlips:number;directSharePct:number;firstSeenAt:string|null;lastSeenAt:string|null;reasons:string[]};
export type SignalObservation={observed_at:string;payload:{priceUsd?:number|null;opportunityScore?:number|null;signalConfidenceScore?:number|null;manipulationRiskScore?:number|null;capitalFlowScore?:number|null;holderQualityScore?:number|null;divergenceSignal?:'bullish'|'bearish'|'none'|null}};
export type ValidationWindow={minutes:number;samples:number;wins:number;winRate:number|null;avgReturnPct:number|null;medianReturnPct:number|null};
export type ValidationSummary={samples:number;qualifiedSamples:number;windows:Record<string,ValidationWindow>;calibrationLabel:'insufficient'|'weak'|'developing'|'validated';note:string};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const median=(values:number[])=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2};

export function buildWalletProfiles(rows:WalletSwap[],now=Date.now()):WalletProfile[]{
 const groups=new Map<string,WalletSwap[]>();
 for(const row of rows){if(!row.wallet||!['buy','sell'].includes(row.side))continue;const list=groups.get(row.wallet)??[];list.push(row);groups.set(row.wallet,list)}
 const profiles:WalletProfile[]=[];
 for(const [wallet,list] of groups){
  list.sort((a,b)=>Date.parse(a.block_at)-Date.parse(b.block_at));
  const buys=list.filter(x=>x.side==='buy'),sells=list.filter(x=>x.side==='sell');
  const priced=list.length>0&&list.every(x=>finite(x.usd_value)&&x.usd_value!>=0);
  const buyUsd=priced?buys.reduce((n,x)=>n+x.usd_value!,0):null,sellUsd=priced?sells.reduce((n,x)=>n+x.usd_value!,0):null;
  const netUsd=buyUsd!=null&&sellUsd!=null?buyUsd-sellUsd:null,avgTradeUsd=priced?list.reduce((n,x)=>n+x.usd_value!,0)/Math.max(1,list.length):null;
  let quickFlips=0,repeatEntries=0,lastBuy=-Infinity;
  for(const row of list){const at=Date.parse(row.block_at);if(row.side==='buy'){if(Number.isFinite(lastBuy)&&at-lastBuy<=30*60000)repeatEntries++;lastBuy=at}else{const prior=[...list].reverse().find(x=>x.side==='buy'&&Date.parse(x.block_at)<at);if(prior&&at-Date.parse(prior.block_at)<=15*60000)quickFlips++}}
  const direct=list.filter(x=>(x.evidence??'direct')==='direct').length,directSharePct=list.length?direct/list.length*100:0;
  const ageMinutes=Math.max(0,(now-Date.parse(list.at(-1)?.block_at??new Date(now).toISOString()))/60000);
  let score=45;score+=Math.min(18,buys.length*3)+Math.min(10,repeatEntries*3)+(directSharePct>=70?8:directSharePct>=40?3:-4);
  if(netUsd!=null)score+=netUsd>2500?12:netUsd>0?5:netUsd<-2500?-12:-4;
  if(avgTradeUsd!=null)score+=avgTradeUsd>=1000?8:avgTradeUsd>=250?4:0;
  score-=Math.min(24,quickFlips*9);if(list.length>=8&&ageMinutes<20)score-=8;score=Math.max(0,Math.min(100,Math.round(score)));
  const botLike=list.length>=8&&quickFlips>=3,label:WalletProfile['label']=botLike?'Bot-like':score>=78?'Smart':score>=64?'Constructive':score>=38?'Neutral':'Risky';
  const reasons:string[]=[];
  if(repeatEntries>=2)reasons.push(String(repeatEntries)+' repeat entries in retained traffic');
  if(netUsd!=null&&Math.abs(netUsd)>=1000)reasons.push((netUsd>0?'Net accumulation ':'Net distribution ')+'$'+Math.abs(Math.round(netUsd)).toLocaleString());
  if(directSharePct>=70)reasons.push(Math.round(directSharePct)+'% verified-direct evidence');
  if(quickFlips)reasons.push(String(quickFlips)+' quick flip'+(quickFlips===1?'':'s')+' <=15m');
  profiles.push({wallet,score,label,swaps:list.length,buys:buys.length,sells:sells.length,buyUsd,sellUsd,netUsd,avgTradeUsd,repeatEntries,quickFlips,directSharePct,firstSeenAt:list[0]?.block_at??null,lastSeenAt:list.at(-1)?.block_at??null,reasons});
 }
 return profiles.sort((a,b)=>b.score-a.score||b.swaps-a.swaps);
}

export function smartMoneySummary(profiles:WalletProfile[]){
 const smart=profiles.filter(p=>p.score>=64&&p.label!=='Bot-like'),priced=smart.filter(p=>p.netUsd!=null);
 const netUsd=priced.length?priced.reduce((n,p)=>n+(p.netUsd??0),0):null,entering=smart.filter(p=>(p.netUsd??0)>0).length,exiting=smart.filter(p=>(p.netUsd??0)<0).length;
 const confidence=Math.max(0,Math.min(100,Math.round(smart.length*10+profiles.filter(p=>p.directSharePct>=70).length*3+(priced.length?15:0))));
 return {wallets:smart.slice(0,8),smartWalletCount:smart.length,entering,exiting,netUsd,confidence};
}

export function validateSignals(rows:SignalObservation[]):ValidationSummary{
 const sorted=[...rows].filter(r=>Number.isFinite(Date.parse(r.observed_at))&&finite(r.payload?.priceUsd)&&r.payload.priceUsd!>0).sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
 const qualified=sorted.filter(r=>{const p=r.payload;return (p.opportunityScore??0)>=70&&(p.signalConfidenceScore??0)>=55&&(p.manipulationRiskScore??50)<70});
 const windows:Record<string,ValidationWindow>={};
 for(const minutes of [15,60,360]){
  const returns:number[]=[];
  for(const row of qualified){const target=Date.parse(row.observed_at)+minutes*60000;const tolerance=Math.max(6,minutes*.25)*60000;const future=sorted.find(x=>Date.parse(x.observed_at)>=target&&Date.parse(x.observed_at)<=target+tolerance);if(!future)continue;const base=row.payload.priceUsd!,next=future.payload.priceUsd!;if(base>0&&finite(next))returns.push((next-base)/base*100)}
  const wins=returns.filter(v=>v>0).length;windows[String(minutes)]={minutes,samples:returns.length,wins,winRate:returns.length?wins/returns.length*100:null,avgReturnPct:returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:null,medianReturnPct:median(returns)};
 }
 const samples=Math.max(...Object.values(windows).map(w=>w.samples),0),calibrationLabel:ValidationSummary['calibrationLabel']=samples>=24?'validated':samples>=10?'developing':samples>=4?'weak':'insufficient';
 return {samples,qualifiedSamples:qualified.length,windows,calibrationLabel,note:'Historical calibration only. Positive return is measured from high-opportunity/high-confidence snapshots; it is not a prediction or guarantee.'};
}

export function classifyMarketRegime(tokens:Array<{priceChange1h?:number|null;hypeScore?:number|null;capitalFlowScore?:number|null;manipulationRiskScore?:number|null}>){
 const active=tokens.filter(t=>finite(t.priceChange1h)||finite(t.hypeScore)||finite(t.capitalFlowScore));
 if(!active.length)return {key:'neutral',label:'NEUTRAL',score:0,reason:'Waiting for market evidence'};
 const avg=(key:'priceChange1h'|'hypeScore'|'capitalFlowScore'|'manipulationRiskScore',fallback=0)=>active.reduce((n,t)=>n+(finite(t[key])?Number(t[key]):fallback),0)/active.length;
 const breadth=active.filter(t=>(t.priceChange1h??0)>0).length/active.length,move=avg('priceChange1h'),hype=avg('hypeScore',50),flow=avg('capitalFlowScore',50),risk=avg('manipulationRiskScore',50);
 const score=Math.round(Math.max(-100,Math.min(100,move*5+(breadth-.5)*70+(flow-50)*.7-(risk-50)*.35)));
 if(hype>=72&&breadth>=.62&&flow>=60)return {key:'mania',label:'MEME MANIA',score,reason:'High hype, positive breadth and strong capital flow'};
 if(score>=28)return {key:'risk-on',label:'RISK ON',score,reason:'Positive breadth and capital flow dominate'};
 if(score<=-28&&risk>=58)return {key:'distribution',label:'DISTRIBUTION',score,reason:'Weak breadth with elevated distribution risk'};
 if(score<=-18)return {key:'risk-off',label:'RISK OFF',score,reason:'Negative price breadth and weaker flow'};
 return {key:'neutral',label:'NEUTRAL',score,reason:'Mixed market evidence'};
}
