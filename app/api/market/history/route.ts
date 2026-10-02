import { NextResponse } from 'next/server';
import { admin } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const url = new URL(req.url), mint = url.searchParams.get('mint') ?? '';
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return NextResponse.json({error:'Invalid mint'},{status:400});
  const hours = Math.min(168,Math.max(1,Number(url.searchParams.get('hours')) || 24));
  try {
    const db=admin();
    const snapshots:{observed_at:string;payload:unknown}[]=[];
    const since=new Date(Date.now()-hours*3600_000).toISOString();
    // Respect Supabase's default 1,000-row response cap while retaining 7d.
    for(let offset=0;offset<2016;offset+=1000) {
      const size=Math.min(1000,2016-offset);
      const {data,error}=await db.from('market_snapshots').select('observed_at,payload').eq('mint',mint).gte('observed_at',since).order('observed_at',{ascending:false}).range(offset,offset+size-1);
      if(error) throw error;
      snapshots.push(...(data ?? []));
      if((data?.length ?? 0)<size) break;
    }
    return NextResponse.json({ mint, hours, snapshots:snapshots.reverse() },{headers:{'cache-control':'public, max-age=30'}});
  } catch { return NextResponse.json({error:'History unavailable'},{status:503}); }
}
