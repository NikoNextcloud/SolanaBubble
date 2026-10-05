"use client";

import type { TrafficSummary } from "@/lib/market/traffic/summary";

type TargetNode = {
  mint: string;
  symbol?: string | null;
  name?: string | null;
  x: number;
  y: number;
  r: number;
  trafficSample?: TrafficSummary | null;
};

type ActivityEvent = {
  mint: string;
  symbol: string | null;
  kind: "surge" | "cooldown" | "buy-pressure" | "sell-pressure";
  deltaTrades: number;
  deltaVolume: number;
  hypeDelta: number;
  at: string;
};

type Comet = {
  key: string;
  target: TargetNode;
  label: string;
  source: "swap" | "activity";
  strength: number;
  delay: number;
  duration: number;
  path: string;
};

const shortWallet = (wallet: string) => wallet.length > 10 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;
const fmtUsd = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `$${Math.max(0, n).toFixed(n >= 100 ? 0 : 2)}`;

function hash(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createPath(node: TargetNode, key: string, index: number) {
  const seed = hash(key);
  const angle = ((seed % 360) / 180) * Math.PI;
  const distance = 250 + (seed % 170);
  const sx = node.x + Math.cos(angle) * distance;
  const sy = node.y + Math.sin(angle) * distance;
  const dx = node.x - sx;
  const dy = node.y - sy;
  const length = Math.max(1, Math.hypot(dx, dy));
  const perpendicularX = -dy / length;
  const perpendicularY = dx / length;
  const bend = (index % 2 ? -1 : 1) * (50 + ((seed >> 8) % 80));
  const cx = (sx + node.x) / 2 + perpendicularX * bend;
  const cy = (sy + node.y) / 2 + perpendicularY * bend;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${node.x.toFixed(1)} ${node.y.toFixed(1)}`;
}

export default function MarketCometLayer({
  nodes,
  events,
  active,
}: {
  nodes: TargetNode[];
  events: ActivityEvent[];
  active: boolean;
}) {
  if (!active) return null;
  const byMint = new Map(nodes.map((n) => [n.mint, n]));
  const observed: Comet[] = [];

  for (const node of nodes) {
    const buys = node.trafficSample?.recentBuys ?? [];
    for (const buy of buys.slice(0, 2)) {
      const age = Date.now() - Date.parse(buy.blockAt);
      if (!Number.isFinite(age) || age < -60_000 || age > 20 * 60_000) continue;
      const quoteLabel = buy.usdValue != null
        ? fmtUsd(buy.usdValue)
        : buy.quoteMint === "So11111111111111111111111111111111111111112"
          ? `+${buy.quoteAmount.toFixed(buy.quoteAmount >= 10 ? 1 : 2)} SOL`
          : `+${buy.quoteAmount.toFixed(2)}`;
      const key = `${node.mint}:${buy.signature}:${buy.wallet}`;
      const index = observed.length;
      observed.push({
        key,
        target: node,
        label: `${shortWallet(buy.wallet)} · ${quoteLabel}`,
        source: "swap",
        strength: Math.max(1, Math.min(3, Math.log10(Math.max(10, buy.usdValue ?? buy.quoteAmount * 100)))),
        delay: index * .32,
        duration: 2.1 + (hash(key) % 70) / 100,
        path: createPath(node, key, index),
      });
    }
  }

  if (observed.length < 2) {
    for (const event of events) {
      if (!(event.kind === "surge" || event.kind === "buy-pressure") || event.deltaTrades <= 0) continue;
      const target = byMint.get(event.mint);
      if (!target) continue;
      const key = `${event.mint}:${event.kind}:${event.at}`;
      const index = observed.length;
      observed.push({
        key,
        target,
        label: `${target.symbol || event.symbol || target.mint.slice(0, 5)} · +${event.deltaTrades} tx`,
        source: "activity",
        strength: 1,
        delay: index * .38,
        duration: 2.5 + (hash(key) % 50) / 100,
        path: createPath(target, key, index),
      });
      if (observed.length >= 4) break;
    }
  }

  const comets = observed
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4);

  return <g className="targeted-comet-layer" pointerEvents="none" aria-hidden="true">
    {comets.map((comet) => {
      const impactAt = Math.max(0, comet.delay + comet.duration * .86);
      return <g key={comet.key} className={`targeted-comet targeted-comet-${comet.source}`}>
        <circle
          cx={comet.target.x}
          cy={comet.target.y}
          r={comet.target.r + 4}
          className="targeted-comet-impact"
          opacity="0"
        >
          <animate attributeName="opacity" values="0;0;.85;0" keyTimes="0;.72;.88;1" dur={`${comet.duration + comet.delay + .55}s`} begin="0s" fill="freeze" />
          <animate attributeName="r" values={`${comet.target.r + 2};${comet.target.r + 2};${comet.target.r + 13};${comet.target.r + 18}`} keyTimes="0;.72;.9;1" dur={`${comet.duration + comet.delay + .55}s`} begin="0s" fill="freeze" />
        </circle>

        <g className="targeted-comet-body" opacity="0">
          <line x1="-30" y1="0" x2="-3" y2="0" className="targeted-comet-tail" />
          <circle cx="0" cy="0" r={comet.source === "swap" ? 3.2 : 2.7} className="targeted-comet-head" />
          <animateMotion path={comet.path} dur={`${comet.duration}s`} begin={`${comet.delay}s`} rotate="auto" fill="freeze" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.84;1" dur={`${comet.duration}s`} begin={`${comet.delay}s`} fill="freeze" />
        </g>

        <g className="targeted-comet-label" opacity="0">
          <rect x="8" y="-20" rx="4" width={Math.min(148, Math.max(76, comet.label.length * 6.1))} height="17" />
          <text x="13" y="-8">{comet.label}</text>
          <animateMotion path={comet.path} dur={`${comet.duration}s`} begin={`${comet.delay}s`} rotate="0" fill="freeze" />
          <animate attributeName="opacity" values="0;.8;.75;0" keyTimes="0;.18;.72;1" dur={`${comet.duration}s`} begin={`${comet.delay}s`} fill="freeze" />
        </g>
        <title>{`Capital flow → ${comet.target.symbol || comet.target.name || comet.target.mint}`}</title>
      </g>;
    })}
    {comets.length > 0 && <text x="0" y="0" opacity="0">{impactAt}</text>}
  </g>;
}
