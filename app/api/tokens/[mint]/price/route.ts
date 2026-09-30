import { NextResponse } from "next/server";
import { fetchPriceUsd } from "@/lib/helius";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const price = await fetchPriceUsd(mint);
  return NextResponse.json(
    { mint, priceUsd: price, fetchedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
