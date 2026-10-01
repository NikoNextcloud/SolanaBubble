import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Helius integration is retired.
 * Keep the old endpoint temporarily so an old external webhook cannot mutate
 * the database if it is still enabled in the Helius dashboard.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, retired: true, message: "Helius integration is disabled." },
    { status: 410 },
  );
}
