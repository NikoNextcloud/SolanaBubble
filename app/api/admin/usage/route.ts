import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
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

  const [rpcHealth, tokens, dbSize] = await Promise.all([
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
    publicRpc: {
      healthy: rpcHealth.ok,
      status: rpcHealth.result,
      trackedTokens: tokens.count ?? 0,
      note: "Solana Public RPC е rate-limited. DexScreener се използва за market данни.",
    },
  }, { headers: { "cache-control": "no-store, max-age=0" } });
}
