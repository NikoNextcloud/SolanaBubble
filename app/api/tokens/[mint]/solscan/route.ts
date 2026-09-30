import { NextResponse } from "next/server";
import { fetchSolscanHolders, fetchSolscanTokenMeta } from "@/lib/solscan";
import { getNetworkLive } from "@/lib/runtime-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const live = await getNetworkLive();

  try {
    // Solscan is only queried while live. Both calls use persistent Supabase
    // cache, so repeated token opens normally cost zero additional API calls.
    if (!live) {
      return NextResponse.json({ live: false, paused: true }, {
        headers: { "cache-control": "no-store, max-age=0" },
      });
    }

    const [meta, holders] = await Promise.all([
      fetchSolscanTokenMeta(mint),
      fetchSolscanHolders(mint, 1, 40),
    ]);

    return NextResponse.json({
      live: true,
      meta: meta.data,
      topHolders: holders.data.items,
      holderCount: holders.data.total,
      cached: meta.cached && holders.cached,
    }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Solscan error",
    }, { status: 502 });
  }
}
