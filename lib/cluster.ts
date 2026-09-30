// Вероятни връзки, НЕ доказателство за обща собственост.
export type Link = {
  a: string;
  b: string;
  kind: "funder" | "timing";
  signal_count?: number;
};

/**
 * Union-find clustering.
 * - common funder = strong signal
 * - timing = weak/probable signal, but one stored timing row is already a real
 *   observed co-buy event. Repeated observations increase signal_count.
 *
 * Cluster ids are deterministic for a given set of members so colors do not
 * randomly change after every webhook.
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
    if (l.kind === "funder") {
      union(l.a, l.b);
      continue;
    }
    // Previously this required two duplicate DB rows, but wallet_links has a
    // primary key on (token, pair, kind), so that condition could never happen.
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
