import { NextResponse } from 'next/server';
import { admin } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const url = new URL(req.url), mint = url.searchParams.get('mint') ?? '';
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return NextResponse.json({error:'Invalid mint'},{status:400});
  const hours = Math.min(168,Math.max(1,Number(url.searchParams.get('hours')) || 24));
  try {
    const { data, error } = await admin().from('market_snapshots').select('observed_at,payload').eq('mint',mint).gte('observed_at',new Date(Date.now()-hours*3600_000).toISOString()).order('observed_at',{ascending:false}).limit(2016);
    if (error) throw error;
    return NextResponse.json({ mint, hours, snapshots:(data ?? []).reverse() },{headers:{'cache-control':'public, max-age=30'}});
  } catch { return NextResponse.json({error:'History unavailable'},{status:503}); }
}
