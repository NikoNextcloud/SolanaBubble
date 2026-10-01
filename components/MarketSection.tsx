"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MarketToken = {
  mint: string;
  name?: string | null;
  symbol?: string | null;
  priceUsd?: number;
  priceChange24h?: number;
  volume24h?: number;
  volume1h?: number;
  trades1h?: number;
  buys1h?: number;
  sells1h?: number;
  hypeScore?: number;
  traffic?: "in" | "out" | "flat";
  imageUrl?: string | null;
  dex?: string | null;
};

type MarketEvent = {
  mint: string;
  symbol?: string | null;
  kind: "surge" | "cooldown" | "buy-pressure" | "sell-pressure";
  deltaTrades: number;
  deltaVolume: number;
  hypeDelta: number;
};

const fmtUsd = (n = 0) => {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(n >= 1 ? 2 : 5)}`;
};

export default function MarketSection({ section }: { section: string }) {
  const router = useRouter();
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [watchlist, setWatchlist] = useState<MarketToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("solanabubble:wishlist") || "[]");
      if (Array.isArray(saved)) setWatchlist(saved);
    } catch {}
  }, []);

  useEffect(() => {
    let stopped = false;
    fetch("/api/market", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => {
        if (stopped) return;
        setTokens(Array.isArray(j.tokens) ? j.tokens : []);
        setEvents(Array.isArray(j.recentEvents) ? j.recentEvents : []);
      })
      .catch(() => {})
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, []);

  const movers = useMemo(() =>
    [...tokens]
      .sort((a, b) => Math.abs(Number(b.priceChange24h || 0)) - Math.abs(Number(a.priceChange24h || 0)))
      .slice(0, 30),
  [tokens]);

  const narratives = useMemo(() => {
    const groups = new Map<string, MarketToken[]>();
    for (const token of tokens) {
      const key = (token.dex || "Other").toUpperCase();
      const list = groups.get(key) || [];
      list.push(token);
      groups.set(key, list);
    }
    return [...groups.entries()]
      .map(([name, items]) => ({
        name,
        items,
        volume: items.reduce((sum, t) => sum + Number(t.volume24h || 0), 0),
        avgChange: items.length ? items.reduce((sum, t) => sum + Number(t.priceChange24h || 0), 0) / items.length : 0,
      }))
      .sort((a, b) => b.volume - a.volume);
  }, [tokens]);

  const titleMap: Record<string, string> = {
    watchlist: "Watchlist",
    movers: "Top Movers",
    narratives: "Narratives",
    alerts: "Alerts",
    portfolio: "Portfolio",
  };

  const openToken = (mint: string) => router.push(`/token/${mint}`);

  return <section className="market-section-page">
    <div className="market-section-head">
      <div>
        <span>MARKET INTELLIGENCE</span>
        <h1>{titleMap[section] || "Market"}</h1>
      </div>
      <button onClick={() => router.push("/")}>← Back to Map</button>
    </div>

    {loading && section !== "watchlist" && <div className="market-section-empty">Зареждам market данни…</div>}

    {section === "watchlist" && (
      watchlist.length ? <div className="market-section-grid">
        {watchlist.map((t) => <button className="market-section-card" key={t.mint} onClick={() => openToken(t.mint)}>
          <strong>{t.symbol || t.name || t.mint.slice(0, 6)}</strong>
          <span>{t.name || "Saved token"}</span>
          <b>{fmtUsd(Number(t.priceUsd || 0))}</b>
        </button>)}
      </div> : <div className="market-section-empty">Watchlist-ът е празен. Отвори токен, за да го добавиш автоматично.</div>
    )}

    {section === "movers" && !loading && (
      <div className="market-section-table">
        <div className="market-section-row market-section-row-head"><span>Token</span><span>24h</span><span>Volume</span><span>Hype</span></div>
        {movers.map((t) => <button className="market-section-row" key={t.mint} onClick={() => openToken(t.mint)}>
          <span><strong>{t.symbol || t.name || t.mint.slice(0, 6)}</strong><small>{t.name || t.dex || "Solana token"}</small></span>
          <span className={Number(t.priceChange24h || 0) >= 0 ? "buy" : "sell"}>{Number(t.priceChange24h || 0) >= 0 ? "+" : ""}{Number(t.priceChange24h || 0).toFixed(2)}%</span>
          <span>{fmtUsd(Number(t.volume24h || 0))}</span>
          <span>H {Math.round(Number(t.hypeScore || 0))}</span>
        </button>)}
      </div>
    )}

    {section === "narratives" && !loading && (
      <div className="market-section-grid">
        {narratives.map((g) => <div className="market-section-card static" key={g.name}>
          <strong>{g.name}</strong>
          <span>{g.items.length} tracked tokens</span>
          <b>{fmtUsd(g.volume)} 24h</b>
          <small className={g.avgChange >= 0 ? "buy" : "sell"}>{g.avgChange >= 0 ? "+" : ""}{g.avgChange.toFixed(2)}% avg</small>
        </div>)}
      </div>
    )}

    {section === "alerts" && !loading && (
      events.length ? <div className="market-section-table">
        <div className="market-section-row market-section-row-head"><span>Token</span><span>Signal</span><span>Δ trades</span><span>Δ hype</span></div>
        {events.map((e, i) => <button className="market-section-row" key={`${e.mint}:${e.kind}:${i}`} onClick={() => openToken(e.mint)}>
          <span><strong>{e.symbol || e.mint.slice(0, 6)}</strong></span>
          <span>{e.kind.replace("-", " ")}</span>
          <span className={e.deltaTrades >= 0 ? "buy" : "sell"}>{e.deltaTrades >= 0 ? "+" : ""}{e.deltaTrades}</span>
          <span className={e.hypeDelta >= 0 ? "buy" : "sell"}>{e.hypeDelta >= 0 ? "+" : ""}{e.hypeDelta}</span>
        </button>)}
      </div> : <div className="market-section-empty">Няма нови market сигнали в последния snapshot.</div>
    )}

    {section === "portfolio" && (
      <div className="market-section-empty">
        <strong>Portfolio tracking</strong>
        <span>Тук ще се показват wallet позиции, когато добавим wallet connection. В момента няма свързан wallet.</span>
      </div>
    )}
  </section>;
}
