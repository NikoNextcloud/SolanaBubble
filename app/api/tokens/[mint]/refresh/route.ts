import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { fetchDexScreenerToken, fetchPublicHolders, fetchPublicSupply } from "@/lib/solana-public";
import { analyzeHolderRelations } from "@/lib/relation-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const db = admin();

  try {
    const [{ supply, decimals }, market, holders] = await Promise.all([
      fetchPublicSupply(mint),
      fetchDexScreenerToken(mint).catch(() => ({
        priceUsd: 0,
        name: null,
        symbol: null,
        marketCap: 0,
        liquidityUsd: 0,
        volume24h: 0,
      })),
      fetchPublicHolders(mint, 45_000),
    ]);

    const price = Number(market.priceUsd ?? 0);

    const { data: previous } = await db
      .from("holdings")
      .select("wallet,balance,cluster_id,funder,first_activity,last_activity,bought_usd,sold_usd")
      .eq("token_mint", mint);

    const prevMap = new Map((previous ?? []).map((row: any) => [row.wallet, row]));
    const now = new Date().toISOString();
    const currentWallets = new Set<string>();

    const rows = holders.map((h) => {
      const wallet = h.wallet;
      currentWallets.add(wallet);
      const balance = Number(h.raw) / 10 ** decimals;
      const prev: any = prevMap.get(wallet);
      return {
        token_mint: mint,
        wallet,
        balance,
        usd_value: balance * price,
        pct_supply: supply ? (balance / supply) * 100 : 0,
        cluster_id: prev?.cluster_id ?? null,
        funder: prev?.funder ?? null,
        first_activity: prev?.first_activity ?? now,
        last_activity: prev?.balance !== balance ? now : (prev?.last_activity ?? now),
        bought_usd: Number(prev?.bought_usd ?? 0),
        sold_usd: Number(prev?.sold_usd ?? 0),
      };
    });

    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await db.from("holdings").upsert(rows.slice(i, i + 400));
      if (error) throw error;
    }

    const exited = (previous ?? []).filter((row: any) => !currentWallets.has(row.wallet));
    for (const row of exited) {
      await db.from("exited_holders").insert({
        token_mint: mint,
        wallet: row.wallet,
        bought_usd: Number(row.bought_usd ?? 0),
        sold_usd: Number(row.sold_usd ?? 0),
        first_activity: row.first_activity ?? now,
        last_activity: now,
        exited_at: now,
        last_signature: null,
        exit_side: "rpc_refresh",
        funder: row.funder ?? null,
        cluster_id: row.cluster_id ?? null,
      });
      await db.from("holdings").delete().eq("token_mint", mint).eq("wallet", row.wallet);
    }

    await db.from("tokens").upsert({
      mint,
      supply,
      decimals,
      price_usd: price,
      symbol: market.symbol ?? null,
      name: market.name ?? null,
      metadata_updated_at: now,
    });

    const relationAnalysis = await analyzeHolderRelations(mint, rows, {
      maxWallets: 24,
      cacheMs: 5 * 60 * 1000,
    }).catch((error) => ({
      cached: false,
      analyzed: 0,
      links: 0,
      transfers: 0,
      error: error instanceof Error ? error.message : "relation_analysis_failed",
    }));

    return NextResponse.json({
      ok: true,
      holders: rows.length,
      exited: exited.length,
      priceUsd: price,
      refreshedAt: now,
      source: "solana-public-rpc+dexscreener",
      relationAnalysis,
    }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Refresh failed",
    }, { status: 502 });
  }
}
