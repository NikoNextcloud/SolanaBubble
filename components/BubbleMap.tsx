"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import { browserDb } from "@/lib/supabase-browser";

type H = { wallet: string; balance: number; usd_value: number; pct_supply: number; cluster_id: number | null; funder: string | null; first_activity: string | null; last_activity: string | null; bought_usd: number; sold_usd: number };
type N = H & { x: number; y: number; vx?: number; vy?: number; r: number; flash?: "buy" | "sell"; fk?: number };
type L = { source: string | N; target: string | N; kind: string; group?: number };
type E = { from_wallet: string; to_wallet: string; kind: "swap" | "transfer"; amount: number; usd_value: number; tx_count: number; last_seen: string };

const MAX_NODES = 500;
const FAN_IN_MIN_SOURCES = 2;
const palette = ["#ff6f91", "#e56bd0", "#8b7cff", "#55c2ff", "#58d6a7", "#ffb45e", "#ff6473", "#60d4df"];
const groupColor = (id: number) => palette[Math.abs(id) % palette.length];
const radius = (pct: number) => Math.max(5, Math.min(74, Math.sqrt(Math.max(pct, 0)) * 30));
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`;

export default function BubbleMap({ mint }: { mint: string }) {
  const db = useMemo(() => browserDb(), []);
  const wrap = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, N>());
  const baseLinks = useRef<L[]>([]);
  const edges = useRef<E[]>([]);
  const links = useRef<L[]>([]);
  const sim = useRef<Simulation<N, undefined>>(undefined);
  const [, bump] = useState(0);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [live, setLive] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [missing, setMissing] = useState(false);

  const visualGroups = () => {
    const map = new Map<string, number>();

    // Existing backend clusters (funder/timing) stay visible.
    for (const n of nodes.current.values()) {
      if (n.cluster_id) map.set(n.wallet, n.cluster_id);
    }

    // Highlight only fan-in patterns: one wallet receiving the tracked token
    // from at least two distinct wallets that are also visible on the map.
    const inbound = new Map<string, Set<string>>();
    for (const e of edges.current) {
      if (!nodes.current.has(e.from_wallet) || !nodes.current.has(e.to_wallet)) continue;
      const set = inbound.get(e.to_wallet) ?? new Set<string>();
      set.add(e.from_wallet);
      inbound.set(e.to_wallet, set);
    }

    let next = 10000;
    for (const [target, sources] of inbound) {
      if (sources.size < FAN_IN_MIN_SOURCES) continue;
      const existing = map.get(target);
      const id = existing ?? next++;
      map.set(target, id);
      for (const src of sources) if (!map.has(src)) map.set(src, id);
    }
    return map;
  };

  const rebuildLinks = () => {
    const groups = visualGroups();
    const fanIn: L[] = [];

    const inbound = new Map<string, Set<string>>();
    for (const e of edges.current) {
      if (!nodes.current.has(e.from_wallet) || !nodes.current.has(e.to_wallet)) continue;
      const set = inbound.get(e.to_wallet) ?? new Set<string>();
      set.add(e.from_wallet);
      inbound.set(e.to_wallet, set);
    }

    for (const e of edges.current) {
      const sources = inbound.get(e.to_wallet);
      if (!sources || sources.size < FAN_IN_MIN_SOURCES) continue;
      fanIn.push({
        source: e.from_wallet,
        target: e.to_wallet,
        kind: e.kind === "swap" ? "flow-swap" : "flow-transfer",
        group: groups.get(e.to_wallet),
      });
    }

    links.current = [...baseLinks.current, ...fanIn];
  };

  const restart = () => {
    const s = sim.current; if (!s) return;
    rebuildLinks();
    s.nodes([...nodes.current.values()]);
    s.force("link", forceLink<N, any>(links.current).id((d) => d.wallet).distance((l: any) => l.kind.startsWith("flow-") ? 70 : 58).strength((l: any) => l.kind.startsWith("flow-") ? 0.28 : 0.14));
    s.force("collide", forceCollide<N>((d) => d.r + 4).strength(0.92));
    s.alpha(0.5).restart();
    bump((x) => x + 1);
  };

  const put = (h: H, animate: boolean) => {
    const prev = nodes.current.get(h.wallet);
    const n: N = prev ?? { ...h, x: size.w / 2 + (Math.random() - 0.5) * 40, y: size.h / 2 + (Math.random() - 0.5) * 40, r: 0 };
    const grew = prev ? h.balance > prev.balance : false, shrank = prev ? h.balance < prev.balance : false;
    Object.assign(n, h, { r: radius(h.pct_supply) });
    if (animate && prev && (grew || shrank)) { n.flash = grew ? "buy" : "sell"; n.fk = (n.fk ?? 0) + 1; }
    nodes.current.set(h.wallet, n);
  };

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    wrap.current && ro.observe(wrap.current); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    const s = forceSimulation<N>().alphaDecay(0.035).velocityDecay(0.4).force("charge", forceManyBody().strength(-10));
    s.on("tick", () => bump((x) => x + 1)); sim.current = s;

    (async () => {
      const { data: t } = await db.from("tokens").select("mint").eq("mint", mint).maybeSingle();
      if (!t) { setMissing(true); return; }
      const [{ data: hs }, { data: ls }, { data: es }] = await Promise.all([
        db.from("holdings").select("*").eq("token_mint", mint).order("balance", { ascending: false }).limit(MAX_NODES),
        db.from("wallet_links").select("wallet_a,wallet_b,kind").eq("token_mint", mint),
        db.from("wallet_edges").select("from_wallet,to_wallet,kind,amount,usd_value,tx_count,last_seen").eq("token_mint", mint),
      ]);
      if (!alive) return;
      (hs ?? []).forEach((h: any) => put(h, false));
      baseLinks.current = (ls ?? [])
        .filter((l: any) => nodes.current.has(l.wallet_a) && nodes.current.has(l.wallet_b))
        .map((l: any) => ({ source: l.wallet_a, target: l.wallet_b, kind: l.kind }));
      edges.current = (es ?? []) as E[];
      restart();
    })();

    const ch = db.channel(`map:${mint}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "holdings", filter: `token_mint=eq.${mint}` }, (p: any) => {
        if (p.eventType === "DELETE") {
          nodes.current.delete(p.old.wallet);
          baseLinks.current = baseLinks.current.filter((l: any) => (l.source.wallet ?? l.source) !== p.old.wallet && (l.target.wallet ?? l.target) !== p.old.wallet);
          edges.current = edges.current.filter((e) => e.from_wallet !== p.old.wallet && e.to_wallet !== p.old.wallet);
        } else put(p.new, true);
        restart();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_links", filter: `token_mint=eq.${mint}` }, (p: any) => {
        if (nodes.current.has(p.new.wallet_a) && nodes.current.has(p.new.wallet_b)) {
          baseLinks.current.push({ source: p.new.wallet_a, target: p.new.wallet_b, kind: p.new.kind });
          restart();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_edges", filter: `token_mint=eq.${mint}` }, (p: any) => {
        const row = p.new as E;
        const idx = edges.current.findIndex((e) => e.from_wallet === row.from_wallet && e.to_wallet === row.to_wallet && e.kind === row.kind);
        if (p.eventType === "DELETE") {
          if (idx >= 0) edges.current.splice(idx, 1);
        } else if (idx >= 0) {
          edges.current[idx] = row;
        } else {
          edges.current.push(row);
        }
        restart();
      })
      .subscribe((st) => setLive(st === "SUBSCRIBED"));

    return () => { alive = false; s.stop(); db.removeChannel(ch); };
  }, [mint]);

  useEffect(() => {
    const s = sim.current; if (!s) return;
    const groups = visualGroups();
    s.force("center", forceCenter(size.w / 2, size.h / 2).strength(0.04));
    s.force("x", forceX<N>((d) => {
      const g = groups.get(d.wallet);
      return g ? size.w / 2 + Math.cos(g * 2.17) * size.w * 0.25 : size.w / 2;
    }).strength((d) => groups.has(d.wallet) ? 0.08 : 0.025));
    s.force("y", forceY<N>((d) => {
      const g = groups.get(d.wallet);
      return g ? size.h / 2 + Math.sin(g * 2.17) * size.h * 0.25 : size.h / 2;
    }).strength((d) => groups.has(d.wallet) ? 0.08 : 0.025));
    s.alpha(0.35).restart();
  }, [size]);

  useEffect(() => {
    if (!sel) return; setTxs([]);
    db.from("transactions").select("signature,side,amount,usd_value,block_time").eq("token_mint", mint).eq("wallet", sel).order("block_time", { ascending: false }).limit(30).then(({ data }) => setTxs(data ?? []));
  }, [sel]);

  const arr = [...nodes.current.values()];
  const groups = visualGroups();
  const s = sel ? nodes.current.get(sel) : null;
  const pl = s && s.bought_usd > 0 ? s.usd_value + s.sold_usd - s.bought_usd : null;

  return (
    <div className="stage insight-stage">
      <div className="map insight-map" ref={wrap}>
        <div className="hud insight-hud">
          <b>{short(mint)}</b>
          <span>{arr.length} holders</span>
          <span className={`live ${live ? "on" : ""}`}><i />{live ? "на живо" : "свързване…"}</span>
        </div>
        {missing && <div className="hud" style={{ top: 60 }}>Токенът не се следи. Стартирай bootstrap за {mint}.</div>}
        <svg role="img" aria-label="Карта на holders">
          <defs>
            <marker id="flowArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>

          {links.current.map((l: any, i) => {
            if (l.source?.x === undefined || l.target?.x === undefined) return null;
            const flow = l.kind.startsWith("flow-");
            const color = flow && l.group ? groupColor(l.group) : "#3b4553";
            return <line
              key={i}
              x1={l.source.x} y1={l.source.y}
              x2={l.target.x} y2={l.target.y}
              stroke={color}
              strokeWidth={flow ? 1.7 : 1}
              strokeOpacity={flow ? 0.82 : 0.35}
              strokeDasharray={flow ? "5 5" : l.kind === "timing" ? "3 4" : undefined}
              markerEnd={flow ? "url(#flowArrow)" : undefined}
            />;
          })}

          {arr.map((n) => {
            const gid = groups.get(n.wallet);
            const color = gid ? groupColor(gid) : "#69717f";
            const selected = sel === n.wallet;
            return <circle
              key={`${n.wallet}:${n.fk ?? 0}`}
              className={`bubble insight-bubble ${n.flash ? `flash-${n.flash}` : ""}`}
              cx={n.x} cy={n.y} r={n.r}
              fill={gid ? color : "#171a21"}
              fillOpacity={gid ? 0.18 : 0.46}
              stroke={selected ? "#f4f7fb" : color}
              strokeWidth={selected ? 3 : gid ? 2.2 : 1.35}
              strokeDasharray={!gid && n.r <= 9 ? "2 2" : undefined}
              tabIndex={0}
              onClick={() => setSel(n.wallet)}
              onKeyDown={(e) => e.key === "Enter" && setSel(n.wallet)}
            >
              <title>{short(n.wallet)} · {n.pct_supply.toFixed(2)}%</title>
            </circle>;
          })}
        </svg>
      </div>

      <aside className="side insight-side">
        {!s ? <>
          <h2>Избери балонче</h2>
          <p className="note">Сивите балони са обикновени holders. Цветните групи показват вероятни връзки. Ако един wallet получава токена от поне два различни wallet-а, адресите се оцветяват еднакво и се свързват със стрелки. Това е on-chain сигнал, а не доказателство за общ собственик.</p>
        </> : <>
          <h2><a href={`https://solscan.io/account/${s.wallet}`} target="_blank" rel="noreferrer">{short(s.wallet)}</a></h2>
          <dl>
            <dt>Баланс</dt><dd>{s.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd>
            <dt>Стойност</dt><dd>{usd(s.usd_value)}</dd>
            <dt>% от supply</dt><dd>{s.pct_supply.toFixed(3)}%</dd>
            <dt>Група</dt><dd>{groups.get(s.wallet) ? `цветна група #${groups.get(s.wallet)}` : s.cluster_id ? `#${s.cluster_id}` : "—"}</dd>
            <dt>Funder</dt><dd>{s.funder ? short(s.funder) : "—"}</dd>
            <dt>Последна активност</dt><dd>{s.last_activity ? new Date(s.last_activity).toLocaleString("bg-BG") : "—"}</dd>
            <dt>P/L (оценка)</dt><dd className={pl === null ? "" : pl >= 0 ? "buy" : "sell"}>{pl === null ? "няма история" : usd(pl)}</dd>
          </dl>
          <ul className="tx">{txs.map((t) => <li key={t.signature}><span className={t.side.includes("buy") || t.side === "transfer_in" ? "buy" : "sell"}>{t.side}</span><span>{usd(t.usd_value)}</span><a href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer">{new Date(t.block_time).toLocaleTimeString("bg-BG")}</a></li>)}</ul>
          <p className="note">Цветните връзки са евристика от on-chain потока. Един човек може да контролира няколко адреса, но това не може да се докаже само от графа.</p>
        </>}
      </aside>
    </div>
  );
}
