import { fetchRecentSignatures, fetchParsedTransaction } from '../solana-public';
export type WalletEvidence = { wallets: string[]; kind: 'common-funder' | 'direct-funder'; evidence: string[] };
// Bounded sample, never a claim that every holder has been analyzed.
export async function sampleWalletRelationships(balances: { wallet: string; balance: number }[]) {
  const sample = [...balances].sort((a,b)=>b.balance-a.balance).slice(0,4);
  const funders = new Map<string, Set<string>>();
  const signatures = new Map<string, Set<string>>();
  let analyzed = 0;
  await Promise.all(sample.map(async h => {
    const recent = await fetchRecentSignatures(h.wallet,2).catch(()=>null);
    if (!recent) return;
    const txs = await Promise.all(recent.filter(s=>!s.err).map(s=>fetchParsedTransaction(s.signature)));
    if (!txs.some(Boolean)) return;
    analyzed++;
    for (const tx of txs) {
      const instructions = [...(tx?.transaction?.message?.instructions ?? []), ...(tx?.meta?.innerInstructions ?? []).flatMap((x: {instructions?: unknown[]})=>x.instructions ?? [])];
      for (const ix of instructions) {
        if (ix?.program !== 'system' || ix.parsed?.type !== 'transfer') continue;
        const info=ix.parsed.info;
        if (info?.destination !== h.wallet || !info.source || info.source === h.wallet) continue;
        const group=funders.get(info.source) ?? new Set<string>(); group.add(h.wallet); funders.set(info.source,group);
        const sigs=signatures.get(info.source) ?? new Set<string>(); sigs.add(String(tx.transaction.signatures?.[0] ?? '')); signatures.set(info.source,sigs);
      }
    }
  }));
  const wallets = new Set(balances.map(h=>h.wallet));
  const evidence: WalletEvidence[]=[];
  for (const [funder,group] of funders) {
    if (group.size >= 2) evidence.push({wallets:[...group],kind:'common-funder',evidence:[`funder:${funder}`,...(signatures.get(funder) ?? [])]});
    else if (wallets.has(funder)) evidence.push({wallets:[funder,...group],kind:'direct-funder',evidence:[...(signatures.get(funder) ?? [])]});
  }
  return { analyzed, sampled: sample.length, evidence };
}
