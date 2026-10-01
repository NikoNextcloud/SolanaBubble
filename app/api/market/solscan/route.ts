import { NextResponse } from "next/server";
import { fetchSolscanTokenList } from "@/lib/solscan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await fetchSolscanTokenList();
    const tokens = (result.data ?? []).map((t: any) => ({
      mint: t.address ?? t.tokenAddress ?? "",
      name: t.name ?? null,
      symbol: t.symbol ?? null,
      dex: "SOLSCAN",
      pairAddress: null,
      quoteMint: null,
      quoteSymbol: null,
      priceUsd: Number(t.price ?? 0),
      marketCap: Number(t.market_cap ?? t.marketCap ?? 0),
      liquidityUsd: 0,
      volume1h: 0,
      volume24h: Number(t.volume_24h ?? t.volume ?? 0),
      buys1h: 0,
      sells1h: 0,
      trades1h: 0,
      priceChange1h: 0,
      priceChange24h: Number(t.price_change_24h ?? 0),
      boost: 0,
      imageUrl: t.icon ?? null,
    })).filter((t: any) => t.mint);

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      source: "solscan",
      cached: result.cached,
      tokens,
      flows: [],
      network: { swaps1h: 0, source: "solscan" },
    }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Solscan market error";
    const planRestricted = /upgrade your api key level|unauthorized/i.test(message);

    return NextResponse.json({
      error: message,
      planRestricted,
      fallback: planRestricted ? "rpc+dexscreener" : null,
      message: planRestricted
        ? "Solscan Level 1 не разрешава този Token API endpoint. Използвай Free mode (Solana RPC + DexScreener) или по-висок Solscan API plan."
        : "Solscan временно не е достъпен.",
      tokens: [],
      flows: [],
    }, { status: planRestricted ? 403 : 502 });
  }
}
