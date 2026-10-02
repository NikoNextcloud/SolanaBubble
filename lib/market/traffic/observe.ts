import {admin} from '../../db';
import {fetchRecentSignatures,fetchParsedTransaction} from '../../solana-public';
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
 const eligible=recent.filter(s=>!s.err&&s.blockTime&&s.blockTime*1000>=Date.now()-3600000&&!seen.has(s.signature));
 const swaps:RecognizedSwap[]=[];const processed:string[]=[];let parsed=0,unavailable=0,unrecognized=0;
 for(let i=0;i<eligible.length&&Date.now()<deadline-15000;i+=3){
  const batch=eligible.slice(i,i+3);await Promise.all(batch.map(async s=>{const tx=await fetchParsedTransaction(s.signature);if(!tx){unavailable++;return;}parsed++;processed.push(s.signature);const swap=decodeDirectSwap(tx,token.mint,token.pairAddress!,solUsd);if(swap)swaps.push(swap);else unrecognized++;}));
 }
 const scan={pool:token.pairAddress,listed:recent.length,parsed,recognized:swaps.length,unavailable,unrecognized,limited:recent.length===12||eligible.length>processed.length,processedSignatures:processed,oldestListedAt:recent.at(-1)?.blockTime?new Date(recent.at(-1).blockTime*1000).toISOString():null};
 const save=await db.rpc('save_traffic_sample',{p_mint:token.mint,p_at:at,p_swaps:swaps,p_scan:scan});if(save.error)throw save.error;
 const merged=new Map<string,RecognizedSwap>();for(const row of [...(prior.data??[]),...swaps])merged.set(`${row.signature}:${row.wallet}`,row as RecognizedSwap);
 const cache=await db.from('api_cache').select('payload,updated_at').eq('cache_key',`intelligence:holders:${token.mint}`).maybeSingle();
 const linked=holder?.walletEvidence?new Set(holder.walletEvidence.flatMap(e=>e.wallets)):undefined;
 const summary=summarizeTraffic([...merged.values()],[scan,...(scans.data??[]).filter(s=>s.payload.pool===token.pairAddress).map(s=>s.payload)],at,token.pairAddress,{holderAt:cache.data?.updated_at,wallets:cache.data?.payload?.balances?new Set(cache.data.payload.balances.map((h:any)=>h.wallet)):undefined,linkedWallets:linked},(prior.data?.length??0)>=1000);
 const write=await db.from('api_cache').upsert({cache_key:`intelligence:traffic:${token.mint}`,payload:summary,updated_at:at});if(write.error)throw write.error;return summary;
}
