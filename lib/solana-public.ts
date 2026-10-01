import { admin } from "./db";

const RPC_URL = () => process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

type RpcResponse<T> = { result?: T; error?: { message?: string; code?: number } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Solana RPC failed: ${res.status}`);
  const json = await res.json() as RpcResponse<T>;
  if (json.error) throw new Error(json.error.message || `Solana RPC error ${json.error.code ?? ""}`);
  if (json.result == null) throw new Error("Solana RPC returned no result");
  return json.result;
}

export async function getRpcHealth() {
  try {
    const result = await rpc<string>("getHealth", []);
    return { ok: result === "ok", result };
  } catch (error) {
    return { ok: false, result: error instanceof Error ? error.message : "RPC error" };
  }
}

export async function fetchPublicSupply(mint: string) {
  const result = await rpc<any>("getTokenSupply", [mint, { commitment: "confirmed" }]);
  const value = result?.value;
  return {
    supply: Number(value?.uiAmountString ?? value?.uiAmount ?? 0),
    decimals: Number(value?.decimals ?? 0),
  };
}

async function holderAccounts(programId: string, mint: string) {
  const result = await rpc<any[]>("getProgramAccounts", [
    programId,
    {
      commitment: "confirmed",
      encoding: "jsonParsed",
      filters: [{ memcmp: { offset: 0, bytes: mint } }],
    },
  ]);

  return result.flatMap((row: any) => {
    const info = row?.account?.data?.parsed?.info;
    const owner = info?.owner;
    const amount = info?.tokenAmount?.amount;
    if (!owner || amount == null) return [];
    try {
      const raw = BigInt(String(amount));
      if (raw <= 0n) return [];
      return [{ wallet: String(owner), raw }];
    } catch {
      return [];
    }
  });
}

export async function fetchPublicHolders(mint: string, maxAgeMs = 5 * 60 * 1000) {
  const db = admin();
  const cacheKey = `public-rpc:holders:${mint}`;
  const { data: cached } = await db
    .from("api_cache")
    .select("payload,updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached?.payload && cached?.updated_at) {
    const age = Date.now() - new Date(cached.updated_at).getTime();
    if (age <= maxAgeMs) {
      const rows = Array.isArray(cached.payload) ? cached.payload : [];
      return rows.map((h: any) => ({ wallet: String(h.wallet), raw: BigInt(String(h.raw)) }));
    }
  }

  let rows: { wallet: string; raw: bigint }[] = [];
  let lastError: unknown = null;

  for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
    try {
      const part = await holderAccounts(program, mint);
      rows.push(...part);
      if (part.length) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!rows.length && lastError) throw lastError;

  const byOwner = new Map<string, bigint>();
  for (const row of rows) byOwner.set(row.wallet, (byOwner.get(row.wallet) ?? 0n) + row.raw);
  rows = [...byOwner.entries()].map(([wallet, raw]) => ({ wallet, raw }));

  await db.from("api_cache").upsert({
    cache_key: cacheKey,
    payload: rows.map((h) => ({ wallet: h.wallet, raw: h.raw.toString() })),
    updated_at: new Date().toISOString(),
  });

  return rows;
}

export async function fetchDexScreenerToken(mint: string) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DexScreener failed: ${res.status}`);
  const json = await res.json() as any;
  const pairs = Array.isArray(json?.pairs) ? json.pairs.filter((p: any) => p?.chainId === "solana") : [];
  const best = pairs.sort((a: any, b: any) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0))[0] ?? null;
  return {
    priceUsd: Number(best?.priceUsd ?? 0),
    name: best?.baseToken?.name ?? null,
    symbol: best?.baseToken?.symbol ?? null,
    marketCap: Number(best?.marketCap ?? best?.fdv ?? 0),
    liquidityUsd: Number(best?.liquidity?.usd ?? 0),
    volume24h: Number(best?.volume?.h24 ?? 0),
  };
}
