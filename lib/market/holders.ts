import { admin } from '../db';
import { fetchPublicHolders, fetchPublicSupply } from '../solana-public';
import { sampleWalletRelationships } from './relationships';
import type { Intelligence } from './signals';

export interface HolderProvider {
  observe(mint: string): Promise<{ supply: number; decimals?:number; balances: { wallet: string; balance: number }[] }>;
}
// One adapter boundary: replace this to use any indexer or RPC provider.
export const rpcHolderProvider: HolderProvider = {
  async observe(mint) {
    const [{ supply, decimals }, holders] = await Promise.all([fetchPublicSupply(mint), fetchPublicHolders(mint, 0)]);
    if (!supply || !holders.length) throw new Error('Incomplete holder observation');
    return { supply, decimals, balances: holders.map(h => ({ wallet: h.wallet, balance: Number(h.raw) / 10 ** decimals })) };
  }
};
export async function observeHolders(mint: string, price: number, provider = rpcHolderProvider): Promise<Intelligence> {
  const db = admin();
  const key = `intelligence:holders:${mint}`;
  const { data: prev, error: readError } = await db.from('api_cache').select('payload,updated_at').eq('cache_key', key).maybeSingle();
  if (readError) throw readError;
  const current = await provider.observe(mint);
  const at = new Date().toISOString();
  const before = prev?.payload as { balances: { wallet: string; balance: number }[]; supply: number; metrics: Intelligence } | undefined;
  const previous = before ? new Map(before.balances.map(h => [h.wallet, h.balance])) : null;
  const previousWhales = before ? new Set(before.balances.filter(h => h.balance / before.supply >= .01).map(h => h.wallet)) : null;
  const whales = new Set(current.balances.filter(h => h.balance / current.supply >= .01).map(h => h.wallet));
  const wallets = new Set(current.balances.map(h => h.wallet));
  const { data: links, error: linkError } = await db.from('wallet_links').select('wallet_a,wallet_b,kind,signal_count').eq('token_mint', mint);
  const linked = new Set<string>(), suspicious = new Set<string>();
  for (const link of links ?? []) {
    if (!wallets.has(link.wallet_a) || !wallets.has(link.wallet_b)) continue;
    linked.add(link.wallet_a); linked.add(link.wallet_b);
    if (link.kind === 'funder' || link.signal_count >= 3) { suspicious.add(link.wallet_a); suspicious.add(link.wallet_b); }
  }
  const previousLargest = before ? [...before.balances].sort((a,b)=>b.balance-a.balance)[0]?.wallet : undefined;
  const relationSample = await sampleWalletRelationships(current.balances,mint,prev?.updated_at,previousLargest);
  for (const group of relationSample.evidence) for (const wallet of group.wallets) {
    linked.add(wallet); suspicious.add(wallet);
  }
  const relationshipKnown = !!links?.length || relationSample.analyzed > 0;
  const whaleWallets = new Set([...whales, ...(previousWhales ?? [])]);
  const balanceNow = new Map(current.balances.map(h => [h.wallet, h.balance]));
  const sorted = [...current.balances].sort((a,b)=>b.balance-a.balance);
  const {data:holderWindows,error:windowError}=await db.rpc('holder_window_comparisons',{p_mint:mint,p_at:at,p_wallets:[...wallets]});
  if(windowError) throw windowError;
  const metrics: Intelligence = {
    holderCount: current.balances.length,
    holderGrowth: previous ? current.balances.length - previous.size : null,
    holderGrowthPct: previous?.size ? (current.balances.length - previous.size) / previous.size * 100 : null,
    newHolders: previous ? current.balances.filter(h=>!previous.has(h.wallet)).length : null,
    exitedHolders: previous ? [...previous.keys()].filter(w=>!wallets.has(w)).length : null,
    largestHolderPct: sorted.length ? sorted[0].balance/current.supply*100 : null,
    whaleConcentrationPct: current.balances.filter(h=>whales.has(h.wallet)).reduce((n,h)=>n+h.balance,0)/current.supply*100,
    linkedSupplyPct: relationshipKnown ? current.balances.filter(h=>linked.has(h.wallet)).reduce((n,h)=>n+h.balance,0)/current.supply*100 : null,
    holderWindows:holderWindows ?? {},
    topHolderSales: relationSample.sales,
    freshWallets: previous ? current.balances.filter(h => !previous.has(h.wallet)).length : null,
    top10SupplyPct: Math.min(100, [...current.balances].sort((a,b) => b.balance - a.balance).slice(0,10).reduce((n,h) => n + h.balance, 0) / current.supply * 100),
    linkedWallets: !relationshipKnown ? null : linked.size,
    suspiciousWallets: !relationshipKnown ? null : suspicious.size,
    whaleEnter: previousWhales ? [...whales].filter(w => !previousWhales.has(w)).length : null,
    whaleExit: previousWhales ? [...previousWhales].filter(w => !whales.has(w)).length : null,
    smartMoneyFlowUsd: previous ? [...whaleWallets].reduce((n,w) => n + ((balanceNow.get(w) ?? 0) - (previous.get(w) ?? 0)) * price, 0) : null,
    relationshipCoverage: `${relationSample.analyzed}/${relationSample.sampled} largest owners sampled; stored links ${linkError ? 'unavailable' : links?.length ?? 0}. Recent transactions only.`,
    walletEvidence: relationSample.evidence,
    holderObservedAt: at, holderBaselineAt: previous ? prev!.updated_at : null,
  };
  const { error } = await db.rpc('save_holder_observation',{p_mint:mint,p_at:at,p_payload:{ ...current, price, metrics },p_wallets:[...wallets]});
  if (error) throw error;
  return metrics;
}
