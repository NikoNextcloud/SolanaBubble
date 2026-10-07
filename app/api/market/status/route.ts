import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {publicObservationHeaders} from '@/lib/http-cache';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const db=admin();
  const since20m=new Date(Date.now()-20*60_000).toISOString();
  const [status,live]=await Promise.all([
   db.from('api_cache').select('payload,updated_at').eq('cache_key','worker:status').maybeSingle(),
   db.from('live_market_events').select('mint,side,evidence,observed_at,block_at').gte('observed_at',since20m).order('observed_at',{ascending:false}).limit(500),
  ]);
  if(status.error)throw status.error;
  if(live.error)throw live.error;
  const w=status.data?.payload;
  const rows=live.data??[];
  const uniqueMints=new Set(rows.map((row:any)=>row.mint).filter(Boolean)).size;
  return NextResponse.json({
   worker:w?{
    state:w.state,startedAt:w.startedAt,finishedAt:w.finishedAt,lastSuccessAt:w.lastSuccessAt,
    durationMs:w.durationMs,holderFailures:w.holderFailures,trafficFailures:w.trafficFailures,
    holderBudget:w.holderBudget,trafficBudget:w.trafficBudget
   }:null,
   workerUpdatedAt:status.data?.updated_at??null,
   marketAt:w?.lastSuccessAt??null,
   tokens:w?.tokens??null,
   recentHolders:w?.recentHolders??null,
   recentTraffic:w?.recentTraffic??null,
   usableTraffic:w?.usableTraffic??null,
   trafficFailures:w?.trafficDiagnostics??{},
   liveEvents20m:rows.length,
   liveBuys20m:rows.filter((row:any)=>row.side==='buy').length,
   liveSells20m:rows.filter((row:any)=>row.side==='sell').length,
   liveDirect20m:rows.filter((row:any)=>row.evidence==='direct').length,
   liveUniqueMints20m:uniqueMints,
   liveLatestObservedAt:rows[0]?.observed_at??null,
   liveLatestBlockAt:rows[0]?.block_at??null,
  },{headers:publicObservationHeaders(60)});
 }catch{return NextResponse.json({error:'Worker status unavailable'},{status:503});}
}
