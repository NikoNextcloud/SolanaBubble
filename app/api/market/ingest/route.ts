import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ingestMarket } from '@/lib/market/ingest';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) return NextResponse.json({error:'Unauthorized'},{status:401});
  try { return NextResponse.json(await ingestMarket()); }
  catch { return NextResponse.json({error:'Snapshot ingestion failed; last successful cache retained'},{status:502}); }
}
