export function observationQuality(at:string|null|undefined,now=Date.now(),staleAfterMinutes=10){
  const time=at?Date.parse(at):NaN;
  if(!Number.isFinite(now)||!Number.isFinite(time)||time>now+60_000)return {status:'unknown',label:'Unknown',ageMinutes:null} as const;
  const ageMinutes=Math.max(0,(now-time)/60000);
  return {status:ageMinutes>=staleAfterMinutes?'stale':'recent',label:ageMinutes>=staleAfterMinutes?'Stale':'Recent',ageMinutes} as const;
}
