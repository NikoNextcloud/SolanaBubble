"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import { browserDb } from "@/lib/supabase-browser";

type H = { wallet: string; balance: number; usd_value: number; pct_supply: number; cluster_id: number | null; funder: string | null; first_activity: string | null; last_activity: string | null; bought_usd: number; sold_usd: number };
type N = H & { x: number; y: number; vx?: number; vy?: number; r: number; flash?: "buy" | "sell"; fk?: number };
type L = { source: string | N; target: string | N; kind: string };
const MAX_NODES = 500;
const hue = (id: number) => (id * 67) % 360;
const radius = (pct: number) => Math.max(4, Math.min(90, Math.sqrt(pct) * 34));
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`;

export default function BubbleMap({ mint }: { mint: string }) {
  const db = useMemo(() => browserDb(), []);
  const wrap = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, N>());
  const links = useRef<L[]>([]);
  const sim = useRef<Simulation<N, undefined>>(undefined);
  const [, bump] = useState(0);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [live, setLive] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [missing, setMissing] = useState(false);

  const restart = () => {
    const s = sim.current; if (!s) return;
    s.nodes([...nodes.current.values()]);
    s.force("link", forceLink<N, any>(links.current).id((d) => d.wallet).distance(60).strength(0.15));
    s.force("collide", forceCollide<N>((d) => d.r + 2).strength(0.9));
    s.alpha(0.5).restart();
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
    const s = forceSimulation<N>().alphaDecay(0.03).force("charge", forceManyBody().strength(-6));
    s.on("tick", () => bump((x) => x + 1)); sim.current = s;

    (async () => {
      const { data: t } = await db.from("tokens").select("mint").eq("mint", mint).maybeSingle();
      if (!t) { setMissing(true); return; }
      const [{ data: hs }, { data: ls }] = await Promise.all([
        db.from("holdings").select("*").eq("token_mint", mint).order("balance", { ascending: false }).limit(MAX_NODES),
        db.from("wallet_links").select("wallet_a,wallet_b,kind").eq("token_mint", mint),
      ]);
      if (!alive) return;
      (hs ?? []).forEach((h: any) => put(h, false));
      links.current = (ls ?? []).filter((l: any) => nodes.current.has(l.wallet_a) && nodes.current.has(l.wallet_b)).map((l: any) => ({ source: l.wallet_a, target: l.wallet_b, kind: l.kind }));
      restart();
    })();

    const ch = db.channel(`map:${mint}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "holdings", filter: `token_mint=eq.${mint}` }, (p: any) => {
        if (p.eventType === "DELETE") { nodes.current.delete(p.old.wallet); links.current = links.current.filter((l: any) => (l.source.wallet ?? l.source) !== p.old.wallet && (l.target.wallet ?? l.target) !== p.old.wallet); }
        else put(p.new, true);
        restart();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_links", filter: `token_mint=eq.${mint}` }, (p: any) => {
        if (nodes.current.has(p.new.wallet_a) && nodes.current.has(p.new.wallet_b)) { links.current.push({ source: p.new.wallet_a, target: p.new.wallet_b, kind: p.new.kind }); restart(); }
      })
      .subscribe((st) => setLive(st === "SUBSCRIBED"));
    return () => { alive = false; s.stop(); db.removeChannel(ch); };
  }, [mint]);

  useEffect(() => { // центриране + cluster притегляне
    const s = sim.current; if (!s) return;
    s.force("center", forceCenter(size.w / 2, size.h / 2).strength(0.05));
    s.force("x", forceX<N>((d) => d.cluster_id ? size.w / 2 + Math.cos(d.cluster_id * 2.4) * size.w * 0.22 : size.w / 2).strength(0.04));
    s.force("y", forceY<N>((d) => d.cluster_id ? size.h / 2 + Math.sin(d.cluster_id * 2.4) * size.h * 0.22 : size.h / 2).strength(0.04));
    s.alpha(0.3).restart();
  }, [size]);

  useEffect(() => {
    if (!sel) return; setTxs([]);
    db.from("transactions").select("signature,side,amount,usd_value,block_time").eq("token_mint", mint).eq("wallet", sel).order("block_time", { ascending: false }).limit(30).then(({ data }) => setTxs(data ?? []));
  }, [sel]);

  const arr = [...nodes.current.values()];
  const clusters = new Map<number, N[]>();
  arr.forEach((n) => n.cluster_id && clusters.set(n.cluster_id, [...(clusters.get(n.cluster_id) ?? []), n]));
  const s = sel ? nodes.current.get(sel) : null;
  const pl = s && s.bought_usd > 0 ? s.usd_value + s.sold_usd - s.bought_usd : null;

  return (
    <div className="stage">
      <div className="map" ref={wrap}>
        <div className="hud"><b>{short(mint)}</b><span>{arr.length} holders</span>
          <span className={`live ${live ? "on" : ""}`}><i />{live ? "на живо" : "свързване…"}</span></div>
        {missing && <div className="hud" style={{ top: 60 }}>Токенът не се следи. Стартирай <code>npm run bootstrap -- {mint}</code>.</div>}
        <svg role="img" aria-label="Карта на holders">
          {[...clusters].map(([id, m]) => {
            const cx = m.reduce((a, n) => a + n.x, 0) / m.length, cy = m.reduce((a, n) => a + n.y, 0) / m.length;
            const rr = Math.max(...m.map((n) => Math.hypot(n.x - cx, n.y - cy) + n.r)) + 10;
            return <circle key={id} cx={cx} cy={cy} r={rr} fill={`hsl(${hue(id)} 70% 55% / .09)`} stroke={`hsl(${hue(id)} 60% 45%)`} strokeDasharray="5 5" />;
          })}
          {links.current.map((l: any, i) => l.source.x !== undefined && (
            <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} stroke={l.kind === "funder" ? "#12202b" : "#5d6f7d"} strokeOpacity={0.45} strokeDasharray={l.kind === "timing" ? "3 4" : undefined} />
          ))}
          {arr.map((n) => (
            <circle key={`${n.wallet}:${n.fk ?? 0}`} className={`bubble ${n.flash ? `flash-${n.flash}` : ""}`} cx={n.x} cy={n.y} r={n.r}
              fill={n.cluster_id ? `hsl(${hue(n.cluster_id)} 65% 50%)` : "#2b5cff"} fillOpacity={0.78}
              stroke={sel === n.wallet ? "#12202b" : "#fff"} strokeWidth={sel === n.wallet ? 3 : 1.5}
              tabIndex={0} onClick={() => setSel(n.wallet)} onKeyDown={(e) => e.key === "Enter" && setSel(n.wallet)}><title>{short(n.wallet)} · {n.pct_supply.toFixed(2)}%</title></circle>
          ))}
        </svg>
      </div>
      <aside className="side">
        {!s ? <><h2>Избери балонче</h2><p className="note">Размерът показва дела от supply. Пунктираните групи са вероятни клъстери (общ funder или синхронни покупки) — <b>не доказателство</b>, че адресите са на един човек.</p></> : <>
          <h2><a href={`https://solscan.io/account/${s.wallet}`} target="_blank" rel="noreferrer">{short(s.wallet)}</a></h2>
          <dl>
            <dt>Баланс</dt><dd>{s.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd>
            <dt>Стойност</dt><dd>{usd(s.usd_value)}</dd>
            <dt>% от supply</dt><dd>{s.pct_supply.toFixed(3)}%</dd>
            <dt>Клъстер</dt><dd>{s.cluster_id ? `#${s.cluster_id} (вероятен)` : "—"}</dd>
            <dt>Funder</dt><dd>{s.funder ? short(s.funder) : "—"}</dd>
            <dt>Последна активност</dt><dd>{s.last_activity ? new Date(s.last_activity).toLocaleString("bg-BG") : "—"}</dd>
            <dt>P/L (оценка)</dt><dd className={pl === null ? "" : pl >= 0 ? "buy" : "sell"}>{pl === null ? "няма история" : usd(pl)}</dd>
          </dl>
          <ul className="tx">{txs.map((t) => <li key={t.signature}><span className={t.side.includes("buy") || t.side === "transfer_in" ? "buy" : "sell"}>{t.side}</span><span>{usd(t.usd_value)}</span><a href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer">{new Date(t.block_time).toLocaleTimeString("bg-BG")}</a></li>)}</ul>
          <p className="note">P/L се показва само за wallet-и с проследени покупки след старта; за по-стара история не е надеждно.</p></>}
      </aside>
    </div>
  );
}
