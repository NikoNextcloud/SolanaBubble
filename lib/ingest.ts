import { admin } from "./db";
import { findFunder, fetchPriceUsd } from "./helius";
import { buildClusterLinks, computeClusters, type GraphEdge, type Link } from "./cluster";
import { alert, short } from "./telegram";

const BIG = () => Number(process.env.ALERT_BIG_TRADE_USD ?? 5000);
const WHALE = () => Number(process.env.ALERT_WHALE_PCT ?? 1);
const TIMING_WINDOW_S = 10;

/** Обработва Helius enhanced транзакция. Идемпотентно по (signature, wallet, mint). */
export async function ingestTx(tx: any) {
  const db = admin();
  const transfers: any[] = tx.tokenTransfers ?? [];
  const mints = [...new Set<string>(transfers.map((t: any) => t.mint).filter(Boolean))];
  if (!mints.length) return;

  const { data: tracked } = await db.from("tokens").select("*").in("mint", mints);
  for (const token of tracked ?? []) {
    const deltas = new Map<string, number>();
    const price = (await fetchPriceUsd(token.mint)) || Number(token.price_usd) || 0;
    const when = new Date((tx.timestamp ?? Date.now() / 1000) * 1000).toISOString();
    const isSwap = tx.type === "SWAP";

    for (const t of transfers) {
      if (t.mint !== token.mint || !t.tokenAmount) continue;

      if (t.toUserAccount) {
        deltas.set(t.toUserAccount, (deltas.get(t.toUserAccount) ?? 0) + t.tokenAmount);
      }
      if (t.fromUserAccount) {
        deltas.set(t.fromUserAccount, (deltas.get(t.fromUserAccount) ?? 0) - t.tokenAmount);
      }

      // Keep a directed graph of token flow. The UI only highlights useful
      // fan-in patterns (one wallet receiving from 2+ distinct wallets), so
      // ordinary pool traffic does not turn the whole map into one cluster.
      if (t.fromUserAccount && t.toUserAccount && t.fromUserAccount !== t.toUserAccount) {
        await upsertWalletEdge(
          token.mint,
          t.fromUserAccount,
          t.toUserAccount,
          isSwap ? "swap" : "transfer",
          Number(t.tokenAmount),
          Number(t.tokenAmount) * price,
          when,
          tx.signature,
        );
      }
    }

    if (price) await db.from("tokens").update({ price_usd: price }).eq("mint", token.mint);

    for (const [wallet, delta] of deltas) {
      if (Math.abs(delta) < 1e-9) continue;
      const side = delta > 0 ? (isSwap ? "buy" : "transfer_in") : (isSwap ? "sell" : "transfer_out");
      const usd = Math.abs(delta) * price;
      const { error } = await db.from("transactions").insert({
        signature: tx.signature,
        token_mint: token.mint,
        wallet,
        side,
        amount: Math.abs(delta),
        usd_value: usd,
        block_time: when,
      });
      if (error?.code === "23505") continue;

      const { data: cur } = await db
        .from("holdings")
        .select("*")
        .eq("token_mint", token.mint)
        .eq("wallet", wallet)
        .maybeSingle();

      const balance = Number(cur?.balance ?? 0) + delta;
      if (balance <= 1e-9) {
        if (cur) {
          // Keep a permanent exit record, then remove the wallet from active
          // holdings so it disappears from the live bubble map immediately.
          await db.from("exited_holders").insert({
            token_mint: token.mint,
            wallet,
            bought_usd: Number(cur.bought_usd ?? 0) + (side === "buy" ? usd : 0),
            sold_usd: Number(cur.sold_usd ?? 0) + (side === "sell" ? usd : 0),
            first_activity: cur.first_activity ?? when,
            last_activity: when,
            exited_at: when,
            last_signature: tx.signature,
            exit_side: side,
            funder: cur.funder ?? null,
            cluster_id: cur.cluster_id ?? null,
          });
          await db.from("holdings").delete().eq("token_mint", token.mint).eq("wallet", wallet);
        }
      } else {
        await db.from("holdings").upsert({
          token_mint: token.mint,
          wallet,
          balance,
          usd_value: balance * price,
          pct_supply: token.supply ? (balance / Number(token.supply)) * 100 : 0,
          cluster_id: cur?.cluster_id ?? null,
          funder: cur?.funder ?? null,
          first_activity: cur?.first_activity ?? when,
          last_activity: when,
          bought_usd: Number(cur?.bought_usd ?? 0) + (side === "buy" ? usd : 0),
          sold_usd: Number(cur?.sold_usd ?? 0) + (side === "sell" ? usd : 0),
        });
        if (!cur) await linkByFunder(token.mint, wallet);
      }

      await notify(token, wallet, side, usd, balance, tx.signature, !cur);
      if (side === "buy") await linkByTiming(token.mint, wallet, when);
    }

    // Recompute once per processed token transaction. This also picks up
    // direct TRANSFER relations and clears stale pool/router clusters.
    await recluster(token.mint);
  }
}

async function upsertWalletEdge(
  mint: string,
  fromWallet: string,
  toWallet: string,
  kind: "swap" | "transfer",
  amount: number,
  usdValue: number,
  when: string,
  signature: string,
) {
  const db = admin();
  const { data: cur } = await db
    .from("wallet_edges")
    .select("amount,usd_value,tx_count,first_seen")
    .eq("token_mint", mint)
    .eq("from_wallet", fromWallet)
    .eq("to_wallet", toWallet)
    .eq("kind", kind)
    .maybeSingle();

  await db.from("wallet_edges").upsert({
    token_mint: mint,
    from_wallet: fromWallet,
    to_wallet: toWallet,
    kind,
    amount: Number(cur?.amount ?? 0) + amount,
    usd_value: Number(cur?.usd_value ?? 0) + usdValue,
    tx_count: Number(cur?.tx_count ?? 0) + 1,
    first_seen: cur?.first_seen ?? when,
    last_seen: when,
    last_signature: signature,
  });
}

async function linkByFunder(mint: string, wallet: string) {
  const db = admin();
  const funder = await findFunder(wallet);
  if (!funder) return;
  await db.from("holdings").update({ funder }).eq("token_mint", mint).eq("wallet", wallet);
  const { data: sibs } = await db.from("holdings").select("wallet").eq("token_mint", mint).eq("funder", funder).neq("wallet", wallet);
  for (const s of sibs ?? []) {
    const [a, b] = [wallet, s.wallet].sort();
    const now = new Date().toISOString();
    const { data: prev } = await db.from("wallet_links")
      .select("signal_count,created_at")
      .eq("token_mint", mint).eq("wallet_a", a).eq("wallet_b", b).eq("kind", "funder")
      .maybeSingle();
    await db.from("wallet_links").upsert({
      token_mint: mint, wallet_a: a, wallet_b: b, kind: "funder",
      evidence: `общ funder ${funder}`,
      signal_count: Math.max(1, Number(prev?.signal_count ?? 0)),
      created_at: prev?.created_at ?? now,
      last_seen: now,
    });
  }
}

async function linkByTiming(mint: string, wallet: string, when: string) {
  const db = admin();
  const from = new Date(new Date(when).getTime() - TIMING_WINDOW_S * 1000).toISOString();
  const { data } = await db.from("transactions").select("wallet").eq("token_mint", mint).eq("side", "buy").gte("block_time", from).neq("wallet", wallet);
  const others = [...new Set((data ?? []).map(r => r.wallet))];
  for (const o of others) {
    const [a, b] = [wallet, o].sort();
    const { data: prev } = await db.from("wallet_links")
      .select("signal_count,created_at")
      .eq("token_mint", mint).eq("wallet_a", a).eq("wallet_b", b).eq("kind", "timing")
      .maybeSingle();
    await db.from("wallet_links").upsert({
      token_mint: mint, wallet_a: a, wallet_b: b, kind: "timing",
      evidence: `BUY в рамките на ${TIMING_WINDOW_S}s`,
      signal_count: Number(prev?.signal_count ?? 0) + 1,
      created_at: prev?.created_at ?? when,
      last_seen: when,
    });
  }
}

export async function recluster(mint: string) {
  const db = admin();
  const [{ data: rawLinks }, { data: rawEdges }, { data: hs }] = await Promise.all([
    db.from("wallet_links").select("wallet_a,wallet_b,kind,signal_count").eq("token_mint", mint),
    db.from("wallet_edges").select("from_wallet,to_wallet,kind,tx_count").eq("token_mint", mint),
    db.from("holdings").select("wallet,cluster_id").eq("token_mint", mint),
  ]);

  const holders = new Set((hs ?? []).map((h: any) => h.wallet));
  const walletLinks = (rawLinks ?? []).map((l: any) => ({
    a: l.wallet_a,
    b: l.wallet_b,
    kind: l.kind,
    signal_count: Number(l.signal_count ?? 1),
  }) as Link);
  const graphEdges = (rawEdges ?? []).map((e: any) => ({
    from_wallet: e.from_wallet,
    to_wallet: e.to_wallet,
    kind: e.kind,
    tx_count: Number(e.tx_count ?? 1),
  }) as GraphEdge);

  const { links } = buildClusterLinks(walletLinks, graphEdges, holders);
  const map = computeClusters(links);

  for (const h of hs ?? []) {
    const next = map.get(h.wallet) ?? null;
    if (next !== h.cluster_id) {
      await db.from("holdings").update({ cluster_id: next }).eq("token_mint", mint).eq("wallet", h.wallet);
    }
  }
}

async function notify(token: any, wallet: string, side: string, usd: number, balance: number, sig: string, isNew: boolean) {
  const sym = token.symbol ?? short(token.mint);
  const pct = token.supply ? (Math.max(balance, 0) / Number(token.supply)) * 100 : 0;
  const tx = `<a href="https://solscan.io/tx/${sig}">tx</a>`;
  const sell = side === "sell" || side === "transfer_out";
  if (isNew && !sell) await alert(`🆕 Нов holder ${short(wallet)} в <b>${sym}</b> · $${usd.toFixed(0)} · ${tx}`);
  if (usd >= BIG()) await alert(`${sell ? "🔴 Голям SELL" : "🟢 Голям BUY"} <b>${sym}</b> · ${short(wallet)} · $${usd.toFixed(0)} · ${tx}`);
  if (pct >= WHALE()) await alert(`🐋 ${short(wallet)} държи ${pct.toFixed(2)}% от <b>${sym}</b>`);
}
