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
  const body = await req.json().catch(() => null) as { live?: boolean; source?: "helius" | "solscan" } | null;
  if (typeof body?.live !== "boolean") {
    return NextResponse.json({ error: "invalid_live_state" }, { status: 400 });
  }

  // Solscan mode is pull-based. Toggling it must never touch Helius,
  // which avoids wasting webhook-management calls and prevents 429 loops.
  if (body.source === "solscan") {
    return NextResponse.json({ live: body.live, source: "solscan" });
  }

  try {
    const helius = await setNetworkStreaming(body.live);
    await setNetworkLive(body.live);
    return NextResponse.json({ live: body.live, source: "helius", helius });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неуспешна промяна на live режима.";
    const rateLimited = message.includes("429");
    return NextResponse.json({
      live: body.live,
      source: "helius",
      degraded: rateLimited,
      warning: rateLimited
        ? "Helius временно ограничи заявките. Интерфейсът ще продължи с кеширани данни."
        : message,
    }, { status: rateLimited ? 200 : 500 });
  }
}
