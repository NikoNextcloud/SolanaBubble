"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import { useRouter } from "next/navigation";

type MarketToken = {
  mint: string;
  name: string | null;
  symbol: string | null;
  dex: string | null;
  pairAddress: string | null;
  priceUsd: number;
  marketCap: number;
  liquidityUsd: number;
  volume1h: number;
  volume24h: number;
  buys1h: number;
  sells1h: number;
  trades1h: number;
  priceChange1h: number;
  priceChange24h: number;
  boost: number;
  quoteMint?: string | null;
  quoteSymbol?: string | null;
};

type Node = MarketToken & {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  r: number;
  isCore?: boolean;
};

type DataSource = "free" | "solscan";

type Flow = {
  from: string;
  to: string;
  usd1h: number;
  trades1h: number;
  kind: "buy" | "sell";
  dex: string | null;
};

const fmtUsd = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toPrecision(4)}`;
};

function radius(t: MarketToken) {
  const activity = Math.max(1, t.volume1h + t.trades1h * 25 + t.boost * 30);
  return Math.max(9, Math.min(50, 5 + Math.log10(activity + 10) * 7));
}

function flowColor(t: MarketToken) {
  const total = Math.max(1, t.buys1h + t.sells1h);
  const ratio = (t.buys1h - t.sells1h) / total;
  if (ratio > 0.18) return "#46d58d";
  if (ratio < -0.18) return "#ff6473";
  return "#76808e";
}

const CORE_META: Record<string, { symbol: string; name: string }> = {
  "So11111111111111111111111111111111111111112": { symbol: "SOL", name: "Wrapped SOL" },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC", name: "USD Coin" },
  "Es9vMFrzaCERmJfrF4H2FYDgHkmPG8TbQnYQ8V4a8Qj": { symbol: "USDT", name: "Tether" },
};

function edgePoint(a: Node, b: Node, gap = 4) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  return {
    x1: a.x + ux * (a.r + gap),
    y1: a.y + uy * (a.r + gap),
    x2: b.x - ux * (b.r + gap),
    y2: b.y - uy * (b.r + gap),
  };
}

export default function MarketMap() {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const sim = useRef<Simulation<any, any> | null>(null);
  const nodeMap = useRef(new Map<string, Node>());
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [motionNow, setMotionNow] = useState(0);
  const [updated, setUpdated] = useState<string | null>(null);
  const [networkSwaps1h, setNetworkSwaps1h] = useState(0);
  const [dataSource, setDataSource] = useState<DataSource>("free");
  const [streamLive, setStreamLive] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);
  const [selected, setSelected] = useState<MarketToken | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [solscanInfo, setSolscanInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const lastActivity = useRef(Date.now());

  const totals = useMemo(() => {
    return tokens.reduce((a, t) => ({
      volume: a.volume + t.volume1h,
      buys: a.buys + t.buys1h,
      sells: a.sells + t.sells1h,
      liquidity: a.liquidity + t.liquidityUsd,
    }), { volume: 0, buys: 0, sells: 0, liquidity: 0 });
  }, [tokens]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (streamLive !== true) return;
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= 50) {
        last = now;
        setMotionNow(now);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [streamLive, dataSource]);

  useEffect(() => {
    const s = forceSimulation<any>()
      .alphaDecay(0.025)
      .velocityDecay(0.35)
      .force("charge", forceManyBody().strength(-12))
      .on("tick", () => setTick((x) => x + 1));
    sim.current = s;
    return () => { s.stop(); };
  }, []);

  useEffect(() => {
    const s = sim.current;
    if (!s) return;
    const nodes = [...nodeMap.current.values()];
    const links = flows
      .filter((f) => nodeMap.current.has(f.from) && nodeMap.current.has(f.to))
      .map((f) => ({ source: f.from, target: f.to, usd1h: f.usd1h }));

    s.nodes(nodes);
    s.force("center", forceCenter(size.w / 2, size.h / 2).strength(0.025));
    s.force("charge", forceManyBody().strength((d: any) => d.isCore ? -190 : -30));
    s.force("x", forceX<any>((d) => {
      if (d.isCore) {
        if (d.symbol === "SOL") return size.w * 0.5;
        if (d.symbol === "USDC") return size.w * 0.28;
        return size.w * 0.72;
      }
      const imbalance = (d.buys1h - d.sells1h) / Math.max(1, d.buys1h + d.sells1h);
      return size.w / 2 + imbalance * size.w * 0.28;
    }).strength((d: any) => d.isCore ? 0.18 : 0.045));
    s.force("y", forceY<any>((d) => {
      if (d.isCore) return size.h * 0.52;
      const activityRank = Math.min(1, Math.log10(Math.max(1, d.volume1h)) / 7);
      return size.h * (0.6 - activityRank * 0.19);
    }).strength((d: any) => d.isCore ? 0.18 : 0.04));
    s.force("link", forceLink<any, any>(links)
      .id((d: any) => d.mint)
      .distance((l: any) => 110 + Math.max(0, 90 - Math.log10(Math.max(1, l.usd1h)) * 10))
      .strength((l: any) => Math.min(0.32, 0.06 + Math.log10(Math.max(1, l.usd1h)) * 0.03)));
    s.force("collide", forceCollide<any>((d) => d.r + (d.isCore ? 14 : 9)).strength(0.96));
    s.alpha(0.72).restart();
  }, [size, tokens, flows]);

  const applySnapshot = (j: any) => {
    const list = (j.tokens ?? []) as MarketToken[];
    const nextFlows = (j.flows ?? []) as Flow[];
    setTokens(list);
    setFlows(nextFlows);
    setUpdated(j.fetchedAt ?? new Date().toISOString());
    setNetworkSwaps1h(Number(j.network?.swaps1h ?? 0));
    setError("");

    for (const t of list) {
      const prev = nodeMap.current.get(t.mint);
      if (prev) Object.assign(prev, t, { r: radius(t), isCore: false });
      else nodeMap.current.set(t.mint, {
        ...t,
        x: size.w / 2 + (Math.random() - 0.5) * 180,
        y: size.h / 2 + (Math.random() - 0.5) * 140,
        r: radius(t),
        isCore: false,
      });
    }

    const usedCore = new Set<string>();
    for (const flow of nextFlows) {
      if (CORE_META[flow.from]) usedCore.add(flow.from);
      if (CORE_META[flow.to]) usedCore.add(flow.to);
    }
    for (const mint of usedCore) {
      const meta = CORE_META[mint];
      const prev = nodeMap.current.get(mint);
      const coreNode: MarketToken = {
        mint, name: meta.name, symbol: meta.symbol, dex: null, pairAddress: null,
        priceUsd: meta.symbol === "USDC" || meta.symbol === "USDT" ? 1 : 0,
        marketCap: 0, liquidityUsd: 0, volume1h: 0, volume24h: 0,
        buys1h: 0, sells1h: 0, trades1h: 0, priceChange1h: 0,
        priceChange24h: 0, boost: 0,
      };
      if (prev) Object.assign(prev, coreNode, { r: meta.symbol === "SOL" ? 42 : 34, isCore: true });
      else nodeMap.current.set(mint, {
        ...coreNode,
        x: size.w / 2 + (Math.random() - 0.5) * 80,
        y: size.h / 2 + (Math.random() - 0.5) * 80,
        r: meta.symbol === "SOL" ? 42 : 34,
        isCore: true,
      });
    }

    const allowed = new Set([...list.map((x) => x.mint), ...usedCore]);
    for (const key of [...nodeMap.current.keys()]) if (!allowed.has(key)) nodeMap.current.delete(key);
  };

  function chooseSource(source: DataSource) {
    setDataSource(source);
    setSelected(null);
    setError("");
    setStreamLive(true);
    try {
      const cached = localStorage.getItem(`solanabubble:market-snapshot:${source}`);
      if (cached) applySnapshot(JSON.parse(cached));
    } catch {}
  }

  useEffect(() => {
    const syncVisibility = () => setTabVisible(document.visibilityState === "visible");
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    if (streamLive !== true || !dataSource || !tabVisible) return;
    let stopped = false;

    async function load() {
      try {
        const endpoint = dataSource === "free" ? "/api/market" : "/api/market/solscan";
        const r = await fetch(endpoint, { cache: "no-store" });
        if (!r.ok) throw new Error("market");
        const j = await r.json();
        if (stopped) return;
        applySnapshot(j);
        try { localStorage.setItem(`solanabubble:market-snapshot:${dataSource}`, JSON.stringify(j)); } catch {}
      } catch {
        if (!stopped) setError("Не успях да обновя live пазарния поток. Показвам последния кеш.");
      }
    }

    load();
    const id = window.setInterval(load, dataSource === "free" ? 20000 : 30000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [streamLive, dataSource, tabVisible]);

  async function changeLive(next: boolean, automatic = false) {
    setError("");
    setStreamLive(next);
    setAutoPaused(automatic && !next);
    lastActivity.current = Date.now();
    if (next) sim.current?.alpha(0.55).restart();
    else sim.current?.stop();
  }

  useEffect(() => {
    const activity = () => {
      lastActivity.current = Date.now();
      if (autoPaused) setAutoPaused(false);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, activity, { passive: true });

    const timer = window.setInterval(() => {
      if (streamLive === true && Date.now() - lastActivity.current >= 2 * 60 * 1000) {
        changeLive(false, true);
      }
    }, 10000);

    return () => {
      for (const name of events) window.removeEventListener(name, activity);
      window.clearInterval(timer);
    };
  }, [streamLive, autoPaused, dataSource]);

  useEffect(() => {
    if (!selected || streamLive !== true) {
      setSolscanInfo(null);
      return;
    }
    let stopped = false;
    fetch(`/api/tokens/${selected.mint}/solscan`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (!stopped && j) setSolscanInfo(j); })
      .catch(() => null);
    return () => { stopped = true; };
  }, [selected?.mint, streamLive]);

  async function openToken(t: MarketToken) {
    setLoadingMint(t.mint);
    setError("");
    try {
      const r = await fetch("/api/tokens/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint: t.mint }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "track");
      router.push(`/token/${t.mint}`);
    } catch {
      setError("Неуспешно зареждане на holder картата за този токен.");
      setLoadingMint(null);
    }
  }

  const nodes = [...nodeMap.current.values()];
  const visibleFlows = flows
    .map((f) => ({ ...f, source: nodeMap.current.get(f.from), target: nodeMap.current.get(f.to) }))
    .filter((f) => f.source && f.target)
    .slice(0, 100);
  void tick;

  return (
    <main className="market-shell">
      <header className="market-topbar">
        <div>
          <a className="brand" href="/">SolanaBubble</a>
          <span className="market-subtitle">Източник: {dataSource === "free" ? "Solana RPC + DexScreener" : "Solscan"}</span>
        </div>
        <div className="market-actions">
          <button className="source-switch" onClick={() => { setDataSource(null); setStreamLive(null); sim.current?.stop(); }}>Смени източника</button>
          <a href="/admin">База данни</a>
          <span className={`market-live ${streamLive === false ? "paused" : ""}`}><i />{streamLive === false ? "PAUSED" : "LIVE"}</span>
        </div>
      </header>

      <section className="market-stats">
        <div><span>Токени на картата</span><b>{tokens.length}</b></div>
        <div><span>1ч. обем</span><b>{fmtUsd(totals.volume)}</b></div>
        <div><span>Покупки / продажби</span><b>{totals.buys} / {totals.sells}</b></div>
        <div><span>Ликвидност</span><b>{fmtUsd(totals.liquidity)}</b></div>
        <div><span>{dataSource === "free" ? "Пазарни потоци 1ч." : "Solscan feed"}</span><b>{dataSource === "free" ? networkSwaps1h.toLocaleString() : "ACTIVE"}</b></div>
      </section>

      <section className="market-workspace">
        <div className="market-map" ref={wrap}>
          <div className="insight-live-bar">
            <button className="ghost-control">☷ Токени</button>
            <button className="ghost-control">↕ Филтри</button>
            <button
              className={`go-live-control ${streamLive === true ? "is-live" : ""}`}
              onClick={() => changeLive(streamLive !== true)}
            >{streamLive === true ? "◉ Live" : "◉ Go Live"}</button>
          </div>
          <button
            className={`market-pause-orb ${streamLive === false ? "paused" : ""}`}
            onClick={() => changeLive(streamLive !== true)}
            title={streamLive === true ? "Пауза на live обновяванията" : "Пусни live обновяванията"}
          >{streamLive === true ? "Ⅱ" : "▶"}</button>
          {streamLive === false && <div className="pause-banner">
            {autoPaused ? "Автоматична пауза след 2 мин. без активност" : "Live режимът е на пауза"} · данните са от кеша
          </div>}
          <div className="market-map-head">
            <div>
              <strong>{dataSource === "free" ? "Solana RPC + DexScreener market flow" : "Solscan market map"}</strong>
              <span>Размер = активност · стрелките показват посоката на капиталовия поток между quote asset и токена</span>
            </div>
            <span>{updated ? `обновено ${new Date(updated).toLocaleTimeString("bg-BG")}` : "зареждане…"}</span>
          </div>

          <svg>
            <defs>
              <radialGradient id="marketGlow">
                <stop offset="0%" stopColor="#87909f" stopOpacity=".16" />
                <stop offset="55%" stopColor="#4c5563" stopOpacity=".05" />
                <stop offset="100%" stopColor="#0e1015" stopOpacity="0" />
              </radialGradient>
              <marker id="marketArrowBuy" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#46d58d" />
              </marker>
              <marker id="marketArrowSell" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff6473" />
              </marker>
            </defs>
            <ellipse cx={size.w / 2} cy={size.h / 2} rx={size.w * .34} ry={size.h * .34} fill="url(#marketGlow)" />

            {visibleFlows.map((f, i) => {
              const source = f.source as Node;
              const target = f.target as Node;
              const p = edgePoint(source, target, 5);
              const color = f.kind === "buy" ? "#46d58d" : "#ff6473";
              const width = Math.max(.7, Math.min(4.2, .55 + Math.log10(Math.max(1, f.usd1h)) * .55));
              const opacity = Math.max(.18, Math.min(.82, .2 + Math.log10(Math.max(1, f.usd1h)) * .08));
              return <line
                key={`flow:${f.from}:${f.to}:${f.kind}:${i}`}
                x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
                stroke={color}
                strokeWidth={width}
                strokeOpacity={opacity}
                strokeDasharray="4 5"
                markerEnd={f.kind === "buy" ? "url(#marketArrowBuy)" : "url(#marketArrowSell)"}
                className="market-flow-line"
              >
                <title>{`${f.kind === "buy" ? "Капитал към" : "Капитал от"} ${target.symbol || target.mint.slice(0, 5)} · ${fmtUsd(f.usd1h)} / 1ч. · ${f.trades1h} tx`}</title>
              </line>;
            })}

            {visibleFlows.slice(0, 60).map((f, i) => {
              const source = f.source as Node;
              const target = f.target as Node;
              const p = edgePoint(source, target, 6);
              const speed = 1100 + (i % 7) * 160;
              const progress = ((motionNow / speed) + i * .149) % 1;
              const x = p.x1 + (p.x2 - p.x1) * progress;
              const y = p.y1 + (p.y2 - p.y1) * progress;
              return <circle
                key={`particle:${f.from}:${f.to}:${i}`}
                cx={x} cy={y}
                r={Math.max(1.4, Math.min(3.5, 1.2 + Math.log10(Math.max(1, f.usd1h)) * .28))}
                fill={f.kind === "buy" ? "#8ff0bd" : "#ff9aa5"}
                className="market-traffic-particle"
                pointerEvents="none"
              />;
            })}

            {nodes.map((n, i) => {
              const color = flowColor(n);
              const total = Math.max(1, n.buys1h + n.sells1h);
              const imbalance = (n.buys1h - n.sells1h) / total;
              const pulse = n.isCore ? 1 + Math.sin(motionNow / 900 + i) * .025 : 1 + Math.sin(motionNow / 700 + i) * Math.min(.07, Math.abs(imbalance) * .08);
              return <g key={n.mint} transform={`translate(${n.x} ${n.y}) scale(${pulse})`}>
                <circle
                  r={n.r + 5}
                  fill="none"
                  stroke={color}
                  strokeOpacity=".12"
                  strokeWidth="1"
                  className="market-halo"
                />
                <circle
                  r={n.r}
                  fill={n.isCore ? "#202733" : "#15191f"}
                  fillOpacity={n.isCore ? ".98" : ".94"}
                  stroke={selected?.mint === n.mint ? "#ffffff" : n.isCore ? "#a8b2c0" : color}
                  strokeWidth={selected?.mint === n.mint ? 2.5 : 1.5}
                  className={n.isCore ? "market-token-bubble market-core-bubble" : "market-token-bubble"}
                  onClick={() => { if (!n.isCore) setSelected(n); }}
                >
                  <title>{n.symbol || n.name || n.mint}</title>
                </circle>
                {n.r >= 17 && <text textAnchor="middle" dy="4" className="market-symbol">{n.symbol || "?"}</text>}
                {n.volume1h > 0 && <circle
                  className="market-flow-dot"
                  r="2"
                  fill={color}
                  cx={Math.cos(motionNow / 900 + i) * (n.r + 9)}
                  cy={Math.sin(motionNow / 900 + i) * (n.r + 9)}
                />}
              </g>;
            })}
          </svg>

          <div className="market-legend">
            <span><i className="market-buy-dot" />капитал към токена</span>
            <span><i className="market-neutral-dot" />SOL / USDC / USDT центрове</span>
            <span><i className="market-sell-dot" />капитал от токена</span>
          </div>
        </div>

        <aside className="market-side">
          {!selected ? <>
            <h2>Пазарен поток</h2>
            <p>Кликни върху токен, за да видиш данните му и да отвориш holder картата.</p>
            <div className="market-rank">
              {tokens.slice(0, 12).map((t, i) => <button key={t.mint} onClick={() => setSelected(t)}>
                <span>{i + 1}</span>
                <strong>{t.symbol || t.name || t.mint.slice(0, 6)}</strong>
                <small>{fmtUsd(t.volume1h)}</small>
              </button>)}
            </div>
          </> : <>
            <button className="market-back" onClick={() => setSelected(null)}>← Всички токени</button>
            <div className="market-token-title">
              <span className="market-token-dot" style={{ background: flowColor(selected) }} />
              <div><h2>{selected.symbol || selected.name || "Token"}</h2><p>{selected.name}</p></div>
            </div>
            <dl className="market-token-stats">
              <dt>Цена</dt><dd>{fmtUsd(selected.priceUsd)}</dd>
              <dt>Market cap</dt><dd>{fmtUsd(selected.marketCap)}</dd>
              <dt>Ликвидност</dt><dd>{fmtUsd(selected.liquidityUsd)}</dd>
              <dt>Обем 1ч.</dt><dd>{fmtUsd(selected.volume1h)}</dd>
              <dt>Обем 24ч.</dt><dd>{fmtUsd(selected.volume24h)}</dd>
              <dt>Покупки 1ч.</dt><dd>{selected.buys1h}</dd>
              <dt>Продажби 1ч.</dt><dd>{selected.sells1h}</dd>
              <dt>Промяна 1ч.</dt><dd className={selected.priceChange1h >= 0 ? "buy" : "sell"}>{selected.priceChange1h.toFixed(2)}%</dd>
              {solscanInfo?.meta?.holder != null && <><dt>Holders (Solscan)</dt><dd>{Number(solscanInfo.meta.holder).toLocaleString()}</dd></>}
              {solscanInfo?.meta?.creator && <><dt>Creator</dt><dd title={solscanInfo.meta.creator}>{String(solscanInfo.meta.creator).slice(0, 6)}…{String(solscanInfo.meta.creator).slice(-4)}</dd></>}
            </dl>
            {streamLive === true && solscanInfo && <div className="data-source-note">Solscan {solscanInfo.cached ? "кеш" : "обновено"} · Solana RPC + DexScreener</div>}
            <button className="open-token-button" onClick={() => openToken(selected)} disabled={loadingMint === selected.mint}>
              {loadingMint === selected.mint ? "Зареждам holders…" : "Отвори holder картата"}
            </button>
            <p className="market-mint">{selected.mint}</p>
          </>}
          {error && <div className="market-error">{error}</div>}
        </aside>
      </section>
    </main>
  );
}
