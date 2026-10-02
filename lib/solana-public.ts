import { admin } from "./db";

import { SolanaRpcError, solanaRpc as rpc } from "./rpc-provider";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

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

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58(bytes: Uint8Array) {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let out = "";
  while (value > 0n) {
    const mod = Number(value % 58n);
    out = BASE58[mod] + out;
    value /= 58n;
  }
  let leading = 0;
  while (leading < bytes.length && bytes[leading] === 0) leading++;
  return "1".repeat(leading) + (out || (leading ? "" : "1"));
}

async function holderAccounts(programId: string, mint: string) {
  // Token account layout starts with mint[32], owner[32], amount[u64].
  // Slice only owner+amount instead of downloading every full token account.
  // This drastically reduces bandwidth and pressure on the public RPC.
  const result = await rpc<any[]>("getProgramAccounts", [
    programId,
    {
      commitment: "confirmed",
      encoding: "base64",
      dataSlice: { offset: 32, length: 40 },
      filters: [{ memcmp: { offset: 0, bytes: mint } }],
    },
  ]);

  return result.flatMap((row: any) => {
    const encoded = Array.isArray(row?.account?.data) ? row.account.data[0] : null;
    if (!encoded || typeof encoded !== "string") return [];
    try {
      const buf = Buffer.from(encoded, "base64");
      if (buf.length < 40) return [];
      const owner = base58(buf.subarray(0, 32));
      const raw = buf.readBigUInt64LE(32);
      if (!owner || raw <= 0n) return [];
      return [{ wallet: owner, raw }];
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
    signal: AbortSignal.timeout(10000),
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


export async function fetchRecentSignatures(address: string, limit = 8) {
  return rpc<any[]>("getSignaturesForAddress", [
    address,
    { limit, commitment: "confirmed" },
  ]);
}

export async function fetchParsedTransactionResult(signature:string){
 try{return {transaction:await rpc<any>('getTransaction',[signature,{commitment:'confirmed',encoding:'jsonParsed',maxSupportedTransactionVersion:1}]),failure:null};}
 catch(e){return {transaction:null,failure:e instanceof SolanaRpcError?e.kind:'network',failureCode:e instanceof SolanaRpcError?e.code:undefined};}
}
export async function fetchParsedTransaction(signature:string){return (await fetchParsedTransactionResult(signature)).transaction;}
