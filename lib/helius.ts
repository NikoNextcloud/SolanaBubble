const KEY = () => process.env.HELIUS_API_KEY!;
const RPC = () => `https://mainnet.helius-rpc.com/?api-key=${KEY()}`;

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const r = await fetch(RPC(), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}
export type Holder = { wallet: string; raw: bigint };

/** Всички текущи holders чрез DAS getTokenAccounts (странициране); сумира token accounts по owner. */
export async function fetchAllHolders(mint: string): Promise<Holder[]> {
  const byOwner = new Map<string, bigint>();
  let cursor: string | undefined;
  do {
    const res = await rpc<{ token_accounts: { owner: string; amount: number | string }[]; cursor?: string }>(
      "getTokenAccounts", { mint, limit: 1000, cursor, options: { showZeroBalance: false } });
    for (const a of res.token_accounts) byOwner.set(a.owner, (byOwner.get(a.owner) ?? 0n) + BigInt(a.amount));
    cursor = res.token_accounts.length ? res.cursor : undefined;
  } while (cursor);
  return [...byOwner].map(([wallet, raw]) => ({ wallet, raw })).filter(h => h.raw > 0n);
}
export async function fetchSupply(mint: string) {
  const r = await rpc<{ value: { uiAmount: number; decimals: number } }>("getTokenSupply", [mint]);
  return { supply: r.value.uiAmount, decimals: r.value.decimals };
}
/** Най-стария SOL превод към wallet в последните ~100 транзакции = вероятен funder (евристика). */
export async function findFunder(wallet: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${KEY()}&limit=100`);
    const txs: any[] = await r.json();
    for (const tx of [...txs].reverse())
      for (const n of tx.nativeTransfers ?? [])
        if (n.toUserAccount === wallet && n.fromUserAccount !== wallet && n.amount > 1_000_000) return n.fromUserAccount;
  } catch {}
  return null;
}
export async function fetchPriceUsd(mint: string): Promise<number> {
  try {
    const j = await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)).json();
    const best = (j.pairs ?? []).sort((a: any, b: any) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return Number(best?.priceUsd ?? 0);
  } catch { return 0; }
}


type HeliusWebhook = {
  webhookID: string;
  webhookURL: string;
  transactionTypes?: string[];
  accountAddresses?: string[];
  webhookType?: string;
  encoding?: string;
  txnStatus?: string;
};

/**
 * Ensures the production SolanaBubble Enhanced webhook also watches this mint.
 * This lets newly bootstrapped tokens start receiving live SWAP/TRANSFER events
 * without a manual Helius dashboard edit.
 */
export async function ensureWebhookTracksMint(mint: string) {
  const key = KEY();
  if (!key) throw new Error("HELIUS_API_KEY is missing");
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) throw new Error("HELIUS_WEBHOOK_SECRET is missing");

  const listRes = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${key}`, {
    cache: "no-store",
  });
  if (!listRes.ok) throw new Error(`Helius webhooks list failed: ${listRes.status}`);
  const all = await listRes.json() as HeliusWebhook[];
  const webhooks = Array.isArray(all) ? all : [];

  const candidates = webhooks.filter((w) =>
    typeof w.webhookURL === "string" && w.webhookURL.includes("/api/webhooks/helius")
  );
  if (!candidates.length) {
    throw new Error("No SolanaBubble Helius webhook was found");
  }

  const webhook =
    candidates.find((w) => w.webhookURL.includes("solanabubble.vercel.app")) ??
    candidates[0];

  const addresses = [...new Set([...(webhook.accountAddresses ?? []), mint])];
  if ((webhook.accountAddresses ?? []).includes(mint)) {
    return { webhookID: webhook.webhookID, addresses: addresses.length, added: false };
  }

  const transactionTypes = [...new Set([
    ...(webhook.transactionTypes ?? []),
    "SWAP",
    "TRANSFER",
  ])];

  const body: Record<string, unknown> = {
    webhookURL: webhook.webhookURL,
    transactionTypes,
    accountAddresses: addresses,
    webhookType: webhook.webhookType ?? "enhanced",
    authHeader: secret,
  };
  if (webhook.encoding) body.encoding = webhook.encoding;
  if (webhook.txnStatus) body.txnStatus = webhook.txnStatus;

  const updateRes = await fetch(
    `https://api.helius.xyz/v0/webhooks/${webhook.webhookID}?api-key=${key}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!updateRes.ok) {
    const detail = await updateRes.text().catch(() => "");
    throw new Error(`Helius webhook update failed: ${updateRes.status} ${detail.slice(0, 300)}`);
  }

  return { webhookID: webhook.webhookID, addresses: addresses.length, added: true };
}
