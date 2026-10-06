import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {publicObservationHeaders} from '@/lib/http-cache';
import {buildWalletProfiles,computeAdaptiveOpportunity,detectCoordinatedWallets,smartMoneySummary,validateSignals,type SignalObservation,type WalletSwap} from '@/lib/market/intelligence-core';
import {buildReplaySeries,buildWalletNetwork,computeDecisionTerminal} from '@/lib/market/decision-terminal';

export const dynamic='force-dynamic';
export const maxDuration=15;

export async function GET(req:Request){
 const url=new URL(req.url),mint=url.searchParams.get('mint')??'';
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint))return NextResponse.json({error:'Invalid mint'},{status:400});
 try{
  const db=admin(),trafficSince=new Date(Date.now()-2*3600_000).toISOString(),historySince=new Date(Date.now()-7*86400_000).toISOString();
  const traffic=await db.from('traffic_swaps')
   .select('wallet,side,usd_value,block_at,evidence,program')
   .eq('mint',mint).gte('block_at',trafficSince).order('block_at',{ascending:true}).limit(1800);
  if(traffic.error)throw traffic.error;

  const snapshots:{observed_at:string;payload:SignalObservation['payload']}[]=[];
  for(let offset=0;offset<2016;offset+=1000){
   const size=Math.min(1000,2016-offset);
   const page=await db.from('market_snapshots').select('observed_at,payload').eq('mint',mint).gte('observed_at',historySince).order('observed_at',{ascending:true}).range(offset,offset+size-1);
   if(page.error)throw page.error;
   snapshots.push(...((page.data??[]) as typeof snapshots));
   if((page.data?.length??0)<size)break;
  }

  const trafficRows=(traffic.data??[]) as WalletSwap[];
  const profiles=buildWalletProfiles(trafficRows);
  const smartMoney=smartMoneySummary(profiles);
  const coordinatedClusters=detectCoordinatedWallets(trafficRows);
  const validation=validateSignals(snapshots as SignalObservation[]);
  const current=snapshots.at(-1)?.payload??{};
  const adaptiveOpportunity=computeAdaptiveOpportunity(current.opportunityScore,validation,smartMoney,coordinatedClusters,current);
  const replay=buildReplaySeries(snapshots);
  const decision=computeDecisionTerminal({current,adaptive:adaptiveOpportunity,validation,smartMoney,clusters:coordinatedClusters,replay});
  const walletNetwork=buildWalletNetwork(mint,profiles,coordinatedClusters);
  return NextResponse.json({
   mint,
   observedAt:new Date().toISOString(),
   trafficWindowHours:2,
   walletProfiles:profiles.slice(0,12),
   smartMoney,
   coordinatedClusters:coordinatedClusters.slice(0,8),
   adaptiveOpportunity,
   decision,
   replay,
   walletNetwork,
   validation,
   evidence:{
    recognizedSwaps:traffic.data?.length??0,
    historicalSnapshots:snapshots.length,
    note:'Wallet scores are heuristic and bounded to retained recognized traffic. Routed swaps remain lower-confidence evidence; no wallet is labelled profitable without realized PnL evidence.'
   }
  },{headers:publicObservationHeaders(60)});
 }catch{
  return NextResponse.json({error:'Intelligence unavailable'},{status:503});
 }
}
