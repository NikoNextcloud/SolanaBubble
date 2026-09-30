import { NextResponse } from "next/server";
import { admin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLES = ["tokens", "holdings", "exited_holders", "transactions", "wallet_links", "wallet_edges", "network_swaps"] as const;
type Table = (typeof TABLES)[number];

function authorized(req: Request) {
  const expected = process.env.ADMIN_SECRET;
  const got = req.headers.get("x-admin-secret");
  return Boolean(expected && got && got === expected);
}

function isTable(value: string | null): value is Table {
  return Boolean(value && TABLES.includes(value as Table));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const table = url.searchParams.get("table");
  const mint = url.searchParams.get("mint")?.trim() || "";
  const limit = Math.max(1, Math.min(250, Number(url.searchParams.get("limit") || 100)));

  if (!isTable(table)) return NextResponse.json({ error: "invalid_table" }, { status: 400 });

  const db = admin();
  let query: any = db.from(table).select("*", { count: "exact" }).limit(limit);

  if (mint) query = table === "tokens" ? query.eq("mint", mint) : query.eq("token_mint", mint);
  if (table === "transactions" || table === "network_swaps") query = query.order("block_time", { ascending: false });
  if (table === "exited_holders") query = query.order("exited_at", { ascending: false });
  if (table === "wallet_links" || table === "wallet_edges") query = query.order("last_seen", { ascending: false });
  if (table === "holdings") query = query.order("balance", { ascending: false });
  if (table === "tokens") query = query.order("created_at", { ascending: false });

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table, count: count ?? data?.length ?? 0, rows: data ?? [] });
}

export async function DELETE(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as null | {
    table?: string;
    filters?: Record<string, string | number | null>;
    deleteTokenData?: string;
  };
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const db = admin();

  if (body.deleteTokenData) {
    const mint = String(body.deleteTokenData).trim();
    if (!mint) return NextResponse.json({ error: "missing_mint" }, { status: 400 });
    const { error } = await db.from("tokens").delete().eq("mint", mint);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!isTable(body.table ?? null)) return NextResponse.json({ error: "invalid_table" }, { status: 400 });

  const allowed: Record<Table, string[]> = {
    tokens: ["mint"],
    holdings: ["token_mint", "wallet"],
    exited_holders: ["id", "token_mint", "wallet"],
    transactions: ["signature", "wallet", "token_mint"],
    wallet_links: ["token_mint", "wallet_a", "wallet_b", "kind"],
    wallet_edges: ["token_mint", "from_wallet", "to_wallet", "kind"],
    network_swaps: ["signature"],
  };

  const filters = body.filters ?? {};
  const keys = Object.keys(filters);
  if (!keys.length || keys.some((k) => !allowed[body.table as Table].includes(k))) {
    return NextResponse.json({ error: "invalid_filters" }, { status: 400 });
  }

  let query: any = db.from(body.table as Table).delete();
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
