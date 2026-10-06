import type {AdaptiveOpportunity,CoordinatedCluster,ValidationSummary,WalletProfile} from './intelligence-core';

export type ReplayPoint={at:string;price:number|null;opportunity:number|null;confidence:number|null;capitalFlow:number|null;holderQuality:number|null;hype:number|null;risk:number|null};
export type DecisionVerdict='STRONG BUY'|'WATCH'|'NEUTRAL'|'EXIT RISK';
export type DecisionTerminal={verdict:DecisionVerdict;score:number;confidence:number;whyNow:string[];risks:string[];brief:string;freshness:{ageMinutes:number|null;status:'LIVE'|'FRESH'|'DELAYED'|'STALE'|'UNKNOWN'};trend:{pricePct:number|null;opportunityDelta:number|null;capitalFlowDelta:number|null}};
export type WalletNetwork={nodes:Array<{id:string;label:string;kind:'token'|'wallet';score:number|null;netUsd:number|null}>;links:Array<{source:string;target:string;kind:'accumulation'|'distribution'|'coordinated';weight:number}>};

const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
const pct=(v:number)=>`${v>=0?'+':''}${v.toFixed(1)}%`;
const money=(v:number)=>`${v>=0?'+':'−'}$${Math.abs(v)>=1e6?(Math.abs(v)/1e6).toFixed(1)+'M':Math.abs(v)>=1e3?(Math.abs(v)/1e3).toFixed(1)+'K':Math.abs(v).toFixed(0)}`;

export function buildReplaySeries(rows:Array<{observed_at:string;payload:any}>,maxPoints=96):ReplayPoint[]{
 const points=rows.filter(r=>Number.isFinite(Date.parse(r.observed_at))).map(r=>({
  at:r.observed_at,price:finite(r.payload?.priceUsd)?r.payload.priceUsd:null,opportunity:finite(r.payload?.opportunityScore)?r.payload.opportunityScore:null,
  confidence:finite(r.payload?.signalConfidenceScore)?r.payload.signalConfidenceScore:null,capitalFlow:finite(r.payload?.capitalFlowScore)?r.payload.capitalFlowScore:null,
  holderQuality:finite(r.payload?.holderQualityScore)?r.payload.holderQualityScore:null,hype:finite(r.payload?.hypeScore)?r.payload.hypeScore:null,
  risk:finite(r.payload?.manipulationRiskScore)?r.payload.manipulationRiskScore:finite(r.payload?.riskScore)?r.payload.riskScore:null
 })).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 if(points.length<=maxPoints)return points;
 const step=(points.length-1)/(maxPoints-1),out:ReplayPoint[]=[];
 for(let i=0;i<maxPoints;i++)out.push(points[Math.round(i*step)]);
 return out;
}

function nearestBefore(points:ReplayPoint[],target:number){
 let best:ReplayPoint|null=null;
 for(const p of points){const at=Date.parse(p.at);if(at<=target)best=p;else break;}
 return best;
}

export function buildWalletNetwork(mint:string,profiles:WalletProfile[],clusters:CoordinatedCluster[]):WalletNetwork{
 const selected=profiles.slice(0,10),ids=new Set(selected.map(p=>p.wallet));
 const nodes=[{id:mint,label:'TOKEN',kind:'token' as const,score:null,netUsd:null},...selected.map(p=>({id:p.wallet,label:p.wallet.length>10?p.wallet.slice(0,4)+'…'+p.wallet.slice(-4):p.wallet,kind:'wallet' as const,score:p.score,netUsd:p.netUsd}))];
 const links:WalletNetwork['links']=selected.map(p=>({source:p.wallet,target:mint,kind:(p.netUsd??0)>=0?'accumulation':'distribution',weight:Math.max(1,Math.min(100,p.score))}));
 for(const cluster of clusters.slice(0,5)){
  const members=cluster.wallets.filter(w=>ids.has(w));
  for(let i=1;i<members.length;i++)links.push({source:members[i-1],target:members[i],kind:'coordinated',weight:cluster.score});
 }
 return {nodes,links};
}

export function computeDecisionTerminal(args:{
 current:any;adaptive:AdaptiveOpportunity;validation:ValidationSummary;smartMoney:{smartWalletCount:number;entering:number;exiting:number;netUsd:number|null;confidence:number};clusters:CoordinatedCluster[];replay:ReplayPoint[];now?:number;
}):DecisionTerminal{
 const {current,adaptive,validation,smartMoney,clusters,replay}=args,now=args.now??Date.now();
 const risk=finite(current?.manipulationRiskScore)?current.manipulationRiskScore:finite(current?.riskScore)?current.riskScore:50;
 const signalConfidence=finite(current?.signalConfidenceScore)?current.signalConfidenceScore:50;
 const capitalFlow=finite(current?.capitalFlowScore)?current.capitalFlowScore:50;
 const holderQuality=finite(current?.holderQualityScore)?current.holderQualityScore:50;
 const sellCluster=clusters.find(c=>c.side==='sell'&&c.confidence!=='low'),buyCluster=clusters.find(c=>c.side==='buy'&&c.confidence!=='low');
 const last=replay.at(-1)??null,observedAt=last?.at??null;
 const age=observedAt?Math.max(0,(now-Date.parse(observedAt))/60000):null;
 const status=age==null||!Number.isFinite(age)?'UNKNOWN':age<=1.5?'LIVE':age<=5?'FRESH':age<=15?'DELAYED':'STALE';
 const freshForAction=status==='LIVE'||status==='FRESH',usableForWatch=freshForAction||status==='DELAYED';

 const exitRisk=risk>=78||(sellCluster?.score??0)>=78||(adaptive.score<=38&&capitalFlow<42)||current?.liquidityWarning===true;
 const strongBuy=!exitRisk&&freshForAction&&adaptive.score>=82&&adaptive.confidence>=65&&signalConfidence>=65&&risk<65&&current?.divergenceSignal!=='bearish';
 const watch=!exitRisk&&!strongBuy&&usableForWatch&&adaptive.score>=66&&adaptive.confidence>=50&&risk<72;
 const verdict:DecisionVerdict=exitRisk?'EXIT RISK':strongBuy?'STRONG BUY':watch?'WATCH':'NEUTRAL';

 const oneHour=validation.windows['60'];
 const validationConfidence=oneHour?.confidence??0;
 const sampleBoost=Math.min(16,validationConfidence*.16),evidenceBoost=smartMoney.confidence*.16;
 const freshnessMultiplier=status==='LIVE'?1:status==='FRESH'?.94:status==='DELAYED'?.78:status==='STALE'?.5:.6;
 const confidence=Math.round(clamp((adaptive.confidence*.5+signalConfidence*.28+sampleBoost+evidenceBoost)*freshnessMultiplier));
 const whyNow:string[]=[],risks:string[]=[];
 if(adaptive.delta>=4)whyNow.push(`Adaptive score improved +${adaptive.delta} vs base`);
 if(smartMoney.netUsd!=null&&smartMoney.netUsd>1000)whyNow.push(`Smart Money net inflow ${money(smartMoney.netUsd)}`);
 if(smartMoney.entering>=2)whyNow.push(`${smartMoney.entering} constructive wallets are accumulating`);
 if(buyCluster)whyNow.push(`${buyCluster.wallets.length} wallets coordinated BUY flow`);
 if(current?.divergenceSignal==='bullish')whyNow.push('Bullish divergence: flow is stronger than price action');
 if(capitalFlow>=68)whyNow.push(`Capital Flow is strong at ${Math.round(capitalFlow)}/100`);
 if(holderQuality>=65)whyNow.push(`Holder Quality is supportive at ${Math.round(holderQuality)}/100`);
 if(oneHour?.samples>=4&&oneHour.calibratedWinRate!=null)whyNow.push(`Similar signals: ${oneHour.calibratedWinRate.toFixed(0)}% calibrated positive at 1h (${oneHour.samples} samples)`);

 if(risk>=65)risks.push(`Manipulation risk ${Math.round(risk)}/100`);
 if(sellCluster)risks.push(`${sellCluster.wallets.length}-wallet coordinated selling cluster`);
 if(smartMoney.netUsd!=null&&smartMoney.netUsd<-1000)risks.push(`Smart Money net outflow ${money(smartMoney.netUsd)}`);
 if(current?.divergenceSignal==='bearish')risks.push('Bearish divergence: price strength lacks flow confirmation');
 if(current?.liquidityWarning)risks.push('Liquidity deterioration is active');
 if(finite(current?.whaleExit)&&current.whaleExit>0)risks.push(`Whale exits observed: ${Math.round(current.whaleExit)}`);
 if(status==='STALE'||status==='UNKNOWN')risks.push('Decision confidence reduced because market evidence is stale');

 const oneHourAgo=last?nearestBefore(replay,Date.parse(last.at)-60*60000):null;
 const pricePct=last&&oneHourAgo&&finite(last.price)&&finite(oneHourAgo.price)&&oneHourAgo.price>0?(last.price-oneHourAgo.price)/oneHourAgo.price*100:null;
 const opportunityDelta=last&&oneHourAgo&&finite(last.opportunity)&&finite(oneHourAgo.opportunity)?last.opportunity-oneHourAgo.opportunity:null;
 const capitalFlowDelta=last&&oneHourAgo&&finite(last.capitalFlow)&&finite(oneHourAgo.capitalFlow)?last.capitalFlow-oneHourAgo.capitalFlow:null;
 if(pricePct!=null&&Math.abs(pricePct)>=2)whyNow.push(`Price moved ${pct(pricePct)} over ~1h`);
 if(capitalFlowDelta!=null&&capitalFlowDelta>=8)whyNow.push(`Capital Flow accelerated +${capitalFlowDelta.toFixed(0)} over ~1h`);

 const topWhy=whyNow.slice(0,4),topRisks=risks.slice(0,4);
 const brief=verdict==='STRONG BUY'?
  `Strong setup with ${confidence}% evidence confidence. ${topWhy.slice(0,2).join('. ')||'Multiple positive signal families are aligned'}.`:verdict==='EXIT RISK'?
  `Risk dominates the setup. ${topRisks.slice(0,2).join('. ')||'Downside evidence outweighs current opportunity'}.`:verdict==='WATCH'?
  `Constructive setup, but confirmation is incomplete. ${topWhy[0]||'Wait for stronger flow or validation evidence'}.`:
  `Mixed setup with no decisive edge. ${topRisks[0]||topWhy[0]||'Wait for clearer evidence'}.`;
 return {verdict,score:adaptive.score,confidence,whyNow:topWhy,risks:topRisks,brief,freshness:{ageMinutes:age==null?null:Math.round(age*10)/10,status},trend:{pricePct,opportunityDelta,capitalFlowDelta}};
}
