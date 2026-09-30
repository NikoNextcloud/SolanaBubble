import { admin } from "./db";

const SOL = "So11111111111111111111111111111111111111112";

function tokenAmount(entry: any): number {
  if (!entry) return 0;
  const raw = entry.rawTokenAmount;
  if (raw?.tokenAmount != null) {
    const decimals = Number(raw.decimals ?? 0);
    return Number(raw.tokenAmount) / Math.pow(10, decimals);
  }
  return Number(entry.tokenAmount ?? entry.amount ?? 0);
}

function pickToken(entries: any[]): { mint: string; amount: number; wallet?: string } | null {
  for (const e of entries ?? []) {
    if (!e?.mint) continue;
    const amount = tokenAmount(e);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return { mint: e.mint, amount, wallet: e.userAccount ?? e.toUserAccount ?? e.fromUserAccount };
  }
  return null;
}

function pickNative(entry: any): { mint: string; amount: number; wallet?: string } | null {
  if (!entry) return null;
  const raw = Number(entry.amount ?? entry.lamports ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return {
    mint: SOL,
    amount: raw > 1_000_000 ? raw / 1_000_000_000 : raw,
    wallet: entry.account ?? entry.userAccount,
  };
}

/**
 * Stores one normalized token->token swap from a Helius Enhanced transaction.
 * This runs for network DEX-program webhooks even when neither token is one of
 * the explicitly tracked holder-map tokens.
 */
export async function ingestNetworkSwap(tx: any) {
  if (tx?.type !== "SWAP" || !tx?.signature) return;

  const swap = tx?.events?.swap;
  if (!swap) return;

  const input = pickToken(swap.tokenInputs ?? []) ?? pickNative(swap.nativeInput);
  const output = pickToken(swap.tokenOutputs ?? []) ?? pickNative(swap.nativeOutput);
  if (!input || !output || input.mint === output.mint) return;

  const when = new Date((tx.timestamp ?? Date.now() / 1000) * 1000).toISOString();
  const db = admin();

  await db.from("network_swaps").upsert({
    signature: tx.signature,
    user_wallet: tx.feePayer ?? input.wallet ?? output.wallet ?? null,
    source: tx.source ?? "UNKNOWN",
    input_mint: input.mint,
    output_mint: output.mint,
    input_amount: input.amount,
    output_amount: output.amount,
    block_time: when,
  });
}
