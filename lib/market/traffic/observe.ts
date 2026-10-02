import {admin} from '../../db';
import {fetchRecentSignatures,fetchParsedTransactionResult} from '../../solana-public';
import {decodeDirectSwap,type RecognizedSwap} from './decode';
import {summarizeTraffic} from './summary';
import type {Intelligence} from '../signals';
export async function observeTraffic(token:{mint:string;pairAddress?:string|null},solUsd:number|null,holder?:Intelligence,deadline=Date.now()+45000){
 if(!token.pairAddress)throw new Error('No selected pool');
 const db=admin(),at=new Date().toISOString();
 const recent=await fetchRecentSignatures(token.pairAddress,12);
 const since=new Date(Date.now()-2*3600000).toISOString();
 const prior=await db.from('traffic_swaps').select('mint,pool,signature,wallet,side,token_amount,quote_mint,quote_amount,usd_value,block_at,program').eq('mint',token.mint).gte('block_at',since).order('block_at',{ascending:false}).limit(1000);if(prior.error)throw prior.error;
 const scans=await db.from('traffic_scans').select('payload').eq('mint',token.mint).gte('scanned_at',since).order('scanned_at',{ascending:false}).limit(100);if(scans.error)throw scans.error;
 const seen=new Set<string>((scans.data??[]).flatMap(s=>s.payload.processedSignatures??[]));
 const pending=(scans.data??[]).filter(s=>s.payload.pool===token.pairAddress).flatMap(s=>s.payload.pendingSignatures??[]);
 const eligible=[...new Map([...pending,...recent].filter(s=>!s.err&&s.blockTime&&s.blockTime*1000>=Date.now()-3600000&&s.blockTime*1000<=Date.now()-10000&&!seen.has(s.signature)).map(s=>[s.signature,s])).values()].sort((a,b)=>a.blockTime-b.blockTime).slice(0,12);
 const swaps:RecognizedSwap[]=[];const processed:string[]=[];let parsed=0,unavailable=0,unrecognized=0;
 const failures:Record<string,number>={};const retry:any[]=[];let attempted=0;
 for(const s of eligible){
  if(Date.now()>=deadline-16000)break;
  attempted++;const result=await fetchParsedTransactionResult(s.signature);
  if(!result.transaction){unavailable++;const reason=result.failure??'not_found';const key=result.failureCode!=null?`${reason}:${result.failureCode}`:reason;failures[key]=(failures[key]??0)+1;retry.push({signature:s.signature,blockTime:s.blockTime});if(['rate_limited','forbidden','timeout','rpc_error'].includes(reason))break;continue;}
  parsed++;processed.push(s.signature);const swap=decodeDirectSwap(result.transaction,token.mint,token.pairAddress!,solUsd);if(swap)swaps.push(swap);else unrecognized++;
 }
 const deferred=recent.filter(s=>!s.err&&s.blockTime&&s.blockTime*1000>Date.now()-10000&&!seen.has(s.signature)).map(s=>({signature:s.signature,blockTime:s.blockTime}));
 const unattempted=eligible.slice(attempted).map(s=>({signature:s.signature,blockTime:s.blockTime}));
 const scan={pool:token.pairAddress,listed:recent.length,parsed,recognized:swaps.length,unavailable,unrecognized,failures,limited:recent.length===12||attempted<eligible.length,processedSignatures:processed,pendingSignatures:[...new Map([...retry,...unattempted,...deferred].map(s=>[s.signature,s])).values()].slice(0,12),oldestListedAt:recent.at(-1)?.blockTime?new Date(recent.at(-1).blockTime*1000).toISOString():null};
 const save=await db.rpc('save_traffic_sample',{p_mint:token.mint,p_at:at,p_swaps:swaps,p_scan:scan});if(save.error)throw save.error;
 const merged=new Map<string,RecognizedSwap>();for(const row of [...(prior.data??[]),...swaps])merged.set(`${row.signature}:${row.wallet}`,row as RecognizedSwap);
 const cache=await db.from('api_cache').select('payload,updated_at').eq('cache_key',`intelligence:holders:${token.mint}`).maybeSingle();
 const linked=holder?.linkedWallets!=null&&holder?.walletEvidence?new Set(holder.walletEvidence.flatMap(e=>e.wallets)):undefined;
 const summary=summarizeTraffic([...merged.values()],[scan,...(scans.data??[]).filter(s=>s.payload.pool===token.pairAddress).map(s=>s.payload)],at,token.pairAddress,{holderAt:cache.data?.updated_at,wallets:cache.data?.payload?.balances?new Set(cache.data.payload.balances.map((h:any)=>h.wallet)):undefined,linkedWallets:linked},(prior.data?.length??0)>=1000);
 const write=await db.from('api_cache').upsert({cache_key:`intelligence:traffic:${token.mint}`,payload:summary,updated_at:at});if(write.error)throw write.error;return summary;
}
