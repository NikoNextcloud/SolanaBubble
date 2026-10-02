import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(process.env.ALLOW_VERCEL_INGEST!=='true') return NextResponse.json({error:'Ingestion runs on the Supabase worker; Vercel ingestion disabled to conserve CPU'},{status:409});
  try { const {ingestMarket}=await import('@/lib/market/ingest'); return NextResponse.json(await ingestMarket()); }
  catch { return NextResponse.json({error:'Snapshot ingestion failed; last successful cache retained'},{status:502}); }
}
