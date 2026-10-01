import { NextResponse } from "next/server";
import { getNetworkLive, setNetworkLive } from "@/lib/runtime-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ live: await getNetworkLive() }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { live?: boolean; source?: "free" | "solscan" } | null;
  if (typeof body?.live !== "boolean") {
    return NextResponse.json({ error: "invalid_live_state" }, { status: 400 });
  }

    return NextResponse.json({
    live: body.live,
    source: body.source ?? "free",
    mode: "local-control",
  }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
