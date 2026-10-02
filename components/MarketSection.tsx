"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Intelligence, SignalAlert } from "@/lib/market/signals";
import MoversPanel from "./MoversPanel";
import AlertsPanel from "./AlertsPanel";
import WatchlistPanel from "./WatchlistPanel";
import DataQuality from "./DataQuality";

type MarketToken = Intelligence & {
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
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [marketAt,setMarketAt]=useState<string|null>(null);

  useEffect(() => {
    if(section==="watchlist") return;
    let stopped = false;
    const load = () => fetch("/api/market", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => {
        if (stopped) return;
        setTokens(Array.isArray(j.tokens) ? j.tokens : []);
        setMarketAt(j.fetchedAt??null);
        setAlerts(Array.isArray(j.alerts) ? j.alerts : []);
      })
      .catch(() => {})
      .finally(() => { if (!stopped) setLoading(false); });
    load();
    const interval = window.setInterval(load, 30_000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [section]);

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

    {section === "watchlist" && <WatchlistPanel/>}
    {section !== "watchlist" && <DataQuality marketAt={marketAt}/>}

    {section === "movers" && !loading && <MoversPanel tokens={tokens} onSelect={t => openToken(t.mint)} limit={30} />}

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

    {section === "alerts" && !loading && <AlertsPanel alerts={alerts} onSelect={openToken} />}

    {section === "portfolio" && (
      <div className="market-section-empty">
        <strong>Portfolio tracking</strong>
        <span>Тук ще се показват wallet позиции, когато добавим wallet connection. В момента няма свързан wallet.</span>
      </div>
    )}
  </section>;
}
