import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { admin } from "@/lib/db";
import { normalizeWatchState } from "@/lib/watchlist";
import { normalizeSmartWatchState } from "@/lib/watchlist-smart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_RE = /^[a-f0-9]{64}$/;
const headers = { "cache-control": "private, no-store" };

function hashKey(req: Request) {
  const key = (req.headers.get("x-solanabubble-sync-key") || "").trim().toLowerCase();
  if (!KEY_RE.test(key)) return null;
  return createHash("sha256").update(key).digest("hex");
}

export async function GET(req: Request) {
  const syncHash = hashKey(req);
  if (!syncHash) return NextResponse.json({ error: "invalid_sync_key" }, { status: 401, headers });

  try {
    const db = admin();
    const { data, error } = await db
      .from("watchlist_sync")
      .select("payload,updated_at,expires_at")
      .eq("sync_hash", syncHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ found: false }, { status: 404, headers });
    return NextResponse.json({
      found: true,
      state: { ...normalizeWatchState(data.payload), ...normalizeSmartWatchState(data.payload) },
      updatedAt: data.updated_at,
    }, { headers });
  } catch {
    return NextResponse.json({ error: "watchlist_sync_unavailable" }, { status: 503, headers });
  }
}

export async function PUT(req: Request) {
  const syncHash = hashKey(req);
  if (!syncHash) return NextResponse.json({ error: "invalid_sync_key" }, { status: 401, headers });

  const body = await req.json().catch(() => null);
  if (!body || JSON.stringify(body).length > 64_000) {
    return NextResponse.json({ error: "invalid_watchlist_state" }, { status: 400, headers });
  }

  const state = { ...normalizeWatchState(body), ...normalizeSmartWatchState(body) };
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60_000);
  try {
    const db = admin();
    const { error } = await db.from("watchlist_sync").upsert({
      sync_hash: syncHash,
      payload: state,
      updated_at: now.toISOString(),
      expires_at: expires.toISOString(),
    });
    if (error) throw error;
    // Opportunistic cleanup keeps abandoned anonymous sync rows from accumulating forever.
    await db.from("watchlist_sync").delete().lt("expires_at", now.toISOString());
    return NextResponse.json({ ok: true, updatedAt: now.toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: "watchlist_sync_unavailable" }, { status: 503, headers });
  }
}
