import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { fetchSolscanUsage } from "@/lib/solscan";
import { getRpcHealth } from "@/lib/solana-public";

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

  const [solscan, rpcHealth, tokens, dbSize] = await Promise.all([
    fetchSolscanUsage().catch((error) => ({ error: error instanceof Error ? error.message : "Solscan usage error" } as any)),
    getRpcHealth(),
    db.from("tokens").select("mint", { count: "exact", head: true }),
    db.rpc("database_size_bytes"),
  ]);

  const databaseBytes = Number(dbSize.data ?? 0);
  const freeDatabaseLimitBytes = 500 * 1024 * 1024;
  const databaseRemainingBytes = Math.max(0, freeDatabaseLimitBytes - databaseBytes);

  return NextResponse.json({
    supabase: {
      plan: "FREE",
      tier: "tier_free",
      projectRef: "behssggsfiydcdvhkled",
      status: "ACTIVE_HEALTHY",
      databaseBytes,
      databaseLimitBytes: freeDatabaseLimitBytes,
      databaseRemainingBytes,
      databaseUsedPercent: freeDatabaseLimitBytes > 0 ? (databaseBytes / freeDatabaseLimitBytes) * 100 : 0,
    },
    solscan: "data" in solscan ? solscan.data : null,
    solscanCached: "cached" in solscan ? solscan.cached : false,
    solscanError: "error" in solscan ? solscan.error : null,
    publicRpc: {
      healthy: rpcHealth.ok,
      status: rpcHealth.result,
      trackedTokens: tokens.count ?? 0,
      note: "Solana Public RPC е безплатен, но е rate-limited. DexScreener се използва за market данни.",
    },
  }, { headers: { "cache-control": "no-store, max-age=0" } });
}
