import {admin} from '../../db';
import {fetchRecentSignatures,fetchParsedTransactionResult} from '../../solana-public';
import {decodeDirectSwap,decodeRoutedSwap,type RecognizedSwap} from './decode';
import {summarizeTraffic} from './summary';
import type {Intelligence} from '../signals';

type TrafficPool={pairAddress:string;dex?:string|null;liquidityUsd?:number;quoteMint?:string|null;quoteSymbol?:string|null};

export async function observeTraffic(
 token:{mint:string;pairAddress?:string|null;trafficPools?:TrafficPool[]},
 solUsd:number|null,
 holder?:Intelligence,
 deadline=Date.now()+45000,
){
 const configured=[
  ...(token.trafficPools??[]).filter(p=>p?.pairAddress),
  ...(token.pairAddress?[{pairAddress:token.pairAddress}]:[]),
 ];
 const pools=[...new Map(configured.map(p=>[p.pairAddress,p])).values()]
   .sort((a,b)=>Number(b.liquidityUsd??0)-Number(a.liquidityUsd??0))
   .slice(0,3);
 if(!pools.length)throw new Error('No selected pool');

 const db=admin(),at=new Date().toISOString(),since=new Date(Date.now()-2*3600000).toISOString();
 const prior=await db.from('traffic_swaps').select('mint,pool,signature,wallet,side,token_amount,quote_mint,quote_amount,usd_value,block_at,program,evidence').eq('mint',token.mint).gte('block_at',since).order('block_at',{ascending:false}).limit(1800);if(prior.error)throw prior.error;
 const scans=await db.from('traffic_scans').select('payload').eq('mint',token.mint).gte('scanned_at',since).order('scanned_at',{ascending:false}).limit(180);if(scans.error)throw scans.error;
 const previousScans=(scans.data??[]).map(s=>s.payload);
 const seen=new Set<string>(previousScans.flatMap(s=>s.processedSignatures??[]));
 const allNew:RecognizedSwap[]=[];
 const cycleScans:any[]=[];
 let remainingTxBudget=14;

 for(const selected of pools){
  if(Date.now()>=deadline-16000||remainingTxBudget<=0)break;
  const pool=selected.pairAddress;
  const recent=await fetchRecentSignatures(pool,Math.min(8,remainingTxBudget+2));
  const priorPoolScans=previousScans.filter(s=>s.pool===pool);
  const pending=priorPoolScans.flatMap(s=>s.pendingSignatures??[]);
  const eligible=[...new Map([...pending,...recent]
    .filter(s=>!s.err&&s.blockTime&&s.blockTime*1000>=Date.now()-3600000&&s.blockTime*1000<=Date.now()-10000&&!seen.has(s.signature))
    .map(s=>[s.signature,s])).values()]
    .sort((a,b)=>a.blockTime-b.blockTime)
    .slice(0,Math.min(remainingTxBudget,6));

  const swaps:RecognizedSwap[]=[];const processed:string[]=[];let parsed=0,unavailable=0,unrecognized=0,attempted=0;
  const failures:Record<string,number>={};const retry:any[]=[];
  for(const s of eligible){
   if(Date.now()>=deadline-16000)break;
   attempted++;remainingTxBudget--;
   const result=await fetchParsedTransactionResult(s.signature);
   if(!result.transaction){
    unavailable++;const reason=result.failure??'not_found';const key=result.failureCode!=null?`${reason}:${result.failureCode}`:reason;failures[key]=(failures[key]??0)+1;retry.push({signature:s.signature,blockTime:s.blockTime});
    if(['rate_limited','forbidden','timeout','rpc_error'].includes(reason))break;
    continue;
   }
   parsed++;processed.push(s.signature);seen.add(s.signature);
   const swap=decodeDirectSwap(result.transaction,token.mint,pool,solUsd)??decodeRoutedSwap(result.transaction,token.mint,pool,solUsd);
   if(swap)swaps.push(swap);else unrecognized++;
  }

  const deferred=recent.filter(s=>!s.err&&s.blockTime&&s.blockTime*1000>Date.now()-10000&&!seen.has(s.signature)).map(s=>({signature:s.signature,blockTime:s.blockTime}));
  const unattempted=eligible.slice(attempted).map(s=>({signature:s.signature,blockTime:s.blockTime}));
  const scan={pool,listed:recent.length,parsed,recognized:swaps.length,directRecognized:swaps.filter(s=>s.evidence!=='routed').length,routedRecognized:swaps.filter(s=>s.evidence==='routed').length,unavailable,unrecognized,failures,limited:recent.length>=8||attempted<eligible.length,processedSignatures:processed,pendingSignatures:[...new Map([...retry,...unattempted,...deferred].map(s=>[s.signature,s])).values()].slice(0,10),oldestListedAt:recent.at(-1)?.blockTime?new Date(recent.at(-1).blockTime*1000).toISOString():null};
  const save=await db.rpc('save_traffic_sample',{p_mint:token.mint,p_at:at,p_swaps:swaps,p_scan:scan});if(save.error)throw save.error;
  cycleScans.push(scan);allNew.push(...swaps);
 }

 const merged=new Map<string,RecognizedSwap>();
 for(const row of [...(prior.data??[]),...allNew])merged.set(`${row.signature}:${row.wallet}`,row as RecognizedSwap);
 const cache=await db.from('api_cache').select('payload,updated_at').eq('cache_key',`intelligence:holders:${token.mint}`).maybeSingle();
 const linked=holder?.linkedWallets!=null&&holder?.walletEvidence?new Set(holder.walletEvidence.flatMap(e=>e.wallets)):undefined;
 const activePools=pools.slice(0,Math.max(1,cycleScans.length)).map(p=>p.pairAddress);
 const relevantHistorical=previousScans.filter(s=>activePools.includes(s.pool));
 const summary=summarizeTraffic([...merged.values()],[...cycleScans,...relevantHistorical],at,activePools,{
  holderAt:cache.data?.updated_at,
  wallets:cache.data?.payload?.balances?new Set(cache.data.payload.balances.map((h:any)=>h.wallet)):undefined,
  linkedWallets:linked,
 },(prior.data?.length??0)>=1800);
 const write=await db.from('api_cache').upsert({cache_key:`intelligence:traffic:${token.mint}`,payload:summary,updated_at:at});if(write.error)throw write.error;
 return summary;
}
