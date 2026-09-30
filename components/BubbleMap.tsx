"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import { browserDb } from "@/lib/supabase-browser";

type H = { wallet: string; balance: number; usd_value: number; pct_supply: number; cluster_id: number | null; funder: string | null; first_activity: string | null; last_activity: string | null; bought_usd: number; sold_usd: number };
type N = H & { x: number; y: number; vx?: number; vy?: number; r: number; flash?: "buy" | "sell"; fk?: number };
type L = { source: string | N; target: string | N; kind: string; group?: number };
type E = { from_wallet: string; to_wallet: string; kind: "swap" | "transfer"; amount: number; usd_value: number; tx_count: number; last_seen: string };
type Tx = { signature: string; wallet: string; side: string; amount: number; usd_value: number; block_time: string };
type TokenMeta = { mint: string; symbol: string | null; name: string | null; supply: number | null; price_usd: number | null; decimals: number };

const MAX_NODES = 500;
const FAN_IN_MIN_SOURCES = 2;
const palette = ["#ff6f91", "#e56bd0", "#8b7cff", "#55c2ff", "#58d6a7", "#ffb45e", "#ff6473", "#60d4df"];
const groupColor = (id: number) => palette[Math.abs(id) % palette.length];
const radius = (pct: number) => Math.max(5, Math.min(74, Math.sqrt(Math.max(pct, 0)) * 30));
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`;
const num = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString();

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
  const [walletTxs, setWalletTxs] = useState<Tx[]>([]);
  const [feedTxs, setFeedTxs] = useState<Tx[]>([]);
  const [holderCount, setHolderCount] = useState(0);
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [view, setView] = useState<"map" | "holders" | "transactions">("map");

  const visualGroups = () => {
    const map = new Map<string, number>();

    for (const n of nodes.current.values()) {
      if (n.cluster_id) map.set(n.wallet, n.cluster_id);
    }

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
    Object.assign(n, h, { r: radius(Number(h.pct_supply)) });
    if (animate && prev && (grew || shrank)) { n.flash = grew ? "buy" : "sell"; n.fk = (n.fk ?? 0) + 1; }
    nodes.current.set(h.wallet, n);
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [view]);

  useEffect(() => {
    let alive = true;
    const s = forceSimulation<N>().alphaDecay(0.035).velocityDecay(0.4).force("charge", forceManyBody().strength(-10));
    s.on("tick", () => bump((x) => x + 1)); sim.current = s;

    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [
        { data: t },
        { data: hs },
        { data: ls },
        { data: es },
        { data: recent },
        { count },
      ] = await Promise.all([
        db.from("tokens").select("mint,symbol,name,supply,price_usd,decimals").eq("mint", mint).maybeSingle(),
        db.from("holdings").select("*").eq("token_mint", mint).order("balance", { ascending: false }).limit(MAX_NODES),
        db.from("wallet_links").select("wallet_a,wallet_b,kind").eq("token_mint", mint),
        db.from("wallet_edges").select("from_wallet,to_wallet,kind,amount,usd_value,tx_count,last_seen").eq("token_mint", mint),
        db.from("transactions").select("signature,wallet,side,amount,usd_value,block_time").eq("token_mint", mint).gte("block_time", since).order("block_time", { ascending: false }).limit(250),
        db.from("holdings").select("*", { count: "exact", head: true }).eq("token_mint", mint),
      ]);

      if (!alive) return;
      if (!t) { setMissing(true); return; }
      setMeta(t as TokenMeta);
      setFeedTxs((recent ?? []) as Tx[]);
      setHolderCount(count ?? hs?.length ?? 0);
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
          setHolderCount((x) => Math.max(0, x - 1));
          baseLinks.current = baseLinks.current.filter((l: any) => (l.source.wallet ?? l.source) !== p.old.wallet && (l.target.wallet ?? l.target) !== p.old.wallet);
          edges.current = edges.current.filter((e) => e.from_wallet !== p.old.wallet && e.to_wallet !== p.old.wallet);
        } else {
          if (p.eventType === "INSERT") setHolderCount((x) => x + 1);
          put(p.new, true);
        }
        restart();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wallet_links", filter: `token_mint=eq.${mint}` }, (p: any) => {
        if (nodes.current.has(p.new.wallet_a) && nodes.current.has(p.new.wallet_b)) {
          baseLinks.current.push({ source: p.new.wallet_a, target: p.new.wallet_b, kind: p.new.kind });
          restart();
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_edges", filter: `token_mint=eq.${mint}` }, (p: any) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as E;
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: `token_mint=eq.${mint}` }, (p: any) => {
        const row = p.new as Tx;
        setFeedTxs((cur) => [row, ...cur.filter((x) => !(x.signature === row.signature && x.wallet === row.wallet))].slice(0, 250));
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
    if (!sel) { setWalletTxs([]); return; }
    db.from("transactions")
      .select("signature,wallet,side,amount,usd_value,block_time")
      .eq("token_mint", mint)
      .eq("wallet", sel)
      .order("block_time", { ascending: false })
      .limit(30)
      .then(({ data }) => setWalletTxs((data ?? []) as Tx[]));
  }, [sel]);

  const arr = [...nodes.current.values()];
  const groups = visualGroups();
  const selected = sel ? nodes.current.get(sel) : null;
  const pl = selected && selected.bought_usd > 0 ? selected.usd_value + selected.sold_usd - selected.bought_usd : null;
  const groupCount = new Set(groups.values()).size;
  const volume24h = feedTxs.reduce((a, t) => a + Number(t.usd_value || 0), 0) / 2;
  const buys24h = feedTxs.filter((t) => t.side === "buy").length;
  const sells24h = feedTxs.filter((t) => t.side === "sell").length;
  const related = selected ? edges.current
    .filter((e) => e.from_wallet === selected.wallet || e.to_wallet === selected.wallet)
    .sort((a, b) => Number(b.usd_value) - Number(a.usd_value))
    .slice(0, 10) : [];

  return (
    <div className="stage insight-stage">
      <section className="workspace">
        <header className="dash-topbar">
          <div className="brand-block">
            <a className="brand" href="/">SolanaBubble</a>
            <div className="token-title">
              <strong>{meta?.symbol || meta?.name || short(mint)}</strong>
              <span title={mint}>{short(mint)}</span>
            </div>
          </div>
          <div className={`live-pill ${live ? "on" : ""}`}><i />{live ? "Live" : "Connecting"}</div>
        </header>

        <div className="metric-strip">
          <div><span>Price</span><b>{usd(Number(meta?.price_usd ?? 0))}</b></div>
          <div><span>Holders</span><b>{holderCount.toLocaleString()}</b></div>
          <div><span>24h tracked volume</span><b>{usd(volume24h)}</b></div>
          <div><span>Buy / Sell</span><b><em className="buy">{buys24h}</em> / <em className="sell">{sells24h}</em></b></div>
          <div><span>Linked groups</span><b>{groupCount}</b></div>
          <div><span>Supply</span><b>{num(Number(meta?.supply ?? 0))}</b></div>
        </div>

        <nav className="view-tabs" aria-label="Token views">
          <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Bubble map</button>
          <button className={view === "holders" ? "active" : ""} onClick={() => setView("holders")}>Holders</button>
          <button className={view === "transactions" ? "active" : ""} onClick={() => setView("transactions")}>Transactions</button>
        </nav>

        <div className="work-content">
          {view === "map" && <div className="map insight-map" ref={wrap}>
            {missing && <div className="map-message">Токенът не се следи. Стартирай bootstrap за {mint}.</div>}
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
                const active = sel === n.wallet;
                return <circle
                  key={`${n.wallet}:${n.fk ?? 0}`}
                  className={`bubble insight-bubble ${n.flash ? `flash-${n.flash}` : ""}`}
                  cx={n.x} cy={n.y} r={n.r}
                  fill={gid ? color : "#171a21"}
                  fillOpacity={gid ? 0.18 : 0.46}
                  stroke={active ? "#f4f7fb" : color}
                  strokeWidth={active ? 3 : gid ? 2.2 : 1.35}
                  strokeDasharray={!gid && n.r <= 9 ? "2 2" : undefined}
                  tabIndex={0}
                  onClick={() => setSel(n.wallet)}
                  onKeyDown={(e) => e.key === "Enter" && setSel(n.wallet)}
                >
                  <title>{short(n.wallet)} · {Number(n.pct_supply).toFixed(2)}%</title>
                </circle>;
              })}
            </svg>

            <div className="map-legend">
              <span><i className="legend-normal" />holder</span>
              <span><i className="legend-linked" />linked wallets</span>
              <span><i className="legend-flow" />token flow</span>
            </div>
          </div>}

          {view === "holders" && <div className="data-view">
            <div className="data-head"><h2>Top holders</h2><span>{Math.min(arr.length, MAX_NODES)} shown</span></div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>#</th><th>Wallet</th><th>Balance</th><th>Value</th><th>% supply</th><th>Group</th><th>Last activity</th></tr></thead>
              <tbody>{[...arr].sort((a, b) => Number(b.balance) - Number(a.balance)).map((h, i) => <tr key={h.wallet} onClick={() => setSel(h.wallet)}>
                <td>{i + 1}</td>
                <td><a href={`https://solscan.io/account/${h.wallet}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{short(h.wallet)}</a></td>
                <td>{Number(h.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{usd(Number(h.usd_value))}</td>
                <td>{Number(h.pct_supply).toFixed(3)}%</td>
                <td>{groups.get(h.wallet) ? <span className="group-dot" style={{ background: groupColor(groups.get(h.wallet)!) }} /> : "—"}</td>
                <td>{h.last_activity ? new Date(h.last_activity).toLocaleString("bg-BG") : "—"}</td>
              </tr>)}</tbody>
            </table></div>
          </div>}

          {view === "transactions" && <div className="data-view">
            <div className="data-head"><h2>Live transactions</h2><span>last 24h · up to 250 records</span></div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Time</th><th>Wallet</th><th>Side</th><th>Amount</th><th>USD</th><th>Tx</th></tr></thead>
              <tbody>{feedTxs.map((t) => <tr key={`${t.signature}:${t.wallet}`} onClick={() => setSel(t.wallet)}>
                <td>{new Date(t.block_time).toLocaleTimeString("bg-BG")}</td>
                <td>{short(t.wallet)}</td>
                <td><span className={t.side === "buy" || t.side === "transfer_in" ? "side-badge buy" : "side-badge sell"}>{t.side}</span></td>
                <td>{Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                <td>{usd(Number(t.usd_value))}</td>
                <td><a href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Solscan ↗</a></td>
              </tr>)}</tbody>
            </table></div>
          </div>}
        </div>
      </section>

      <aside className="side insight-side">
        {!selected ? <>
          <div className="side-section">
            <span className="eyebrow">Token overview</span>
            <h2>{meta?.name || meta?.symbol || short(mint)}</h2>
            <p className="mint-full">{mint}</p>
          </div>
          <div className="side-section">
            <span className="eyebrow">Live activity</span>
            <ul className="activity-list">{feedTxs.slice(0, 8).map((t) => <li key={`${t.signature}:${t.wallet}`}>
              <span className={t.side === "buy" || t.side === "transfer_in" ? "activity-dot buy-bg" : "activity-dot sell-bg"} />
              <button onClick={() => setSel(t.wallet)}>{short(t.wallet)}</button>
              <span>{usd(Number(t.usd_value))}</span>
            </li>)}</ul>
          </div>
          <div className="side-section">
            <span className="eyebrow">How links work</span>
            <p className="note">Цветните групи са вероятни on-chain връзки. Общ funder, синхронни покупки или token flow между няколко wallet-а са сигнали, но не доказват общ собственик.</p>
          </div>
        </> : <>
          <div className="side-section">
            <button className="back-link" onClick={() => setSel(null)}>← Token overview</button>
            <span className="eyebrow">Wallet inspector</span>
            <h2><a href={`https://solscan.io/account/${selected.wallet}`} target="_blank" rel="noreferrer">{short(selected.wallet)} ↗</a></h2>
            <p className="mint-full">{selected.wallet}</p>
          </div>

          <div className="side-section">
            <dl>
              <dt>Balance</dt><dd>{Number(selected.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd>
              <dt>Value</dt><dd>{usd(Number(selected.usd_value))}</dd>
              <dt>% supply</dt><dd>{Number(selected.pct_supply).toFixed(3)}%</dd>
              <dt>Group</dt><dd>{groups.get(selected.wallet) ? <><span className="group-dot" style={{ background: groupColor(groups.get(selected.wallet)!) }} /> #{groups.get(selected.wallet)}</> : "—"}</dd>
              <dt>Funder</dt><dd>{selected.funder ? short(selected.funder) : "—"}</dd>
              <dt>Last activity</dt><dd>{selected.last_activity ? new Date(selected.last_activity).toLocaleString("bg-BG") : "—"}</dd>
              <dt>P/L estimate</dt><dd className={pl === null ? "" : pl >= 0 ? "buy" : "sell"}>{pl === null ? "no tracked history" : usd(pl)}</dd>
            </dl>
          </div>

          {related.length > 0 && <div className="side-section">
            <span className="eyebrow">Connected wallets</span>
            <ul className="connection-list">{related.map((e) => {
              const outgoing = e.from_wallet === selected.wallet;
              const other = outgoing ? e.to_wallet : e.from_wallet;
              return <li key={`${e.from_wallet}:${e.to_wallet}:${e.kind}`}>
                <span>{outgoing ? "→" : "←"}</span>
                <button onClick={() => setSel(other)}>{short(other)}</button>
                <small>{e.kind} · {usd(Number(e.usd_value))}</small>
              </li>;
            })}</ul>
          </div>}

          <div className="side-section">
            <span className="eyebrow">Wallet transactions</span>
            <ul className="tx">{walletTxs.slice(0, 12).map((t) => <li key={t.signature}>
              <span className={t.side === "buy" || t.side === "transfer_in" ? "buy" : "sell"}>{t.side}</span>
              <span>{usd(Number(t.usd_value))}</span>
              <a href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer">{new Date(t.block_time).toLocaleTimeString("bg-BG")}</a>
            </li>)}</ul>
          </div>
        </>}
      </aside>
    </div>
  );
}
