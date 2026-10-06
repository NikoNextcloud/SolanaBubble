import type {SignalToken} from './market/signals';
export type RuleKey='opportunityScore'|'hypeScore'|'hypeVelocity'|'holderGrowthPct'|'buyPressure'|'liquidityChangePct';
export type SmartRuleKey='strongSetup'|'bullishDivergence'|'bearishDivergence'|'liquidityDanger'|'whaleExit';
export const ruleDefinitions=[{key:'opportunityScore',label:'Opportunity ≥',default:75,min:0,max:100},{key:'hypeScore',label:'Hype ≥',default:70,min:0,max:100},{key:'hypeVelocity',label:'Hype velocity ≥ H/min',default:3,min:0,max:100},{key:'holderGrowthPct',label:'Holder growth · 5m ≥ %',default:5,min:0,max:1000},{key:'buyPressure',label:'Buy count pressure ≥ %',default:70,min:0,max:100},{key:'liquidityChangePct',label:'Liquidity drop ≥ %',default:25,min:0,max:100}] as const;
export const smartRuleDefinitions=[{key:'strongSetup',label:'Strong Buy setup'},{key:'bullishDivergence',label:'Bullish divergence'},{key:'bearishDivergence',label:'Bearish divergence'},{key:'liquidityDanger',label:'Liquidity danger'},{key:'whaleExit',label:'Whale exit'}] as const;
export type WatchEntry={mint:string;symbol?:string|null;name?:string|null;rules:Partial<Record<RuleKey,number>>;smartRules?:Partial<Record<SmartRuleKey,boolean>>};
export type WatchFilters={query:string;minHype:number;maxRisk:number;onlyFavorites:boolean};
export type PersonalAlert={id:string;mint:string;symbol?:string|null;key:RuleKey|SmartRuleKey;value:number;threshold:number;at:string;message?:string};
export type WatchState={version:1;entries:WatchEntry[];filters:WatchFilters;alerts:PersonalAlert[];seen:Record<string,string>;active:Record<string,boolean>};
export const emptyWatchState=():WatchState=>({version:1,entries:[],filters:{query:'',minHype:0,maxRisk:100,onlyFavorites:false},alerts:[],seen:{},active:{}});
export const validMint=(m:unknown):m is string=>typeof m==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m);
export function normalizeWatchState(raw:any):WatchState {
  const state=emptyWatchState();
  if(!raw||typeof raw!=='object') return state;
  const entries:any[]=Array.isArray(raw.entries)?raw.entries:Array.isArray(raw)?raw:[];
  const seen=new Set<string>();
  state.entries=entries.filter(e=>validMint(e?.mint)&&!seen.has(e.mint)&&!!seen.add(e.mint)).slice(0,50).map(e=>({mint:e.mint,symbol:typeof e.symbol==='string'?e.symbol.slice(0,30):null,name:typeof e.name==='string'?e.name.slice(0,100):null,rules:Object.fromEntries(ruleDefinitions.filter(d=>typeof e.rules?.[d.key]==='number'&&Number.isFinite(e.rules[d.key])&&e.rules[d.key]>=d.min&&e.rules[d.key]<=d.max).map(d=>[d.key,e.rules[d.key]])),smartRules:Object.fromEntries(smartRuleDefinitions.filter(d=>e.smartRules?.[d.key]===true).map(d=>[d.key,true]))}));
  state.filters={query:typeof raw.filters?.query==='string'?raw.filters.query.slice(0,100):'',minHype:Math.max(0,Math.min(100,Number(raw.filters?.minHype)||0)),maxRisk:typeof raw.filters?.maxRisk==='number'?Math.max(0,Math.min(100,raw.filters.maxRisk)):100,onlyFavorites:raw.filters?.onlyFavorites===true};
  state.alerts=Array.isArray(raw.alerts)?raw.alerts.filter((a:any)=>validMint(a?.mint)&&(ruleDefinitions.some(d=>d.key===a.key)||smartRuleDefinitions.some(d=>d.key===a.key))&&typeof a.id==='string'&&Number.isFinite(a.value)&&Number.isFinite(a.threshold)&&Number.isFinite(Date.parse(a.at))).slice(0,100).map((a:any)=>({...a,message:typeof a.message==='string'?a.message.slice(0,240):undefined})):[];
  state.seen=raw.seen&&typeof raw.seen==='object'?Object.fromEntries(Object.entries(raw.seen).filter(([k,v])=>k.length<100&&typeof v==='string').slice(0,500)) as Record<string,string>:{};
  state.active=raw.active&&typeof raw.active==='object'?Object.fromEntries(Object.entries(raw.active).filter(([k,v])=>k.length<100&&typeof v==='boolean').slice(0,500)) as Record<string,boolean>:{};
  return state;
}
export type WatchToken=SignalToken&{name?:string|null;marketObservedAt?:string|null};
export function matchesWatchFilters(t:WatchToken,filters:WatchFilters,entries:WatchEntry[]) {
  const q=filters.query.trim().toLowerCase();
  return (!q||`${t.mint} ${t.symbol??''} ${t.name??''}`.toLowerCase().includes(q))&&(!filters.onlyFavorites||entries.some(e=>e.mint===t.mint))&&(filters.minHype===0||(typeof t.hypeScore==='number'&&t.hypeScore>=filters.minHype))&&(filters.maxRisk===100||(typeof t.riskScore==='number'&&t.riskScore<=filters.maxRisk));
}
export function evaluatePersonalAlerts(state:WatchState,tokens:WatchToken[],now=Date.now()):WatchState {
  const next={...state,seen:{...state.seen},active:{...state.active},alerts:[...state.alerts]};let changed=false;
  for(const entry of state.entries) {
    const t=tokens.find(t=>t.mint===entry.mint);if(!t) continue;
    for(const definition of ruleDefinitions) {
      const key=definition.key,threshold=entry.rules[key];if(threshold==null) continue;
      const at=key==='holderGrowthPct'?t.holderWindows?.['5']?.observedAt:t.marketObservedAt;
      const value=key==='holderGrowthPct'?t.holderWindows?.['5']?.holderGrowthPct:t[key];
      if(!at||!Number.isFinite(Date.parse(at))||now-Date.parse(at)>10*60_000||Date.parse(at)>now+60_000||typeof value!=='number'||!Number.isFinite(value)) continue;
      if(key==='buyPressure'&&(t.buys1h??0)+(t.sells1h??0)<20) continue;
      const id=`${entry.mint}:${key}`;
      const last=next.seen[id];const lastTime=last?Date.parse(last.slice(0,last.lastIndexOf(':'))):NaN;
      if(Number.isFinite(lastTime)&&Date.parse(at)<lastTime)continue;
      const revision=`${at}:${threshold}`;if(next.seen[id]===revision) continue;
      const crossed=key==='liquidityChangePct'?value<=-threshold:value>=threshold;
      if(crossed&&!next.active[id]&&!next.alerts.some(a=>a.id===`${id}:${revision}`)) next.alerts.unshift({id:`${id}:${revision}`,mint:entry.mint,symbol:t.symbol??entry.symbol,key,value,threshold,at});
      next.seen[id]=revision;next.active[id]=crossed;changed=true;
    }
    for(const definition of smartRuleDefinitions) {
      const key=definition.key;if(entry.smartRules?.[key]!==true)continue;
      const at=t.marketObservedAt;
      if(!at||!Number.isFinite(Date.parse(at))||now-Date.parse(at)>10*60_000||Date.parse(at)>now+60_000)continue;
      let crossed=false,value=1,threshold=1,message=definition.label;
      if(key==='strongSetup'){value=t.opportunityScore??0;threshold=80;crossed=value>=80&&(t.signalConfidenceScore??0)>=70&&(t.manipulationRiskScore??t.riskScore??50)<65;message='Strong Buy setup: Opportunity, confidence and risk are aligned';}
      else if(key==='bullishDivergence'){value=t.signalConfidenceScore??0;threshold=60;crossed=t.divergenceSignal==='bullish'&&value>=60;message='Bullish divergence confirmed by signal confidence';}
      else if(key==='bearishDivergence'){value=t.signalConfidenceScore??0;threshold=60;crossed=t.divergenceSignal==='bearish'&&value>=60;message='Bearish divergence detected';}
      else if(key==='liquidityDanger'){value=Math.abs(t.liquidityChangePct??0);threshold=1;crossed=t.liquidityWarning===true;message='Liquidity deterioration warning is active';}
      else if(key==='whaleExit'){value=t.whaleExit??0;threshold=1;crossed=value>0;message='Whale exit activity detected';}
      const id=`${entry.mint}:${key}`,revision=`${at}:smart`;
      if(next.seen[id]===revision)continue;
      if(crossed&&!next.active[id]&&!next.alerts.some(a=>a.id===`${id}:${revision}`))next.alerts.unshift({id:`${id}:${revision}`,mint:entry.mint,symbol:t.symbol??entry.symbol,key,value,threshold,at,message});
      next.seen[id]=revision;next.active[id]=crossed;changed=true;
    }
  }
  next.alerts=next.alerts.slice(0,100);return changed?next:state;
}
