import { NextResponse } from "next/server";
import { admin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Holding = {
  token_mint: string;
  wallet: string;
  usd_value: number | string | null;
  first_activity: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = (searchParams.get("mint") || "").trim();

  if (!MINT_RE.test(mint)) {
    return NextResponse.json({ error: "invalid_mint" }, { status: 400 });
  }

  const db = admin();

  const { data: sourceRows, error: sourceError } = await db
    .from("holdings")
    .select("wallet,usd_value,first_activity")
    .eq("token_mint", mint)
    .order("usd_value", { ascending: false })
    .limit(40);

  if (sourceError) {
    return NextResponse.json({ error: sourceError.message }, { status: 500 });
  }

  const source = (sourceRows ?? []) as Array<{
    wallet: string;
    usd_value: number | string | null;
    first_activity: string | null;
  }>;

  const wallets = source.map((row) => row.wallet).filter(Boolean);
  if (!wallets.length) {
    return NextResponse.json({ mint, tokens: [], flows: [], sharedWallets: 0 });
  }

  const { data: relatedRows, error: relatedError } = await db
    .from("holdings")
    .select("token_mint,wallet,usd_value,first_activity")
    .in("wallet", wallets)
    .neq("token_mint", mint)
    .limit(2500);

  if (relatedError) {
    return NextResponse.json({ error: relatedError.message }, { status: 500 });
  }

  const sourceByWallet = new Map(source.map((row) => [row.wallet, row]));
  const stats = new Map<string, {
    wallets: Set<string>;
    overlapUsd: number;
    selectedToOther: number;
    otherToSelected: number;
  }>();

  for (const row of (relatedRows ?? []) as Holding[]) {
    if (!row.token_mint || !row.wallet) continue;
    const base = sourceByWallet.get(row.wallet);
    if (!base) continue;

    const stat = stats.get(row.token_mint) ?? {
      wallets: new Set<string>(),
      overlapUsd: 0,
      selectedToOther: 0,
      otherToSelected: 0,
    };

    stat.wallets.add(row.wallet);
    stat.overlapUsd += Math.min(
      Number(base.usd_value ?? 0),
      Number(row.usd_value ?? 0),
    );

    const a = base.first_activity ? new Date(base.first_activity).getTime() : 0;
    const b = row.first_activity ? new Date(row.first_activity).getTime() : 0;
    if (a && b) {
      if (a < b) stat.selectedToOther++;
      else if (b < a) stat.otherToSelected++;
    }

    stats.set(row.token_mint, stat);
  }

  const ranked = [...stats.entries()]
    .filter(([, stat]) => stat.wallets.size >= 2)
    .sort((a, b) => {
      const av = a[1].wallets.size * 1000 + Math.log10(Math.max(1, a[1].overlapUsd)) * 100;
      const bv = b[1].wallets.size * 1000 + Math.log10(Math.max(1, b[1].overlapUsd)) * 100;
      return bv - av;
    })
    .slice(0, 14);

  const neighborMints = ranked.map(([tokenMint]) => tokenMint);
  if (!neighborMints.length) {
    return NextResponse.json({ mint, tokens: [], flows: [], sharedWallets: wallets.length });
  }

  const { data: tokenRows } = await db
    .from("tokens")
    .select("mint,symbol,name,price_usd,supply")
    .in("mint", neighborMints);

  const tokenMap = new Map((tokenRows ?? []).map((row: any) => [String(row.mint), row]));

  const tokens = ranked.map(([tokenMint]) => {
    const row: any = tokenMap.get(tokenMint);
    return {
      mint: tokenMint,
      symbol: row?.symbol ?? null,
      name: row?.name ?? null,
      priceUsd: Number(row?.price_usd ?? 0),
      marketCap: Number(row?.price_usd ?? 0) * Number(row?.supply ?? 0),
      liquidityUsd: 0,
      volume1h: 0,
      volume24h: 0,
      buys1h: 0,
      sells1h: 0,
      trades1h: 0,
      priceChange1h: 0,
      priceChange24h: 0,
      boost: 0,
      dex: null,
      pairAddress: null,
      quoteMint: null,
      quoteSymbol: null,
      imageUrl: null,
      expanded: true,
    };
  });

  const flows = ranked.map(([tokenMint, stat]) => {
    const forward = stat.selectedToOther >= stat.otherToSelected;
    const directionalVotes = Math.max(stat.selectedToOther, stat.otherToSelected);
    const totalVotes = stat.selectedToOther + stat.otherToSelected;
    const confidence = Math.min(
      0.88,
      0.42 +
        Math.min(0.24, stat.wallets.size * 0.035) +
        (totalVotes ? (directionalVotes / totalVotes) * 0.18 : 0),
    );

    return {
      from: forward ? mint : tokenMint,
      to: forward ? tokenMint : mint,
      usd1h: Math.max(1, stat.overlapUsd),
      trades1h: stat.wallets.size,
      kind: "rotation",
      dex: null,
      source: "wallet-overlap",
      confidence,
      sharedWallets: stat.wallets.size,
    };
  });

  return NextResponse.json({
    mint,
    tokens,
    flows,
    sharedWallets: wallets.length,
    inferred: true,
    fetchedAt: new Date().toISOString(),
  }, {
    headers: { "cache-control": "private, max-age=20, stale-while-revalidate=40" },
  });
}
