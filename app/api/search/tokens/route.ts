import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  try {
    const r = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`,
      { headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (!r.ok) throw new Error(`DexScreener search failed: ${r.status}`);
    const j = await r.json() as any;
    const seen = new Set<string>();
    const results = (Array.isArray(j?.pairs) ? j.pairs : [])
      .filter((p: any) => p?.chainId === "solana" && p?.baseToken?.address)
      .sort((a: any, b: any) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))
      .flatMap((p: any) => {
        const mint = String(p.baseToken.address);
        if (seen.has(mint)) return [];
        seen.add(mint);
        return [{
          mint,
          symbol: p.baseToken.symbol ?? null,
          name: p.baseToken.name ?? null,
          priceUsd: Number(p.priceUsd ?? 0),
          liquidityUsd: Number(p.liquidity?.usd ?? 0),
          imageUrl: p.info?.imageUrl ?? null,
        }];
      })
      .slice(0, 8);

    return NextResponse.json({ results }, {
      headers: { "cache-control": "private, max-age=10" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "search_failed",
      results: [],
    }, { status: 502 });
  }
}
