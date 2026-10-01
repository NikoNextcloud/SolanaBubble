import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { bootstrapToken } from "@/lib/bootstrap";
import { fetchSolscanTokenMeta } from "@/lib/solscan";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as null | { mint?: string };
  const mint = body?.mint?.trim() || "";
  if (!MINT_RE.test(mint)) {
    return NextResponse.json({ error: "Невалиден Solana mint адрес." }, { status: 400 });
  }

  const db = admin();
  const { data: existing, error: lookupError } = await db
    .from("tokens")
    .select("mint,bootstrapped_at,metadata_updated_at")
    .eq("mint", mint)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  let bootstrapped = false;
  let holders: number | null = null;

  if (!existing) {
    const result = await bootstrapToken(mint);
    holders = result.holders;
    bootstrapped = true;
  } else {
    const stale = !existing.metadata_updated_at ||
      Date.now() - new Date(existing.metadata_updated_at).getTime() > 30 * 60 * 1000;
    if (stale) {
      const solscan = await fetchSolscanTokenMeta(mint).catch(() => null);
      const meta = solscan?.data;
      if (meta) {
        await db.from("tokens").update({
          symbol: meta.symbol ?? null,
          name: meta.name ?? null,
          icon: meta.icon ?? null,
          creator: meta.creator ?? null,
          solscan_holder_count: meta.holder ?? null,
          price_usd: Number(meta.price ?? 0) || undefined,
          metadata_updated_at: new Date().toISOString(),
        }).eq("mint", mint);
      }
    }
  }



  return NextResponse.json({
    mint,
    tracked: true,
    bootstrapped,
    holders,
    source: "public-rpc+dexscreener",
  });
}
