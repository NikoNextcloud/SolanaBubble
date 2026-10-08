import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {publicObservationHeaders} from '@/lib/http-cache';
import {rpcProviderReadiness} from '@/lib/rpc-readiness';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const rpc=rpcProviderReadiness();
  const r=await admin().from('api_cache').select('payload').eq('cache_key','worker:status').maybeSingle();if(r.error)throw r.error;
  const w=r.data?.payload;
  const tokens=Number(w?.tokens??0),recentTraffic=Number(w?.recentTraffic??0),usableTraffic=Number(w?.usableTraffic??0),recentHolders=Number(w?.recentHolders??0);
  const trafficCoveragePct=tokens?Math.min(100,usableTraffic/tokens*100):null;
  const holderCoveragePct=tokens?Math.min(100,recentHolders/tokens*100):null;
  const marketAt=w?.lastSuccessAt??null;
  const marketAgeSec=marketAt?Math.max(0,(Date.now()-Date.parse(marketAt))/1000):null;
  return NextResponse.json({
   worker:w?{state:w.state,startedAt:w.startedAt,finishedAt:w.finishedAt,lastSuccessAt:w.lastSuccessAt,durationMs:w.durationMs,holderFailures:w.holderFailures,trafficFailures:w.trafficFailures,holderBudget:w.holderBudget,trafficBudget:w.trafficBudget}:null,
   marketAt,tokens,recentHolders,recentTraffic,usableTraffic,trafficFailures:w?.trafficDiagnostics??{},
   coverage:{trafficCoveragePct,holderCoveragePct,marketAgeSec,swapMode:'sampled',rpcMode:rpc.mode,rpc,fullFirehose:rpc.fullFirehose}
  },{headers:publicObservationHeaders(120)});
 }catch{return NextResponse.json({error:'Worker status unavailable'},{status:503});}
}
