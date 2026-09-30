import { admin } from "./db";
import { fetchAllHolders, fetchSupply, fetchPriceUsd } from "./helius";

/** Начално състояние: supply, цена и всички текущи holders. */
export async function bootstrapToken(mint: string) {
  const db = admin();
  const [{ supply, decimals }, price, holders] = await Promise.all([fetchSupply(mint), fetchPriceUsd(mint), fetchAllHolders(mint)]);
  await db.from("tokens").upsert({ mint, supply, decimals, price_usd: price, bootstrapped_at: new Date().toISOString() });
  const rows = holders.map(h => {
    const bal = Number(h.raw) / 10 ** decimals;
    return { token_mint: mint, wallet: h.wallet, balance: bal, usd_value: bal * price, pct_supply: supply ? (bal / supply) * 100 : 0 };
  });
  for (let i = 0; i < rows.length; i += 500) await db.from("holdings").upsert(rows.slice(i, i + 500));
  return { holders: rows.length };
}
