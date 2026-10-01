import { NextResponse, after } from 'next/server';
import { admin } from '@/lib/db';
import { ingestMarket } from '@/lib/market/ingest';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function GET() {
  try {
    const { data, error } = await admin().from('api_cache').select('payload,updated_at').eq('cache_key','market:snapshot').maybeSingle();
    if (error) throw error;
    const age = data ? Date.now()-Date.parse(data.updated_at) : Infinity;
    // Recovery path only: respond immediately, then warm cache server-side.
    if (age > 5 * 60_000) after(async () => { try { await ingestMarket(); } catch (e) { console.error('Market ingestion failed', e instanceof Error ? e.message : 'database/upstream error'); } });
    if (!data) return NextResponse.json({ tokens: [], flows: [], alerts: [], recentEvents: [], live: false, stale: true, warming: true, error: 'Snapshot worker is warming the cache' }, { status: 202, headers: { 'cache-control':'no-store' } });
    return NextResponse.json({ ...data.payload, cached: true, live: age < 10 * 60_000, stale: age >= 10 * 60_000, ageSeconds: Math.round(age/1000) }, { headers:{'cache-control':'no-store'} });
  } catch {
    return NextResponse.json({ error: 'Market cache unavailable' }, { status:503 });
  }
}
