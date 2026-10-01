

type Profile = { tokenAddress?: string; chainId?: string; icon?: string; imageUrl?: string };
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
  info?: { imageUrl?: string };
};

const SOL = "So11111111111111111111111111111111111111112";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

export async function collectMarket(previousPayload: any) {
  const [profiles, boosts] = await Promise.all([
    getJson<Profile[]>("https://api.dexscreener.com/token-profiles/latest/v1"),
    getJson<Boost[]>("https://api.dexscreener.com/token-boosts/top/v1"),
  ]);

  const profileIcon = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.chainId !== "solana" || !p.tokenAddress) continue;
    const icon = p.icon || p.imageUrl;
    if (icon) profileIcon.set(p.tokenAddress, icon);
  }

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

  const tracked = (previousPayload?.tokens ?? []).map((t: any) => String(t.mint));
  const picked = [...new Set([...tracked.slice(0, 70), ...addresses, ...tracked.slice(70)])].slice(0, 100);
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

  if (!best.size) throw new Error("Market sources unavailable; retaining last successful snapshot");

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
      imageUrl: p.info?.imageUrl ?? profileIcon.get(mint) ?? null,
      hypeScore: 0,
      traffic: "flat" as "in" | "out" | "flat",
      netFlowUsd1h: 0,
      activityDelta: 0,
      hypeDelta: 0,
      volumeDelta: 0,
    };
  })
  .filter((t) => t.marketCap > 0 || t.liquidityUsd > 0 || t.volume1h > 0)
  .sort((a, b) => (b.volume1h + b.trades1h * 30 + b.boost * 50) - (a.volume1h + a.trades1h * 30 + a.boost * 50))
  .slice(0, 100);

  for (const t of tokens) {
    // Fixed scales keep Hype comparable when the discovery universe changes.
    const tradeNorm = Math.min(1, Math.log10(t.trades1h + 1) / 4);
    const volumeNorm = Math.min(1, Math.log10(t.volume1h + 1) / 6);
    const boostNorm = Math.min(1, Math.log10(t.boost + 1) / 3);
    const buyRatio = t.trades1h ? t.buys1h / t.trades1h : 0;
    const momentumNorm = Math.max(0, Math.min(1, (t.priceChange1h + 12) / 36));
    t.hypeScore = Math.round((tradeNorm * .30 + buyRatio * .24 + momentumNorm * .22 + boostNorm * .14 + volumeNorm * .10) * 100);
    const imbalance = (t.buys1h - t.sells1h) / Math.max(1, t.trades1h);
    t.traffic = imbalance > .16 ? "in" : imbalance < -.16 ? "out" : "flat";
  }

  const previousTokens = new Map<string, any>();
  for (const t of Array.isArray(previousPayload?.tokens) ? previousPayload.tokens : []) {
    if (t?.mint) previousTokens.set(String(t.mint), t);
  }

  const recentEvents: Array<{
    mint: string;
    symbol: string | null;
    kind: "surge" | "cooldown" | "buy-pressure" | "sell-pressure";
    deltaTrades: number;
    deltaVolume: number;
    hypeDelta: number;
    at: string;
  }> = [];

  for (const t of tokens) {
    const prev = previousTokens.get(t.mint);
    if (!prev) continue;
    const deltaTrades = t.trades1h - Number(prev.trades1h ?? 0);
    const deltaVolume = t.volume1h - Number(prev.volume1h ?? 0);
    const previousHype = Number(prev.hypeScore ?? 0);
    t.activityDelta = deltaTrades;
    t.volumeDelta = deltaVolume;
    t.hypeDelta = t.hypeScore - previousHype;

    if (deltaTrades === 0 && Math.abs(deltaVolume) < 1 && t.hypeDelta === 0) continue;
    const kind =
      deltaTrades > 2 || t.hypeDelta >= 5 ? "surge" :
      deltaTrades < -2 || t.hypeDelta <= -5 ? "cooldown" :
      t.traffic === "in" ? "buy-pressure" : "sell-pressure";

    recentEvents.push({
      mint: t.mint,
      symbol: t.symbol,
      kind,
      deltaTrades,
      deltaVolume,
      hypeDelta: t.hypeDelta,
      at: new Date().toISOString(),
    });
  }

  recentEvents.sort((a, b) =>
    (Math.abs(b.deltaTrades) * 100 + Math.abs(b.hypeDelta) * 10 + Math.abs(b.deltaVolume) / 1000) -
    (Math.abs(a.deltaTrades) * 100 + Math.abs(a.hypeDelta) * 10 + Math.abs(a.deltaVolume) / 1000)
  );

  const shown = new Set(tokens.map((t) => t.mint));
  const core = new Set([
    SOL,
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYDgHkmPG8TbQnYQ8V4a8Qj",
  ]);

  const marketFlows = tokens.flatMap((t) => {
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
      source: "market",
    });
    if (sellUsd > 1) out.push({
      from: t.mint,
      to: t.quoteMint,
      usd1h: sellUsd,
      trades1h: t.sells1h,
      kind: "sell",
      dex: t.dex,
      source: "market",
    });
    return out;
  });

  const byQuote = new Map<string, typeof tokens>();
  for (const t of tokens) {
    if (!t.quoteMint) continue;
    const list = byQuote.get(t.quoteMint) ?? [];
    list.push(t);
    byQuote.set(t.quoteMint, list);
  }

  const rotationFlows: Array<{
    from: string;
    to: string;
    usd1h: number;
    trades1h: number;
    kind: "rotation";
    dex: string | null;
    source: "inferred";
    confidence: number;
  }> = [];

  for (const group of byQuote.values()) {
    const outTokens = group
      .filter((t) => t.sells1h > t.buys1h && t.volume1h > 100)
      .sort((a, b) => (b.sells1h - b.buys1h) - (a.sells1h - a.buys1h))
      .slice(0, 5);
    const inTokens = group
      .filter((t) => t.buys1h > t.sells1h && t.volume1h > 100)
      .sort((a, b) => (b.buys1h - b.sells1h) - (a.buys1h - a.sells1h))
      .slice(0, 5);

    for (const from of outTokens) {
      const sellShare = from.sells1h / Math.max(1, from.trades1h);
      const sellUsd = from.volume1h * sellShare;
      for (const to of inTokens) {
        if (from.mint === to.mint) continue;
        const buyShare = to.buys1h / Math.max(1, to.trades1h);
        const buyUsd = to.volume1h * buyShare;
        const usd1h = Math.min(sellUsd, buyUsd) * 0.30;
        if (usd1h < 150) continue;
        const confidence = Math.min(0.82, 0.42 + Math.min(sellShare, buyShare) * 0.36);
        rotationFlows.push({
          from: from.mint,
          to: to.mint,
          usd1h,
          trades1h: Math.min(from.sells1h, to.buys1h),
          kind: "rotation",
          dex: to.dex,
          source: "inferred",
          confidence,
        });
      }
    }
  }

  const flows = [...marketFlows, ...rotationFlows]
    .sort((a, b) => (b.usd1h * ("confidence" in b ? Number(b.confidence ?? 1) : 1)) - (a.usd1h * ("confidence" in a ? Number(a.confidence ?? 1) : 1)))
    .slice(0, 220);

  const netFlow = new Map<string, number>();
  for (const flow of flows) {
    if (!shown.has(flow.from) || !shown.has(flow.to)) continue;
    netFlow.set(flow.from, (netFlow.get(flow.from) ?? 0) - flow.usd1h);
    netFlow.set(flow.to, (netFlow.get(flow.to) ?? 0) + flow.usd1h);
  }
  for (const token of tokens) token.netFlowUsd1h = netFlow.get(token.mint) ?? 0;

  const hotPath = [...rotationFlows]
    .sort((a, b) => (b.usd1h * b.confidence) - (a.usd1h * a.confidence))
    .slice(0, 6)
    .map((f) => ({
      from: f.from,
      to: f.to,
      score: Math.round(f.usd1h * f.confidence),
      confidence: f.confidence,
    }));

  const observedTrades1h = tokens.reduce((sum, t) => sum + t.trades1h, 0);

  const payload = {
    fetchedAt: new Date().toISOString(),
    tokens,
    flows,
    hotPath,
    recentEvents: recentEvents.slice(0, 12),
    network: {
      swaps1h: observedTrades1h,
      source: "dexscreener",
    },
    live: true,
  };

  return payload;
}
