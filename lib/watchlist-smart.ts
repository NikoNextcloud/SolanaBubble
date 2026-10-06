import type {WatchToken} from './watchlist';

export type SmartRuleKey='strongSetup'|'bullishDivergence'|'bearishDivergence'|'liquidityDanger'|'whaleExit';
export const smartRuleDefinitions=[
 {key:'strongSetup',label:'Strong Buy setup'},
 {key:'bullishDivergence',label:'Bullish divergence'},
 {key:'bearishDivergence',label:'Bearish divergence'},
 {key:'liquidityDanger',label:'Liquidity danger'},
 {key:'whaleExit',label:'Whale exit'},
] as const;
export type SmartPersonalAlert={id:string;mint:string;symbol?:string|null;key:SmartRuleKey;value:number;at:string;message:string};
export type SmartWatchState={smartRules:Record<string,Partial<Record<SmartRuleKey,boolean>>>;smartAlerts:SmartPersonalAlert[];smartSeen:Record<string,string>;smartActive:Record<string,boolean>};
export const emptySmartWatchState=():SmartWatchState=>({smartRules:{},smartAlerts:[],smartSeen:{},smartActive:{}});
const validMint=(m:unknown):m is string=>typeof m==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m);
const validKey=(k:unknown):k is SmartRuleKey=>smartRuleDefinitions.some(d=>d.key===k);

export function normalizeSmartWatchState(raw:any):SmartWatchState{
 const state=emptySmartWatchState();if(!raw||typeof raw!=='object')return state;
 if(raw.smartRules&&typeof raw.smartRules==='object'){for(const [mint,rules] of Object.entries(raw.smartRules)){if(!validMint(mint)||!rules||typeof rules!=='object')continue;const clean:Partial<Record<SmartRuleKey,boolean>>={};for(const d of smartRuleDefinitions)if((rules as any)[d.key]===true)clean[d.key]=true;if(Object.keys(clean).length)state.smartRules[mint]=clean;}}
 if(Array.isArray(raw.smartAlerts))state.smartAlerts=raw.smartAlerts.filter((a:any)=>validMint(a?.mint)&&validKey(a?.key)&&typeof a.id==='string'&&typeof a.message==='string'&&Number.isFinite(a.value)&&Number.isFinite(Date.parse(a.at))).slice(0,100).map((a:any)=>({...a,message:a.message.slice(0,240)}));
 if(raw.smartSeen&&typeof raw.smartSeen==='object')state.smartSeen=Object.fromEntries(Object.entries(raw.smartSeen).filter(([k,v])=>k.length<140&&typeof v==='string').slice(0,500)) as Record<string,string>;
 if(raw.smartActive&&typeof raw.smartActive==='object')state.smartActive=Object.fromEntries(Object.entries(raw.smartActive).filter(([k,v])=>k.length<140&&typeof v==='boolean').slice(0,500)) as Record<string,boolean>;
 return state;
}

export function evaluateSmartPersonalAlerts(state:SmartWatchState,tokens:WatchToken[],now=Date.now()):SmartWatchState{
 const next={smartRules:state.smartRules,smartAlerts:[...state.smartAlerts],smartSeen:{...state.smartSeen},smartActive:{...state.smartActive}};let changed=false;
 for(const [mint,rules] of Object.entries(state.smartRules)){
  const t=tokens.find(t=>t.mint===mint);if(!t)continue;const at=t.marketObservedAt;if(!at||!Number.isFinite(Date.parse(at))||now-Date.parse(at)>10*60_000||Date.parse(at)>now+60_000)continue;
  for(const d of smartRuleDefinitions){if(rules[d.key]!==true)continue;const key=d.key;let crossed=false,value=1,message:string=d.label;
   if(key==='strongSetup'){value=t.opportunityScore??0;crossed=value>=80&&(t.signalConfidenceScore??0)>=70&&(t.manipulationRiskScore??t.riskScore??50)<65;message='Strong Buy setup: Opportunity, confidence and risk are aligned';}
   else if(key==='bullishDivergence'){value=t.signalConfidenceScore??0;crossed=t.divergenceSignal==='bullish'&&value>=60;message='Bullish divergence confirmed by signal confidence';}
   else if(key==='bearishDivergence'){value=t.signalConfidenceScore??0;crossed=t.divergenceSignal==='bearish'&&value>=60;message='Bearish divergence detected';}
   else if(key==='liquidityDanger'){value=Math.abs(t.liquidityChangePct??0);crossed=t.liquidityWarning===true;message='Liquidity deterioration warning is active';}
   else if(key==='whaleExit'){value=t.whaleExit??0;crossed=value>0;message='Whale exit activity detected';}
   const id=mint+':'+key,revision=at+':smart';if(next.smartSeen[id]===revision)continue;
   if(crossed&&!next.smartActive[id]&&!next.smartAlerts.some(a=>a.id===id+':'+revision))next.smartAlerts.unshift({id:id+':'+revision,mint,symbol:t.symbol,key,value,at,message});
   next.smartSeen[id]=revision;next.smartActive[id]=crossed;changed=true;
  }
 }
 next.smartAlerts=next.smartAlerts.slice(0,100);return changed?next:state;
}
