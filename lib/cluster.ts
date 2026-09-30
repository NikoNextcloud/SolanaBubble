// Вероятни връзки, НЕ доказателство за обща собственост.
export type Link = {
  a: string;
  b: string;
  kind: "funder" | "timing" | "transfer";
  signal_count?: number;
};

export type GraphEdge = {
  from_wallet: string;
  to_wallet: string;
  kind: "swap" | "transfer";
  tx_count?: number;
};

/**
 * Адреси с много swap counterparties и двупосочен поток най-често са
 * liquidity pool / router / aggregator accounts. Изключваме ги от wallet
 * clustering, за да не оцветим половината карта като една група.
 */
export function detectGraphHubs(edges: GraphEdge[], minDegree = 6): Set<string> {
  const peers = new Map<string, Set<string>>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();

  for (const e of edges) {
    if (e.kind !== "swap" || !e.from_wallet || !e.to_wallet || e.from_wallet === e.to_wallet) continue;
    const a = peers.get(e.from_wallet) ?? new Set<string>();
    const b = peers.get(e.to_wallet) ?? new Set<string>();
    a.add(e.to_wallet); b.add(e.from_wallet);
    peers.set(e.from_wallet, a); peers.set(e.to_wallet, b);
    outgoing.set(e.from_wallet, (outgoing.get(e.from_wallet) ?? 0) + 1);
    incoming.set(e.to_wallet, (incoming.get(e.to_wallet) ?? 0) + 1);
  }

  const hubs = new Set<string>();
  for (const [wallet, set] of peers) {
    const bothDirections = (incoming.get(wallet) ?? 0) > 0 && (outgoing.get(wallet) ?? 0) > 0;
    if (bothDirections && set.size >= minDegree) hubs.add(wallet);
  }
  return hubs;
}

/**
 * Изгражда само връзки, които са полезни за ownership-style клъстери.
 * - common funder: силен сигнал
 * - timing: вероятен сигнал, но pool/router адресите се изключват
 * - direct TRANSFER между два текущи holder-а: директен on-chain flow сигнал
 * SWAP edges не се union-ват директно, защото обикновено минават през pool/router.
 */
export function buildClusterLinks(
  walletLinks: Link[],
  graphEdges: GraphEdge[],
  currentHolders: Set<string>,
): { links: Link[]; hubs: Set<string> } {
  const hubs = detectGraphHubs(graphEdges);
  const links: Link[] = [];

  for (const l of walletLinks) {
    if (!currentHolders.has(l.a) || !currentHolders.has(l.b) || l.a === l.b) continue;
    if (l.kind === "timing" && (hubs.has(l.a) || hubs.has(l.b))) continue;
    links.push(l);
  }

  for (const e of graphEdges) {
    if (e.kind !== "transfer") continue;
    if (!currentHolders.has(e.from_wallet) || !currentHolders.has(e.to_wallet)) continue;
    if (hubs.has(e.from_wallet) || hubs.has(e.to_wallet) || e.from_wallet === e.to_wallet) continue;
    links.push({ a: e.from_wallet, b: e.to_wallet, kind: "transfer", signal_count: Number(e.tx_count ?? 1) });
  }

  return { links, hubs };
}

/**
 * Union-find clustering with deterministic ids, so cluster colors remain
 * stable between webhook updates.
 */
export function computeClusters(links: Link[]): Map<string, number> {
  const parent = new Map<string, string>();

  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };

  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const l of links) {
    if (!l.a || !l.b || l.a === l.b) continue;
    if ((l.signal_count ?? 1) >= 1) union(l.a, l.b);
  }

  const groups = new Map<string, string[]>();
  for (const w of parent.keys()) {
    const r = find(w);
    groups.set(r, [...(groups.get(r) ?? []), w]);
  }

  const out = new Map<string, number>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort();
    const id = stableId(members.join("|"));
    for (const w of members) out.set(w, id);
  }
  return out;
}

function stableId(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647 || 1;
}
