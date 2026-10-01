import { admin } from "./db";
import { fetchDexScreenerToken, fetchPublicHolders, fetchPublicSupply } from "./solana-public";
import { fetchSolscanTokenMeta } from "./solscan";

/** Начално състояние: supply, цена и всички текущи holders. */
export async function bootstrapToken(mint: string) {
  const db = admin();
  const [{ supply, decimals }, market, holders, solscan] = await Promise.all([fetchPublicSupply(mint), fetchDexScreenerToken(mint).catch(() => ({ priceUsd: 0, name: null, symbol: null, marketCap: 0, liquidityUsd: 0, volume24h: 0 })), fetchPublicHolders(mint), fetchSolscanTokenMeta(mint).catch(() => null)]);
  const meta = solscan?.data;
  await db.from("tokens").upsert({
    mint,
    supply,
    decimals,
    price_usd: Number(meta?.price ?? 0) || Number(market.priceUsd ?? 0),
    symbol: meta?.symbol ?? market.symbol ?? null,
    name: meta?.name ?? market.name ?? null,
    icon: meta?.icon ?? null,
    creator: meta?.creator ?? null,
    solscan_holder_count: meta?.holder ?? null,
    metadata_updated_at: meta ? new Date().toISOString() : null,
    bootstrapped_at: new Date().toISOString(),
  });
  const rows = holders.map(h => {
    const bal = Number(h.raw) / 10 ** decimals;
    const px = Number(meta?.price ?? 0) || Number(market.priceUsd ?? 0);
    return { token_mint: mint, wallet: h.wallet, balance: bal, usd_value: bal * px, pct_supply: supply ? (bal / supply) * 100 : 0 };
  });
  for (let i = 0; i < rows.length; i += 500) await db.from("holdings").upsert(rows.slice(i, i + 500));
  return { holders: rows.length, solscanHolders: meta?.holder ?? null, metadataCached: Boolean(solscan?.cached) };
}
