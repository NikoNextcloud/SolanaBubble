import type {TrafficSummary} from './traffic/summary';

export type WalletSwap={wallet:string;side:'buy'|'sell';usd_value:number|null;block_at:string;evidence?:'direct'|'routed';program?:string|null;signature?:string|null};
export type WalletProfile={wallet:string;score:number;label:'Smart'|'Constructive'|'Neutral'|'Risky'|'Bot-like';swaps:number;buys:number;sells:number;buyUsd:number|null;sellUsd:number|null;netUsd:number|null;avgTradeUsd:number|null;repeatEntries:number;quickFlips:number;directSharePct:number;firstSeenAt:string|null;lastSeenAt:string|null;reasons:string[]};
export type SignalObservation={observed_at:string;payload:{mint?:string;symbol?:string|null;priceUsd?:number|null;opportunityScore?:number|null;signalConfidenceScore?:number|null;manipulationRiskScore?:number|null;capitalFlowScore?:number|null;holderQualityScore?:number|null;divergenceSignal?:'bullish'|'bearish'|'none'|null;whaleExit?:number|null;liquidityWarning?:boolean|null}};
export type ValidationWindow={minutes:number;samples:number;wins:number;winRate:number|null;calibratedWinRate:number|null;confidence:number;avgReturnPct:number|null;medianReturnPct:number|null;downsideMedianPct:number|null};
export type ValidationSummary={samples:number;qualifiedSamples:number;windows:Record<string,ValidationWindow>;calibrationLabel:'insufficient'|'weak'|'developing'|'validated';note:string};
export type CoordinatedCluster={id:string;side:'buy'|'sell';wallets:string[];swaps:number;totalUsd:number|null;directSharePct:number;startAt:string;endAt:string;score:number;confidence:'low'|'medium'|'high'};
export type AdaptiveOpportunity={baseScore:number;score:number;delta:number;confidence:number;historyAdjustment:number;smartMoneyAdjustment:number;coordinationAdjustment:number;riskAdjustment:number;reasons:string[]};
export type SmartSignalAlert={id:string;mint:string;symbol:string|null;kind:string;severity:'info'|'warning'|'critical';value:number;message:string;at:string;deltaTrades:number;deltaVolume:number;hypeDelta:number};
export type SmartAlertToken={mint:string;symbol?:string|null;opportunityScore?:number|null;signalConfidenceScore?:number|null;manipulationRiskScore?:number|null;divergenceSignal?:'bullish'|'bearish'|'none'|null;trafficSample?:TrafficSummary|null;volumeDelta?:number|null;hypeDelta?:number|null};

const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const median=(values:number[])=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2};

export function trafficSampleRows(sample?:TrafficSummary|null):WalletSwap[]{
 if(!sample)return [];
 return [
  ...(sample.recentBuys??[]).map(s=>({wallet:s.wallet,side:'buy' as const,usd_value:s.usdValue,block_at:s.blockAt,evidence:s.evidence,program:s.program,signature:s.signature})),
  ...(sample.recentSells??[]).map(s=>({wallet:s.wallet,side:'sell' as const,usd_value:s.usdValue,block_at:s.blockAt,evidence:s.evidence,program:s.program,signature:s.signature})),
 ].sort((a,b)=>Date.parse(a.block_at)-Date.parse(b.block_at));
}

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
  for(const row of list){const at=Date.parse(row.block_at);if(row.side==='buy'){if(Number.isFinite(lastBuy)&&at-lastBuy<=30*60000)repeatEntries++;lastBuy=at}else if(Number.isFinite(lastBuy)&&at-lastBuy<=15*60000)quickFlips++}
  const direct=list.filter(x=>(x.evidence??'direct')==='direct').length,directSharePct=list.length?direct/list.length*100:0;
  const ageMinutes=Math.max(0,(now-Date.parse(list.at(-1)?.block_at??new Date(now).toISOString()))/60000);
  let score=36;
  score+=Math.min(18,buys.length*3)+Math.min(12,repeatEntries*3)+(directSharePct>=70?8:directSharePct>=40?3:-5);
  if(netUsd!=null)score+=netUsd>5000?14:netUsd>2500?11:netUsd>0?5:netUsd<-5000?-15:netUsd<-1500?-10:-4;
  if(avgTradeUsd!=null)score+=avgTradeUsd>=2500?10:avgTradeUsd>=1000?8:avgTradeUsd>=250?4:0;
  score-=Math.min(27,quickFlips*9);if(list.length>=8&&ageMinutes<20)score-=8;score=clamp(Math.round(score));
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
 const repeatEvidence=smart.reduce((n,p)=>n+p.repeatEntries,0);
 const confidence=clamp(Math.round(smart.length*8+profiles.filter(p=>p.directSharePct>=70).length*2.5+Math.min(18,repeatEvidence*3)+(priced.length?10:0)));
 return {wallets:smart.slice(0,8),smartWalletCount:smart.length,entering,exiting,netUsd,confidence};
}

export function detectCoordinatedWallets(rows:WalletSwap[],windowSeconds=90):CoordinatedCluster[]{
 const clusters:CoordinatedCluster[]=[];
 for(const side of ['buy','sell'] as const){
  const sorted=rows.filter(r=>r.side===side&&Number.isFinite(Date.parse(r.block_at))).sort((a,b)=>Date.parse(a.block_at)-Date.parse(b.block_at));
  let i=0;
  while(i<sorted.length){
   const start=Date.parse(sorted[i].block_at),group:WalletSwap[]=[];
   let j=i;
   while(j<sorted.length&&Date.parse(sorted[j].block_at)-start<=windowSeconds*1000){group.push(sorted[j]);j++}
   const wallets=[...new Set(group.map(r=>r.wallet))];
   if(wallets.length>=3){
    const direct=group.filter(r=>(r.evidence??'direct')==='direct').length,directSharePct=group.length?direct/group.length*100:0;
    const priced=group.length>0&&group.every(r=>finite(r.usd_value)&&r.usd_value!>=0),totalUsd=priced?group.reduce((n,r)=>n+r.usd_value!,0):null;
    const sizeBoost=Math.min(18,Math.max(0,wallets.length-3)*5);
    const valueBoost=totalUsd==null?0:Math.min(15,Math.log10(Math.max(1,totalUsd))*4);
    const score=clamp(Math.round(36+wallets.length*6+directSharePct*.2+sizeBoost+valueBoost));
    clusters.push({
     id:side+':'+sorted[i].block_at+':'+wallets.slice().sort().join(','),
     side,wallets,swaps:group.length,totalUsd,directSharePct,startAt:group[0].block_at,endAt:group.at(-1)!.block_at,score,
     confidence:score>=78?'high':score>=58?'medium':'low'
    });
    i=j;
   }else i++;
  }
 }
 return clusters.sort((a,b)=>b.score-a.score||Date.parse(b.endAt)-Date.parse(a.endAt));
}

export function validateSignals(rows:SignalObservation[]):ValidationSummary{
 const sorted=[...rows].filter(r=>Number.isFinite(Date.parse(r.observed_at))&&finite(r.payload?.priceUsd)&&r.payload.priceUsd!>0).sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
 const times=sorted.map(r=>Date.parse(r.observed_at));
 const qualified=sorted.filter(r=>{const p=r.payload;return (p.opportunityScore??0)>=70&&(p.signalConfidenceScore??0)>=55&&(p.manipulationRiskScore??50)<70});
 const lowerBound=(target:number)=>{let lo=0,hi=times.length;while(lo<hi){const mid=(lo+hi)>>1;if(times[mid]<target)lo=mid+1;else hi=mid}return lo};
 const windows:Record<string,ValidationWindow>={};
 for(const minutes of [15,60,360]){
  const returns:number[]=[];
  for(const row of qualified){
   const target=Date.parse(row.observed_at)+minutes*60000,tolerance=Math.max(6,minutes*.25)*60000,index=lowerBound(target),future=sorted[index];
   if(!future||times[index]>target+tolerance)continue;
   const base=row.payload.priceUsd!,next=future.payload.priceUsd!;
   if(base>0&&finite(next))returns.push((next-base)/base*100);
  }
  const wins=returns.filter(v=>v>0).length,losses=returns.filter(v=>v<0),samples=returns.length;
  const raw=samples?wins/samples*100:null;
  const calibrated=samples?(wins+2)/(samples+4)*100:null;
  const confidence=Math.round(clamp(samples/24*100));
  windows[String(minutes)]={
   minutes,samples,wins,winRate:raw,calibratedWinRate:calibrated,confidence,
   avgReturnPct:samples?returns.reduce((a,b)=>a+b,0)/samples:null,
   medianReturnPct:median(returns),downsideMedianPct:median(losses)
  };
 }
 const samples=Math.max(...Object.values(windows).map(w=>w.samples),0),calibrationLabel:ValidationSummary['calibrationLabel']=samples>=24?'validated':samples>=10?'developing':samples>=4?'weak':'insufficient';
 return {samples,qualifiedSamples:qualified.length,windows,calibrationLabel,note:'Historical calibration uses sample-shrunk win rates and bounded forward windows. It is evidence, not a prediction or guarantee.'};
}

export function computeAdaptiveOpportunity(baseScore:number|null|undefined,validation:ValidationSummary,smartMoney:ReturnType<typeof smartMoneySummary>,clusters:CoordinatedCluster[],current?:SignalObservation['payload']):AdaptiveOpportunity{
 const base=clamp(Math.round(finite(baseScore)?baseScore:50));
 const calibrationWeight={insufficient:0,weak:.25,developing:.6,validated:1}[validation.calibrationLabel];
 const windowWeights:Record<string,number>={'15':.25,'60':.5,'360':.25};
 let edgeSum=0,edgeWeight=0;
 for(const [key,w] of Object.entries(windowWeights)){
  const row=validation.windows[key];if(!row||row.samples<2||row.calibratedWinRate==null)continue;
  const downsidePenalty=Math.abs(Math.min(0,row.downsideMedianPct??0))*.18;
  const edge=(row.calibratedWinRate-50)*.12+clamp(row.medianReturnPct??row.avgReturnPct??0,-12,12)*.45-downsidePenalty;
  const sampleWeight=Math.min(1,row.confidence/80),weight=w*sampleWeight;
  edgeSum+=edge*weight;edgeWeight+=weight;
 }
 const historyAdjustment=edgeWeight?Math.round(clamp(edgeSum/edgeWeight*calibrationWeight,-12,12)):0;
 const smartSignal=smartMoney.netUsd==null?0:Math.tanh(smartMoney.netUsd/7000)*7*(smartMoney.confidence/100);
 const smartMoneyAdjustment=Math.round(clamp(smartSignal+(smartMoney.entering-smartMoney.exiting)*.7,-8,8));
 const bestBuy=clusters.find(c=>c.side==='buy'&&c.confidence!=='low'),bestSell=clusters.find(c=>c.side==='sell'&&c.confidence!=='low');
 const coordinationAdjustment=Math.round(clamp(((bestBuy?.score??0)-(bestSell?.score??0))/18,-6,6));
 const risk=finite(current?.manipulationRiskScore)?current!.manipulationRiskScore!:50;
 let riskAdjustment=risk>70?-Math.min(7,Math.round((risk-70)*.23)):0;
 if(current?.divergenceSignal==='bearish')riskAdjustment-=3;
 else if(current?.divergenceSignal==='bullish')riskAdjustment+=2;
 const score=clamp(Math.round(base+historyAdjustment+smartMoneyAdjustment+coordinationAdjustment+riskAdjustment));
 const reasons:string[]=[];
 if(historyAdjustment)reasons.push('Validated history '+(historyAdjustment>0?'+':'')+historyAdjustment);
 if(smartMoneyAdjustment)reasons.push('Smart Money '+(smartMoneyAdjustment>0?'+':'')+smartMoneyAdjustment);
 if(coordinationAdjustment)reasons.push('Coordinated flow '+(coordinationAdjustment>0?'+':'')+coordinationAdjustment);
 if(riskAdjustment)reasons.push('Risk/divergence '+(riskAdjustment>0?'+':'')+riskAdjustment);
 const confidence=clamp(Math.round(30+Math.min(30,validation.samples*2)+smartMoney.confidence*.22+(current?.signalConfidenceScore??50)*.25));
 return {baseScore:base,score,delta:score-base,confidence,historyAdjustment,smartMoneyAdjustment,coordinationAdjustment,riskAdjustment,reasons};
}

export function deriveSmartAlerts(tokens:SmartAlertToken[],at:string):SmartSignalAlert[]{
 const alerts:SmartSignalAlert[]=[];
 const add=(t:SmartAlertToken,kind:string,value:number,message:string,severity:SmartSignalAlert['severity']='warning')=>alerts.push({
  id:t.mint+':'+kind+':'+at,mint:t.mint,symbol:t.symbol??null,kind,severity,value,message,at,deltaTrades:0,deltaVolume:t.volumeDelta??0,hypeDelta:t.hypeDelta??0
 });
 for(const t of tokens){
  const rows=trafficSampleRows(t.trafficSample),profiles=buildWalletProfiles(rows,Date.parse(at)||Date.now()),smart=smartMoneySummary(profiles),clusters=detectCoordinatedWallets(rows);
  const risk=t.manipulationRiskScore??50,confidence=t.signalConfidenceScore??0;
  if((t.opportunityScore??0)>=80&&confidence>=70&&risk<65)add(t,'smart-opportunity',t.opportunityScore!,'High Opportunity + High Confidence with controlled manipulation risk','warning');
  if(smart.entering>=2&&(smart.netUsd??0)>=1500&&smart.confidence>=35)add(t,'smart-money-inflow',smart.netUsd!,'Multiple constructive wallets are accumulating in retained swap evidence','warning');
  if(smart.exiting>=2&&(smart.netUsd??0)<=-1500&&smart.confidence>=35)add(t,'smart-money-exit',Math.abs(smart.netUsd!),'Multiple constructive wallets are distributing in retained swap evidence','critical');
  const buyCluster=clusters.find(c=>c.side==='buy'&&c.confidence!=='low');
  const sellCluster=clusters.find(c=>c.side==='sell'&&c.confidence!=='low');
  if(buyCluster)add(t,'coordinated-buying',buyCluster.score,buyCluster.wallets.length+' wallets bought within '+Math.round((Date.parse(buyCluster.endAt)-Date.parse(buyCluster.startAt))/1000)+'s','warning');
  if(sellCluster)add(t,'coordinated-selling',sellCluster.score,sellCluster.wallets.length+' wallets sold within '+Math.round((Date.parse(sellCluster.endAt)-Date.parse(sellCluster.startAt))/1000)+'s','critical');
  if(t.divergenceSignal==='bullish'&&confidence>=60)add(t,'bullish-divergence',confidence,'Price weakness conflicts with positive underlying flow','info');
  if(t.divergenceSignal==='bearish'&&confidence>=60)add(t,'bearish-divergence',confidence,'Price strength lacks confirmation from underlying flow','warning');
 }
 return alerts.sort((a,b)=>({critical:3,warning:2,info:1}[b.severity]-{critical:3,warning:2,info:1}[a.severity])||Math.abs(b.value)-Math.abs(a.value)).slice(0,20);
}

export function classifyMarketRegime(tokens:Array<{priceChange1h?:number|null;hypeScore?:number|null;capitalFlowScore?:number|null;manipulationRiskScore?:number|null}>){
 const active=tokens.filter(t=>finite(t.priceChange1h)||finite(t.hypeScore)||finite(t.capitalFlowScore));
 if(!active.length)return {key:'neutral',label:'NEUTRAL',score:0,reason:'Waiting for market evidence'};
 const avg=(key:'priceChange1h'|'hypeScore'|'capitalFlowScore'|'manipulationRiskScore',fallback=0)=>active.reduce((n,t)=>n+(finite(t[key])?Number(t[key]):fallback),0)/active.length;
 const breadth=active.filter(t=>(t.priceChange1h??0)>0).length/active.length,move=avg('priceChange1h'),hype=avg('hypeScore',50),flow=avg('capitalFlowScore',50),risk=avg('manipulationRiskScore',50);
 const score=Math.round(clamp(move*5+(breadth-.5)*70+(flow-50)*.7-(risk-50)*.35,-100,100));
 if(hype>=72&&breadth>=.62&&flow>=60)return {key:'mania',label:'MEME MANIA',score,reason:'High hype, positive breadth and strong capital flow'};
 if(score>=28)return {key:'risk-on',label:'RISK ON',score,reason:'Positive breadth and capital flow dominate'};
 if(score<=-28&&risk>=58)return {key:'distribution',label:'DISTRIBUTION',score,reason:'Weak breadth with elevated distribution risk'};
 if(score<=-18)return {key:'risk-off',label:'RISK OFF',score,reason:'Negative price breadth and weaker flow'};
 return {key:'neutral',label:'NEUTRAL',score,reason:'Mixed market evidence'};
}
