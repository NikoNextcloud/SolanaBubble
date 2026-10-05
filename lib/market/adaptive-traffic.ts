export type AdaptiveTrafficToken={
  mint:string;
  volume1h?:number;
  trades1h?:number;
  hypeScore?:number;
  trafficObservedAt?:string|null;
  trafficEvidence?:string|null;
};

export function adaptiveTrafficBudget(
  ceiling:number,
  previous:{durationMs?:number;trafficFailures?:number;holderFailures?:number;trafficCompleted?:number}={},
){
  const max=Math.max(0,Math.floor(ceiling));
  if(max===0)return 0;
  const duration=Number(previous.durationMs??Infinity);
  const failures=Number(previous.trafficFailures??0)+Number(previous.holderFailures??0);
  if(failures>0||duration>35_000)return Math.max(1,Math.min(max,2));
  if(duration<10_000)return Math.min(max,5);
  if(duration<16_000)return Math.min(max,4);
  if(duration<24_000)return Math.min(max,3);
  return Math.min(max,2);
}

export function selectAdaptiveTrafficWork<T extends AdaptiveTrafficToken>(
  tokens:T[],
  priorityMints:string[],
  cursor:number,
  budget:number,
  now=Date.now(),
){
  const prioritySet=new Set(priorityMints);
  const score=(t:T)=>{
    const age=t.trafficObservedAt?Math.max(0,(now-Date.parse(t.trafficObservedAt))/60_000):120;
    const freshness=Math.min(80,age*3);
    const activity=Math.log10(Math.max(1,Number(t.volume1h??0)))*7+Math.log10(Math.max(1,Number(t.trades1h??0)+1))*11;
    const hype=Math.max(0,Math.min(100,Number(t.hypeScore??0)))*.22;
    const evidence=t.trafficEvidence==='usable'?-6:t.trafficEvidence==='sparse'?8:t.trafficEvidence==='degraded'?14:18;
    return (prioritySet.has(t.mint)?1000:0)+freshness+activity+hype+evidence;
  };
  const ranked=[...tokens].sort((a,b)=>score(b)-score(a));
  if(!ranked.length||budget<=0)return {candidates:[] as T[],ranked,rotation:[] as T[]};

  // Reserve one slot for fair rotation so low-activity tokens still receive periodic coverage.
  const hotSlots=Math.max(0,budget-1);
  const selected=ranked.slice(0,hotSlots);
  const selectedSet=new Set(selected.map(t=>t.mint));
  const rotation=tokens.filter(t=>!selectedSet.has(t.mint));
  if(rotation.length&&selected.length<budget){
    const start=Math.max(0,Math.floor(cursor||0))%rotation.length;
    selected.push(rotation[start]);
  }
  while(selected.length<budget){
    const next=ranked.find(t=>!selected.some(s=>s.mint===t.mint));
    if(!next)break;
    selected.push(next);
  }
  return {candidates:selected.slice(0,budget),ranked,rotation};
}
