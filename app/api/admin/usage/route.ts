import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { getRpcHealth } from "@/lib/solana-public";
import {rpcProviderReadiness} from "@/lib/rpc-readiness";

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
  const rpcReadiness=rpcProviderReadiness();

  const since2h = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const [rpcHealth, tokens, dbSize, workerStatus, bootstraps, directTraffic, routedTraffic, syncRows, snapshots, liveEvents, clientErrors] = await Promise.all([
    getRpcHealth(),
    db.from("tokens").select("mint", { count: "exact", head: true }),
    db.rpc("database_size_bytes"),
    db.from("api_cache").select("payload,updated_at").eq("cache_key", "worker:status").maybeSingle(),
    db.from("token_bootstrap_leases").select("mint,lease_until", { count: "exact" }).gt("lease_until", new Date().toISOString()),
    db.from("traffic_swaps").select("signature", { count: "exact", head: true }).eq("evidence", "direct").gte("block_at", since2h),
    db.from("traffic_swaps").select("signature", { count: "exact", head: true }).eq("evidence", "routed").gte("block_at", since2h),
    db.from("watchlist_sync").select("sync_hash", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
    db.from("market_snapshots").select("id", { count: "exact", head: true }),
    db.from("live_market_events").select("block_at,side,evidence").gte("block_at", new Date(Date.now()-20*60_000).toISOString()).order("block_at",{ascending:false}).limit(500),
    db.from("client_error_events").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now()-60*60_000).toISOString()),
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
      note: "Solana RPC failover + DexScreener market data.",
      providerMode: rpcReadiness.mode,
      readiness: rpcReadiness,
      fullFirehose: rpcReadiness.fullFirehose,
    },
    health: {
      worker: workerStatus.data?.payload ?? null,
      workerUpdatedAt: workerStatus.data?.updated_at ?? null,
      activeBootstraps: bootstraps.count ?? 0,
      directTraffic2h: directTraffic.count ?? 0,
      routedTraffic2h: routedTraffic.count ?? 0,
      syncedWatchlists: syncRows.count ?? 0,
      marketSnapshots: snapshots.count ?? 0,
      liveEvents20m: liveEvents.data?.length ?? 0,
      liveBuys20m: (liveEvents.data??[]).filter((row:any)=>row.side==="buy").length,
      liveSells20m: (liveEvents.data??[]).filter((row:any)=>row.side==="sell").length,
      liveDirect20m: (liveEvents.data??[]).filter((row:any)=>row.evidence==="direct").length,
      liveLatestAt: liveEvents.data?.[0]?.block_at ?? null,
      heliusWebhookConfigured: Boolean(process.env.HELIUS_WEBHOOK_SECRET),
      clientErrors1h: clientErrors.count ?? 0,
      runtime: {
        environment: process.env.VERCEL_ENV ?? "local",
        gitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
        region: process.env.VERCEL_REGION ?? null,
        node: process.version,
      },
    },
  }, { headers: { "cache-control": "no-store, max-age=0" } });
}
