import { admin } from "./db";
import { fetchDexScreenerToken, fetchPublicHolders, fetchPublicSupply } from "./solana-public";

/** Начално състояние: supply, DexScreener metadata/цена и текущи holders от Public RPC. */
export async function bootstrapToken(mint: string) {
  const db = admin();
  const [{ supply, decimals }, market, holders] = await Promise.all([
    fetchPublicSupply(mint),
    fetchDexScreenerToken(mint).catch(() => ({
      priceUsd: 0,
      name: null,
      symbol: null,
      marketCap: 0,
      liquidityUsd: 0,
      volume24h: 0,
    })),
    fetchPublicHolders(mint),
  ]);

  const price = Number(market.priceUsd ?? 0);
  await db.from("tokens").upsert({
    mint,
    supply,
    decimals,
    price_usd: price,
    symbol: market.symbol ?? null,
    name: market.name ?? null,
    metadata_updated_at: new Date().toISOString(),
    bootstrapped_at: new Date().toISOString(),
  });

  const rows = holders.map((h) => {
    const balance = Number(h.raw) / 10 ** decimals;
    return {
      token_mint: mint,
      wallet: h.wallet,
      balance,
      usd_value: balance * price,
      pct_supply: supply ? (balance / supply) * 100 : 0,
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    await db.from("holdings").upsert(rows.slice(i, i + 500));
  }

  return { holders: rows.length };
}
