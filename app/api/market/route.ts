import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Profile = { tokenAddress?: string; chainId?: string };
type Boost = { tokenAddress?: string; chainId?: string; amount?: number; totalAmount?: number };
type Pair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h1?: number; h6?: number; h24?: number };
  txns?: { h1?: { buys?: number; sells?: number }; h24?: { buys?: number; sells?: number } };
  priceChange?: { h1?: number; h24?: number };
};

const SOL = "So11111111111111111111111111111111111111112";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const [profiles, boosts] = await Promise.all([
    getJson<Profile[]>("https://api.dexscreener.com/token-profiles/latest/v1"),
    getJson<Boost[]>("https://api.dexscreener.com/token-boosts/top/v1"),
  ]);

  const boostMap = new Map<string, number>();
  for (const b of boosts ?? []) {
    if (b.chainId !== "solana" || !b.tokenAddress) continue;
    boostMap.set(b.tokenAddress, Math.max(Number(b.totalAmount ?? b.amount ?? 0), boostMap.get(b.tokenAddress) ?? 0));
  }

  const addresses: string[] = [];
  const push = (a?: string) => {
    if (!a || a === SOL || addresses.includes(a)) return;
    addresses.push(a);
  };
  for (const b of boosts ?? []) if (b.chainId === "solana") push(b.tokenAddress);
  for (const p of profiles ?? []) if (p.chainId === "solana") push(p.tokenAddress);

  const picked = addresses.slice(0, 90);
  const chunks: string[][] = [];
  for (let i = 0; i < picked.length; i += 30) chunks.push(picked.slice(i, i + 30));

  const batch = await Promise.all(chunks.map((chunk) =>
    getJson<Pair[]>(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`)
  ));

  const best = new Map<string, Pair>();
  for (const pairs of batch) {
    for (const p of pairs ?? []) {
      if (p.chainId !== "solana" || !p.baseToken?.address) continue;
      const mint = p.baseToken.address;
      const prev = best.get(mint);
      if (!prev || Number(p.liquidity?.usd ?? 0) > Number(prev.liquidity?.usd ?? 0)) best.set(mint, p);
    }
  }

  const tokens = [...best.entries()].map(([mint, p]) => {
    const buys1h = Number(p.txns?.h1?.buys ?? 0);
    const sells1h = Number(p.txns?.h1?.sells ?? 0);
    return {
      mint,
      name: p.baseToken?.name ?? null,
      symbol: p.baseToken?.symbol ?? null,
      dex: p.dexId ?? null,
      pairAddress: p.pairAddress ?? null,
      quoteMint: p.quoteToken?.address ?? null,
      quoteSymbol: p.quoteToken?.symbol ?? null,
      priceUsd: Number(p.priceUsd ?? 0),
      marketCap: Number(p.marketCap ?? p.fdv ?? 0),
      liquidityUsd: Number(p.liquidity?.usd ?? 0),
      volume1h: Number(p.volume?.h1 ?? 0),
      volume24h: Number(p.volume?.h24 ?? 0),
      buys1h,
      sells1h,
      trades1h: buys1h + sells1h,
      priceChange1h: Number(p.priceChange?.h1 ?? 0),
      priceChange24h: Number(p.priceChange?.h24 ?? 0),
      boost: boostMap.get(mint) ?? 0,
    };
  })
  .filter((t) => t.marketCap > 0 || t.liquidityUsd > 0 || t.volume1h > 0)
  .sort((a, b) => (b.volume1h + b.trades1h * 30 + b.boost * 50) - (a.volume1h + a.trades1h * 30 + a.boost * 50))
  .slice(0, 80);

  const shown = new Set(tokens.map((t) => t.mint));
  const core = new Set([
    SOL,
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYDgHkmPG8TbQnYQ8V4a8Qj",
  ]);

  const flows = tokens.flatMap((t) => {
    if (!t.quoteMint || (!shown.has(t.quoteMint) && !core.has(t.quoteMint))) return [];
    const totalTrades = Math.max(1, t.buys1h + t.sells1h);
    const buyShare = t.buys1h / totalTrades;
    const sellShare = t.sells1h / totalTrades;
    const out = [];
    const buyUsd = t.volume1h * buyShare;
    const sellUsd = t.volume1h * sellShare;
    if (buyUsd > 1) out.push({
      from: t.quoteMint,
      to: t.mint,
      usd1h: buyUsd,
      trades1h: t.buys1h,
      kind: "buy",
      dex: t.dex,
    });
    if (sellUsd > 1) out.push({
      from: t.mint,
      to: t.quoteMint,
      usd1h: sellUsd,
      trades1h: t.sells1h,
      kind: "sell",
      dex: t.dex,
    });
    return out;
  })
  .sort((a, b) => b.usd1h - a.usd1h)
  .slice(0, 140);

  return NextResponse.json(
    { fetchedAt: new Date().toISOString(), tokens, flows },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
