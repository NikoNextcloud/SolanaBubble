"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { Intelligence, SignalAlert } from "@/lib/market/signals";
import WorkerStatus from "./WorkerStatus";
import TokenSignalCard from "./TokenSignalCard";
import AlertsPanel from "./AlertsPanel";
import MarketSidebarCharts from "./MarketSidebarCharts";
import DataQuality from "./DataQuality";
import {bubbleSignal,trafficConfidence} from "@/lib/market/map-signals";
import SavedMarketFilters from "./SavedMarketFilters";
import {useWatchlist} from "./useWatchlist";
import {matchesWatchFilters} from "@/lib/watchlist";
import { fomoTokenUrl, gmgnTokenUrl } from "@/lib/token-links";
import { marketCoordinateBase } from "@/lib/market/coordinates";
import MarketWaveMap from "./MarketWaveMap";
import EarlyPoolBubbles from "./EarlyPoolBubbles";
import {useLiveMarketEvents} from "./useLiveMarketEvents";
import {useSolanaLiveSwaps,type LivePoolTarget} from "./useSolanaLiveSwaps";
import type {LiveMarketEvent} from "@/lib/market/live-events";
import {classifyMarketRegime,deriveSmartAlerts} from "@/lib/market/intelligence-core";

type MarketToken = Intelligence & {
  marketObservedAt?:string|null;
  mint: string;
  name: string | null;
  symbol: string | null;
  dex: string | null;
  pairAddress: string | null;
  trafficPools?: { pairAddress: string; dex?: string | null; liquidityUsd?: number; quoteMint?: string | null; quoteSymbol?: string | null }[];
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
  const lastLivePulse = useRef("");
  const previousActivity = useRef(new Map<string, number>());
  const [updated, setUpdated] = useState<string | null>(null);
  useEffect(()=>{if(tokens.length)watch.evaluate(tokens.map(t=>({...t,marketObservedAt:updated})));},[tokens,updated,watch.evaluate]);
  const [networkSwaps1h, setNetworkSwaps1h] = useState(0);
  const [streamLive, setStreamLive] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
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
  const animateSignals=streamLive&&pulsesEnabled;
  function togglePulses(){setPulsesEnabled(v=>{try{localStorage.setItem('solanabubble:map-pulses',v?'off':'on');}catch{}return !v;});}

  const liveTargets=useMemo<LivePoolTarget[]>(()=>{
    const ranked=[...tokens].sort((a,b)=>(Number(b.hypeScore??0)+Math.log10(Math.max(1,b.volume1h))*8)-(Number(a.hypeScore??0)+Math.log10(Math.max(1,a.volume1h))*8));
    const picked:LivePoolTarget[]=[];const seen=new Set<string>();
    for(const token of ranked){
      const pools=(token.trafficPools?.length
        ? [...token.trafficPools].sort((a,b)=>Number(b.liquidityUsd??0)-Number(a.liquidityUsd??0)).map(p=>p.pairAddress)
        : token.pairAddress?[token.pairAddress]:[]).filter(Boolean);
      const pool=pools.find(candidate=>!seen.has(candidate));
      if(!pool)continue;
      seen.add(pool);picked.push({mint:token.mint,pool});
      if(picked.length>=16)return picked;
    }
    return picked;
  },[tokens]);
  const realtime=useLiveMarketEvents(streamLive&&tabVisible);
  const solanaLive=useSolanaLiveSwaps(liveTargets,streamLive&&tabVisible);
  const liveMarketEvents=useMemo<LiveMarketEvent[]>(()=>{
    const merged=new Map<string,LiveMarketEvent>();
    for(const event of [...solanaLive.events,...realtime.events]){
      const key=`${event.mint}:${event.signature}:${event.wallet}`;
      if(!merged.has(key)||event.whale)merged.set(key,event);
    }
    return [...merged.values()].sort((a,b)=>Date.parse(b.block_at)-Date.parse(a.block_at)).slice(0,80);
  },[solanaLive.events,realtime.events]);
  const liveLatencySeconds=liveMarketEvents[0]?Math.max(0,(Date.now()-Date.parse(liveMarketEvents[0].observed_at||liveMarketEvents[0].block_at))/1000):null;
  const liveLatency=liveLatencySeconds==null
    ? {label:"Snapshot",cls:"snapshot"}
    : liveLatencySeconds<5
      ? {label:`Live · ${liveLatencySeconds.toFixed(1)}s`,cls:"live"}
      : liveLatencySeconds<30
        ? {label:`Delayed · ${Math.round(liveLatencySeconds)}s`,cls:"delayed"}
        : {label:`Snapshot · ${Math.round(liveLatencySeconds/60)}m`,cls:"snapshot"};
  useEffect(()=>{
    const first=liveMarketEvents[0];if(!first)return;
    const key=`${first.mint}:${first.signature}`;
    if(key===lastLivePulse.current)return;
    lastLivePulse.current=key;
    setActivityPulse(current=>[...new Set([first.mint,...current])].slice(0,24));
    const timer=window.setTimeout(()=>setActivityPulse(current=>current.filter(m=>m!==first.mint)),1500);
    return()=>window.clearTimeout(timer);
  },[liveMarketEvents]);
  const [viewMode, setViewMode] = useState<MarketViewMode>("map");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [showTrafficOverlay, setShowTrafficOverlay] = useState(true);
  const [capitalFlowOnly,setCapitalFlowOnly]=useState(false);
  const [autoGraph, setAutoGraph] = useState(true);
  const lastAutoExpand = useRef(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const [selected, setSelected] = useState<MarketToken | null>(null);
  const [quickActionMint, setQuickActionMint] = useState<string | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [error, setError] = useState("");
  const lastActivity = useRef(Date.now());
  const [mapView, setMapView] = useState({ x: 0, y: 0, k: 1 });
  const mapLod=mapView.k<.78?"far":mapView.k>1.55?"near":"mid";
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

  const marketRegime = useMemo(() => classifyMarketRegime(tokens), [tokens]);
  const smartAlerts = useMemo(() => deriveSmartAlerts(tokens, updated ?? new Date().toISOString()), [tokens, updated]);
  const visibleAlerts = useMemo(() => {
    const byKey=new Map<string,SignalAlert>();
    for(const alert of [...smartAlerts,...alerts]){
      const key=`${alert.mint}:${alert.kind}`;
      if(!byKey.has(key))byKey.set(key,alert);
    }
    return [...byKey.values()].slice(0,80);
  },[smartAlerts,alerts]);

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
  const renderedNodes = nodes;

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

            {viewMode === "map" && <span className="market-coordinate-mode">Live order flow × Strength</span>}
            {viewMode === "map" && <span className={`market-live-latency latency-${liveLatency.cls}`}>{liveLatency.label}</span>}
            {viewMode === "map" && <button
              type="button"
              className={capitalFlowOnly?"capital-flow-toggle active":"capital-flow-toggle"}
              aria-pressed={capitalFlowOnly}
              onClick={()=>setCapitalFlowOnly(v=>!v)}
              title="Показва само основните capital-flow сигнали, BUY/SELL комети и traffic confidence."
            >{capitalFlowOnly?"◎ Capital Flow":"○ Capital Flow"}</button>}
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
          <button type="button" aria-pressed={pulsesEnabled} onClick={togglePulses} title={reducedMotion?'Reduced motion: импулсите остават видими, но CSS движението е ограничено.':'Спира визуалните ефекти; обновяването на данните остава активно.'}>◌ Анимации: {pulsesEnabled?'Вкл':'Изкл'}</button>
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
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 550px",minWidth:0}}><SavedMarketFilters/></div>
          {viewMode === "map" && <EarlyPoolBubbles/>}
        </div>
        <DataQuality marketAt={updated}/>
      </div>
      <section className="market-stats reference-market-stats">
        <div>
          <span>MARKET REGIME</span>
          <b className={marketRegime.key==="risk-on"||marketRegime.key==="mania"?"bullish":marketRegime.key==="risk-off"||marketRegime.key==="distribution"?"bearish":"neutral"}>{marketRegime.label} <i>{marketRegime.score>=0?"↗":"↘"}</i></b>
          <small>{marketRegime.reason} · {marketSummary.sentiment.label} {marketSummary.avgMove >= 0 ? "+" : ""}{marketSummary.avgMove.toFixed(1)}%</small>
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
          {viewMode === "map" && <div className="lovable-map-hint">Клик: FoMo/GmGn · Двоен клик: Holders · GOOD setup-ите са с приоритет · Hype ↑ усилва вълната към края, Hype ↓ я затихва · Zoom out до 30 токена</div>}
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
          </div> : <MarketWaveMap
            tokens={renderedNodes.filter(n=>!n.isCore)}
            events={liveMarketEvents}
            width={size.w}
            height={size.h}
            now={signalNow??Date.now()}
            selectedMint={selected?.mint??null}
            quickActionMint={quickActionMint}
            mapView={mapView}
            lod={mapLod}
            capitalFlowOnly={capitalFlowOnly}
            animated={animateSignals}
            maxComets={size.w<=700?10:15}
            onSelect={token=>{const node=nodeMap.current.get(token.mint);if(node){setSelected(node);setMobileDetailOpen(false);void expandToken(node);}}}
            onQuickAction={setQuickActionMint}
            onDetails={token=>{const node=nodeMap.current.get(token.mint);if(node){setSelected(node);setMobileDetailOpen(true);}}}
            onOpen={token=>{const node=nodeMap.current.get(token.mint);if(node)openToken(node);}}
            onWheel={handleMapWheel}
            onPointerDown={beginMapPan}
            onPointerMove={moveMapPan}
            onPointerUp={endMapPan}
            onPointerCancel={endMapPan}
          />}

          {viewMode === "map" && <div className="market-zoom-controls">
            <button onClick={() => zoomMapBy(1 / 1.18)} aria-label="Zoom out">−</button>
            <span>{Math.round(mapView.k * 100)}%</span>
            <button onClick={() => zoomMapBy(1.18)} aria-label="Zoom in">＋</button>
            <button onClick={resetMarketView} aria-label="Reset zoom">⛶</button>
            <button className="market-fullscreen-button" onClick={toggleMapFullscreen} aria-label={isMapFullscreen ? "Exit fullscreen map" : "Fullscreen map"} title={isMapFullscreen ? "Изход от цял екран" : "Карта на цял екран"}>{isMapFullscreen ? "⤡" : "⤢"}</button>
          </div>}
          <details className="market-legend map-signal-legend">
            <summary>Как да четеш импулсите</summary>
            <div><span><i className="market-buy-dot"/>Зелен импулс = нов BUY</span><span><i className="market-sell-dot"/>Червен импулс = нов SELL</span><span>GOOD = Opportunity + Confidence + Capital Flow + Momentum + BUY Strength + растящ Hype + контролиран Risk</span><span>Бяла вълна = GOOD setup, минал всички филтри; не е BUY команда и не гарантира печалба</span><span>Hype ↑ = вълната набира енергия към десния край · Hype ↓ = затихва · → = стабилен</span><span>По-силно сияние на токена = по-високо текущо Hype</span><span>Strength: +100 силен buy pressure · 0 баланс · −100 силен sell pressure</span><span className="comet-trust-legend"><i className="direct"/>Движеща точка = live Solana сделка <i className="routed"/>Cyan = routed</span><small>Картата вече ранква конструктивните bullish setup-и пред екстремния sell pressure. BUY/SELL точките остават реални observed swaps. GOOD/бялата вълна са моделна индикация, не финансов съвет.</small></div>
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
            <MarketSidebarCharts
              tokens={tokens}
              regime={marketRegime}
              onSelect={mint=>{const t=tokens.find(t=>t.mint===mint);const node=nodeMap.current.get(mint);if(t)setSelected(t);if(node)expandToken(node);}}
            />
            <details className="sidebar-secondary">
              <summary>Alerts & live activity</summary>
              <AlertsPanel alerts={visibleAlerts} onSelect={mint => { const t = tokens.find(t => t.mint === mint); if (t) setSelected(t); else router.push(`/token/${mint}`); }} />
              {(liveMarketEvents.length > 0 || recentEvents.length > 0) && <div className="market-activity-feed reference-side-card">
                <div className="market-hot-title">
                  <strong>Live activity</strong>
                  <span className={solanaLive.status==="live"?"live-stream-ok":realtime.status==="live"?"live-stream-partial":"live-stream-wait"}>
                    {solanaLive.status==="live"?"SOLANA WS":realtime.status==="live"?"REALTIME":"SNAPSHOT"}
                  </span>
                </div>
                {liveMarketEvents.slice(0,4).map(event=>{
                  const node=nodeMap.current.get(event.mint),positive=event.side==="buy";
                  const amount=event.usd_value!=null?fmtUsd(event.usd_value):event.quote_mint==="So11111111111111111111111111111111111111112"?`${event.quote_amount.toFixed(2)} SOL`:event.quote_amount.toFixed(2);
                  return <button key={`${event.mint}:${event.signature}:${event.wallet}`} onClick={()=>{if(node){setSelected(node);expandToken(node);}}}>
                    <span className={positive?"event-dot in":"event-dot out"}/><strong>{node?.symbol||event.mint.slice(0,6)}</strong>
                    <small>{positive?"BUY":"SELL"} · {event.wallet.slice(0,4)}…{event.wallet.slice(-4)}</small><b className={positive?"in":"out"}>{positive?"+":"−"}{amount}</b>
                  </button>;
                })}
              </div>}
            </details>
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
