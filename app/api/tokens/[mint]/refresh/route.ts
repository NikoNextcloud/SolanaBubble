import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {validMint} from '@/lib/watchlist';
import {publicObservationHeaders} from '@/lib/http-cache';
export const dynamic='force-dynamic';
/** Read-only holder observation overlay; never deletes or mutates core holdings. */
export async function GET(_req:Request,{params}:{params:Promise<{mint:string}>}){
 const {mint}=await params;if(!validMint(mint))return NextResponse.json({error:'invalid_mint'},{status:400});
 try{
  const db=admin();const [token,holders]=await Promise.all([db.from('tokens').select('price_usd').eq('mint',mint).maybeSingle(),db.from('api_cache').select('payload,updated_at').eq('cache_key',`intelligence:holders:${mint}`).maybeSingle()]);if(token.error||holders.error)throw token.error??holders.error;
  const payload=holders.data?.payload,at=holders.data?.updated_at;
  const fresh=at&&Date.now()-Date.parse(at)>=0&&Date.now()-Date.parse(at)<3600000;
  const balances=fresh&&payload?.supply>0&&Array.isArray(payload.balances)?payload.balances.slice().sort((a:any,b:any)=>b.balance-a.balance).slice(0,500):[];
  return NextResponse.json({ok:true,cached:true,priceUsd:payload?.price??token.data?.price_usd??null,supply:payload?.supply??null,decimals:payload?.decimals??null,balances,holders:payload?.metrics?.holderCount??null,refreshedAt:at??null,pending:!holders.data,stale:!fresh,source:'supabase-background-worker'}, {headers:publicObservationHeaders(300)});
 }catch{return NextResponse.json({error:'Holder observation unavailable'},{status:503,headers:{'cache-control':'no-store'}});}
}
export const POST=GET;
