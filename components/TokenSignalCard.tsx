"use client";

import FavoriteButton from "./FavoriteButton";
import TrafficCard from "./TrafficCard";
import type { WatchToken } from "@/lib/watchlist";

const number = (value: number | null | undefined, suffix = "") =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

export default function TokenSignalCard({ token }: { token: WatchToken }) {
  const primaryRows: [string, string][] = [
    ["Hype", number(token.hypeScore, " / 100")],
    ["Hype Velocity", number(token.hypeVelocity, " H/min")],
    ["Observed buy pressure · 15m", number(token.observedBuyPressure15m, "%")],
    ["Observed net flow · 15m", number(token.observedNetFlowUsd15m, " $")],
    ["Holder Growth", `${number(token.holderGrowth)} (${number(token.holderGrowthPct, "%")})`],
    ["Liquidity Δ", number(token.liquidityChangePct, "%")],
    ["Top 10 supply", number(token.top10SupplyPct, "%")],
  ];

  return (
    <section className="signal-card reference-side-card" aria-label="Token Signal Card">
      <div className="market-hot-title">
        <strong>Token Signal Card</strong>
        <b className={(token.riskScore ?? 0) >= 50 ? "sell" : ""}>
          Risk {number(token.riskScore)} / 100
        </b>
      </div>
      <FavoriteButton token={token} />
      <TrafficCard sample={token.trafficSample} />
      {token.liquidityWarning && (
        <p className="signal-warning" role="alert">
          ⚠ Liquidity disappearing: {number(token.liquidityChangePct, "%")}
        </p>
      )}
      <dl className="market-token-stats signal-primary-stats">
        {primaryRows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
