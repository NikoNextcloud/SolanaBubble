"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
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
};

type Node = MarketToken & {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  r: number;
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

export default function MarketMap() {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const sim = useRef<Simulation<any, any> | null>(null);
  const nodeMap = useRef(new Map<string, Node>());
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketToken | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [error, setError] = useState("");

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
    const s = forceSimulation<any>()
      .alphaDecay(0.025)
      .velocityDecay(0.35)
      .force("charge", forceManyBody().strength(-12))
      .on("tick", () => setTick((x) => x + 1));
    sim.current = s;
    return () => s.stop();
  }, []);

  useEffect(() => {
    const s = sim.current;
    if (!s) return;
    const nodes = [...nodeMap.current.values()];
    s.nodes(nodes);
    s.force("center", forceCenter(size.w / 2, size.h / 2).strength(0.04));
    s.force("x", forceX<any>((d) => {
      const imbalance = (d.buys1h - d.sells1h) / Math.max(1, d.buys1h + d.sells1h);
      return size.w / 2 + imbalance * size.w * 0.25;
    }).strength(0.055));
    s.force("y", forceY<any>((d) => {
      const activityRank = Math.min(1, Math.log10(Math.max(1, d.volume1h)) / 7);
      return size.h * (0.58 - activityRank * 0.16);
    }).strength(0.045));
    s.force("collide", forceCollide<any>((d) => d.r + 3).strength(0.9));
    s.alpha(0.7).restart();
  }, [size, tokens]);

  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const r = await fetch("/api/market", { cache: "no-store" });
        if (!r.ok) throw new Error("market");
        const j = await r.json();
        if (stopped) return;
        const list = (j.tokens ?? []) as MarketToken[];
        setTokens(list);
        setUpdated(j.fetchedAt ?? new Date().toISOString());
        setError("");

        for (const t of list) {
          const prev = nodeMap.current.get(t.mint);
          if (prev) {
            Object.assign(prev, t, { r: radius(t) });
          } else {
            nodeMap.current.set(t.mint, {
              ...t,
              x: size.w / 2 + (Math.random() - 0.5) * 180,
              y: size.h / 2 + (Math.random() - 0.5) * 140,
              r: radius(t),
            });
          }
        }

        const allowed = new Set(list.map((x) => x.mint));
        for (const key of [...nodeMap.current.keys()]) {
          if (!allowed.has(key)) nodeMap.current.delete(key);
        }
      } catch {
        if (!stopped) setError("Не успях да заредя live пазарния поток.");
      }
    }
    load();
    const id = window.setInterval(load, 10000);
    return () => { stopped = true; window.clearInterval(id); };
  }, []);

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
  void tick;

  return (
    <main className="market-shell">
      <header className="market-topbar">
        <div>
          <a className="brand" href="/">SolanaBubble</a>
          <span className="market-subtitle">Solana live flow</span>
        </div>
        <div className="market-actions">
          <a href="/admin">База данни</a>
          <span className="market-live"><i /> LIVE</span>
        </div>
      </header>

      <section className="market-stats">
        <div><span>Токени на картата</span><b>{tokens.length}</b></div>
        <div><span>1ч. обем</span><b>{fmtUsd(totals.volume)}</b></div>
        <div><span>Покупки / продажби</span><b>{totals.buys} / {totals.sells}</b></div>
        <div><span>Ликвидност</span><b>{fmtUsd(totals.liquidity)}</b></div>
      </section>

      <section className="market-workspace">
        <div className="market-map" ref={wrap}>
          <div className="market-map-head">
            <div>
              <strong>Live Solana traffic</strong>
              <span>Размер = активност · зелено = buy pressure · червено = sell pressure</span>
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
            </defs>
            <ellipse cx={size.w / 2} cy={size.h / 2} rx={size.w * .34} ry={size.h * .34} fill="url(#marketGlow)" />

            {nodes.map((n, i) => {
              const color = flowColor(n);
              const total = Math.max(1, n.buys1h + n.sells1h);
              const imbalance = (n.buys1h - n.sells1h) / total;
              const pulse = 1 + Math.sin(Date.now() / 700 + i) * Math.min(.07, Math.abs(imbalance) * .08);
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
                  fill="#15191f"
                  fillOpacity=".94"
                  stroke={selected?.mint === n.mint ? "#ffffff" : color}
                  strokeWidth={selected?.mint === n.mint ? 2.5 : 1.5}
                  className="market-token-bubble"
                  onClick={() => setSelected(n)}
                >
                  <title>{n.symbol || n.name || n.mint}</title>
                </circle>
                {n.r >= 17 && <text textAnchor="middle" dy="4" className="market-symbol">{n.symbol || "?"}</text>}
                {n.volume1h > 0 && <circle
                  className="market-flow-dot"
                  r="2"
                  fill={color}
                  cx={Math.cos(Date.now() / 900 + i) * (n.r + 9)}
                  cy={Math.sin(Date.now() / 900 + i) * (n.r + 9)}
                />}
              </g>;
            })}
          </svg>

          <div className="market-legend">
            <span><i className="market-buy-dot" />повече покупки</span>
            <span><i className="market-neutral-dot" />балансиран поток</span>
            <span><i className="market-sell-dot" />повече продажби</span>
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
            </dl>
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
