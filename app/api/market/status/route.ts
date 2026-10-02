import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {publicObservationHeaders} from '@/lib/http-cache';
export const dynamic='force-dynamic';
export async function GET(){
 try{const r=await admin().from('api_cache').select('payload').eq('cache_key','worker:status').maybeSingle();if(r.error)throw r.error;
 const w=r.data?.payload;
 return NextResponse.json({worker:w?{state:w.state,startedAt:w.startedAt,finishedAt:w.finishedAt,lastSuccessAt:w.lastSuccessAt,durationMs:w.durationMs,holderFailures:w.holderFailures,trafficFailures:w.trafficFailures,holderBudget:w.holderBudget,trafficBudget:w.trafficBudget}:null,marketAt:w?.lastSuccessAt??null,tokens:w?.tokens??null,recentHolders:w?.recentHolders??null,recentTraffic:w?.recentTraffic??null,usableTraffic:w?.usableTraffic??null,trafficFailures:w?.trafficDiagnostics??{}},{headers:publicObservationHeaders(120)});
 }catch{return NextResponse.json({error:'Worker status unavailable'},{status:503});}
}
