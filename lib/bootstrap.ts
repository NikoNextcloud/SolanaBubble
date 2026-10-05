import { admin } from "./db";
import { fetchDexScreenerToken, fetchPublicHolders, fetchPublicSupply } from "./solana-public";

export type BootstrapResult = {
  holders: number | null;
  busy?: boolean;
};

/** Initial token state: supply, DexScreener metadata/price and current holders from Public RPC. */
export async function bootstrapToken(mint: string): Promise<BootstrapResult> {
  const db = admin();
  const { data: claimed, error: claimError } = await db.rpc("claim_token_bootstrap", {
    p_mint: mint,
    p_lease: "00:05:00",
  });
  if (claimError) throw claimError;
  if (!claimed) return { holders: null, busy: true };

  try {
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
    const tokenWrite = await db.from("tokens").upsert({
      mint,
      supply,
      decimals,
      price_usd: price,
      symbol: market.symbol ?? null,
      name: market.name ?? null,
      metadata_updated_at: new Date().toISOString(),
      bootstrapped_at: new Date().toISOString(),
    });
    if (tokenWrite.error) throw tokenWrite.error;

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
      const write = await db.from("holdings").upsert(rows.slice(i, i + 500));
      if (write.error) throw write.error;
    }

    await db.rpc("finish_token_bootstrap", { p_mint: mint, p_error: null });
    return { holders: rows.length };
  } catch (error) {
    try { await db.rpc("finish_token_bootstrap", { p_mint: mint, p_error: "bootstrap_failed" }); } catch {}
    throw error;
  }
}
