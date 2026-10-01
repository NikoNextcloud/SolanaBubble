import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { fetchDexScreenerToken } from "@/lib/solana-public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  if (!RE.test(mint)) return NextResponse.json({ error: "invalid_mint" }, { status: 400 });

  const market = await fetchDexScreenerToken(mint);
  const priceUsd = Number(market.priceUsd ?? 0);
  if (priceUsd > 0) {
    const db = admin();
    await db.from("tokens").update({ price_usd: priceUsd }).eq("mint", mint);
  }

  return NextResponse.json({ mint, priceUsd, source: "dexscreener" }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
