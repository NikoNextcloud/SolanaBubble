export type ReliabilityInput={
  workerState?:string|null;
  workerUpdatedAt?:string|null;
  marketAt?:string|null;
  tokens?:number|null;
  recentTraffic?:number|null;
  usableTraffic?:number|null;
  liveEvents20m?:number|null;
  liveUniqueMints20m?:number|null;
  liveLatestObservedAt?:string|null;
};

export type ReliabilityLevel="healthy"|"partial"|"degraded"|"warming";

export function classifyReliability(input:ReliabilityInput,now=Date.now()){
  const workerAt=input.workerUpdatedAt?Date.parse(input.workerUpdatedAt):NaN;
  const marketAt=input.marketAt?Date.parse(input.marketAt):NaN;
  const liveAt=input.liveLatestObservedAt?Date.parse(input.liveLatestObservedAt):NaN;
  const workerAge=Number.isFinite(workerAt)?Math.max(0,now-workerAt):null;
  const marketAge=Number.isFinite(marketAt)?Math.max(0,now-marketAt):null;
  const liveAge=Number.isFinite(liveAt)?Math.max(0,now-liveAt):null;
  const tokens=Math.max(0,Number(input.tokens??0));
  const recent=Math.max(0,Number(input.recentTraffic??0));
  const usable=Math.max(0,Number(input.usableTraffic??0));
  const liveEvents=Math.max(0,Number(input.liveEvents20m??0));
  const liveMints=Math.max(0,Number(input.liveUniqueMints20m??0));
  let level:ReliabilityLevel="partial";
  if(!tokens||!Number.isFinite(marketAt))level="warming";
  else if(input.workerState==="error"||(workerAge!=null&&workerAge>15*60_000)||(marketAge!=null&&marketAge>15*60_000))level="degraded";
  else if(input.workerState==="ok"&&marketAge!=null&&marketAge<10*60_000&&recent>0)level="healthy";
  const liveState=liveAge==null?"quiet":liveAge<30_000?"active":liveAge<5*60_000?"recent":"quiet";
  return {
    level,
    workerAgeMs:workerAge,
    marketAgeMs:marketAge,
    liveAgeMs:liveAge,
    tokens,
    recentTraffic:recent,
    usableTraffic:usable,
    liveEvents20m:liveEvents,
    liveUniqueMints20m:liveMints,
    liveState,
    coveragePct:tokens?Math.min(100,recent/tokens*100):0,
  };
}
