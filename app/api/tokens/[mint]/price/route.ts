import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {validMint} from '@/lib/watchlist';
import {publicObservationHeaders} from '@/lib/http-cache';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{mint:string}>}){
 const {mint}=await params;if(!validMint(mint))return NextResponse.json({error:'invalid_mint'},{status:400});
 try{const db=admin(),r=await db.from('api_cache').select('payload,updated_at').eq('cache_key','market:snapshot').maybeSingle();if(r.error)throw r.error;
 const t=r.data?.payload?.tokens?.find((t:any)=>t.mint===mint);if(t)return NextResponse.json({mint,priceUsd:t.priceUsd,observedAt:r.data?.payload?.fetchedAt??r.data?.updated_at,source:'cached-dexscreener'}, {headers:publicObservationHeaders()});
 const fallback=await db.from('tokens').select('price_usd,metadata_updated_at').eq('mint',mint).maybeSingle();if(fallback.error)throw fallback.error;
 return NextResponse.json({mint,priceUsd:fallback.data?.price_usd??null,observedAt:fallback.data?.metadata_updated_at??null,source:'cached-token'}, {headers:publicObservationHeaders()});
 }catch{return NextResponse.json({error:'Cached price unavailable'},{status:503});}
}
