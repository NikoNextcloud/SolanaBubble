import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { bootstrapToken } from "@/lib/bootstrap";

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

  const { count: holdingCount, error: holdingCountError } = await db
    .from("holdings")
    .select("*", { count: "exact", head: true })
    .eq("token_mint", mint);

  if (holdingCountError) {
    return NextResponse.json({ error: holdingCountError.message }, { status: 500 });
  }

  const needsBootstrap = !existing || !existing.bootstrapped_at || Number(holdingCount ?? 0) === 0;

  if (needsBootstrap) {
    const result = await bootstrapToken(mint);
    holders = result.holders;
    bootstrapped = true;
  } else {
    holders = holdingCount ?? 0;

  }

  return NextResponse.json({
    mint,
    tracked: true,
    bootstrapped,
    holders,
    source: "public-rpc+dexscreener",
  });
}
