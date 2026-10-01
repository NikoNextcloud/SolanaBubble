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
  imageUrl?: string | null;
  expanded?: boolean;
  depth?: number;
  parentMint?: string | null;
  hypeScore?: number;
  traffic?: "in" | "out" | "flat";
  netFlowUsd1h?: number;
  activityDelta?: number;
  hypeDelta?: number;
  volumeDelta?: number;
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
type MarketAxis = "marketCap" | "liquidityUsd" | "volume24h";

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
  const scale = Math.log10(Math.max(1, t.marketCap || t.volume24h || t.liquidityUsd) + 1);
  return Math.max(18, Math.min(46, 12 + scale * 4.25));
}

function flowColor(t: MarketToken) {
  const total = Math.max(1, t.buys1h + t.sells1h);
  const ratio = (t.buys1h - t.sells1h) / total;
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
  const wrap = useRef<HTMLDivElement>(null);
  const sim = useRef<Simulation<any, any> | null>(null);
  const nodeMap = useRef(new Map<string, Node>());
  const lastSimRender = useRef(0);
  const [tick, setTick] = useState(0);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [tokens, setTokens] = useState<MarketToken[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [expansionFlows, setExpansionFlows] = useState<Flow[]>([]);
  const [expandedMints, setExpandedMints] = useState<string[]>([]);
  const [expansionLoading, setExpansionLoading] = useState<string | null>(null);
  const [hotPath, setHotPath] = useState<HotPath[]>([]);
  const [recentEvents, setRecentEvents] = useState<MarketEvent[]>([]);
  const [activityPulse, setActivityPulse] = useState<string[]>([]);
  const previousActivity = useRef(new Map<string, number>());
  const [updated, setUpdated] = useState<string | null>(null);
  const [networkSwaps1h, setNetworkSwaps1h] = useState(0);
  const [streamLive, setStreamLive] = useState(true);
  const [viewMode, setViewMode] = useState<MarketViewMode>("map");
  const [xAxis, setXAxis] = useState<MarketAxis>("marketCap");
  const [showTrafficOverlay, setShowTrafficOverlay] = useState(true);
  const [autoGraph, setAutoGraph] = useState(true);
  const lastAutoExpand = useRef(0);
  const [tabVisible, setTabVisible] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);
  const [selected, setSelected] = useState<MarketToken | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [error, setError] = useState("");
  const lastActivity = useRef(Date.now());
  const drag = useRef({ active: false, pointerId: -1, mint: "", lastX: 0, lastY: 0, moved: false });

  const savePinnedMarketNodes = () => {
    try {
      const pinned: Record<string, { x: number; y: number }> = {};
      for (const n of nodeMap.current.values()) {
        if (n.fx != null && n.fy != null) pinned[n.mint] = { x: n.fx, y: n.fy };
      }
      localStorage.setItem("solanabubble:market-pinned", JSON.stringify(pinned));
    } catch {}
  };

  const beginMarketDrag = (e: React.PointerEvent<SVGCircleElement>, mint: string) => {
    e.stopPropagation();
    const n = nodeMap.current.get(mint);
    if (!n) return;
    n.fx = n.x;
    n.fy = n.y;
    n.vx = 0;
    n.vy = 0;
    drag.current = { active: true, pointerId: e.pointerId, mint, lastX: e.clientX, lastY: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    sim.current?.alpha(0.8).alphaTarget(0.22).restart();
    setTick((x) => x + 1);
  };

  const moveMarketDrag = (e: React.PointerEvent<SVGCircleElement>) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const n = nodeMap.current.get(d.mint);
    if (!n) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    n.fx = (n.fx ?? n.x) + dx;
    n.fy = (n.fy ?? n.y) + dy;
    n.x = n.fx;
    n.y = n.fy;
    sim.current?.alpha(0.72).restart();
    setTick((x) => x + 1);
  };

  const endMarketDrag = (e: React.PointerEvent<SVGCircleElement>) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const n = nodeMap.current.get(d.mint);
    if (n) {
      n.fx = n.x;
      n.fy = n.y;
      n.vx = 0;
      n.vy = 0;
    }
    d.active = false;
    savePinnedMarketNodes();
    sim.current?.alpha(0.45).alphaTarget(0).restart();
    setTick((x) => x + 1);
  };

  const resetMarketPositions = () => {
    for (const n of nodeMap.current.values()) {
      n.fx = null;
      n.fy = null;
    }
    try { localStorage.removeItem("solanabubble:market-pinned"); } catch {}
    sim.current?.alpha(0.85).alphaTarget(0).restart();
    setTick((x) => x + 1);
  };

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

  const axisStats = useMemo(() => {
    const values = tokens.map((t) => Math.max(0, Number(t[xAxis] ?? 0))).filter((v) => v > 0);
    const logs = values.map((v) => Math.log10(v + 1));
    const min = logs.length ? Math.min(...logs) : 0;
    const max = logs.length ? Math.max(...logs) : 1;
    const changes = tokens.map((t) => Number(t.priceChange24h || 0));
    const abs = Math.max(25, Math.min(150, changes.length ? Math.max(...changes.map((v) => Math.abs(v))) : 100));
    return { min, max: Math.max(min + .1, max), changeAbs: abs };
  }, [tokens, xAxis]);

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
      .on("tick", () => {
        const now = performance.now();
        if (now - lastSimRender.current < 34) return;
        lastSimRender.current = now;
        setTick((x) => x + 1);
      });
    sim.current = s;
    return () => { s.stop(); };
  }, []);

  useEffect(() => {
    const s = sim.current;
    if (!s) return;
    const nodes = [...nodeMap.current.values()];
    for (const node of nodes) {
      if (node.isCore) node.r = node.symbol === "SOL" ? 42 : 34;
      else node.r = viewMode === "map" ? marketMapRadius(node) : radius(node);
    }
    const links = [...flows, ...expansionFlows]
      .filter((f) => nodeMap.current.has(f.from) && nodeMap.current.has(f.to))
      .map((f) => ({ source: f.from, target: f.to, usd1h: f.usd1h }));

    s.nodes(nodes);
    s.force("center", forceCenter(size.w / 2, size.h / 2).strength(0.005));
    s.force("charge", forceManyBody().strength((d: any) => d.isCore ? -20 : -18));
    s.force("x", forceX<any>((d) => {
      if (viewMode === "map") {
        if (d.isCore) return size.w / 2;
        const raw = Math.max(0, Number(d[xAxis] ?? 0));
        const log = Math.log10(raw + 1);
        const pct = (log - axisStats.min) / Math.max(.1, axisStats.max - axisStats.min);
        return 74 + Math.max(0, Math.min(1, pct)) * Math.max(100, size.w - 148);
      }
      if (d.isCore) {
        if (d.symbol === "SOL") return size.w * 0.5;
        if (d.symbol === "USDC") return size.w * 0.22;
        return size.w * 0.78;
      }
      const imbalance = (d.buys1h - d.sells1h) / Math.max(1, d.buys1h + d.sells1h);
      return size.w / 2 + imbalance * size.w * 0.28;
    }).strength((d: any) => d.isCore ? .02 : .46));
    s.force("y", forceY<any>((d) => {
      if (viewMode === "map") {
        if (d.isCore) return size.h * .58;
        const pct = (Number(d.priceChange24h || 0) + axisStats.changeAbs) / (axisStats.changeAbs * 2);
        return Math.max(84, Math.min(size.h - 72, 70 + (1 - Math.max(0, Math.min(1, pct))) * Math.max(120, size.h - 150)));
      }
      if (d.isCore) return d.symbol === "SOL" ? size.h * 0.52 : size.h * 0.48;
      const activityRank = Math.min(1, Math.log10(Math.max(1, d.volume1h)) / 7);
      return size.h * (0.58 - activityRank * 0.24);
    }).strength((d: any) => d.isCore ? .02 : .5));
    s.force("link", forceLink<any, any>(viewMode === "map" && !showTrafficOverlay ? [] : links)
      .id((d: any) => d.mint)
      .distance((l: any) => 135 + Math.max(0, 100 - Math.log10(Math.max(1, l.usd1h)) * 10))
      .strength((l: any) => Math.min(0.32, 0.06 + Math.log10(Math.max(1, l.usd1h)) * 0.03)));
    s.force("collide", forceCollide<any>((d) => d.r + 24).strength(0.99));
    s.alpha(.58).restart();
  }, [size, tokens, flows, expansionFlows, viewMode, xAxis, showTrafficOverlay, axisStats]);

  const applySnapshot = (j: any) => {
    const list = (j.tokens ?? []) as MarketToken[];
    let pinned: Record<string, { x: number; y: number }> = {};
    try { pinned = JSON.parse(localStorage.getItem("solanabubble:market-pinned") || "{}"); } catch {}
    const nextFlows = (j.flows ?? []) as Flow[];
    setTokens(list);
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
    setUpdated(j.fetchedAt ?? new Date().toISOString());
    setNetworkSwaps1h(Number(j.network?.swaps1h ?? 0));
    setError("");

    for (const t of list) {
      const prev = nodeMap.current.get(t.mint);
      if (prev) Object.assign(prev, t, { r: radius(t), isCore: false });
      else {
        const pin = pinned[t.mint];
        nodeMap.current.set(t.mint, {
          ...t,
          depth: t.depth ?? 0,
          x: pin?.x ?? size.w / 2 + (Math.random() - 0.5) * 180,
          y: pin?.y ?? size.h / 2 + (Math.random() - 0.5) * 140,
          fx: pin?.x ?? null,
          fy: pin?.y ?? null,
          r: radius(t),
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
      if (prev) Object.assign(prev, coreNode, { r: meta.symbol === "SOL" ? 42 : 34, isCore: true });
      else nodeMap.current.set(mint, {
        ...coreNode,
        depth: 0,
        x: size.w / 2 + (Math.random() - 0.5) * 80,
        y: size.h / 2 + (Math.random() - 0.5) * 80,
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
        const r = await fetch("/api/market", { cache: "no-store" });
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
    const id = window.setInterval(load, 30000);
    return () => { stopped = true; window.clearInterval(id); };
  }, [streamLive, tabVisible]);

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
  }, [streamLive, autoPaused]);

  async function expandToken(t: Node) {
    const currentDepth = t.depth ?? 0;
    if (t.isCore || currentDepth >= 3 || expandedMints.includes(t.mint) || expansionLoading === t.mint) return;
    setExpansionLoading(t.mint);
    try {
      const r = await fetch(`/api/market/expand?mint=${encodeURIComponent(t.mint)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "expand");

      const center = nodeMap.current.get(t.mint);
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
        const angle = (Math.PI * 2 * i) / Math.max(1, additions.length) + Math.random() * 0.25;
        const distance = 105 + (i % 3) * 34;
        nodeMap.current.set(token.mint, {
          ...token,
          expanded: true,
          depth: currentDepth + 1,
          parentMint: t.mint,
          x: (center?.x ?? size.w / 2) + Math.cos(angle) * distance,
          y: (center?.y ?? size.h / 2) + Math.sin(angle) * distance,
          r: Math.max(10, radius(token) * 0.8),
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
      sim.current?.alpha(0.9).restart();
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
    sim.current?.alpha(0.85).restart();
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
  const renderedNodes = viewMode === "map" ? nodes.filter((n) => !n.isCore) : nodes;
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
  const visibleFlows = combinedFlows
    .map((f) => ({ ...f, source: nodeMap.current.get(f.from), target: nodeMap.current.get(f.to) }))
    .filter((f) => f.source && f.target)
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

  const movers = [...renderedNodes]
    .filter((n) => !n.isCore)
    .sort((a, b) =>
      (Math.abs(Number(b.activityDelta ?? 0)) * 8 + Math.abs(Number(b.hypeDelta ?? 0)) * 4 + Math.abs(Number(b.volumeDelta ?? 0)) / 5000) -
      (Math.abs(Number(a.activityDelta ?? 0)) * 8 + Math.abs(Number(a.hypeDelta ?? 0)) * 4 + Math.abs(Number(a.volumeDelta ?? 0)) / 5000)
    )
    .slice(0, 5);
  void tick;

  return (
    <main className="market-shell">
      <div className="lovable-page-heading">
        <div>
          <div className="eyebrow"><i /> LIVE MARKET INTELLIGENCE</div>
          <h1>Token map</h1>
          <p>Discover the tokens and market activity moving across Solana.</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={() => setSelected(null)}>Reset view</button>
        </div>
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
          <span>SMART MONEY FLOW</span>
          <b className={marketSummary.smartFlow >= 0 ? "bullish" : "bearish"}>{marketSummary.smartFlow >= 0 ? "+" : ""}{fmtUsd(marketSummary.smartFlow).replace("$", "$")}</b>
          <small>{hotPath.length ? `${hotPath.length} hot paths` : "watching rotations"}</small>
        </div>
      </section>

      <section className="market-workspace reference-market-workspace">
        <div className="market-map" ref={wrap}>
          <div className="reference-map-toolbar neon-map-toolbar">
            <div className="market-view-switch">
              <button className={viewMode === "map" ? "active" : ""} onClick={() => setViewMode("map")}>▦ Map</button>
              <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>☷ List</button>
            </div>
            <div className="market-map-filters">
              <button className="sector-control">◉ All Sectors⌄</button>
              <div className="timeframe-switch">
                <button className="active">1H</button><button>6H</button>
              </div>
            </div>
            <div className="market-toolbar-actions">
              <div className="market-inline-search">⌕ <span>Search tokens, wallets, or narratives…</span></div>
              {viewMode === "map" && <select value={xAxis} onChange={(e) => setXAxis(e.target.value as MarketAxis)} aria-label="Хоризонтална ос">
                <option value="marketCap">Market cap</option>
                <option value="liquidityUsd">Liquidity</option>
                <option value="volume24h">24h volume</option>
              </select>}
              <button
                className={`go-live-control ${streamLive === true ? "is-live" : ""}`}
                onClick={() => changeLive(streamLive !== true)}
              >{streamLive === true ? "◉ Live" : "◉ Go Live"}</button>
            </div>
          </div>
          <div className="insight-live-bar secondary-market-controls">
            <button className={`ghost-control auto-graph-control ${autoGraph ? "active" : ""}`} onClick={() => setAutoGraph((v) => !v)}>
              {autoGraph ? "✦ Auto graph" : "○ Auto graph"}
            </button>
            <button className="ghost-control reset-layout-control" onClick={resetMarketPositions}>↺ Нулирай позиции</button>
          </div>
          {streamLive === false && <div className="pause-banner">
            {autoPaused ? "Автоматична пауза след 2 мин. без активност" : "Live режимът е на пауза"} · данните са от кеша
          </div>}
          <div className="market-map-head reference-map-head">
            <div>
              <strong>{viewMode === "map" ? "Solana Market Map" : "Solana Token List"}</strong>
              <span>{viewMode === "map"
                ? "Y = price change 24h · X = selected market metric · size = activity · glow = Hype strength"
                : "Подреден списък с market, hype и traffic показатели"}</span>
            </div>
            <span>{updated ? `обновено ${new Date(updated).toLocaleTimeString("bg-BG")}` : "зареждане…"}</span>
          </div>

          {viewMode === "list" ? <div className="market-list-view">
            <div className="market-list-header">
              <span>Token</span><span>Price</span><span>24h</span><span>24h Volume</span><span>Hype</span><span>Traffic</span>
            </div>
            {[...tokens].sort((a,b) => b.volume24h - a.volume24h).map((t) => {
              const traffic = trafficState(t);
              return <button key={t.mint} onClick={() => setSelected(t)} onDoubleClick={() => openToken(t)}>
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
          </div> : <svg>
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
              <g className="market-axis-grid" pointerEvents="none">
                {[1, .75, .5, .25, 0].map((p, i) => {
                  const value = axisStats.changeAbs - p * axisStats.changeAbs * 2;
                  const y = 70 + p * Math.max(120, size.h - 150);
                  return <g key={`axis-y-${i}`}>
                    <line x1="48" y1={y} x2={size.w - 18} y2={y} />
                    <text x="14" y={y + 4}>{value >= 0 ? "+" : ""}{value.toFixed(0)}%</text>
                  </g>;
                })}
                {[.25,.5,.75].map((p, i) => {
                  const x = 74 + p * Math.max(100, size.w - 148);
                  return <line key={`axis-x-${i}`} x1={x} y1="54" x2={x} y2={size.h - 56} />;
                })}
                <text x="12" y="28" className="axis-title">PRICE CHANGE 24H</text>
                <text x={size.w / 2} y={size.h - 18} textAnchor="middle" className="axis-title">{xAxis === "marketCap" ? "MARKET CAP" : xAxis === "liquidityUsd" ? "LIQUIDITY" : "24H VOLUME"}</text>
              </g>
            </>}
            {renderedNodes.map((n, i) => {
              const color = flowColor(n);
              const total = Math.max(1, n.buys1h + n.sells1h);
              const imbalance = (n.buys1h - n.sells1h) / total;
              const activity = Math.min(1, Math.log10(Math.max(1, n.trades1h + 1)) / 4);
              const hype = hypeScore(n);
              const traffic = trafficState(n);
              const netFlow = Number.isFinite(Number(n.netFlowUsd1h)) ? Number(n.netFlowUsd1h) : (netFlowByMint.get(n.mint) ?? 0);
              const focusDimmed = Boolean(selected?.mint && !focusMints.has(n.mint) && !n.isCore);
              const pulseDuration = n.isCore ? 3.2 : Math.max(1.7, 4.4 - activity * 2.2 - hype / 120);
              return <g
                key={n.mint}
                transform={`translate(${n.x} ${n.y})`}
                className={`market-node-group ${streamLive ? "is-animated" : "is-paused"}`}
                style={{ ["--node-pulse-duration" as any]: `${pulseDuration}s` }}
              >
                <circle
                  r={n.r + 8}
                  className="market-hype-glow"
                  strokeWidth={1.2 + hype * .032}
                  strokeOpacity={Math.min(.92, .12 + hype / 112)}
                  style={{ ["--hype-strength" as any]: Math.max(.08, hype / 100) }}
                  pointerEvents="none"
                />
                {hype >= 55 && <circle
                  r={n.r + 14 + hype * .07}
                  className="market-hype-glow market-hype-glow-outer"
                  strokeWidth={.8 + hype * .018}
                  strokeOpacity={Math.min(.58, .08 + hype / 190)}
                  style={{ ["--hype-strength" as any]: hype / 100 }}
                  pointerEvents="none"
                />}
                <circle
                  r={n.r}
                  fill={n.isCore ? "#2b3138" : `url(#${planetGradientId(n)})`}
                  fillOpacity={n.isCore ? ".98" : ".94"}
                  stroke={selected?.mint === n.mint ? "#ffffff" : n.isCore ? "#b8c0c8" : color}
                  strokeWidth={selected?.mint === n.mint ? 2.5 : 1.5}
                  className={[
                    n.isCore ? "market-token-bubble market-core-bubble planet-bubble" : "market-token-bubble planet-bubble",
                    hotNodeMints.has(n.mint) ? "hot-path-node" : "",
                    activityPulse.includes(n.mint) ? "trade-hit" : "",
                    focusDimmed ? "focus-dimmed" : "",
                  ].filter(Boolean).join(" ")}
                  onPointerDown={(e) => beginMarketDrag(e, n.mint)}
                  onPointerMove={moveMarketDrag}
                  onPointerUp={endMarketDrag}
                  onPointerCancel={endMarketDrag}
                  onClick={() => {
                    if (!drag.current.moved && !n.isCore) {
                      setSelected(n);
                      expandToken(n);
                    }
                    drag.current.moved = false;
                  }}
                  onDoubleClick={() => {
                    if (!n.isCore) openToken(n);
                  }}
                >
                  <title>{n.symbol || n.name || n.mint}</title>
                </circle>
                {!n.isCore && <circle
                  r={Math.max(4, n.r * .7)}
                  cx={-n.r * .16}
                  cy={-n.r * .2}
                  className="planet-highlight"
                  pointerEvents="none"
                />}
                
                {viewMode === "map" && !n.isCore && <g className="reference-node-label" pointerEvents="none">
                  <text x="0" y={-n.r - 30} textAnchor="middle" className="reference-token-name">{n.symbol || n.name || n.mint.slice(0,5)}</text>
                  <text x="0" y={-n.r - 18} textAnchor="middle" className={n.priceChange24h >= 0 ? "reference-token-change buy" : "reference-token-change sell"}>
                    {n.priceChange24h >= 0 ? "+" : ""}{n.priceChange24h.toFixed(1)}%
                  </text>
                  <rect x="-22" y={n.r + 8} width="44" height="13" rx="2" className="reference-pool-chip" />
                  <text x="0" y={n.r + 17} textAnchor="middle" className="reference-pool-text">{n.dex ? n.dex.slice(0,8) : "Pool"} · live</text>
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
          </svg>}

          <div className="market-zoom-controls">
            <button>−</button><span>100%</span><button>＋</button><button>⛶</button>
          </div>
          <div className="market-legend">
            <span><i className="market-buy-dot" />капитал към токена</span>
            <span><i className="market-neutral-dot" />SOL / USDC / USDT центрове</span>
            <span><i className="market-sell-dot" />капитал от токена</span>
          </div>
        </div>

        <aside className="market-side reference-market-side">
          {!selected ? <>
            <div className="side-section-title">
              <h2>Market intelligence</h2>
              <span>LIVE</span>
            </div>
            <p className="side-intro">Кликни върху токен за подробности. Double click отваря holder картата.</p>
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
            {movers.some((m) => Number(m.activityDelta ?? 0) !== 0 || Number(m.hypeDelta ?? 0) !== 0) && <div className="market-movers">
              <strong>Най-бързи промени</strong>
              {movers.map((m) => <button key={m.mint} onClick={() => { setSelected(m); expandToken(m); }}>
                <span>{m.symbol || m.mint.slice(0, 5)}</span>
                <small>{Number(m.activityDelta ?? 0) >= 0 ? "+" : ""}{Number(m.activityDelta ?? 0)} tx</small>
                <b className={Number(m.hypeDelta ?? 0) >= 0 ? "in" : "out"}>{Number(m.hypeDelta ?? 0) >= 0 ? "+" : ""}{Number(m.hypeDelta ?? 0)} H</b>
              </button>)}
            </div>}
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
            <button className="market-back" onClick={() => setSelected(null)}>← Всички токени</button>
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
            <dl className="market-token-stats">
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
            </dl>
            <button className="open-token-button" onClick={() => openToken(selected)} disabled={loadingMint === selected.mint}>
              {loadingMint === selected.mint ? "Зареждам holders…" : "Отвори Holder Map →"}
            </button>
            <p className="market-mint">{selected.mint}</p>
          </>}
          {error && <div className="market-error">{error}</div>}
        </aside>
      </section>
    </main>
  );
}
