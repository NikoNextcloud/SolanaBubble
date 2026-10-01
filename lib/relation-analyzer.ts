import { admin } from "./db";
import { fetchParsedTransaction, fetchRecentSignatures } from "./solana-public";

type HolderRow = {
  wallet: string;
  balance: number;
  usd_value: number;
  pct_supply: number;
  funder?: string | null;
  cluster_id?: number | null;
};

type Fingerprint = {
  wallet: string;
  funders: string[];
  signers: string[];
  tokenBuyTimes: number[];
  signatures: string[];
};

type DirectEdge = {
  from: string;
  to: string;
  amount: number;
  signature: string;
  blockTime: number;
};

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function accountKeyString(key: any) {
  if (!key) return "";
  if (typeof key === "string") return key;
  return String(key.pubkey ?? "");
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function systemFunders(tx: any, wallet: string) {
  const out: string[] = [];
  for (const ix of tx?.transaction?.message?.instructions ?? []) {
    const parsed = ix?.parsed;
    if (!parsed || parsed.type !== "transfer") continue;
    const isSystem = ix.program === "system" || accountKeyString(ix.programId) === SYSTEM_PROGRAM;
    if (!isSystem) continue;
    const info = parsed.info ?? {};
    if (String(info.destination ?? "") !== wallet) continue;
    const source = String(info.source ?? "");
    if (source && source !== wallet) out.push(source);
  }
  return out;
}

function transactionSigners(tx: any, wallet: string) {
  return (tx?.transaction?.message?.accountKeys ?? [])
    .filter((k: any) => Boolean(k?.signer))
    .map(accountKeyString)
    .filter((x: string) => x && x !== wallet);
}

function tokenDelta(tx: any, mint: string, wallet: string) {
  let pre = 0;
  let post = 0;
  for (const row of tx?.meta?.preTokenBalances ?? []) {
    if (row?.mint === mint && String(row?.owner ?? "") === wallet) {
      pre += Number(row.uiTokenAmount?.uiAmountString ?? row.uiTokenAmount?.uiAmount ?? 0);
    }
  }
  for (const row of tx?.meta?.postTokenBalances ?? []) {
    if (row?.mint === mint && String(row?.owner ?? "") === wallet) {
      post += Number(row.uiTokenAmount?.uiAmountString ?? row.uiTokenAmount?.uiAmount ?? 0);
    }
  }
  return post - pre;
}

function trackedTokenTransfers(tx: any, mint: string, currentHolders: Set<string>) {
  const pre = new Map<string, number>();
  const post = new Map<string, number>();

  for (const row of tx?.meta?.preTokenBalances ?? []) {
    if (row?.mint !== mint || !row?.owner) continue;
    const owner = String(row.owner);
    pre.set(owner, (pre.get(owner) ?? 0) + Number(row.uiTokenAmount?.uiAmountString ?? row.uiTokenAmount?.uiAmount ?? 0));
  }
  for (const row of tx?.meta?.postTokenBalances ?? []) {
    if (row?.mint !== mint || !row?.owner) continue;
    const owner = String(row.owner);
    post.set(owner, (post.get(owner) ?? 0) + Number(row.uiTokenAmount?.uiAmountString ?? row.uiTokenAmount?.uiAmount ?? 0));
  }

  const delta = new Map<string, number>();
  for (const owner of new Set([...pre.keys(), ...post.keys()])) {
    if (!currentHolders.has(owner)) continue;
    delta.set(owner, (post.get(owner) ?? 0) - (pre.get(owner) ?? 0));
  }

  const sellers = [...delta.entries()].filter(([, d]) => d < 0).sort((a, b) => a[1] - b[1]);
  const buyers = [...delta.entries()].filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]);
  const out: { from: string; to: string; amount: number }[] = [];
  const remainingBuy = new Map(buyers.map(([w, amount]) => [w, amount]));

  for (const [from, loss] of sellers) {
    let remaining = Math.abs(loss);
    for (const [to] of buyers) {
      const available = remainingBuy.get(to) ?? 0;
      if (from === to || remaining <= 0 || available <= 0) continue;
      const amount = Math.min(remaining, available);
      if (amount > 0) out.push({ from, to, amount });
      remaining -= amount;
      remainingBuy.set(to, available - amount);
    }
  }
  return out;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function parsePair(key: string) {
  const [wallet_a, wallet_b] = key.split("|");
  return { wallet_a, wallet_b };
}

function addScore(
  scores: Map<string, { score: number; signals: Set<string>; funder?: string }>,
  a: string,
  b: string,
  points: number,
  signal: string,
  funder?: string,
) {
  if (!a || !b || a === b) return;
  const key = pairKey(a, b);
  const cur = scores.get(key) ?? { score: 0, signals: new Set<string>() };
  if (!cur.signals.has(signal)) {
    cur.score += points;
    cur.signals.add(signal);
  }
  if (funder) cur.funder = funder;
  scores.set(key, cur);
}

async function fingerprintWallet(
  mint: string,
  wallet: string,
  currentHolders: Set<string>,
  directEdges: Map<string, DirectEdge>,
): Promise<Fingerprint> {
  const funders: string[] = [];
  const signers: string[] = [];
  const tokenBuyTimes: number[] = [];
  const signatures: string[] = [];

  // We inspect more signature history than before, but only fetch a bounded
  // number of full transactions. This improves multi-wallet detection without
  // turning Public RPC into a firehose.
  const sigs = await fetchRecentSignatures(wallet, 12);
  const candidates = unique([
    ...sigs.slice(0, 4),
    ...sigs.slice(-2),
  ].map((x: any) => String(x?.signature ?? "")).filter(Boolean));

  for (const signature of candidates) {
    const row = sigs.find((x: any) => String(x?.signature ?? "") === signature);
    const tx = await fetchParsedTransaction(signature);
    if (!tx) continue;

    signatures.push(signature);
    funders.push(...systemFunders(tx, wallet));
    signers.push(...transactionSigners(tx, wallet));

    const blockTime = Number(tx?.blockTime ?? row?.blockTime ?? 0);
    if (blockTime && tokenDelta(tx, mint, wallet) > 0) tokenBuyTimes.push(blockTime);

    for (const transfer of trackedTokenTransfers(tx, mint, currentHolders)) {
      const key = `${transfer.from}>${transfer.to}`;
      const prev = directEdges.get(key);
      if (!prev || transfer.amount > prev.amount) {
        directEdges.set(key, {
          ...transfer,
          signature,
          blockTime,
        });
      }
    }

    await sleep(55);
  }

  return {
    wallet,
    funders: unique(funders),
    signers: unique(signers),
    tokenBuyTimes: unique(tokenBuyTimes).sort((a, b) => a - b),
    signatures: unique(signatures),
  };
}

export async function analyzeHolderRelations(
  mint: string,
  holders: HolderRow[],
  opts: { maxWallets?: number; cacheMs?: number } = {},
) {
  const db = admin();
  const maxWallets = opts.maxWallets ?? 24;
  const cacheMs = opts.cacheMs ?? 5 * 60 * 1000;
  const cacheKey = `relations:v2:${mint}`;

  const { data: cached } = await db
    .from("api_cache")
    .select("payload,updated_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (cached?.updated_at && Date.now() - new Date(cached.updated_at).getTime() < cacheMs) {
    return { cached: true, ...(cached.payload as object) };
  }

  const currentHolders = new Set(holders.map((h) => h.wallet));
  const priority = [...holders].sort((a, b) => {
    const aNeeds = a.cluster_id == null ? 1 : 0;
    const bNeeds = b.cluster_id == null ? 1 : 0;
    if (aNeeds !== bNeeds) return bNeeds - aNeeds;
    return Number(b.usd_value ?? 0) - Number(a.usd_value ?? 0);
  });
  const target = priority.slice(0, maxWallets);

  const fingerprints: Fingerprint[] = [];
  const directEdges = new Map<string, DirectEdge>();

  for (const holder of target) {
    try {
      fingerprints.push(await fingerprintWallet(mint, holder.wallet, currentHolders, directEdges));
    } catch {
      fingerprints.push({ wallet: holder.wallet, funders: [], signers: [], tokenBuyTimes: [], signatures: [] });
    }
    await sleep(55);
  }

  const scores = new Map<string, { score: number; signals: Set<string>; funder?: string }>();

  // Strong signal #1: same wallet funded multiple holder wallets.
  const byFunder = new Map<string, string[]>();
  for (const fp of fingerprints) {
    for (const funder of fp.funders) {
      const list = byFunder.get(funder) ?? [];
      list.push(fp.wallet);
      byFunder.set(funder, list);
    }
  }
  for (const [funder, walletsRaw] of byFunder) {
    const wallets = unique(walletsRaw);
    if (wallets.length < 2) continue;
    for (let i = 0; i < wallets.length; i++) {
      for (let j = i + 1; j < wallets.length; j++) {
        addScore(scores, wallets[i], wallets[j], 4, `common_funder:${funder}`, funder);
      }
    }
    // Do not exclude a funder just because it is itself a holder. If wallet A
    // funded B and C, all three are relevant to the same on-chain cluster.
    if (currentHolders.has(funder)) {
      for (const wallet of wallets) addScore(scores, funder, wallet, 5, `direct_funder:${funder}`, funder);
    }
  }

  // Strong signal #2: same external signer/authority appears on transactions
  // for multiple holders.
  const bySigner = new Map<string, string[]>();
  for (const fp of fingerprints) {
    for (const signer of fp.signers) {
      const list = bySigner.get(signer) ?? [];
      list.push(fp.wallet);
      bySigner.set(signer, list);
    }
  }
  for (const [signer, walletsRaw] of bySigner) {
    const wallets = unique(walletsRaw);
    if (wallets.length < 2) continue;
    for (let i = 0; i < wallets.length; i++) {
      for (let j = i + 1; j < wallets.length; j++) {
        addScore(scores, wallets[i], wallets[j], 3, `common_signer:${signer}`);
      }
    }
  }

  // Strong signal #3: direct token flow between holders.
  for (const edge of directEdges.values()) {
    addScore(scores, edge.from, edge.to, 5, `direct_token_transfer:${edge.signature}`);
  }

  // Supporting signal: token acquisition within 75 seconds. Timing alone is
  // deliberately too weak to create a cluster.
  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const a = fingerprints[i];
      const b = fingerprints[j];
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const ta of a.tokenBuyTimes) {
        for (const tb of b.tokenBuyTimes) bestDelta = Math.min(bestDelta, Math.abs(ta - tb));
      }
      if (bestDelta <= 75) addScore(scores, a.wallet, b.wallet, 1, `buy_timing:${bestDelta}s`);
    }
  }

  // Same parsed transaction touching both wallets is another strong relation.
  const signatureOwners = new Map<string, string[]>();
  for (const fp of fingerprints) {
    for (const sig of fp.signatures) {
      const list = signatureOwners.get(sig) ?? [];
      list.push(fp.wallet);
      signatureOwners.set(sig, list);
    }
  }
  for (const [sig, walletsRaw] of signatureOwners) {
    const wallets = unique(walletsRaw);
    if (wallets.length < 2) continue;
    for (let i = 0; i < wallets.length; i++) {
      for (let j = i + 1; j < wallets.length; j++) {
        addScore(scores, wallets[i], wallets[j], 4, `same_transaction:${sig}`);
      }
    }
  }

  // Rebuild the weak links from the current evidence. Strong funder links are
  // retained/upserted; old timing-only noise is cleared every analysis pass.
  await db.from("wallet_links").delete().eq("token_mint", mint).eq("kind", "timing");

  let links = 0;
  const acceptedPairs = new Set<string>();

  for (const [key, scored] of scores) {
    // A single timing coincidence is not enough. We require either one strong
    // signal (score >= 3) or multiple independent weak/supporting signals.
    if (scored.score < 3) continue;
    const { wallet_a, wallet_b } = parsePair(key);
    if (!currentHolders.has(wallet_a) || !currentHolders.has(wallet_b)) continue;

    const hasFunder = [...scored.signals].some((s) => s.startsWith("common_funder:") || s.startsWith("direct_funder:"));
    const kind = hasFunder ? "funder" : "timing";
    const evidence = [...scored.signals].join(";");
    const signalCount = scored.signals.size;

    await db.from("wallet_links").upsert({
      token_mint: mint,
      wallet_a,
      wallet_b,
      kind,
      evidence,
      signal_count: signalCount,
      last_seen: new Date().toISOString(),
    });

    if (scored.funder) {
      await db.from("holdings").update({ funder: scored.funder })
        .eq("token_mint", mint)
        .in("wallet", [wallet_a, wallet_b]);
    }

    acceptedPairs.add(key);
    links++;
  }

  let transfers = 0;
  for (const edge of directEdges.values()) {
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
    acceptedPairs.add(pairKey(edge.from, edge.to));
    transfers++;
  }

  // Build clusters only from accepted high-confidence relations.
  const adjacency = new Map<string, Set<string>>();
  const connect = (a: string, b: string) => {
    if (!currentHolders.has(a) || !currentHolders.has(b)) return;
    const aa = adjacency.get(a) ?? new Set<string>();
    const bb = adjacency.get(b) ?? new Set<string>();
    aa.add(b); bb.add(a);
    adjacency.set(a, aa); adjacency.set(b, bb);
  };
  for (const key of acceptedPairs) {
    const { wallet_a, wallet_b } = parsePair(key);
    connect(wallet_a, wallet_b);
  }

  // Reset only wallets in the analysis window, then assign stable component
  // ids based on the lexicographically smallest wallet in each component.
  await db.from("holdings").update({ cluster_id: null })
    .eq("token_mint", mint)
    .in("wallet", target.map((h) => h.wallet));

  const visited = new Set<string>();
  let clusters = 0;
  for (const wallet of [...adjacency.keys()].sort()) {
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

    const seed = [...component].sort()[0];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash * 31) + seed.charCodeAt(i)) | 0;
    const clusterId = Math.abs(hash % 1_000_000) + 1;

    await db.from("holdings").update({ cluster_id: clusterId })
      .eq("token_mint", mint)
      .in("wallet", component);
    clusters++;
  }

  const payload = {
    analyzed: target.length,
    links,
    transfers,
    clusters,
    candidatePairs: scores.size,
    updatedAt: new Date().toISOString(),
  };

  await db.from("api_cache").upsert({
    cache_key: cacheKey,
    payload,
    updated_at: new Date().toISOString(),
  });

  return { cached: false, ...payload };
}
