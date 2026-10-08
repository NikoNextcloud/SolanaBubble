import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {publicObservationHeaders} from '@/lib/http-cache';
import {buildWalletProfiles,computeAdaptiveOpportunity,detectCoordinatedWallets,smartMoneySummary,validateGoodOpportunities,validateSignals,type SignalObservation,type WalletSwap} from '@/lib/market/intelligence-core';
import {buildReplaySeries,buildWalletNetwork,computeDecisionTerminal} from '@/lib/market/decision-terminal';

export const dynamic='force-dynamic';
export const maxDuration=15;

async function loadSnapshots(db:ReturnType<typeof admin>,mint:string,since:string){
 const snapshots:{observed_at:string;payload:SignalObservation['payload']}[]=[];
 for(let offset=0;offset<2016;offset+=1000){
  const size=Math.min(1000,2016-offset);
  const page=await db.from('market_snapshots').select('observed_at,payload').eq('mint',mint).gte('observed_at',since).order('observed_at',{ascending:true}).range(offset,offset+size-1);
  if(page.error)throw page.error;
  snapshots.push(...((page.data??[]) as typeof snapshots));
  if((page.data?.length??0)<size)break;
 }
 return snapshots;
}

export async function GET(req:Request){
 const started=performance.now(),url=new URL(req.url),mint=url.searchParams.get('mint')??'';
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))return NextResponse.json({error:'Invalid mint'},{status:400});
 try{
  const db=admin(),now=Date.now(),trafficSince=new Date(now-2*3600_000).toISOString(),historySince=new Date(now-7*86400_000).toISOString();
  const dbStarted=performance.now();
  const [traffic,snapshots]=await Promise.all([
   db.from('traffic_swaps').select('wallet,side,usd_value,block_at,evidence,program').eq('mint',mint).gte('block_at',trafficSince).order('block_at',{ascending:true}).limit(1800),
   loadSnapshots(db,mint,historySince)
  ]);
  if(traffic.error)throw traffic.error;
  const dbMs=performance.now()-dbStarted,computeStarted=performance.now();
  const trafficRows=(traffic.data??[]) as WalletSwap[];
  const profiles=buildWalletProfiles(trafficRows,now);
  const smartMoney=smartMoneySummary(profiles);
  const coordinatedClusters=detectCoordinatedWallets(trafficRows);
  const validation=validateSignals(snapshots);
  const goodValidation=validateGoodOpportunities(snapshots);
  const current=snapshots.at(-1)?.payload??{};
  const adaptiveOpportunity=computeAdaptiveOpportunity(current.opportunityScore,validation,smartMoney,coordinatedClusters,current,goodValidation);
  const replay=buildReplaySeries(snapshots);
  const decision=computeDecisionTerminal({current,adaptive:adaptiveOpportunity,validation,smartMoney,clusters:coordinatedClusters,replay,now});
  const walletNetwork=buildWalletNetwork(mint,profiles,coordinatedClusters);
  const computeMs=performance.now()-computeStarted,totalMs=performance.now()-started;
  return NextResponse.json({
   mint,observedAt:new Date(now).toISOString(),trafficWindowHours:2,
   walletProfiles:profiles.slice(0,12),smartMoney,coordinatedClusters:coordinatedClusters.slice(0,8),
   adaptiveOpportunity,decision,replay,walletNetwork,validation,goodValidation,
   evidence:{
    recognizedSwaps:traffic.data?.length??0,historicalSnapshots:snapshots.length,
    note:'Wallet scores are heuristic and bounded to retained recognized traffic. Routed swaps remain lower-confidence evidence; no wallet is labelled profitable without realized PnL evidence.'
   }
  },{headers:{...publicObservationHeaders(60),'server-timing':`db;dur=${dbMs.toFixed(1)}, compute;dur=${computeMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`}});
 }catch{
  return NextResponse.json({error:'Intelligence unavailable'},{status:503,headers:{'cache-control':'no-store'}});
 }
}
