import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {validMint} from '@/lib/watchlist';
export const dynamic='force-dynamic';
export async function GET(req:Request){
  const mints=[...new Set((new URL(req.url).searchParams.get('mints')??'').split(',').filter(Boolean))];
  if(mints.length>50||mints.some(m=>!validMint(m)))return NextResponse.json({error:'Use up to 50 valid mints'},{status:400});
  if(!mints.length)return NextResponse.json({tokens:[]});
  try {
    const db=admin();const cache=await db.from('api_cache').select('payload,updated_at').eq('cache_key','market:snapshot').maybeSingle();if(cache.error)throw cache.error;
    const tokens:any[]=[];const missing:string[]=[];
    for(const mint of mints){const t=cache.data?.payload?.tokens?.find((t:any)=>t.mint===mint);if(t)tokens.push({...t,marketObservedAt:cache.data?.payload?.fetchedAt??cache.data?.updated_at});else missing.push(mint);}
    for(let i=0;i<missing.length;i+=5)await Promise.all(missing.slice(i,i+5).map(async mint=>{const r=await db.from('market_snapshots').select('payload,observed_at').eq('mint',mint).order('observed_at',{ascending:false}).limit(1);if(r.error)throw r.error;if(r.data?.[0])tokens.push({...r.data[0].payload,marketObservedAt:r.data[0].observed_at});}));
    return NextResponse.json({tokens,missing:mints.filter(m=>!tokens.some(t=>t.mint===m))},{headers:{'cache-control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Watchlist observations unavailable'},{status:503});}
}
