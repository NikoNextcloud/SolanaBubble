import { admin } from "./db";
import { fetchAllHolders, fetchSupply, fetchPriceUsd } from "./helius";
import { fetchSolscanTokenMeta } from "./solscan";

/** Начално състояние: supply, цена и всички текущи holders. */
export async function bootstrapToken(mint: string) {
  const db = admin();
  const [{ supply, decimals }, price, holders, solscan] = await Promise.all([fetchSupply(mint), fetchPriceUsd(mint), fetchAllHolders(mint), fetchSolscanTokenMeta(mint).catch(() => null)]);
  const meta = solscan?.data;
  await db.from("tokens").upsert({
    mint,
    supply,
    decimals,
    price_usd: Number(meta?.price ?? 0) || price,
    symbol: meta?.symbol ?? null,
    name: meta?.name ?? null,
    icon: meta?.icon ?? null,
    creator: meta?.creator ?? null,
    solscan_holder_count: meta?.holder ?? null,
    metadata_updated_at: meta ? new Date().toISOString() : null,
    bootstrapped_at: new Date().toISOString(),
  });
  const rows = holders.map(h => {
    const bal = Number(h.raw) / 10 ** decimals;
    const px = Number(meta?.price ?? 0) || price;
    return { token_mint: mint, wallet: h.wallet, balance: bal, usd_value: bal * px, pct_supply: supply ? (bal / supply) * 100 : 0 };
  });
  for (let i = 0; i < rows.length; i += 500) await db.from("holdings").upsert(rows.slice(i, i + 500));
  return { holders: rows.length, solscanHolders: meta?.holder ?? null, metadataCached: Boolean(solscan?.cached) };
}
