import { NextResponse } from 'next/server';
import { admin } from '@/lib/db';
import {publicObservationHeaders} from '@/lib/http-cache';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET() {
  try {
    const { data, error } = await admin().from('api_cache').select('payload,updated_at').eq('cache_key','market:snapshot').maybeSingle();
    if (error) throw error;
    const age = data ? Date.now()-Date.parse(data.updated_at) : Infinity;
    if (!data) return NextResponse.json({ tokens: [], flows: [], alerts: [], recentEvents: [], live: false, stale: true, warming: true, error: 'Snapshot worker is warming the cache' }, { status: 202, headers: { 'cache-control':'no-store' } });
    return NextResponse.json({ ...data.payload, cached: true, live: age < 10 * 60_000, stale: age >= 10 * 60_000, ageSeconds: Math.round(age/1000) }, { headers:publicObservationHeaders() });
  } catch {
    return NextResponse.json({ error: 'Market cache unavailable' }, { status:503 });
  }
}
