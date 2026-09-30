import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { fetchSolscanUsage } from "@/lib/solscan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const expected = process.env.ADMIN_SECRET;
  const got = req.headers.get("x-admin-secret");
  return Boolean(expected && got && got === expected);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = admin();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [solscan, swaps24h, tokens] = await Promise.all([
    fetchSolscanUsage().catch((error) => ({ error: error instanceof Error ? error.message : "Solscan usage error" } as any)),
    db.from("network_swaps").select("signature", { count: "exact", head: true }).gte("block_time", since24h),
    db.from("tokens").select("mint", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    solscan: "data" in solscan ? solscan.data : null,
    solscanCached: "cached" in solscan ? solscan.cached : false,
    solscanError: "error" in solscan ? solscan.error : null,
    helius: {
      exactRemainingAvailable: false,
      note: "Helius не предоставя използвания/оставащия месечен кредит през публичен usage endpoint, затова не показваме измислена стойност.",
      observedSwaps24h: swaps24h.count ?? 0,
      trackedTokens: tokens.count ?? 0,
    },
  }, { headers: { "cache-control": "no-store, max-age=0" } });
}
