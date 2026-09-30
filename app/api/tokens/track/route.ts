import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { bootstrapToken } from "@/lib/bootstrap";
import { ensureWebhookTracksMint } from "@/lib/helius";

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
    .select("mint,bootstrapped_at")
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
  }

  let webhook: { added: boolean; addresses: number } | null = null;
  let webhookWarning: string | null = null;
  try {
    const result = await ensureWebhookTracksMint(mint);
    webhook = { added: result.added, addresses: result.addresses };
  } catch (error) {
    webhookWarning = error instanceof Error ? error.message : "Неуспешно live следене.";
  }

  return NextResponse.json({
    mint,
    tracked: true,
    bootstrapped,
    holders,
    webhook,
    webhookWarning,
  });
}
