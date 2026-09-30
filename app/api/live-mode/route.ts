import { NextResponse } from "next/server";
import { getNetworkLive, setNetworkLive } from "@/lib/runtime-state";
import { setNetworkStreaming } from "@/lib/helius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ live: await getNetworkLive() }, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { live?: boolean } | null;
  if (typeof body?.live !== "boolean") {
    return NextResponse.json({ error: "invalid_live_state" }, { status: 400 });
  }

  try {
    const helius = await setNetworkStreaming(body.live);
    await setNetworkLive(body.live);
    return NextResponse.json({ live: body.live, helius });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Неуспешна промяна на live режима.",
    }, { status: 500 });
  }
}
