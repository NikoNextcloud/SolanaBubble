import { admin } from "./db";

const BASE = "https://pro-api.solscan.io/v2.0";
const KEY = () => {
  const raw = process.env.SOLSCAN_API_KEY || "";
  return raw.trim().replace(/^["']|["']$/g, "");
};

type CacheRow<T> = { payload: T; updated_at: string };

async function cached<T>(key: string, maxAgeMs: number): Promise<T | null> {
  const { data } = await admin()
    .from("api_cache")
    .select("payload,updated_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  const age = Date.now() - new Date((data as CacheRow<T>).updated_at).getTime();
  return age <= maxAgeMs ? (data as CacheRow<T>).payload : null;
}

async function saveCache(key: string, payload: unknown) {
  await admin().from("api_cache").upsert({
    cache_key: key,
    payload,
    updated_at: new Date().toISOString(),
  });
}

async function get<T>(path: string, base = BASE): Promise<T> {
  const key = KEY();
  if (!key) throw new Error("SOLSCAN_API_KEY is missing");
  const r = await fetch(`${base}${path}`, {
    headers: { accept: "application/json", token: key },
    cache: "no-store",
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Solscan API failed: ${r.status}${detail ? ` · ${detail.slice(0, 180)}` : ""}`);
  }
  const j = await r.json();
  if (j?.success === false) throw new Error(j?.errors?.message || "Solscan API error");
  return j.data as T;
}

export type SolscanTokenMeta = {
  address: string;
  name?: string;
  symbol?: string;
  icon?: string;
  decimals?: number;
  price?: number;
  market_cap?: number;
  price_change_24h?: number;
  supply?: string;
  holder?: number;
  creator?: string;
  create_tx?: string;
  created_time?: number;
  metadata?: Record<string, unknown>;
};

export async function fetchSolscanTokenMeta(mint: string, maxAgeMs = 30 * 60 * 1000) {
  const key = `solscan:token-meta:${mint}`;
  const hit = await cached<SolscanTokenMeta>(key, maxAgeMs);
  if (hit) return { data: hit, cached: true };
  const data = await get<SolscanTokenMeta>(`/token/meta?address=${encodeURIComponent(mint)}`);
  await saveCache(key, data);
  return { data, cached: false };
}

export type SolscanHolder = {
  address: string;
  amount: number;
  amount_str?: string;
  decimals: number;
  owner: string;
  rank: number;
  value?: number;
  percentage?: number;
};

export async function fetchSolscanHolders(
  mint: string,
  page = 1,
  pageSize: 40 | 30 | 20 | 10 = 40,
  maxAgeMs = 5 * 60 * 1000,
) {
  const key = `solscan:holders:${mint}:${page}:${pageSize}`;
  const hit = await cached<{ total: number; items: SolscanHolder[] }>(key, maxAgeMs);
  if (hit) return { data: hit, cached: true };
  const data = await get<{ total: number; items: SolscanHolder[] }>(
    `/token/holders?address=${encodeURIComponent(mint)}&page=${page}&page_size=${pageSize}`,
  );
  await saveCache(key, data);
  return { data, cached: false };
}


export type SolscanMarketToken = {
  address?: string;
  tokenAddress?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  price?: number;
  market_cap?: number;
  marketCap?: number;
  volume_24h?: number;
  volume?: number;
  holder?: number;
  price_change_24h?: number;
};

export async function fetchSolscanTokenList(maxAgeMs = 30_000) {
  const cacheKey = "solscan:market-token-list:v2";
  const hit = await cached<SolscanMarketToken[]>(cacheKey, maxAgeMs);
  if (hit) return { data: hit, cached: true };

  // V2 API key is configured in Vercel. The v2 token/list endpoint supports
  // sort_by=market_cap|holder|created_time (not the old v1 volume sort).
  const data = await get<SolscanMarketToken[]>(
    "/token/list?sort_by=market_cap&sort_order=desc&page=1&page_size=60",
  );
  await saveCache(cacheKey, data ?? []);
  return { data: data ?? [], cached: false };
}

export type SolscanUsage = {
  renew_date?: string;
  end_date?: string;
  last_cu_reset_date?: string;
  remaining_cus?: number;
  usage_cus?: number;
  total_requests_24h?: number;
  success_rate_24h?: number;
  total_cu_24h?: number;
};

export async function fetchSolscanUsage(maxAgeMs = 60_000) {
  const cacheKey = "solscan:usage";
  const hit = await cached<SolscanUsage>(cacheKey, maxAgeMs);
  if (hit) return { data: hit, cached: true };
  const data = await get<SolscanUsage>("/monitor/usage");
  await saveCache(cacheKey, data);
  return { data, cached: false };
}
