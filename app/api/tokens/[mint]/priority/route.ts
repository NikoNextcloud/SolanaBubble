import {NextResponse} from 'next/server';
import {admin} from '@/lib/db';
import {validMint} from '@/lib/watchlist';
export async function POST(_req:Request,{params}:{params:Promise<{mint:string}>}){
 const {mint}=await params;if(!validMint(mint))return NextResponse.json({error:'invalid_mint'},{status:400});
 try{const r=await admin().rpc('request_holder_priority',{p_mint:mint});if(r.error)throw r.error;return NextResponse.json({queued:r.data===true,note:'Bounded background priority; not an immediate refresh or freshness guarantee'},{headers:{'cache-control':'no-store'}});}
 catch{return NextResponse.json({error:'Background priority unavailable'},{status:503});}
}
