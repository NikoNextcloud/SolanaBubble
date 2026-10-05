"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { Intelligence, SignalAlert } from "@/lib/market/signals";
import WorkerStatus from "./WorkerStatus";
import TokenSignalCard from "./TokenSignalCard";
import MoversPanel from "./MoversPanel";
import AlertsPanel from "./AlertsPanel";
import DataQuality from "./DataQuality";
import {bubbleSignal,trafficConfidence} from "@/lib/market/map-signals";
import SavedMarketFilters from "./SavedMarketFilters";
import {useWatchlist} from "./useWatchlist";
import {matchesWatchFilters} from "@/lib/watchlist";
import { fomoTokenUrl, gmgnTokenUrl } from "@/lib/token-links";
import { positionQuickActions } from "@/lib/market/quick-actions";
import { MARKET_X_TICKS, MARKET_Y_TICKS, applyMarketViewport, marketCoordinateBase } from "@/lib/market/coordinates";
import { declutterMarketNodes } from "@/lib/market/declutter";

type MarketToken = Intelligence & {
  marketObservedAt?:string|null;
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
  imageUrl?: string | null;
  expanded?: boolean;
  depth?: number;
  parentMint?: string | null;
  hypeScore?: number;
  traffic?: "in" | "out" | "flat";
  netFlowUsd1h?: number;
  activityDelta?: number;
  hypeDelta?: number | null;
  volumeDelta?: number | null;
};

type Node = MarketToken & {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  r: number;
  isCore?: boolean;
  fx?: number | null;
  fy?: number | null;
};

type MarketEvent = {
  mint: string;
  symbol: string | null;
  kind: "surge" | "cooldown" | "buy-pressure" | "sell-pressure";
  deltaTrades: number;
  deltaVolume: number;
  hypeDelta: number;
  at: string;
};

type HotPath = {
  from: string;
  to: string;
  score: number;
  confidence?: number;
};

type MarketViewMode = "map" | "list";

type Flow = {
  from: string;
  to: string;
  usd1h: number;
  trades1h: number;
  kind: "buy" | "sell" | "rotation";
  dex: string | null;
  source?: "market" | "wallet-overlap";
  confidence?: number;
  sharedWallets?: number;
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

function marketMapRadius(t: MarketToken) {
  const hype = hypeScore(t);
  return Math.max(13, Math.min(62, 13 + hype * 0.49));
}

function visualNoise(seed: number) {
  const x = Math.sin(seed * 9301.17) * 49297.31;
  return x - Math.floor(x);
}

function flowColor(t: MarketToken) {
  const total = Math.max(1, t.buys1h + t.sells1h);
  const ratio = t.netFlowUsd1h == null ? (t.buys1h - t.sells1h) / total : t.netFlowUsd1h / Math.max(1, t.volume1h);
  if (ratio > 0.18) return "#46d58d";
  if (ratio < -0.18) return "#ff6473";
  return "#76808e";
}

function hypeScore(t: MarketToken) {
  if (Number.isFinite(Number(t.hypeScore))) return Number(t.hypeScore);
  const tradeScore = Math.min(35, Math.log10(Math.max(1, t.trades1h) + 1) * 11);
  const buyRatio = t.buys1h / Math.max(1, t.buys1h + t.sells1h);
  const buyScore = Math.max(0, (buyRatio - 0.45) * 55);
  const momentum = Math.max(0, Math.min(18, t.priceChange1h * 0.6 + 7));
  const boostScore = Math.min(12, Math.log10(Math.max(1, t.boost) + 1) * 4);
  return Math.max(0, Math.min(100, Math.round(tradeScore + buyScore + momentum + boostScore)));
}

function trafficState(t: MarketToken) {
  if (t.traffic === "in") return { label: "IN", symbol: "↑", cls: "in" };
  if (t.traffic === "out") return { label: "OUT", symbol: "↓", cls: "out" };
  if (t.traffic === "flat") return { label: "FLAT", symbol: "•", cls: "flat" };
  const total = Math.max(1, t.buys1h + t.sells1h);
  const imbalance = (t.buys1h - t.sells1h) / total;
  if (imbalance > 0.16) return { label: "IN", symbol: "↑", cls: "in" };
  if (imbalance < -0.16) return { label: "OUT", symbol: "↓", cls: "out" };
  return { label: "FLAT", symbol: "•", cls: "flat" };
}


function planetGradientId(t: MarketToken) {
  const traffic = trafficState(t);
  if (traffic.cls === "in") return "planetGradIn";
  if (traffic.cls === "out") return "planetGradOut";
  return "planetGradFlat";
}

function planetGlowClass(t: MarketToken) {
  const traffic = trafficState(t);
  if (traffic.cls === "in") return "planet-glow-in";
  if (traffic.cls === "out") return "planet-glow-out";
  return "planet-glow-flat";
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
  const watch=useWatchlist();
  const wrap = useRef<HTMLDivElement>(null);
  const nodeMap = useRef(new Map<string, Node>());
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [expansionFlows, setExpansionFlows] = useState<Flow[]>([]);
  const [expandedMints, setExpandedMints] = useState<string[]>([]);
  const [expansionLoading, setExpansionLoading] = useState<string | null>(null);
  const [hotPath, setHotPath] = useState<HotPath[]>([]);
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [snapshotStale, setSnapshotStale] = useState(false);
  const [recentEvents, setRecentEvents] = useState<MarketEvent[]>([]);
  const [activityPulse, setActivityPulse] = useState<string[]>([]);
  const previousActivity = useRef(new Map<string, number>());
  const [updated, setUpdated] = useState<string | null>(null);
  useEffect(()=>{if(tokens.length)watch.evaluate(tokens.map(t=>({...t,marketObservedAt:updated})));},[tokens,updated,watch.evaluate]);
  const [networkSwaps1h, setNetworkSwaps1h] = useState(0);
  const [streamLive, setStreamLive] = useState(true);
  const [pulsesEnabled,setPulsesEnabled]=useState(true);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [signalNow,setSignalNow]=useState<number|null>(null);
  useEffect(()=>{
    try {setPulsesEnabled(localStorage.getItem('solanabubble:map-pulses')!=='off');}catch{}
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync=()=>setReducedMotion(media.matches);sync();media.addEventListener('change',sync);
    setSignalNow(Date.now());const timer=setInterval(()=>setSignalNow(Date.now()),30000);
    return()=>{media.removeEventListener('change',sync);clearInterval(timer);};
  },[]);
  const animateSignals=streamLive&&pulsesEnabled&&!reducedMotion;
  function togglePulses(){setPulsesEnabled(v=>{try{localStorage.setItem('solanabubble:map-pulses',v?'off':'on');}catch{}return !v;});}
  const [viewMode, setViewMode] = useState<MarketViewMode>("map");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [showTrafficOverlay, setShowTrafficOverlay] = useState(true);
  const [autoGraph, setAutoGraph] = useState(true);
  const lastAutoExpand = useRef(0);
  const [tabVisible, setTabVisible] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);
  const [selected, setSelected] = useState<MarketToken | null>(null);
  const [quickActionMint, setQuickActionMint] = useState<string | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [error, setError] = useState("");
  const lastActivity = useRef(Date.now());
  const [mapView, setMapView] = useState({ x: 0, y: 0, k: 1 });
  const mapPanDrag = useRef({ active: false, pointerId: -1, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);

  const beginMapPan = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest?.(".market-node-group")) return;
    setQuickActionMint(null);
    setMobileDetailOpen(false);
    mapPanDrag.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: mapView.x,
      baseY: mapView.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveMapPan = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = mapPanDrag.current;
    if (!p.active || p.pointerId !== e.pointerId) return;
    setMapView((current) => ({
      ...current,
      x: p.baseX + e.clientX - p.startX,
      y: p.baseY + e.clientY - p.startY,
    }));
  };

  const endMapPan = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = mapPanDrag.current;
    if (!p.active || p.pointerId !== e.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    p.active = false;
  };

  const zoomMapAt = (clientX: number, clientY: number, factor: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setMapView((current) => {
      const k = Math.max(.45, Math.min(3.2, current.k * factor));
      const ratio = k / current.k;
      return {
        k,
        x: px - (px - current.x) * ratio,
        y: py - (py - current.y) * ratio,
      };
    });
  };

  const handleMapWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    zoomMapAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12, e.currentTarget);
  };

  const zoomMapBy = (factor: number) => {
    const svg = wrap.current?.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    zoomMapAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor, svg);
  };

  const resetMarketView = () => {
    setMapView({ x: 0, y: 0, k: 1 });
    setQuickActionMint(null);
  };

  const toggleMapFullscreen = async () => {
    const map = wrap.current;
    if (!map) return;
    try {
      if (document.fullscreenElement === map) await document.exitFullscreen();
      else await map.requestFullscreen();
    } catch {
      setError("Браузърът не позволи режим на цял екран.");
    }
  };

  useEffect(() => {
    const syncFullscreen = () => setIsMapFullscreen(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  const totals = useMemo(() => {
    return tokens.reduce((a, t) => ({
      volume: a.volume + t.volume1h,
      buys: a.buys + t.buys1h,
      sells: a.sells + t.sells1h,
      liquidity: a.liquidity + t.liquidityUsd,
    }), { volume: 0, buys: 0, sells: 0, liquidity: 0 });
  }, [tokens]);

  const marketSummary = useMemo(() => {
    const active = tokens.filter((t) => t.trades1h > 0 || t.volume1h > 0);
    const avgMove = active.length
      ? active.reduce((sum, t) => sum + Number(t.priceChange1h || 0), 0) / active.length
      : 0;
    const imbalance = (totals.buys - totals.sells) / Math.max(1, totals.buys + totals.sells);
    const sentimentScore = avgMove * .45 + imbalance * 28;
    const sentiment = sentimentScore > 3
      ? { label: "Bullish", cls: "bullish", arrow: "↗" }
      : sentimentScore < -3
        ? { label: "Bearish", cls: "bearish", arrow: "↘" }
        : { label: "Neutral", cls: "neutral", arrow: "→" };
    const smartFlow = tokens.reduce((sum, t) => sum + Number(t.netFlowUsd1h ?? 0), 0);
    return { active: active.length, avgMove, sentiment, smartFlow };
  }, [tokens, totals]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    for (const node of nodeMap.current.values()) {
      if (node.isCore) continue;
      const point = marketCoordinateBase(node.marketCap, node.priceChange1h, size.w, size.h);
      node.x = point.x;
      node.y = point.y;
      node.fx = null;
      node.fy = null;
      node.vx = 0;
      node.vy = 0;
    }
    setTick((x) => x + 1);
  }, [size, tokens, expansionFlows, viewMode]);

  const applySnapshot = (j: any) => {
    const list = (j.tokens ?? []).map((t:MarketToken)=>({...t,marketObservedAt:j.fetchedAt??null})) as MarketToken[];
    const nextFlows = (j.flows ?? []) as Flow[];
    if (!list.length && j.warming) { setError("Snapshot worker is warming the cache…"); return; }
    setTokens(list);
    setSelected(current => current ? list.find(t => t.mint === current.mint) ?? current : null);
    setAlerts(Array.isArray(j.alerts) ? j.alerts : []);
    const stale=Boolean(j.stale)||!j.fetchedAt||Date.now()-Date.parse(j.fetchedAt)>=600000;
    setSnapshotStale(stale);
    setFlows(nextFlows);
    setHotPath(Array.isArray(j.hotPath) ? j.hotPath : []);
    setRecentEvents(Array.isArray(j.recentEvents) ? j.recentEvents : []);
    const changed: string[] = [];
    for (const t of list) {
      const activity = t.trades1h + t.buys1h + t.sells1h;
      const previous = previousActivity.current.get(t.mint);
      if (previous != null && activity > previous) changed.push(t.mint);
      previousActivity.current.set(t.mint, activity);
    }
    if (changed.length) {
      setActivityPulse(changed.slice(0, 24));
      window.setTimeout(() => setActivityPulse([]), 1800);
    }
    setUpdated(j.fetchedAt ?? null);
    setNetworkSwaps1h(Number(j.network?.swaps1h ?? 0));
    setError(stale ? "Snapshot is stale; waiting for the ingestion worker." : "");

    for (const t of list) {
      const prev = nodeMap.current.get(t.mint);
      if (prev) {
        const point = marketCoordinateBase(t.marketCap, t.priceChange1h, size.w, size.h);
        Object.assign(prev, t, { x: point.x, y: point.y, fx: null, fy: null, r: marketMapRadius(t), isCore: false });
      }
      else {
        const point = marketCoordinateBase(t.marketCap, t.priceChange1h, size.w, size.h);
        nodeMap.current.set(t.mint, {
          ...t,
          depth: t.depth ?? 0,
          x: point.x,
          y: point.y,
          fx: null,
          fy: null,
          r: marketMapRadius(t),
          isCore: false,
        });
      }
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
      if (prev) Object.assign(prev, coreNode, { x: size.w / 2, y: size.h / 2, r: meta.symbol === "SOL" ? 42 : 34, isCore: true });
      else nodeMap.current.set(mint, {
        ...coreNode,
        depth: 0,
        x: size.w / 2,
        y: size.h / 2,
        r: meta.symbol === "SOL" ? 42 : 34,
        isCore: true,
      });
    }

    const allowed = new Set([...list.map((x) => x.mint), ...usedCore]);
    for (const key of [...nodeMap.current.keys()]) {
      const node = nodeMap.current.get(key);
      if (!allowed.has(key) && !node?.expanded) nodeMap.current.delete(key);
    }
  };

  useEffect(() => {
    const syncVisibility = () => setTabVisible(document.visibilityState === "visible");
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  useEffect(() => {
    if (streamLive !== true || !tabVisible) return;
    let stopped = false;

    async function load() {
      try {
        const r = await fetch("/api/market");
        const j = await r.json();
        if (!r.ok) throw new Error(j?.message || "market");
        if (stopped) return;
        applySnapshot(j);
        try { localStorage.setItem("solanabubble:market-snapshot:free", JSON.stringify(j)); } catch {}
      } catch {
        if (!stopped) setError("Не успях да обновя live пазарния поток. Показвам последния кеш.");
      }
    }

    try {
      const cached = localStorage.getItem("solanabubble:market-snapshot:free");
      if (cached) applySnapshot(JSON.parse(cached));
    } catch {}

    load();
    const id = window.setInterval(load, 120000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [streamLive, tabVisible]);

  async function changeLive(next: boolean, automatic = false) {
    setError("");
    setStreamLive(next);
    setAutoPaused(automatic && !next);
    lastActivity.current = Date.now();
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
  }, [streamLive, autoPaused]);

  async function expandToken(t: Node) {
    const currentDepth = t.depth ?? 0;
    if (t.isCore || currentDepth >= 3 || expandedMints.includes(t.mint) || expansionLoading === t.mint) return;
    setExpansionLoading(t.mint);
    try {
      const r = await fetch(`/api/market/expand?mint=${encodeURIComponent(t.mint)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "expand");

      const additions = (j.tokens ?? []) as MarketToken[];
      additions.forEach((token, i) => {
        const prev = nodeMap.current.get(token.mint);
        if (prev) {
          Object.assign(prev, token, {
            expanded: true,
            depth: Math.max(prev.depth ?? 0, currentDepth + 1),
            parentMint: prev.parentMint ?? t.mint,
            r: Math.max(10, radius(token) * 0.8),
          });
          return;
        }
        const point = marketCoordinateBase(token.marketCap, token.priceChange1h, size.w, size.h);
        nodeMap.current.set(token.mint, {
          ...token,
          expanded: true,
          depth: currentDepth + 1,
          parentMint: t.mint,
          x: point.x,
          y: point.y,
          r: Math.max(10, marketMapRadius(token) * 0.82),
          isCore: false,
        });
      });

      const nextFlows = (j.flows ?? []) as Flow[];
      setExpansionFlows((current) => {
        const keyed = new Map<string, Flow>();
        for (const flow of [...current, ...nextFlows]) {
          keyed.set(`${flow.from}>${flow.to}:${flow.source ?? flow.kind}`, flow);
        }
        return [...keyed.values()].slice(-120);
      });
      setExpandedMints((current) => [...new Set([...current, t.mint])].slice(-12));
      setTick((x) => x + 1);
    } catch {
      setError("Не успях да разширя мрежата за този токен.");
    } finally {
      setExpansionLoading(null);
    }
  }

  async function followHotPath() {
    setError("");
    const path = hotPath.slice(0, 3);
    for (const step of path) {
      const node = nodeMap.current.get(step.to) ?? nodeMap.current.get(step.from);
      if (!node || node.isCore || (node.depth ?? 0) >= 3) continue;
      await expandToken(node);
    }
  }

  useEffect(() => {
    if (!autoGraph || streamLive !== true || !recentEvents.length) return;
    if (Date.now() - lastAutoExpand.current < 45_000) return;

    const candidate = recentEvents
      .filter((event) => event.kind === "surge" || event.kind === "buy-pressure")
      .map((event) => nodeMap.current.get(event.mint))
      .find((node) => node && !node.isCore && (node.depth ?? 0) < 2 && !expandedMints.includes(node.mint));

    if (!candidate) return;
    lastAutoExpand.current = Date.now();
    void expandToken(candidate);
  }, [recentEvents, autoGraph, streamLive, expandedMints]);

  function openToken(t: MarketToken) {
    setLoadingMint(t.mint);
    setError("");
    router.push(`/token/${t.mint}`);
  }

  const filteredTokens=tokens.filter(t=>matchesWatchFilters(t,watch.state.filters,watch.state.entries));
  const nodes = [...nodeMap.current.values()].filter(n=>n.isCore||matchesWatchFilters(n,watch.state.filters,watch.state.entries));
  const mapNodes = nodes.filter((n) => !n.isCore);
  const mapLayoutKey = mapNodes
    .map((n) => `${n.mint}:${n.x.toFixed(1)}:${n.y.toFixed(1)}:${n.r.toFixed(1)}`)
    .join("|");
  const declutteredMapNodes = useMemo(() => viewMode === "map"
    ? declutterMarketNodes(mapNodes, {
        // Keep dense coordinate clusters readable: >2x the previous edge-to-edge gap.
        gap: size.w <= 700 ? 88 : 152,
        maxDisplacement: size.w <= 700 ? 260 : 520,
        iterations: size.w <= 700 ? 34 : 48,
        anchorStrength: size.w <= 700 ? .028 : .015,
      })
    : mapNodes.map((n) => ({ ...n, anchorX: n.x, anchorY: n.y, displacement: 0 })),
    [mapLayoutKey, size.w, viewMode],
  );
  const renderedNodes = viewMode === "map" ? declutteredMapNodes : nodes;
  const renderNodeByMint = useMemo(() => new Map(renderedNodes.map((n) => [n.mint, n])), [renderedNodes]);
  const quickActionNode = quickActionMint ? (renderNodeByMint.get(quickActionMint) ?? nodeMap.current.get(quickActionMint)) : null;
  const quickActionLayout = quickActionNode ? positionQuickActions({
    nodeX: quickActionNode.x,
    nodeY: quickActionNode.y,
    nodeRadius: quickActionNode.r,
    viewX: mapView.x,
    viewY: mapView.y,
    scale: mapView.k,
    viewportWidth: size.w,
    viewportHeight: size.h,
    preferredWidth: size.w <= 640 ? 236 : 148,
    panelHeight: size.w <= 640 ? 52 : 42,
  }) : null;
  const combinedFlows = [...flows, ...expansionFlows];
  const hotFlowKeys = new Set([
    ...[...combinedFlows]
      .sort((a, b) => (b.usd1h * (b.confidence ?? 1)) - (a.usd1h * (a.confidence ?? 1)))
      .slice(0, 4)
      .map((f) => `${f.from}>${f.to}:${f.kind}`),
    ...hotPath.map((p) => `${p.from}>${p.to}:rotation`),
  ]);
  const hotNodeMints = new Set(hotPath.flatMap((p) => [p.from, p.to]));
  const focusMints = new Set<string>();
  if (selected?.mint) {
    focusMints.add(selected.mint);
    for (const flow of combinedFlows) {
      if (flow.from === selected.mint) focusMints.add(flow.to);
      if (flow.to === selected.mint) focusMints.add(flow.from);
    }
  }
  const visibleMints=new Set(nodes.map(n=>n.mint));
  const visibleFlows = combinedFlows
    .map((f) => ({ ...f, source: nodeMap.current.get(f.from), target: nodeMap.current.get(f.to) }))
    .filter((f) => f.source && f.target && visibleMints.has(f.from) && visibleMints.has(f.to))
    .slice(0, 100);

  const netFlowByMint = new Map<string, number>();
  for (const flow of combinedFlows) {
    netFlowByMint.set(flow.from, (netFlowByMint.get(flow.from) ?? 0) - flow.usd1h);
    netFlowByMint.set(flow.to, (netFlowByMint.get(flow.to) ?? 0) + flow.usd1h);
  }

  const hottest = [...renderedNodes]
    .filter((n) => !n.isCore)
    .sort((a, b) => hypeScore(b) - hypeScore(a))
    .slice(0, 5);

  // Hype particle halo: strong green signal cloud around high-hype planets.
  const signalDust = viewMode === "map"
    ? [...renderedNodes]
        .filter((n) => !n.isCore && hypeScore(n) >= 65)
        .sort((a, b) => hypeScore(b) - hypeScore(a))
        .slice(0, 18)
        .flatMap((n, nodeIndex) => {
          const hype = hypeScore(n);
          const normalized = Math.max(0, Math.min(1, (hype - 65) / 35));
          const count = Math.round(7 + normalized * 23);
          return Array.from({ length: count }, (_, i) => {
            const seed = nodeIndex * 1307 + i * 29 + n.mint.charCodeAt(i % n.mint.length);
            const angle = visualNoise(seed) * Math.PI * 2;
            const ring = Math.pow(visualNoise(seed + 1.7), .62);
            const distance = n.r + 12 + ring * (26 + normalized * 46);
            return {
              key: `${n.mint}:hype-particle:${i}`,
              x: n.x + Math.cos(angle) * distance,
              y: n.y + Math.sin(angle) * distance * .82,
              r: .65 + visualNoise(seed + 2.6) * (1.25 + normalized * .7),
              opacity: .18 + normalized * .42 + visualNoise(seed + 3.3) * .16,
              delay: visualNoise(seed + 5.1) * 2.8,
              duration: 1.9 + visualNoise(seed + 7.2) * 2.3,
            };
          });
        })
        .slice(0, 360)
    : [];

  void tick;

  return (
    <main className="market-shell">
      <div className="lovable-page-heading market-page-heading">
        <div className="market-heading-copy">
          <div className="eyebrow"><i /> LIVE MARKET INTELLIGENCE</div>
          <h1>Token map</h1>
          <p>Discover the tokens and market activity moving across Solana.</p>
        </div>

        <div className="market-heading-controls">
          <div className="market-view-switch">
            <button className={viewMode === "map" ? "active" : ""} onClick={() => setViewMode("map")}>▦ Map</button>
            <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>☷ List</button>
          </div>
          <div className="market-toolbar-actions">

            {viewMode === "map" && <span className="market-coordinate-mode">Market cap × Price 1h</span>}
            <button
              className={`go-live-control ${streamLive === true ? "is-live" : ""}`}
              onClick={() => changeLive(streamLive !== true)}
            >{streamLive === true ? "◉ Live" : "◉ Go Live"}</button>
          </div>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className={autoGraph ? "active" : ""}
            onClick={() => setAutoGraph((v) => !v)}
            title="Автоматично разгръща токени със surge или buy pressure, най-много веднъж на 45 секунди."
          >{autoGraph ? "✦ Auto graph" : "○ Auto graph"}</button>
          <button type="button" aria-pressed={pulsesEnabled&&!reducedMotion} disabled={reducedMotion} onClick={togglePulses} title={reducedMotion?'Reduced motion е включен в системата.':'Спира визуалните ефекти; обновяването на данните остава активно.'}>◌ Анимации: {pulsesEnabled&&!reducedMotion?'Вкл':'Изкл'}</button>
          <button type="button" onClick={resetMarketView}>↺ Нулирай изгледа</button>
        </div>
      </div>
      <button
        type="button"
        className="mobile-tools-toggle"
        aria-expanded={mobileToolsOpen}
        onClick={() => setMobileToolsOpen((value) => !value)}
      >{mobileToolsOpen ? "Скрий филтрите" : "Филтри и качество"} {mobileToolsOpen ? "↑" : "↓"}</button>
      <div className={`market-tools-drawer ${mobileToolsOpen ? "is-open" : ""}`}>
        <SavedMarketFilters/>
        <DataQuality marketAt={updated}/>
      </div>
      <section className="market-stats reference-market-stats">
        <div>
          <span>MARKET SENTIMENT</span>
          <b className={marketSummary.sentiment.cls}>{marketSummary.sentiment.label} <i>{marketSummary.sentiment.arrow}</i></b>
          <small>{marketSummary.avgMove >= 0 ? "+" : ""}{marketSummary.avgMove.toFixed(1)}% avg 1h</small>
        </div>
        <div>
          <span>ACTIVE TOKENS</span>
          <b>{marketSummary.active.toLocaleString()}</b>
          <small>{tokens.length} loaded</small>
        </div>
        <div>
          <span>24H VOLUME</span>
          <b>{fmtUsd(tokens.reduce((sum, t) => sum + t.volume24h, 0))}</b>
          <small>{totals.buys >= totals.sells ? "buy pressure" : "sell pressure"}</small>
        </div>
        <div>
          <span>ESTIMATED MARKET FLOW</span>
          <b className={marketSummary.smartFlow >= 0 ? "bullish" : "bearish"}>{marketSummary.smartFlow >= 0 ? "+" : ""}{fmtUsd(marketSummary.smartFlow).replace("$", "$")}</b>
          <small>{hotPath.length ? `${hotPath.length} hot paths` : "watching rotations"}</small>
        </div>
      </section>

      <section className="market-workspace reference-market-workspace">
        <div className="market-map" ref={wrap}>
          {viewMode === "map" && <div className="lovable-map-hint">Клик: FoMo/GmGn · Двоен клик: Holders · Планетите = координати · Drag картата · Scroll zoom</div>}
          {watch.ready && (viewMode === "list" ? !filteredTokens.length : !renderedNodes.length) && tokens.length > 0 && <div className="pause-banner">No tokens match your saved filters. Reset filters or add favorites.</div>}
          {streamLive === false && <div className="pause-banner">
            {autoPaused ? "Автоматична пауза след 2 мин. без активност" : "Live режимът е на пауза"} · данните са от кеша
          </div>}
          {viewMode === "list" ? <div className="market-list-view">
            <div className="market-list-header">
              <span>Token</span><span>Price</span><span>24h</span><span>24h Volume</span><span>Hype</span><span>Traffic</span>
            </div>
            {[...filteredTokens].sort((a,b) => b.volume24h - a.volume24h).map((t) => {
              const traffic = trafficState(t);
              return <button key={t.mint} onClick={() => { setSelected(t); setMobileDetailOpen(true); }} onDoubleClick={() => openToken(t)}>
                <span className="market-list-token">
                  <span className="market-list-icon">{t.imageUrl ? <img src={t.imageUrl} alt="" /> : (t.symbol || "?").slice(0,2)}</span>
                  <span><strong>{t.symbol || t.name || t.mint.slice(0,6)}</strong><small>{t.name || t.dex || "Solana token"}</small></span>
                </span>
                <span>{fmtUsd(t.priceUsd)}</span>
                <span className={t.priceChange24h >= 0 ? "buy" : "sell"}>{t.priceChange24h >= 0 ? "+" : ""}{t.priceChange24h.toFixed(1)}%</span>
                <span>{fmtUsd(t.volume24h)}</span>
                <span>H {hypeScore(t)}</span>
                <span className={traffic.cls}>{traffic.symbol} {traffic.label}</span>
              </button>;
            })}
          </div> : <svg
            className={`market-pan-surface ${animateSignals?"signals-animated":"signals-paused"} ${mapPanDrag.current.active ? "is-panning" : ""}`}
            onWheel={handleMapWheel}
            onPointerDown={beginMapPan}
            onPointerMove={moveMapPan}
            onPointerUp={endMapPan}
            onPointerCancel={endMapPan}
          >
            <defs>
              <radialGradient id="marketGlow">
                <stop offset="0%" stopColor="#87909f" stopOpacity=".16" />
                <stop offset="55%" stopColor="#4c5563" stopOpacity=".05" />
                <stop offset="100%" stopColor="#0e1015" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="spaceBgCenter" cx="50%" cy="45%" r="78%">
                <stop offset="0%" stopColor="#303943" />
                <stop offset="42%" stopColor="#202831" />
                <stop offset="100%" stopColor="#10151b" />
              </radialGradient>
              <radialGradient id="planetGradIn" cx="34%" cy="27%" r="78%">
                <stop offset="0%" stopColor="#eafff6" />
                <stop offset="22%" stopColor="#8cf3c6" />
                <stop offset="68%" stopColor="#2ea46f" />
                <stop offset="100%" stopColor="#153e31" />
              </radialGradient>
              <radialGradient id="planetGradOut" cx="34%" cy="27%" r="78%">
                <stop offset="0%" stopColor="#fff0f2" />
                <stop offset="22%" stopColor="#ff9eaa" />
                <stop offset="68%" stopColor="#cf4e62" />
                <stop offset="100%" stopColor="#4b2029" />
              </radialGradient>
              <radialGradient id="planetGradFlat" cx="34%" cy="27%" r="78%">
                <stop offset="0%" stopColor="#f1f4f7" />
                <stop offset="24%" stopColor="#b9c4ce" />
                <stop offset="68%" stopColor="#65727f" />
                <stop offset="100%" stopColor="#303942" />
              </radialGradient>
              <pattern id="tinyStars" width="220" height="220" patternUnits="userSpaceOnUse">
                <circle cx="18" cy="22" r="1" fill="#ffffff" opacity=".55" />
                <circle cx="74" cy="38" r="1.2" fill="#dfe8ff" opacity=".38" />
                <circle cx="142" cy="28" r=".9" fill="#ffffff" opacity=".48" />
                <circle cx="198" cy="46" r="1.1" fill="#ffffff" opacity=".37" />
                <circle cx="36" cy="102" r="1.3" fill="#fff5d6" opacity=".4" />
                <circle cx="114" cy="86" r="1" fill="#ffffff" opacity=".42" />
                <circle cx="180" cy="120" r=".9" fill="#d9f3ff" opacity=".39" />
                <circle cx="64" cy="172" r="1.1" fill="#ffffff" opacity=".44" />
                <circle cx="150" cy="188" r="1.4" fill="#fff5d6" opacity=".31" />
                <circle cx="205" cy="176" r="1" fill="#ffffff" opacity=".4" />
              </pattern>
              <marker id="marketArrowBuy" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#46d58d" />
              </marker>
              <marker id="marketArrowSell" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff6473" />
              </marker>
            </defs>
            <g className="space-background" pointerEvents="none">
              <rect x="0" y="0" width={size.w} height={size.h} fill="url(#spaceBgCenter)" />
              <rect x="0" y="0" width={size.w} height={size.h} fill="url(#tinyStars)" />
              <ellipse cx={size.w / 2} cy={size.h * .48} rx={size.w * .36} ry={size.h * .34} className="space-nebula-core" />
            </g>
            <ellipse cx={size.w / 2} cy={size.h / 2} rx={size.w * .34} ry={size.h * .34} fill="url(#marketGlow)" />

            {viewMode === "map" && <>
              <g className="market-axis-grid lovable-coordinate-grid" pointerEvents="none">
                {MARKET_Y_TICKS.map((value) => {
                  const base = marketCoordinateBase(1e4, value, size.w, size.h);
                  const screen = applyMarketViewport(base, mapView);
                  return <g key={`axis-y-${value}`}>
                    <line x1="0" y1={screen.y} x2={size.w} y2={screen.y} className={value === 0 ? "axis-zero-line" : ""} />
                    <text x="8" y={screen.y - 5}>{value > 0 ? "+" : ""}{value}%</text>
                  </g>;
                })}
                {MARKET_X_TICKS.map(({ value, label }) => {
                  const base = marketCoordinateBase(value, 0, size.w, size.h);
                  const screen = applyMarketViewport(base, mapView);
                  return <g key={`axis-x-${value}`}>
                    <line x1={screen.x} y1="0" x2={screen.x} y2={size.h} />
                    <text x={screen.x} y={size.h - 9} textAnchor="middle">{label}</text>
                  </g>;
                })}
                <text x="48" y="14" className="axis-title">PRICE CHANGE · 1H</text>
                <text x={size.w - 14} y={size.h - 9} textAnchor="end" className="axis-title">MARKET CAP</text>
              </g>
            </>}
            <g transform={`translate(${mapView.x} ${mapView.y}) scale(${mapView.k})`} className="market-pan-layer">
            <g className="market-signal-dust hype-particle-cloud" pointerEvents="none">
              {signalDust.map((p) => <circle
                key={p.key}
                cx={p.x}
                cy={p.y}
                r={p.r}
                className="signal-dust-dot hype-green-particle"
                opacity={p.opacity}
                style={{
                  ["--particle-delay" as any]: `${p.delay}s`,
                  ["--particle-duration" as any]: `${p.duration}s`,
                }}
              />)}
            </g>
            {viewMode === "map" && animateSignals && [...renderedNodes]
              .filter((n) => !n.isCore && n.trades1h > 0)
              .sort((a, b) => b.trades1h - a.trades1h)
              .slice(0, 5)
              .map((n, i) => {
                const seed = n.mint.charCodeAt(0) + i * 37;
                const angle = visualNoise(seed) * Math.PI * 2;
                const distance = 180 + visualNoise(seed + 4) * 170;
                const dx = Math.cos(angle) * distance;
                const dy = Math.sin(angle) * distance;
                const tailAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                return <g
                  key={`comet-${n.mint}`}
                  transform={`translate(${n.x} ${n.y})`}
                  className="market-comet-anchor"
                  pointerEvents="none"
                >
                  <g
                    className="market-comet-runner"
                    style={{
                      ["--comet-dx" as any]: `${dx}px`,
                      ["--comet-dy" as any]: `${dy}px`,
                      ["--comet-angle" as any]: `${tailAngle}deg`,
                      ["--comet-delay" as any]: `${i * .72}s`,
                      ["--comet-duration" as any]: `${2.6 + visualNoise(seed + 9) * 1.2}s`,
                    }}
                  >
                    <line x1="0" y1="0" x2="52" y2="0" className="market-comet-tail" />
                    <circle cx="0" cy="0" r="3.5" className="market-comet-head" />
                  </g>
                </g>;
              })}
            {renderedNodes.map((n, i) => {
              const signal=bubbleSignal(n,signalNow??NaN);
              const confidence=trafficConfidence(n.trafficSample,signalNow??NaN);
              const color=signal.flow==='in'?'#66d39a':signal.flow==='out'?'#ee746c':'#a9afb7';
              const total = Math.max(1, n.buys1h + n.sells1h);
              const imbalance = (n.buys1h - n.sells1h) / total;
              const activity = Math.min(1, Math.log10(Math.max(1, n.trades1h + 1)) / 4);
              const hype = hypeScore(n);
              const traffic = {...trafficState(n),cls:signal.flow};
              const netFlow = Number.isFinite(Number(n.netFlowUsd1h)) ? Number(n.netFlowUsd1h) : (netFlowByMint.get(n.mint) ?? 0);
              const focusDimmed = Boolean(selected?.mint && !focusMints.has(n.mint) && !n.isCore);
              const pulseDuration = n.isCore ? 3.2 : Math.max(.8, Math.min(5, 4 - Math.tanh(Number(signal.fresh?n.hypeAcceleration??0:0) / .3) * 3));
              const brightness = Math.max(.65, Math.min(1.5, 1 + Math.tanh(Math.abs(Number(signal.fresh?n.hypeVelocity??0:0))) * .5));
              const anchorDistance = "anchorX" in n ? Number((n as any).displacement ?? 0) : 0;
              return <g
                key={n.mint}
                transform={`translate(${n.x} ${n.y})`}
                className={`market-node-group ${animateSignals ? "is-animated" : "is-paused"}`}
                style={{ ["--node-pulse-duration" as any]: `${pulseDuration}s` }}
              >
                {anchorDistance > 18 && <line
                  x1={0}
                  y1={0}
                  x2={Number((n as any).anchorX) - n.x}
                  y2={Number((n as any).anchorY) - n.y}
                  className="market-anchor-link"
                  pointerEvents="none"
                />}
                <circle
                  r={n.r + 6 + hype * .045}
                  className="market-hype-glow"
                  strokeWidth={1 + hype * .038}
                  strokeOpacity={Math.min(.96, (.10 + hype / 108) * brightness)}
                  style={{
                    ["--hype-strength" as any]: Math.max(.08, hype / 100),
                    ["--hype-color" as any]: traffic.cls === "in" ? "#66d39a" : traffic.cls === "out" ? "#ee746c" : "#a9afb7",
                    ["--hype-blur" as any]: `${4 + hype * .12}px`,
                    ["--hype-duration" as any]: `${pulseDuration}s`,
                  }}
                  pointerEvents="none"
                />
                {hype >= 48 && <circle
                  r={n.r + 12 + hype * .075}
                  className="market-hype-glow market-hype-glow-outer"
                  strokeWidth={.8 + hype * .02}
                  strokeOpacity={Math.min(.85, (.08 + hype / 165) * brightness)}
                  style={{
                    ["--hype-strength" as any]: hype / 100,
                    ["--hype-color" as any]: traffic.cls === "in" ? "#66d39a" : traffic.cls === "out" ? "#ee746c" : "#c7cbd0",
                    ["--hype-blur" as any]: `${8 + hype * .16}px`,
                    ["--hype-duration" as any]: `${pulseDuration}s`,
                  }}
                  pointerEvents="none"
                />}
                <circle
                  r={n.r}
                  fill={n.isCore ? "#2b3138" : `url(#${planetGradientId(n)})`}
                  fillOpacity={n.isCore ? ".98" : ".94"}
                  stroke={selected?.mint === n.mint ? "#ffffff" : n.isCore ? "#b8c0c8" : color}
                  strokeWidth={(selected?.mint === n.mint ? 2.5 : 1.5) + Math.max(0, Math.min(4, Number(signal.fresh&&n.holderObservedAt&&signalNow!=null&&signalNow-Date.parse(n.holderObservedAt)<60*60_000?n.holderGrowthPct??0:0) / 5))}
                  className={[
                    n.isCore ? "market-token-bubble market-core-bubble planet-bubble" : "market-token-bubble planet-bubble",
                    hotNodeMints.has(n.mint) ? "hot-path-node" : "",
                    activityPulse.includes(n.mint) ? "trade-hit" : "",
                    focusDimmed ? "focus-dimmed" : "",
                  ].filter(Boolean).join(" ")}
                  tabIndex={n.isCore?-1:0}
                  role="button"
                  aria-label={`${n.symbol||n.name||n.mint}: ${signal.label}; Traffic confidence: ${confidence.label}${signal.liquidityDrop?', Liquidity ↓':''}${signal.whaleLabel?', '+signal.whaleLabel:''}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={e=>{if(!n.isCore&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setSelected(n);setQuickActionMint(n.mint);expandToken(n);}}}
                  onClick={() => {
                    if (!n.isCore) {
                      setSelected(n);
                      setQuickActionMint(n.mint);
                      setMobileDetailOpen(false);
                      expandToken(n);
                    }
                  }}
                  onDoubleClick={() => {
                    if (!n.isCore) openToken(n);
                  }}
                >
                  <title>{`${n.symbol||n.name||n.mint} · ${signal.label}\nTraffic confidence: ${confidence.label}\n${signal.reasons.join("\n")}\nПосоката е оценка от rolling 1h trade counts + Hype, не измерен паричен поток и не прогноза за цена.`}</title>
                </circle>
                {!n.isCore && <g className={`traffic-confidence confidence-${confidence.level}`} pointerEvents="none">
                  <title>Traffic Confidence · {confidence.label}</title>
                  <circle cx={n.r * .7} cy={-n.r * .7} r="7" className="traffic-confidence-rim" />
                  <circle cx={n.r * .7} cy={-n.r * .7} r="4" className="traffic-confidence-core" />
                </g>}
                {!n.isCore && (signal.riskWarning || signal.liquidityDrop) && <circle r={n.r + 9} fill="none" stroke={signal.liquidityDrop ? "#ff6473" : "#f5bd62"} strokeWidth="2" strokeDasharray="5 4" pointerEvents="none"/>}
                {!n.isCore && <circle
                  r={Math.max(4, n.r * .7)}
                  cx={-n.r * .16}
                  cy={-n.r * .2}
                  className="planet-highlight"
                  pointerEvents="none"
                />}
                
                {viewMode === "map" && !n.isCore && <g className="reference-node-label" pointerEvents="none">
                  <text x="0" y={-n.r - 32} textAnchor="middle" className="reference-token-name">{(n.symbol||n.name||n.mint.slice(0,5)).slice(0,12)} <tspan className={`map-direction direction-${signal.state}`}>{signal.arrow}</tspan></text>
                  <text x="0" y={-n.r - 18} textAnchor="middle" className={`map-signal-status direction-${signal.state}`}>{signal.label}</text>
                  <rect x="-42" y={n.r + 8} width="84" height="15" rx="3" className="reference-pool-chip"/>
                  <text x="0" y={n.r + 19} textAnchor="middle" className="reference-pool-text">H {Math.round(hype)} · {n.dex?n.dex.slice(0,6):'Pool'}</text>
                  {(signal.liquidityDrop||signal.whaleLabel) && <text x="0" y={n.r + 37} textAnchor="middle" className={signal.liquidityDrop?'map-event-badge liquidity-badge':'map-event-badge whale-badge'}>{signal.liquidityDrop?'⚠ Liquidity ↓':signal.whaleLabel}</text>}
                  {signal.liquidityDrop&&signal.whaleLabel&&<text x="0" y={n.r+51} textAnchor="middle" className="map-event-badge whale-badge">{signal.whaleLabel}</text>}
                </g>}
                {n.imageUrl && !n.isCore ? <>
                  <clipPath id={`token-clip-${n.mint}`}><circle r={Math.max(5, n.r - 3)} /></clipPath>
                  <image
                    href={n.imageUrl}
                    x={-(n.r - 3)}
                    y={-(n.r - 3)}
                    width={(n.r - 3) * 2}
                    height={(n.r - 3) * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#token-clip-${n.mint})`}
                    pointerEvents="none"
                    className="market-token-icon"
                  />
                </> : n.r >= 17 && <text textAnchor="middle" dy="4" className="market-symbol">{n.symbol || "?"}</text>}
                {activityPulse.includes(n.mint) && !n.isCore && <>
                  <circle r={n.r + 8} className="market-shockwave shockwave-a" pointerEvents="none" />
                  <circle r={n.r + 8} className="market-shockwave shockwave-b" pointerEvents="none" />
                </>}
              </g>;
            })}
            </g>
          </svg>}

          {viewMode === "map" && quickActionNode && quickActionLayout && <div
            className="token-quick-actions token-quick-actions-overlay"
            style={{ left: quickActionLayout.left, top: quickActionLayout.top, width: quickActionLayout.width }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <a href={fomoTokenUrl(quickActionNode.mint)} target="_blank" rel="noreferrer">FoMo ↗</a>
            <a href={gmgnTokenUrl(quickActionNode.mint)} target="_blank" rel="noreferrer">GmGn ↗</a>
            <button className="quick-detail-action" onClick={() => setMobileDetailOpen(true)}>Details</button>
            <button className="quick-holder-action" onClick={() => openToken(quickActionNode)} disabled={loadingMint === quickActionNode.mint}>Holders</button>
          </div>}

          {viewMode === "map" && <div className="market-zoom-controls">
            <button onClick={() => zoomMapBy(1 / 1.18)} aria-label="Zoom out">−</button>
            <span>{Math.round(mapView.k * 100)}%</span>
            <button onClick={() => zoomMapBy(1.18)} aria-label="Zoom in">＋</button>
            <button onClick={resetMarketView} aria-label="Reset zoom">⛶</button>
            <button className="market-fullscreen-button" onClick={toggleMapFullscreen} aria-label={isMapFullscreen ? "Exit fullscreen map" : "Fullscreen map"} title={isMapFullscreen ? "Изход от цял екран" : "Карта на цял екран"}>{isMapFullscreen ? "⤡" : "⤢"}</button>
          </div>}
          <details className="market-legend map-signal-legend" open>
            <summary>Как да четеш балоните · оценка</summary>
            <div><span><i className="market-buy-dot"/>Зелено: покупки по брой</span><span><i className="market-sell-dot"/>Червено: продажби по брой</span><span>↑ Засилва се · → Баланс · ↓ Отслабва · ? Unknown</span><span>Размер = Hype · Яркост = Velocity · Пулс = Acceleration</span><span>Контур = Holder growth · Жълт пръстен = Risk</span><span className="traffic-confidence-legend"><i className="reliable"/>Traffic: надежден <i className="partial"/>частичен <i className="insufficient"/>недостатъчен</span><span>⚠ Liquidity ↓: рязък спад · Whale +/−: праг 1% supply</span><small>Rolling 1h counts + Hype; “sample” = разпознати swaps от един pool (непълна извадка), цветът следва net USD в нея. Не общ пазарен капитал. Посочи балон за причините; Risk остава отделен. Whale значките изчезват след 5m.</small></div>
          </details>
        </div>

        <aside
          className={`market-side reference-market-side ${selected ? "is-token-selected" : ""} ${mobileDetailOpen ? "is-mobile-open" : ""}`}
          aria-label={selected ? `Детайли за ${selected.symbol || selected.name || "токен"}` : "Market intelligence"}
        >
          <WorkerStatus/>
          {!selected ? <>
            <div className="side-section-title">
              <h2>Market intelligence</h2>
              <span>{snapshotStale ? "STALE" : "CACHED"}</span>
            </div>
            <small className="signal-note">Snapshot: {updated ? new Date(updated).toLocaleString() : "warming"}</small>
            <p className="side-intro">Клик: FoMo/GmGn и подробности. Двоен клик: Holder Map.</p>
            {expansionLoading && <div className="market-expanding">Разгръщам wallet връзките…</div>}
            <div className="market-hot-list reference-side-card">
              <div className="market-hot-title">
                <strong>Market Hype</strong>
                {hotPath.length > 0 && <button className="follow-hot-path" onClick={followHotPath}>Проследи Hot Path</button>}
              </div>
              {hottest.map((t, i) => {
                const traffic = trafficState(t);
                return <button key={t.mint} onClick={() => { setSelected(t); expandToken(t); }}>
                  <span>{i + 1}</span>
                  <strong>{t.symbol || t.name || t.mint.slice(0, 6)}</strong>
                  <b>H {hypeScore(t)}</b>
                  <i className={traffic.cls}>{traffic.symbol}</i>
                </button>;
              })}
            </div>
            {recentEvents.length > 0 && <div className="market-activity-feed reference-side-card">
              <div className="market-hot-title">
                <strong>Live activity</strong>
                <span>Δ от последния snapshot</span>
              </div>
              {recentEvents.slice(0, 6).map((event, i) => {
                const node = nodeMap.current.get(event.mint);
                const positive = event.kind === "surge" || event.kind === "buy-pressure";
                return <button key={`${event.mint}:${event.kind}:${i}`} onClick={() => {
                  if (node) { setSelected(node); expandToken(node); }
                }}>
                  <span className={positive ? "event-dot in" : "event-dot out"} />
                  <strong>{node?.symbol || event.symbol || event.mint.slice(0, 6)}</strong>
                  <small>{event.deltaTrades >= 0 ? "+" : ""}{event.deltaTrades} tx</small>
                  <b className={event.hypeDelta >= 0 ? "in" : "out"}>{event.hypeDelta >= 0 ? "+" : ""}{event.hypeDelta} H</b>
                </button>;
              })}
            </div>}
            <MoversPanel tokens={tokens} onSelect={t => setSelected(t)} limit={5} />
            <AlertsPanel alerts={alerts} onSelect={mint => { const t = tokens.find(t => t.mint === mint); if (t) setSelected(t); else router.push(`/token/${mint}`); }} />
            {hotPath.length > 0 && <div className="market-hot-path-list reference-side-card">
              <strong>Traffic Flow</strong>
              {hotPath.slice(0, 4).map((step, i) => {
                const from = nodeMap.current.get(step.from);
                const to = nodeMap.current.get(step.to);
                return <button key={`${step.from}:${step.to}:${i}`} onClick={() => {
                  if (to) { setSelected(to); expandToken(to); }
                }}>
                  <span>{from?.symbol || step.from.slice(0, 4)}</span>
                  <i>→</i>
                  <span>{to?.symbol || step.to.slice(0, 4)}</span>
                  <b>{Math.round((step.confidence ?? .5) * 100)}%</b>
                </button>;
              })}
            </div>}
            <div className="market-rank">
              {tokens.slice(0, 12).map((t, i) => <button key={t.mint} onClick={() => setSelected(t)}>
                <span>{i + 1}</span>
                <strong>{t.symbol || t.name || t.mint.slice(0, 6)}</strong>
                <small>{fmtUsd(t.volume1h)}</small>
              </button>)}
            </div>
          </> : <>
            <button className="market-back" onClick={() => { setSelected(null); setMobileDetailOpen(false); }}>← Всички токени</button>
            <div className="selected-token-card">
              <div className="selected-token-head">
                <span className="selected-token-avatar">
                  {selected.imageUrl ? <img src={selected.imageUrl} alt="" /> : (selected.symbol || "?").slice(0, 2)}
                </span>
                <div className="selected-token-copy">
                  <h2>{selected.symbol || selected.name || "Token"}</h2>
                  <p>{selected.name || "Solana token"}</p>
                </div>
                <span className={selected.priceChange24h >= 0 ? "selected-change buy" : "selected-change sell"}>
                  {selected.priceChange24h >= 0 ? "+" : ""}{selected.priceChange24h.toFixed(1)}%
                </span>
              </div>
              <div className="selected-price-row">
                <strong>{fmtUsd(selected.priceUsd)}</strong>
                <span className={trafficState(selected).cls}>{trafficState(selected).symbol} {trafficState(selected).label}</span>
              </div>
              <div className="selected-hype-row">
                <span>Hype Flow</span>
                <b className="selected-hype-meter"><i style={{ width: `${hypeScore(selected)}%` }} /></b>
              </div>
            </div>
            <TokenSignalCard token={selected} />
            <details className="signal-disclosure selected-market-details"><summary>Пазарни данни и промени</summary><dl className="market-token-stats">
              <dt>Цена</dt><dd>{fmtUsd(selected.priceUsd)}</dd>
              <dt>Market cap</dt><dd>{fmtUsd(selected.marketCap)}</dd>
              <dt>Ликвидност</dt><dd>{fmtUsd(selected.liquidityUsd)}</dd>
              <dt>Обем 1ч.</dt><dd>{fmtUsd(selected.volume1h)}</dd>
              <dt>Обем 24ч.</dt><dd>{fmtUsd(selected.volume24h)}</dd>
              <dt>Покупки 1ч.</dt><dd>{selected.buys1h}</dd>
              <dt>Продажби 1ч.</dt><dd>{selected.sells1h}</dd>
              <dt>Промяна 1ч.</dt><dd className={selected.priceChange1h >= 0 ? "buy" : "sell"}>{selected.priceChange1h.toFixed(2)}%</dd>
              <dt>Hype</dt><dd>H {hypeScore(selected)} / 100</dd>
              <dt>Traffic</dt><dd className={trafficState(selected).cls}>{trafficState(selected).symbol} {trafficState(selected).label}</dd>
              <dt>Δ trades</dt><dd className={Number(selected.activityDelta ?? 0) >= 0 ? "buy" : "sell"}>{Number(selected.activityDelta ?? 0) >= 0 ? "+" : ""}{Number(selected.activityDelta ?? 0)}</dd>
              <dt>Δ Hype</dt><dd className={Number(selected.hypeDelta ?? 0) >= 0 ? "buy" : "sell"}>{Number(selected.hypeDelta ?? 0) >= 0 ? "+" : ""}{Number(selected.hypeDelta ?? 0)}</dd>
              <dt>Мрежа</dt><dd>{expandedMints.includes(selected.mint) ? `разгърната · L${nodeMap.current.get(selected.mint)?.depth ?? 0}/3` : "клик за разгръщане"}</dd>
            </dl></details>
            <button className="open-token-button" onClick={() => openToken(selected)} disabled={loadingMint === selected.mint}>
              {loadingMint === selected.mint ? "Зареждам holders…" : "Отвори Holder Map →"}
            </button>
          </>}
          {error && <div className="market-error">{error}</div>}
        </aside>
      </section>
    </main>
  );
}
