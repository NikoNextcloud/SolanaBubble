import { admin } from "./db";
import { fetchParsedTransaction, fetchRecentSignatures } from "./solana-public";

type HolderRow = {
  wallet: string;
  balance: number;
  usd_value: number;
  pct_supply: number;
  funder?: string | null;
};

type Evidence = {
  wallet: string;
  funder: string | null;
  firstSeen: number | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function accountKeyString(key: any) {
  if (!key) return "";
  if (typeof key === "string") return key;
  return String(key.pubkey ?? "");
}

function extractSystemFunder(tx: any, wallet: string): string | null {
  const instructions = tx?.transaction?.message?.instructions ?? [];
  for (const ix of instructions) {
    const parsed = ix?.parsed;
    if (!parsed) continue;
    if (ix.program !== "system" && ix.programId?.toString?.() !== "11111111111111111111111111111111") continue;
    if (parsed.type !== "transfer") continue;
    const info = parsed.info ?? {};
    if (String(info.destination ?? "") !== wallet) continue;
    const source = String(info.source ?? "");
    if (source && source !== wallet) return source;
  }

  const keys = tx?.transaction?.message?.accountKeys ?? [];
  const pre = tx?.meta?.preBalances ?? [];
  const post = tx?.meta?.postBalances ?? [];
  const walletIdx = keys.findIndex((k: any) => accountKeyString(k) === wallet);
  if (walletIdx < 0 || Number(post[walletIdx] ?? 0) <= Number(pre[walletIdx] ?? 0)) return null;

  let best: { wallet: string; loss: number } | null = null;
  for (let i = 0; i < keys.length; i++) {
    const address = accountKeyString(keys[i]);
    if (!address || address === wallet) continue;
    const loss = Number(pre[i] ?? 0) - Number(post[i] ?? 0);
    const isSigner = Boolean(keys[i]?.signer);
    if (loss > 5_000 && isSigner && (!best || loss > best.loss)) best = { wallet: address, loss };
  }
  return best?.wallet ?? null;
}

function trackedTokenTransfers(tx: any, mint: string, currentHolders: Set<string>) {
  const pre = tx?.meta?.preTokenBalances ?? [];
  const post = tx?.meta?.postTokenBalances ?? [];
  const before = new Map<string, number>();
  const after = new Map<string, number>();

  for (const row of pre) {
    if (row?.mint !== mint || !row?.owner) continue;
    before.set(String(row.owner), (before.get(String(row.owner)) ?? 0) + Number(row.uiTokenAmount?.uiAmountString ?? row.uiTokenAmount?.uiAmount ?? 0));
  }
  for (const row of post) {
    if (row?.mint !== mint || !row?.owner) continue;
    after.set(String(row.owner), (after.get(String(row.owner)) ?? 0) + Number(row.uiTokenAmount?.uiAmountString ?? row.uiTokenAmount?.uiAmount ?? 0));
  }

  const deltas = new Map<string, number>();
  for (const owner of new Set([...before.keys(), ...after.keys()])) {
    deltas.set(owner, (after.get(owner) ?? 0) - (before.get(owner) ?? 0));
  }

  const sellers = [...deltas.entries()].filter(([w, d]) => currentHolders.has(w) && d < 0).sort((a, b) => a[1] - b[1]);
  const buyers = [...deltas.entries()].filter(([w, d]) => currentHolders.has(w) && d > 0).sort((a, b) => b[1] - a[1]);
  const out: { from: string; to: string; amount: number }[] = [];

  for (const [from, loss] of sellers) {
    let remaining = Math.abs(loss);
    for (const [to, gain] of buyers) {
      if (from === to || remaining <= 0) continue;
      const amount = Math.min(remaining, gain);
      if (amount > 0) out.push({ from, to, amount });
      remaining -= amount;
    }
  }
  return out;
}

export async function analyzeHolderRelations(
  mint: string,
  holders: HolderRow[],
  opts: { maxWallets?: number; cacheMs?: number } = {},
) {
  const db = admin();
  const maxWallets = opts.maxWallets ?? 14;
  const cacheMs = opts.cacheMs ?? 10 * 60 * 1000;
  const cacheKey = `relations:${mint}`;

  const { data: cached } = await db
    .from("api_cache")
    .select("updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached?.updated_at && Date.now() - new Date(cached.updated_at).getTime() < cacheMs) {
    return { cached: true, analyzed: 0, links: 0, transfers: 0 };
  }

  const top = [...holders]
    .sort((a, b) => Number(b.usd_value ?? 0) - Number(a.usd_value ?? 0))
    .slice(0, maxWallets);
  const currentHolders = new Set(holders.map((h) => h.wallet));
  const evidence: Evidence[] = [];
  const directTransfers = new Map<string, { from: string; to: string; amount: number; signature: string; blockTime: number }>();

  for (const holder of top) {
    let funder: string | null = null;
    let firstSeen: number | null = null;

    try {
      const sigs = await fetchRecentSignatures(holder.wallet, 4);
      if (sigs.length) {
        const oldest = sigs[sigs.length - 1];
        firstSeen = Number(oldest?.blockTime ?? 0) || null;
      }

      for (const sigRow of sigs.slice(0, 2)) {
        const signature = String(sigRow?.signature ?? "");
        if (!signature) continue;
        const tx = await fetchParsedTransaction(signature);
        if (!tx) continue;

        funder ||= extractSystemFunder(tx, holder.wallet);

        for (const tr of trackedTokenTransfers(tx, mint, currentHolders)) {
          const key = `${tr.from}>${tr.to}`;
          const existing = directTransfers.get(key);
          if (!existing || tr.amount > existing.amount) {
            directTransfers.set(key, {
              ...tr,
              signature,
              blockTime: Number(tx.blockTime ?? sigRow?.blockTime ?? 0),
            });
          }
        }
        await sleep(70);
      }
    } catch {
      // Public RPC may rate-limit individual wallets; keep the rest of the analysis.
    }

    evidence.push({ wallet: holder.wallet, funder, firstSeen });
    await sleep(70);
  }

  const byFunder = new Map<string, string[]>();
  for (const item of evidence) {
    if (!item.funder || currentHolders.has(item.funder)) continue;
    const list = byFunder.get(item.funder) ?? [];
    list.push(item.wallet);
    byFunder.set(item.funder, list);
  }

  let links = 0;
  for (const [funder, wallets] of byFunder) {
    if (wallets.length < 2) continue;
    for (const wallet of wallets) {
      await db.from("holdings").update({ funder }).eq("token_mint", mint).eq("wallet", wallet);
    }
    for (let i = 0; i < wallets.length; i++) {
      for (let j = i + 1; j < wallets.length; j++) {
        const [wallet_a, wallet_b] = [wallets[i], wallets[j]].sort();
        await db.from("wallet_links").upsert({
          token_mint: mint,
          wallet_a,
          wallet_b,
          kind: "funder",
          evidence: `common_funder:${funder}`,
          signal_count: 1,
          last_seen: new Date().toISOString(),
        });
        links++;
      }
    }
  }

  const timed = evidence.filter((x) => x.firstSeen).sort((a, b) => Number(a.firstSeen) - Number(b.firstSeen));
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const delta = Math.abs(Number(timed[j].firstSeen) - Number(timed[i].firstSeen));
      if (delta > 90) break;
      const [wallet_a, wallet_b] = [timed[i].wallet, timed[j].wallet].sort();
      await db.from("wallet_links").upsert({
        token_mint: mint,
        wallet_a,
        wallet_b,
        kind: "timing",
        evidence: `activity_within:${delta}s`,
        signal_count: 1,
        last_seen: new Date().toISOString(),
      });
      links++;
    }
  }

  // Persist deterministic cluster ids from the evidence graph so linked
  // holders are not only connected by lines but also share a visual cluster.
  const adjacency = new Map<string, Set<string>>();
  const { data: relationRows } = await db
    .from("wallet_links")
    .select("wallet_a,wallet_b")
    .eq("token_mint", mint);

  for (const row of relationRows ?? []) {
    const a = String(row.wallet_a);
    const b = String(row.wallet_b);
    if (!currentHolders.has(a) || !currentHolders.has(b)) continue;
    const aa = adjacency.get(a) ?? new Set<string>();
    const bb = adjacency.get(b) ?? new Set<string>();
    aa.add(b); bb.add(a);
    adjacency.set(a, aa); adjacency.set(b, bb);
  }
  for (const edge of directTransfers.values()) {
    const aa = adjacency.get(edge.from) ?? new Set<string>();
    const bb = adjacency.get(edge.to) ?? new Set<string>();
    aa.add(edge.to); bb.add(edge.from);
    adjacency.set(edge.from, aa); adjacency.set(edge.to, bb);
  }

  const visited = new Set<string>();
  let clusterId = 1;
  for (const wallet of adjacency.keys()) {
    if (visited.has(wallet)) continue;
    const queue = [wallet];
    const component: string[] = [];
    visited.add(wallet);
    while (queue.length) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const next of adjacency.get(cur) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    if (component.length < 2) continue;
    for (const member of component) {
      await db.from("holdings")
        .update({ cluster_id: clusterId })
        .eq("token_mint", mint)
        .eq("wallet", member);
    }
    clusterId++;
  }

  let transfers = 0;
  for (const edge of directTransfers.values()) {
    await db.from("wallet_edges").upsert({
      token_mint: mint,
      from_wallet: edge.from,
      to_wallet: edge.to,
      kind: "transfer",
      amount: edge.amount,
      usd_value: 0,
      tx_count: 1,
      first_seen: edge.blockTime ? new Date(edge.blockTime * 1000).toISOString() : new Date().toISOString(),
      last_seen: edge.blockTime ? new Date(edge.blockTime * 1000).toISOString() : new Date().toISOString(),
      last_signature: edge.signature,
    });
    transfers++;
  }

  await db.from("api_cache").upsert({
    cache_key: cacheKey,
    payload: {
      analyzed: top.length,
      links,
      transfers,
      updatedAt: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  });

  return { cached: false, analyzed: top.length, links, transfers };
}
