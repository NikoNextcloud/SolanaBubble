"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from "d3-force";
import { browserDb } from "@/lib/supabase-browser";

type H = { wallet: string; balance: number; usd_value: number; pct_supply: number; cluster_id: number | null; funder: string | null; first_activity: string | null; last_activity: string | null; bought_usd: number; sold_usd: number };
type N = H & { x: number; y: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null; r: number; flash?: "buy" | "sell"; fk?: number };
type L = { source: string | N; target: string | N; kind: string; group?: number; signalCount?: number };
type E = { from_wallet: string; to_wallet: string; kind: "swap" | "transfer"; amount: number; usd_value: number; tx_count: number; last_seen: string };
type Tx = { signature: string; wallet: string; side: string; amount: number; usd_value: number; block_time: string };
type TokenMeta = { mint: string; symbol: string | null; name: string | null; supply: number | null; price_usd: number | null; decimals: number };
type View = "map" | "holders" | "transactions" | "history";

const MAX_NODES = 500;
const FAN_IN_MIN_SOURCES = 2;
const HOUR = 60 * 60 * 1000;
const palette = ["#ff6f91", "#e56bd0", "#8b7cff", "#55c2ff", "#58d6a7", "#ffb45e", "#ff6473", "#60d4df"];
const groupColor = (id: number) => palette[Math.abs(id) % palette.length];
const radius = (pct: number) => Math.max(5, Math.min(74, Math.sqrt(Math.max(pct, 0)) * 30));
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(0)}`;
const num = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toLocaleString();
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const linkEndpoints = (source: N, target: N, gap = 3) => {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const sr = Math.max(1, source.r) + gap;
  const tr = Math.max(1, target.r) + gap;
  return {
    x1: source.x + ux * sr,
    y1: source.y + uy * sr,
    x2: target.x - ux * tr,
    y2: target.y - uy * tr,
  };
};

export default function BubbleMap({ mint }: { mint: string }) {
  const db = useMemo(() => browserDb(), []);
  const wrap = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, N>());
  const baseLinks = useRef<L[]>([]);
  const edges = useRef<E[]>([]);
  const links = useRef<L[]>([]);
  const sim = useRef<Simulation<N, undefined>>(undefined);
  const pan = useRef({ active: false, x: 0, y: 0, tx: 0, ty: 0 });
  const drag = useRef({
    active: false,
    pointerId: -1,
    wallet: "",
    lastX: 0,
    lastY: 0,
    lastAt: 0,
    vx: 0,
    vy: 0,
    moved: false,
  });

  const [, bump] = useState(0);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [live, setLive] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [walletTxs, setWalletTxs] = useState<Tx[]>([]);
  const [feedTxs, setFeedTxs] = useState<Tx[]>([]);
  const [holderCount, setHolderCount] = useState(0);
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [missing, setMissing] = useState(false);
  const [view, setView] = useState<View>("map");

  const [walletQuery, setWalletQuery] = useState("");
  const [minPct, setMinPct] = useState(0);
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [showSwaps, setShowSwaps] = useState(true);
  const [showTransfers, setShowTransfers] = useState(true);
  const [motionOn, setMotionOn] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [streamLive, setStreamLive] = useState(true);
  const [tabVisible, setTabVisible] = useState(true);
  const [autoPaused, setAutoPaused] = useState(false);
  const idleRef = useRef(Date.now());
  const [motionNow, setMotionNow] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [draggingWallet, setDraggingWallet] = useState<string | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [watched, setWatched] = useState<string[]>([]);
  const [hiddenWallets, setHiddenWallets] = useState<string[]>([]);
  const [showClusters, setShowClusters] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [showOthers, setShowOthers] = useState(true);
  const groupsForMotionRef = useRef(new Set<string>());

  const visualGroups = () => {
    const map = new Map<string, number>();

    for (const n of nodes.current.values()) {
      if (n.cluster_id) map.set(n.wallet, n.cluster_id);
    }

    const hubs = graphHubs();
    const inbound = new Map<string, Set<string>>();
    for (const e of edges.current) {
      if (!nodes.current.has(e.from_wallet) || !nodes.current.has(e.to_wallet)) continue;
      if (hubs.has(e.from_wallet) || hubs.has(e.to_wallet)) continue;
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
    const directTransfers: L[] = [];
    const hubs = graphHubs();
    const inbound = new Map<string, Set<string>>();
    const seen = new Set<string>();

    for (const e of edges.current) {
      if (!nodes.current.has(e.from_wallet) || !nodes.current.has(e.to_wallet)) continue;
      if (hubs.has(e.from_wallet) || hubs.has(e.to_wallet)) continue;
      const set = inbound.get(e.to_wallet) ?? new Set<string>();
      set.add(e.from_wallet);
      inbound.set(e.to_wallet, set);

      // Direct wallet-to-wallet TRANSFER relations are useful cluster evidence
      // and should always be visible between current holders, not only in fan-in.
      if (e.kind === "transfer") {
        const sg = groups.get(e.from_wallet);
        const tg = groups.get(e.to_wallet);
        directTransfers.push({
          source: e.from_wallet,
          target: e.to_wallet,
          kind: "direct-transfer",
          group: sg && sg === tg ? sg : tg ?? sg,
          signalCount: Number(e.tx_count ?? 1),
        });
        seen.add(`${e.from_wallet}>${e.to_wallet}:transfer`);
      }
    }

    for (const e of edges.current) {
      const sources = inbound.get(e.to_wallet);
      if (!sources || sources.size < FAN_IN_MIN_SOURCES) continue;
      const key = `${e.from_wallet}>${e.to_wallet}:${e.kind}`;
      if (e.kind === "transfer" && seen.has(key)) continue;
      fanIn.push({
        source: e.from_wallet,
        target: e.to_wallet,
        kind: e.kind === "swap" ? "flow-swap" : "flow-transfer",
        group: groups.get(e.to_wallet),
        signalCount: Number(e.tx_count ?? 1),
      });
    }

    links.current = [...baseLinks.current, ...directTransfers, ...fanIn];
  };

  const configureLayout = (s: Simulation<N, undefined>) => {
    const groups = visualGroups();
    const ids = [...new Set(groups.values())].sort((a, b) => a - b);
    const centers = new Map<number, { x: number; y: number }>();

    ids.forEach((id, i) => {
      if (ids.length === 1) {
        centers.set(id, { x: size.w * 0.52, y: size.h * 0.5 });
        return;
      }
      const angle = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
      centers.set(id, {
        x: size.w / 2 + Math.cos(angle) * size.w * 0.29,
        y: size.h / 2 + Math.sin(angle) * size.h * 0.27,
      });
    });

    s.force("center", forceCenter(size.w / 2, size.h / 2).strength(0.025));
    s.force("charge", forceManyBody<N>().strength((d) => groups.has(d.wallet) ? -10 : -34));
    s.force("x", forceX<N>((d) => {
      const g = groups.get(d.wallet);
      return g ? (centers.get(g)?.x ?? size.w / 2) : size.w / 2;
    }).strength((d) => groups.has(d.wallet) ? 0.2 : 0.014));
    s.force("y", forceY<N>((d) => {
      const g = groups.get(d.wallet);
      return g ? (centers.get(g)?.y ?? size.h / 2) : size.h / 2;
    }).strength((d) => groups.has(d.wallet) ? 0.2 : 0.014));
    s.force("collide", forceCollide<N>((d) => d.r + (groups.has(d.wallet) ? 7 : 11)).strength(0.97));
  };

  const restart = () => {
    const s = sim.current; if (!s) return;
    rebuildLinks();
    s.nodes([...nodes.current.values()]);
    configureLayout(s);
    s.force("link", forceLink<N, any>(links.current)
      .id((d) => d.wallet)
      .distance((l: any) =>
        l.kind === "funder" ? 46 :
        l.kind === "direct-transfer" ? 50 :
        l.kind === "timing" ? 58 :
        l.kind.startsWith("flow-") ? 68 : 60
      )
      .strength((l: any) =>
        l.kind === "funder" ? 0.48 :
        l.kind === "direct-transfer" ? 0.42 :
        l.kind === "timing" ? 0.28 :
        l.kind.startsWith("flow-") ? 0.22 : 0.16
      ));
    s.alpha(0.62).restart();
    bump((x) => x + 1);
  };

  const put = (h: H, animate: boolean) => {
    const prev = nodes.current.get(h.wallet);
    let pin: { x: number; y: number } | null = null;
    if (!prev) {
      try {
        const saved = JSON.parse(localStorage.getItem(`solanabubble:pinned:${mint}`) || "{}");
        pin = saved[h.wallet] ?? null;
      } catch {}
    }
    const n: N = prev ?? {
      ...h,
      x: pin?.x ?? size.w / 2 + (Math.random() - 0.5) * 40,
      y: pin?.y ?? size.h / 2 + (Math.random() - 0.5) * 40,
      fx: pin?.x ?? null,
      fy: pin?.y ?? null,
      r: 0,
    };
    const grew = prev ? Number(h.balance) > Number(prev.balance) : false;
    const shrank = prev ? Number(h.balance) < Number(prev.balance) : false;
    Object.assign(n, h, { r: radius(Number(h.pct_supply)) });
    if (animate && prev && (grew || shrank)) {
      n.flash = grew ? "buy" : "sell";
      n.fk = (n.fk ?? 0) + 1;
      const flashKey = n.fk;
      window.setTimeout(() => {
        const current = nodes.current.get(h.wallet);
        if (current && current.fk === flashKey) {
          current.flash = undefined;
          bump((x) => x + 1);
        }
      }, 900);
    }
    nodes.current.set(h.wallet, n);
  };

  useEffect(() => {
    if (!motionOn || streamLive !== true || view !== "map") return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 45) {
        last = now;
        setMotionNow(now);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motionOn, streamLive, view]);

  async function changeStreamLive(next: boolean, automatic = false) {
    setStreamLive(next);
    setAutoPaused(automatic && !next);
    idleRef.current = Date.now();
    if (next) sim.current?.alpha(0.45).restart();
    else sim.current?.stop();
  }

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!streamLive || !tabVisible) return;
    let stopped = false;

    const refresh = async () => {
      try {
        const r = await fetch(`/api/tokens/${mint}/refresh`, {
          method: "POST",
          cache: "no-store",
        });
        if (!r.ok || stopped) return;
        const j = await r.json();
        if (Number.isFinite(Number(j.priceUsd))) {
          setMeta((prev) => prev ? { ...prev, price_usd: Number(j.priceUsd) } : prev);
        }
      } catch {}
    };

    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [mint, streamLive, tabVisible]);

  useEffect(() => {
    const activity = () => {
      idleRef.current = Date.now();
      if (autoPaused) setAutoPaused(false);
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, activity, { passive: true });
    const timer = window.setInterval(() => {
      if (streamLive === true && Date.now() - idleRef.current >= 2 * 60 * 1000) {
        changeStreamLive(false, true);
      }
    }, 10000);
    return () => {
      for (const name of events) window.removeEventListener(name, activity);
      window.clearInterval(timer);
    };
  }, [streamLive, autoPaused]);

  useEffect(() => {
    try {
      setLabels(JSON.parse(localStorage.getItem(`solanabubble:labels:${mint}`) || "{}"));
      setWatched(JSON.parse(localStorage.getItem(`solanabubble:watched:${mint}`) || "[]"));
      setHiddenWallets(JSON.parse(localStorage.getItem(`solanabubble:hidden:${mint}`) || "[]"));
    } catch {}
  }, [mint]);

  const saveLabels = (next: Record<string, string>) => {
    setLabels(next);
    localStorage.setItem(`solanabubble:labels:${mint}`, JSON.stringify(next));
  };
  const saveWatched = (next: string[]) => {
    setWatched(next);
    localStorage.setItem(`solanabubble:watched:${mint}`, JSON.stringify(next));
  };
  const saveHidden = (next: string[]) => {
    setHiddenWallets(next);
    localStorage.setItem(`solanabubble:hidden:${mint}`, JSON.stringify(next));
  };
  const toggleHidden = (wallet: string) => {
    saveHidden(hiddenWallets.includes(wallet) ? hiddenWallets.filter((w) => w !== wallet) : [...hiddenWallets, wallet]);
  };
  const toggleWatch = (wallet: string) => {
    saveWatched(watched.includes(wallet) ? watched.filter((w) => w !== wallet) : [...watched, wallet]);
  };
  const displayWallet = (wallet: string) => labels[wallet]?.trim() || short(wallet);

  const motionPoint = (n: N) => {
    if (n.fx != null && n.fy != null) return { ...n, x: n.fx, y: n.fy };
    if (!motionOn || !motionNow) return { ...n };
    let seed = 0;
    for (let i = 0; i < Math.min(10, n.wallet.length); i++) seed = (seed * 31 + n.wallet.charCodeAt(i)) >>> 0;
    const phase = (seed % 628) / 100;
    const speed = 1700 + (seed % 1300);
    const amp = groupsForMotionRef.current.has(n.wallet) ? 2.2 : 1.25;
    const t = motionNow / speed + phase;
    return {
      ...n,
      x: n.x + Math.sin(t) * amp,
      y: n.y + Math.cos(t * 0.83) * amp,
    };
  };

  const graphHubs = () => {
    const peers = new Map<string, Set<string>>();
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const e of edges.current) {
      if (e.kind !== "swap" || e.from_wallet === e.to_wallet) continue;
      const a = peers.get(e.from_wallet) ?? new Set<string>();
      const b = peers.get(e.to_wallet) ?? new Set<string>();
      a.add(e.to_wallet); b.add(e.from_wallet);
      peers.set(e.from_wallet, a); peers.set(e.to_wallet, b);
      outgoing.set(e.from_wallet, (outgoing.get(e.from_wallet) ?? 0) + 1);
      incoming.set(e.to_wallet, (incoming.get(e.to_wallet) ?? 0) + 1);
    }
    const hubs = new Set<string>();
    for (const [wallet, set] of peers) {
      if (set.size >= 6 && (incoming.get(wallet) ?? 0) > 0 && (outgoing.get(wallet) ?? 0) > 0) hubs.add(wallet);
    }
    return hubs;
  };

  const linkWallet = (value: string | N) => typeof value === "string" ? value : value.wallet;

  const connectedWallets = (start: string) => {
    const adjacency = new Map<string, Set<string>>();
    for (const l of links.current) {
      const a = linkWallet(l.source);
      const b = linkWallet(l.target);
      if (!nodes.current.has(a) || !nodes.current.has(b)) continue;
      const aa = adjacency.get(a) ?? new Set<string>();
      const bb = adjacency.get(b) ?? new Set<string>();
      aa.add(b);
      bb.add(a);
      adjacency.set(a, aa);
      adjacency.set(b, bb);
    }

    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift()!;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return [...seen];
  };

  const beginNodeDrag = (e: React.PointerEvent<SVGCircleElement>, wallet: string) => {
    e.stopPropagation();
    const n = nodes.current.get(wallet);
    if (!n) return;

    // Only the grabbed bubble is pinned to the pointer. Connected bubbles stay
    // physically free, so the d3 link forces pull them after it like springs.
    n.fx = n.x;
    n.fy = n.y;
    n.vx = 0;
    n.vy = 0;

    drag.current = {
      active: true,
      pointerId: e.pointerId,
      wallet,
      lastX: e.clientX,
      lastY: e.clientY,
      lastAt: performance.now(),
      vx: 0,
      vy: 0,
      moved: false,
    };
    setDraggingWallet(wallet);
    e.currentTarget.setPointerCapture(e.pointerId);
    sim.current?.alpha(0.78).alphaTarget(0.24).restart();
    bump((x) => x + 1);
  };

  const moveNodeDrag = (e: React.PointerEvent<SVGCircleElement>) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const now = performance.now();
    const dt = Math.max(8, now - d.lastAt);
    const dx = (e.clientX - d.lastX) / transform.k;
    const dy = (e.clientY - d.lastY) / transform.k;
    if (Math.abs(dx) + Math.abs(dy) > 0.15) d.moved = true;

    // Track pointer speed so release can keep a little momentum.
    d.vx = (dx / dt) * 16.67;
    d.vy = (dy / dt) * 16.67;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    d.lastAt = now;

    const n = nodes.current.get(d.wallet);
    if (!n) return;
    n.fx = (n.fx ?? n.x) + dx;
    n.fy = (n.fy ?? n.y) + dy;
    n.x = n.fx;
    n.y = n.fy;
    n.vx = 0;
    n.vy = 0;

    // Keep the simulation hot while dragging. Link forces make connected
    // wallets lag and then catch up instead of moving as one rigid block.
    sim.current?.alpha(0.72).restart();
    bump((x) => x + 1);
  };

  const endNodeDrag = (e: React.PointerEvent<SVGCircleElement>) => {
    const d = drag.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    const n = nodes.current.get(d.wallet);
    if (n) {
      // Keep the grabbed bubble pinned exactly where the user dropped it.
      // Connected bubbles remain free and continue following it through the
      // spring/link forces.
      n.fx = n.x;
      n.fy = n.y;
      n.vx = 0;
      n.vy = 0;
    }

    try {
      const pinned: Record<string, { x: number; y: number }> = {};
      for (const node of nodes.current.values()) {
        if (node.fx != null && node.fy != null) pinned[node.wallet] = { x: node.fx, y: node.fy };
      }
      localStorage.setItem(`solanabubble:pinned:${mint}`, JSON.stringify(pinned));
    } catch {}

    d.active = false;
    setDraggingWallet(null);
    sim.current?.alpha(0.5).alphaTarget(0).restart();
    bump((x) => x + 1);
  };

  const releasePinnedNodes = () => {
    for (const n of nodes.current.values()) {
      n.fx = null;
      n.fy = null;
    }
    try { localStorage.removeItem(`solanabubble:pinned:${mint}`); } catch {}
    drag.current.active = false;
    setDraggingWallet(null);
    sim.current?.alpha(0.65).alphaTarget(0).restart();
    bump((x) => x + 1);
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
    const s = forceSimulation<N>().alphaDecay(0.026).velocityDecay(0.34);
    s.on("tick", () => bump((x) => x + 1)); sim.current = s;

    (async () => {
      const since = new Date(Date.now() - 24 * HOUR).toISOString();
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
        db.from("wallet_links").select("wallet_a,wallet_b,kind,signal_count").eq("token_mint", mint),
        db.from("wallet_edges").select("from_wallet,to_wallet,kind,amount,usd_value,tx_count,last_seen").eq("token_mint", mint),
        db.from("transactions").select("signature,wallet,side,amount,usd_value,block_time").eq("token_mint", mint).gte("block_time", since).order("block_time", { ascending: false }).limit(1000),
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
        .map((l: any) => ({ source: l.wallet_a, target: l.wallet_b, kind: l.kind, signalCount: Number(l.signal_count ?? 1) }));
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
          baseLinks.current.push({ source: p.new.wallet_a, target: p.new.wallet_b, kind: p.new.kind, signalCount: Number(p.new.signal_count ?? 1) });
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
        setFeedTxs((cur) => [row, ...cur.filter((x) => !(x.signature === row.signature && x.wallet === row.wallet))].slice(0, 1000));
      })
      .subscribe((st) => setLive(st === "SUBSCRIBED"));

    return () => { alive = false; s.stop(); db.removeChannel(ch); };
  }, [mint]);

  useEffect(() => {
    const s = sim.current; if (!s) return;
    configureLayout(s);
    s.alpha(0.42).restart();
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
  groupsForMotionRef.current = new Set(groups.keys());
  const selected = sel ? nodes.current.get(sel) : null;
  const rankedWallets = [...arr].sort((a, b) => Number(b.usd_value) - Number(a.usd_value));
  const selectedRank = selected ? rankedWallets.findIndex((n) => n.wallet === selected.wallet) + 1 : 0;
  const pl = selected && Number(selected.bought_usd) > 0 ? Number(selected.usd_value) + Number(selected.sold_usd) - Number(selected.bought_usd) : null;
  const groupCount = new Set(groups.values()).size;
  const ignoredHubCount = graphHubs().size;
  const volume24h = feedTxs.reduce((a, t) => a + Number(t.usd_value || 0), 0) / 2;
  const buys24h = feedTxs.filter((t) => t.side === "buy").length;
  const sells24h = feedTxs.filter((t) => t.side === "sell").length;
  const related = selected ? edges.current
    .filter((e) => e.from_wallet === selected.wallet || e.to_wallet === selected.wallet)
    .sort((a, b) => Number(b.usd_value) - Number(a.usd_value))
    .slice(0, 10) : [];

  const q = walletQuery.trim().toLowerCase();
  const hiddenSet = new Set(hiddenWallets);
  const clusterCount = arr.filter((n) => groups.has(n.wallet) && !hiddenSet.has(n.wallet)).length;
  const hiddenCount = arr.filter((n) => hiddenSet.has(n.wallet)).length;
  const otherCount = arr.filter((n) => !groups.has(n.wallet) && !hiddenSet.has(n.wallet)).length;

  const visibleNodes = arr.filter((n) => {
    const hidden = hiddenSet.has(n.wallet);
    const clustered = groups.has(n.wallet) && !hidden;
    const other = !clustered && !hidden;
    if (clustered && !showClusters) return false;
    if (hidden && !showHidden) return false;
    if (other && !showOthers) return false;
    if (Number(n.pct_supply) < minPct) return false;
    if (linkedOnly && !groups.has(n.wallet)) return false;
    if (q && !n.wallet.toLowerCase().includes(q) && !(labels[n.wallet] || "").toLowerCase().includes(q)) return false;
    return true;
  });
  const visibleWallets = new Set(visibleNodes.map((n) => n.wallet));
  const visibleLinks = links.current.filter((l: any) => {
    const source = l.source?.wallet ?? l.source;
    const target = l.target?.wallet ?? l.target;
    if (!visibleWallets.has(source) || !visibleWallets.has(target)) return false;
    if (l.kind === "flow-swap" && !showSwaps) return false;
    if ((l.kind === "flow-transfer" || l.kind === "direct-transfer") && !showTransfers) return false;
    return true;
  });

  const nowHour = Math.floor(Date.now() / HOUR) * HOUR;
  const historyStart = nowHour - 23 * HOUR;
  const history = Array.from({ length: 24 }, (_, i) => ({
    ts: historyStart + i * HOUR,
    buyUsd: 0,
    sellUsd: 0,
    buys: 0,
    sells: 0,
    cumulative: 0,
  }));
  for (const t of feedTxs) {
    const ts = new Date(t.block_time).getTime();
    const idx = Math.floor((ts - historyStart) / HOUR);
    if (idx < 0 || idx >= 24) continue;
    if (t.side === "buy") { history[idx].buyUsd += Number(t.usd_value || 0); history[idx].buys += 1; }
    if (t.side === "sell") { history[idx].sellUsd += Number(t.usd_value || 0); history[idx].sells += 1; }
  }
  let running = 0;
  for (const h of history) {
    running += h.buyUsd - h.sellUsd;
    h.cumulative = running;
  }
  const historyMax = Math.max(1, ...history.map((h) => Math.abs(h.cumulative)));
  const historyPoints = history.map((h, i) => {
    const x = 32 + i * (936 / 23);
    const y = 145 - (h.cumulative / historyMax) * 105;
    return `${x},${y}`;
  }).join(" ");
  const netFlow24h = history.reduce((a, h) => a + h.buyUsd - h.sellUsd, 0);

  const zoomBy = (factor: number) => setTransform((t) => {
    const k = clamp(t.k * factor, 0.45, 4);
    const cx = size.w / 2, cy = size.h / 2;
    const ratio = k / t.k;
    return { k, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio };
  });
  const resetView = () => setTransform({ x: 0, y: 0, k: 1 });

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
          <div><span>Ignored pools/routers</span><b>{ignoredHubCount}</b></div>
          <div><span>24h net flow</span><b className={netFlow24h >= 0 ? "buy" : "sell"}>{netFlow24h >= 0 ? "+" : ""}{usd(netFlow24h)}</b></div>
        </div>

        <nav className="view-tabs" aria-label="Token views">
          <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Bubble map</button>
          <button className={view === "holders" ? "active" : ""} onClick={() => setView("holders")}>Holders</button>
          <button className={view === "transactions" ? "active" : ""} onClick={() => setView("transactions")}>Transactions</button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>Historical</button>
        </nav>

        <div className="work-content">
          {view === "map" && <div className="map insight-map" ref={wrap}>
            {missing && <div className="map-message">Токенът не се следи. Стартирай bootstrap за {mint}.</div>}

            <div className="insight-live-bar holder-live-bar">
              <button className="ghost-control" onClick={() => setView("holders")}>☷ Holders</button>
              <button
                className={`ghost-control ${filtersOpen ? "active" : ""}`}
                onClick={() => setFiltersOpen((v) => !v)}
              >↕ Filters</button>
              <button
                className={`go-live-control ${streamLive === true ? "is-live" : ""}`}
                onClick={() => changeStreamLive(streamLive !== true)}
              >{streamLive === true ? "◉ Live" : "◉ Go Live"}</button>
            </div>
            {filtersOpen && <div className="holder-filter-menu">
              <label><input type="checkbox" checked={linkedOnly} onChange={(e) => setLinkedOnly(e.target.checked)} /><span>Само свързани</span></label>
              <label><input type="checkbox" checked={showSwaps} onChange={(e) => setShowSwaps(e.target.checked)} /><span>Swap връзки</span></label>
              <label><input type="checkbox" checked={showTransfers} onChange={(e) => setShowTransfers(e.target.checked)} /><span>Transfer връзки</span></label>
              <label><input type="checkbox" checked={motionOn} onChange={(e) => setMotionOn(e.target.checked)} /><span>Жива карта</span></label>
            </div>}
            {selected && <div className="holder-quick-card">
              <div className="holder-quick-head">
                <span className="holder-quick-rank">{selectedRank || "—"}</span>
                <span className="holder-quick-avatar">◈</span>
                <button
                  className="holder-quick-wallet"
                  onClick={() => navigator.clipboard?.writeText(selected.wallet)}
                  title="Копирай адреса"
                >
                  {displayWallet(selected.wallet)} <span>▣</span>
                </button>
                <button className="holder-quick-more" onClick={() => setSel(null)} title="Затвори">•••</button>
              </div>

              <div className="holder-quick-metrics">
                <strong><span>＄</span>{usd(Number(selected.usd_value))}</strong>
                <strong><span>◌</span>{Number(selected.pct_supply).toFixed(2)}%</strong>
              </div>

              <div className="holder-quick-badge">Wallet</div>

              <button
                className="holder-quick-cluster"
                onClick={() => {
                  const gid = groups.get(selected.wallet);
                  if (gid) {
                    setLinkedOnly(true);
                    setShowClusters(true);
                  }
                }}
              >
                <span>{groups.get(selected.wallet) ? `Cluster #${groups.get(selected.wallet)}` : "Без клъстер"}</span>
                <b>{Number(selected.pct_supply).toFixed(2)}%</b>
                <i>›</i>
              </button>
            </div>}
            {streamLive === false && <div className="pause-banner holder-pause-banner">
              {autoPaused ? "Автоматична пауза след 2 мин. без активност" : "Live режимът е на пауза"}
            </div>}
            <div className="graph-toolbar holder-graph-toolbar">
              <input value={walletQuery} onChange={(e) => setWalletQuery(e.target.value)} placeholder="Find wallet…" aria-label="Find wallet" />
              <label>Min %
                <select value={String(minPct)} onChange={(e) => setMinPct(Number(e.target.value))}>
                  <option value="0">All</option>
                  <option value="0.001">0.001%</option>
                  <option value="0.01">0.01%</option>
                  <option value="0.05">0.05%</option>
                  <option value="0.1">0.1%</option>
                  <option value="0.5">0.5%</option>
                  <option value="1">1%</option>
                </select>
              </label>
              <div className="holder-type-controls">
                <button className={showClusters ? "active" : ""} onClick={() => setShowClusters((v) => !v)}>Клъстери <b>{clusterCount}</b></button>
                <button className={showHidden ? "active" : ""} onClick={() => setShowHidden((v) => !v)}>Скрити <b>{hiddenCount}</b></button>
                <button className={showOthers ? "active" : ""} onClick={() => setShowOthers((v) => !v)}>Останали <b>{otherCount}</b></button>
              </div>
              <span className="shown-count">{visibleNodes.length} shown</span>
            </div>

            <div className="zoom-controls">
              <button onClick={() => zoomBy(1.2)} title="Zoom in">+</button>
              <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out">−</button>
              <button onClick={resetView} title="Нулирай изгледа">↺</button>
              <button className="reset-pins-button" onClick={releasePinnedNodes} title="Нулирай фиксираните позиции">↺ Позиции</button>
              <span>{Math.round(transform.k * 100)}%</span>
            </div>

            <svg
              role="img"
              aria-label="Карта на holders"
              style={{ touchAction: "none" }}
              onWheel={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const px = e.clientX - rect.left, py = e.clientY - rect.top;
                setTransform((t) => {
                  const k = clamp(t.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.45, 4);
                  const ratio = k / t.k;
                  return { k, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio };
                });
              }}
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget) return;
                pan.current = { active: true, x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!pan.current.active) return;
                setTransform((t) => ({ ...t, x: pan.current.tx + e.clientX - pan.current.x, y: pan.current.ty + e.clientY - pan.current.y }));
              }}
              onPointerUp={(e) => {
                pan.current.active = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => { pan.current.active = false; }}
            >
              <defs>
                <marker id="flowArrow" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
                <marker id="relationArrow" viewBox="0 0 10 10" refX="8.4" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
                </marker>
              </defs>

              <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
                {visibleLinks.map((l: any, i) => {
                  if (l.source?.x === undefined || l.target?.x === undefined) return null;
                  const source = motionPoint(l.source as N);
                  const target = motionPoint(l.target as N);
                  const flow = l.kind.startsWith("flow-");
                  const directed = flow || l.kind === "direct-transfer";
                  const sourceGroup = groups.get(source.wallet);
                  const targetGroup = groups.get(target.wallet);
                  const sharedGroup = sourceGroup && sourceGroup === targetGroup ? sourceGroup : l.group;
                  const color = sharedGroup ? groupColor(sharedGroup) : "#46505f";
                  const count = Math.max(1, Number(l.signalCount ?? 1));
                  const confidence =
                    l.kind === "funder" ? 0.96 :
                    l.kind === "direct-transfer" ? Math.min(0.92, 0.68 + Math.log2(count + 1) * 0.08) :
                    l.kind === "timing" ? Math.min(0.82, 0.48 + Math.log2(count + 1) * 0.08) :
                    Math.min(0.88, 0.58 + Math.log2(count + 1) * 0.07);
                  const p = linkEndpoints(source, target, directed ? 6 : 5);
                  const title =
                    l.kind === "funder" ? `Общ финансиращ адрес · висока увереност` :
                    l.kind === "timing" ? `Синхронна покупка · ${count} сигнал(а) · ${Math.round(confidence * 100)}% увереност` :
                    l.kind === "direct-transfer" ? `Директен трансфер · ${count} tx · ${Math.round(confidence * 100)}% увереност` :
                    `Token flow · ${count} tx · ${Math.round(confidence * 100)}% увереност`;
                  return <line
                    key={i}
                    x1={p.x1} y1={p.y1}
                    x2={p.x2} y2={p.y2}
                    stroke={color}
                    strokeWidth={1 + confidence * 1.15}
                    strokeOpacity={0.34 + confidence * 0.62}
                    strokeDasharray={flow ? "5 5" : l.kind === "timing" ? "3 4" : undefined}
                    markerStart={!directed ? "url(#relationArrow)" : undefined}
                    markerEnd={flow ? "url(#flowArrow)" : "url(#relationArrow)"}
                  ><title>{title}</title></line>;
                })}

                {motionOn && visibleLinks.slice(0, 90).map((l: any, i) => {
                  if (l.source?.x === undefined || l.target?.x === undefined) return null;
                  const directed = l.kind.startsWith("flow-") || l.kind === "direct-transfer";
                  if (!directed) return null;
                  const source = motionPoint(l.source as N);
                  const target = motionPoint(l.target as N);
                  const p = linkEndpoints(source, target, 7);
                  const progress = ((motionNow / (1500 + (i % 5) * 170)) + i * 0.137) % 1;
                  const x = p.x1 + (p.x2 - p.x1) * progress;
                  const y = p.y1 + (p.y2 - p.y1) * progress;
                  const gid = groups.get(source.wallet) ?? groups.get(target.wallet) ?? l.group;
                  return <circle
                    key={`particle:${i}`}
                    className="flow-particle"
                    cx={x} cy={y} r={1.8}
                    fill={gid ? groupColor(gid) : "#a9b6c8"}
                    pointerEvents="none"
                  />;
                })}

                {visibleNodes.map((n) => {
                  const gid = groups.get(n.wallet);
                  const color = gid ? groupColor(gid) : "#69717f";
                  const active = sel === n.wallet;
                  const over = hovered === n.wallet;
                  const p = motionPoint(n);
                  return <g key={n.wallet} className="live-node">
                    {gid && <circle
                      className="node-halo"
                      cx={p.x} cy={p.y} r={n.r + 4}
                      fill="none" stroke={color} strokeWidth={1}
                      pointerEvents="none"
                    />}
                    {n.flash && <circle
                      key={`activity:${n.wallet}:${n.fk ?? 0}`}
                      className={`activity-ring activity-${n.flash}`}
                      cx={p.x} cy={p.y} r={n.r + 2}
                      fill="none" pointerEvents="none"
                    />}
                    <circle
                      className={`bubble insight-bubble ${n.flash ? `flash-${n.flash}` : ""}`}
                      cx={p.x} cy={p.y} r={n.r + (over ? 2 : 0)}
                      fill={n.flash === "buy" ? "#dfe5ed" : n.flash === "sell" ? "#352026" : gid ? color : "#171a21"}
                      fillOpacity={n.flash === "buy" ? 0.72 : n.flash === "sell" ? 0.56 : gid ? 0.2 : 0.46}
                      stroke={active ? "#f4f7fb" : watched.includes(n.wallet) ? "#ffd166" : color}
                      strokeWidth={active ? 3 : watched.includes(n.wallet) ? 2.8 : gid ? 2.2 : 1.35}
                      strokeDasharray={!gid && n.r <= 9 ? "2 2" : undefined}
                      tabIndex={0}
                      data-dragging={draggingWallet === n.wallet ? "true" : "false"}
                      onPointerEnter={() => setHovered(n.wallet)}
                      onPointerLeave={() => setHovered(null)}
                      onPointerDown={(e) => beginNodeDrag(e, n.wallet)}
                      onPointerMove={moveNodeDrag}
                      onPointerUp={endNodeDrag}
                      onPointerCancel={endNodeDrag}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!drag.current.moved) setSel(n.wallet);
                        drag.current.moved = false;
                      }}
                      onKeyDown={(e) => e.key === "Enter" && setSel(n.wallet)}
                    >
                      <title>{displayWallet(n.wallet)} · {Number(n.pct_supply).toFixed(2)}%{watched.includes(n.wallet) ? " · наблюдаван" : ""}</title>
                    </circle>
                    <text
                      x={p.x}
                      y={p.y}
                      dy="0.34em"
                      textAnchor="middle"
                      className="holder-bubble-value"
                      pointerEvents="none"
                    >{usd(Number(n.usd_value ?? 0))}</text>
                  </g>;
                })}
              </g>
            </svg>

            <div className="map-legend">
              <span><i className="legend-normal" />holder</span>
              <span><i className="legend-linked" />linked wallets</span>
              <span><i className="legend-flow" />token flow</span>
              <span><i className="legend-watch" />watchlist</span>
            </div>
          </div>}

          {view === "holders" && <div className="data-view">
            <div className="data-head">
              <h2>Top holders</h2>
              <div className="data-head-actions">
                <input value={walletQuery} onChange={(e) => setWalletQuery(e.target.value)} placeholder="Search wallet…" />
                <span>{visibleNodes.length} shown</span>
              </div>
            </div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>#</th><th>★</th><th>Wallet</th><th>Balance</th><th>Value</th><th>% supply</th><th>Group</th><th>Last activity</th></tr></thead>
              <tbody>{[...visibleNodes].sort((a, b) => Number(b.balance) - Number(a.balance)).map((h, i) => <tr key={h.wallet} onClick={() => setSel(h.wallet)}>
                <td>{i + 1}</td>
                <td><button className={watched.includes(h.wallet) ? "watch-star active" : "watch-star"} onClick={(e) => { e.stopPropagation(); toggleWatch(h.wallet); }}>{watched.includes(h.wallet) ? "★" : "☆"}</button></td>
                <td><a href={`https://solscan.io/account/${h.wallet}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{displayWallet(h.wallet)}</a></td>
                <td>{Number(h.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{usd(Number(h.usd_value))}</td>
                <td>{Number(h.pct_supply).toFixed(3)}%</td>
                <td>{groups.get(h.wallet) ? <span className="group-dot" style={{ background: groupColor(groups.get(h.wallet)!) }} /> : "—"}</td>
                <td>{h.last_activity ? new Date(h.last_activity).toLocaleString("bg-BG") : "—"}</td>
              </tr>)}</tbody>
            </table></div>
          </div>}

          {view === "transactions" && <div className="data-view">
            <div className="data-head"><h2>Live transactions</h2><span>last 24h · up to 250 shown</span></div>
            <div className="table-wrap"><table className="data-table">
              <thead><tr><th>Time</th><th>Wallet</th><th>Side</th><th>Amount</th><th>USD</th><th>Tx</th></tr></thead>
              <tbody>{feedTxs.slice(0, 250).map((t) => <tr key={`${t.signature}:${t.wallet}`} onClick={() => setSel(t.wallet)}>
                <td>{new Date(t.block_time).toLocaleTimeString("bg-BG")}</td>
                <td>{short(t.wallet)}</td>
                <td><span className={t.side === "buy" || t.side === "transfer_in" ? "side-badge buy" : "side-badge sell"}>{t.side}</span></td>
                <td>{Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                <td>{usd(Number(t.usd_value))}</td>
                <td><a href={`https://solscan.io/tx/${t.signature}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Solscan ↗</a></td>
              </tr>)}</tbody>
            </table></div>
          </div>}

          {view === "history" && <div className="data-view history-view">
            <div className="data-head"><h2>Historical activity</h2><span>tracked 24h window</span></div>
            <div className="history-cards">
              <div><span>Buy volume</span><b className="buy">{usd(history.reduce((a, h) => a + h.buyUsd, 0))}</b></div>
              <div><span>Sell volume</span><b className="sell">{usd(history.reduce((a, h) => a + h.sellUsd, 0))}</b></div>
              <div><span>Net flow</span><b className={netFlow24h >= 0 ? "buy" : "sell"}>{netFlow24h >= 0 ? "+" : ""}{usd(netFlow24h)}</b></div>
              <div><span>Tracked swaps</span><b>{buys24h + sells24h}</b></div>
            </div>
            <div className="history-chart">
              <div className="chart-title"><strong>Cumulative buy − sell flow</strong><span>USD · hourly buckets</span></div>
              <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-label="Historical net flow chart">
                <line x1="32" y1="145" x2="968" y2="145" className="chart-zero" />
                {[0, 6, 12, 18, 23].map((i) => {
                  const x = 32 + i * (936 / 23);
                  return <g key={i}><line x1={x} y1="38" x2={x} y2="250" className="chart-grid" /><text x={x} y="275" textAnchor="middle">{new Date(history[i].ts).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })}</text></g>;
                })}
                <polyline points={historyPoints} className="history-line" />
                {history.map((h, i) => {
                  const x = 32 + i * (936 / 23);
                  const y = 145 - (h.cumulative / historyMax) * 105;
                  return <circle key={i} cx={x} cy={y} r="3" className="history-point"><title>{new Date(h.ts).toLocaleString("bg-BG")} · {usd(h.cumulative)}</title></circle>;
                })}
              </svg>
              <p className="history-note">Historical data starts from the moment this token began being tracked by SolanaBubble; it is not a reconstruction of pre-bootstrap history.</p>
            </div>
            <div className="hourly-grid">{history.map((h) => <div key={h.ts}>
              <span>{new Date(h.ts).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })}</span>
              <b className={h.buyUsd - h.sellUsd >= 0 ? "buy" : "sell"}>{h.buyUsd - h.sellUsd >= 0 ? "+" : ""}{usd(h.buyUsd - h.sellUsd)}</b>
              <small>{h.buys} buys · {h.sells} sells</small>
            </div>)}</div>
          </div>}
        </div>
      </section>

      <aside className="side insight-side">
        {!selected ? <>
          <div className="side-section">
            <span className="eyebrow">Token overview</span>
            <h2>{meta?.name || meta?.symbol || short(mint)}</h2>
            <p className="mint-full">{mint}</p>
            <dl>
              <dt>Price</dt><dd>{usd(Number(meta?.price_usd ?? 0))}</dd>
              <dt>Supply</dt><dd>{num(Number(meta?.supply ?? 0))}</dd>
              <dt>Holders</dt><dd>{holderCount.toLocaleString()}</dd>
              <dt>Linked groups</dt><dd>{groupCount}</dd>
              <dt>Ignored pools/routers</dt><dd>{ignoredHubCount}</dd>
            </dl>
          </div>
          <div className="side-section">
            <span className="eyebrow">Live activity</span>
            <ul className="activity-list">{feedTxs.slice(0, 8).map((t) => <li key={`${t.signature}:${t.wallet}`}>
              <span className={t.side === "buy" || t.side === "transfer_in" ? "activity-dot buy-bg" : "activity-dot sell-bg"} />
              <button onClick={() => setSel(t.wallet)}>{displayWallet(t.wallet)}</button>
              <span>{usd(Number(t.usd_value))}</span>
            </li>)}</ul>
          </div>
          {watched.length > 0 && <div className="side-section">
            <span className="eyebrow">Watchlist</span>
            <ul className="watch-list">{watched.map((wallet) => <li key={wallet}>
              <button onClick={() => setSel(wallet)}>{displayWallet(wallet)}</button>
              <button className="watch-remove" onClick={() => toggleWatch(wallet)}>×</button>
            </li>)}</ul>
          </div>}
          <div className="side-section">
            <span className="eyebrow">How links work</span>
            <p className="note">Цветните групи са вероятни on-chain връзки. Общ funder, синхронни покупки и директни transfer-и между текущи holders са сигнали. Адреси, които приличат на pool/router по многото двупосочни swap връзки, се изключват от ownership клъстерите.</p>
          </div>
        </> : <>
          <div className="side-section">
            <button className="back-link" onClick={() => setSel(null)}>← Token overview</button>
            <span className="eyebrow">Wallet inspector</span>
            <div className="wallet-heading">
              <h2><a href={`https://solscan.io/account/${selected.wallet}`} target="_blank" rel="noreferrer">{displayWallet(selected.wallet)} ↗</a></h2>
              <button className={watched.includes(selected.wallet) ? "watch-button active" : "watch-button"} onClick={() => toggleWatch(selected.wallet)}>{watched.includes(selected.wallet) ? "★ Watching" : "☆ Watch"}</button>
            </div>
            <p className="mint-full">{selected.wallet}</p>
            <div className="wallet-actions">
              <button className={hiddenWallets.includes(selected.wallet) ? "wallet-action active" : "wallet-action"} onClick={() => toggleHidden(selected.wallet)}>
                {hiddenWallets.includes(selected.wallet) ? "Покажи на картата" : "Скрий от картата"}
              </button>
            </div>
            <label className="wallet-label-editor"><span>Label</span><input value={labels[selected.wallet] || ""} placeholder="e.g. deployer, whale, team wallet" onChange={(e) => saveLabels({ ...labels, [selected.wallet]: e.target.value })} /></label>
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
                <button onClick={() => setSel(other)}>{displayWallet(other)}</button>
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
