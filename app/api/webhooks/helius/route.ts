import { NextResponse } from "next/server";
import { ingestTx } from "@/lib/ingest";
import { ingestNetworkSwap } from "@/lib/network-flow";
export const runtime = "nodejs";
export const maxDuration = 60;

// Helius Enhanced Webhook: server-side ingestion, без browser polling.
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== process.env.HELIUS_WEBHOOK_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  for (const tx of Array.isArray(body) ? body : [body]) {
    await ingestNetworkSwap(tx);
    await ingestTx(tx);
  }
  return NextResponse.json({ ok: true });
}
