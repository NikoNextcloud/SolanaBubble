// Вероятни връзки, НЕ доказателство за обща собственост.
export type Link = { a: string; b: string; kind: "funder" | "timing" };

/** Union-find. funder = силен сигнал; timing се брои само при >=2 съвпадения между същата двойка. */
export function computeClusters(links: Link[]): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (x: string): string => { if (!parent.has(x)) parent.set(x, x); const p = parent.get(x)!; if (p === x) return x; const r = find(p); parent.set(x, r); return r; };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const timing = new Map<string, number>();
  for (const l of links) {
    if (l.kind === "funder") union(l.a, l.b);
    else { const k = `${l.a}|${l.b}`; timing.set(k, (timing.get(k) ?? 0) + 1); }
  }
  for (const [k, n] of timing) if (n >= 2) { const [a, b] = k.split("|"); union(a, b); }
  const groups = new Map<string, string[]>();
  for (const w of parent.keys()) { const r = find(w); groups.set(r, [...(groups.get(r) ?? []), w]); }
  const out = new Map<string, number>(); let id = 1;
  for (const m of groups.values()) if (m.length > 1) { for (const w of m) out.set(w, id); id++; }
  return out;
}
