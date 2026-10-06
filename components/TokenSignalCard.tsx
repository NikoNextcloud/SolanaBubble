"use client";

import FavoriteButton from "./FavoriteButton";
import TrafficCard from "./TrafficCard";
import TokenSparkline from "./TokenSparkline";
import type { WatchToken } from "@/lib/watchlist";

const number = (value: number | null | undefined, suffix = "") =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

const signed = (value: number | null | undefined, suffix = "") =>
  value == null || !Number.isFinite(value)
    ? "—"
    : `${value > 0 ? "+" : ""}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;

export default function TokenSignalCard({ token }: { token: WatchToken }) {
  const primaryRows: [string, string, string?][] = [
    ["Hype", number(token.hypeScore, " / 100")],
    ["Hype Velocity", signed(token.hypeVelocity, " H/min"), (token.hypeVelocity ?? 0) >= 0 ? "buy" : "sell"],
    ["Hype Acceleration", signed(token.hypeAcceleration, " H/min²"), (token.hypeAcceleration ?? 0) >= 0 ? "buy" : "sell"],
    ["Observed buy pressure · 15m", number(token.observedBuyPressure15m, "%")],
    ["Observed net flow · 15m", signed(token.observedNetFlowUsd15m, " $"), (token.observedNetFlowUsd15m ?? 0) >= 0 ? "buy" : "sell"],
    ["Holder Growth", `${signed(token.holderGrowth)} (${signed(token.holderGrowthPct, "%")})`, (token.holderGrowthPct ?? 0) >= 0 ? "buy" : "sell"],
    ["Liquidity Δ", signed(token.liquidityChangePct, "%"), (token.liquidityChangePct ?? 0) >= 0 ? "buy" : "sell"],
    ["Top 10 supply", number(token.top10SupplyPct, "%")],
  ];

  const windows = (["5","15","60","360"] as const)
    .map(key => ({ key, market: token.windows?.[key], holders: token.holderWindows?.[key] }))
    .filter(row => row.market || row.holders);

  const risk = token.riskScore ?? null;
  const riskClass = risk == null ? "" : risk >= 65 ? "sell" : risk >= 35 ? "risk-medium" : "buy";
  const riskLabel = risk == null ? "Unknown" : risk >= 65 ? "High" : risk >= 35 ? "Medium" : "Low";

  return (
    <section className="signal-card reference-side-card" aria-label="Token Signal Card">
      <div className="market-hot-title">
        <strong>Token Signal Card</strong>
        <b className={riskClass}>Risk {number(risk)} / 100 · {riskLabel}</b>
      </div>
      <FavoriteButton token={token} />
      <div className="signal-dimensions" aria-label="Signal Engine dimensions">
        {[
          ["Momentum",token.momentumScore],
          ["Capital Flow",token.capitalFlowScore],
          ["Holder Quality",token.holderQualityScore],
          ["Liquidity Health",token.liquidityHealthScore],
          ["Manipulation Risk",token.manipulationRiskScore],
        ].map(([label,value])=><div key={String(label)}>
          <span>{label}</span>
          <b>{number(value as number|null|undefined)}</b>
          <i><em style={{width:`${Math.max(0,Math.min(100,Number(value??0)))}%`}}/></i>
        </div>)}
        <small>{token.signalDimensionsCoverage||"Waiting for complete signal coverage"}</small>
      </div>
      <div className="signal-engine-v3" aria-label="Signal Engine v3 intelligence">
        <div className="signal-v3-grid">
          <div><span>Confidence</span><strong>{number(token.signalConfidenceScore, " / 100")}</strong><small>{token.signalConfidenceLabel || "Low"} evidence confidence</small></div>
          <div><span>Trend persistence</span><strong>{number(token.trendPersistenceScore, " / 100")}</strong><small>{token.trendPersistenceLabel || "Insufficient history"}</small></div>
        </div>
        <div className={`signal-thesis ${token.divergenceSignal === "bearish" ? "sell" : token.divergenceSignal === "bullish" ? "buy" : ""}`}>
          <b>{token.divergenceSignal && token.divergenceSignal !== "none" ? `${token.divergenceSignal === "bullish" ? "Bullish" : "Bearish"} divergence` : "Signal thesis"}</b>
          <p>{token.signalThesis || "Neutral setup: evidence is mixed or still incomplete."}</p>
          {(token.divergenceReasons?.length ?? 0) > 0 && <ul>{token.divergenceReasons!.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        </div>
      </div>
      <TokenSparkline token={token}/>
      <div className="opportunity-score" aria-label="Opportunity Score">
        <div><span>Opportunity</span><strong>{number(token.opportunityScore, " / 100")}</strong></div>
        <small>{token.opportunityCoverage || "Waiting for enough signal families"}</small>
        {(token.opportunityFactors?.length ?? 0) > 0 && <details>
          <summary>Why this score</summary>
          <ul>{token.opportunityFactors!.map((factor) => <li key={factor.label}>
            <span>{factor.label}<small>{factor.evidence}</small></span>
            <b className={factor.points >= 0 ? "buy" : "sell"}>{factor.points >= 0 ? "+" : ""}{factor.points}</b>
          </li>)}</ul>
        </details>}
      </div>
      <TrafficCard sample={token.trafficSample} />

      {token.liquidityWarning && (
        <p className="signal-warning" role="alert">
          ⚠ Liquidity disappearing: {number(token.liquidityChangePct, "%")}
        </p>
      )}

      <dl className="market-token-stats signal-primary-stats">
        {primaryRows.map(([label, value, cls]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={cls || ""}>{value}</dd>
          </div>
        ))}
      </dl>

      {windows.length > 0 && <div className="signal-window-grid" aria-label="Historical signal windows">
        {windows.map(({key,market,holders}) => <div key={key}>
          <strong>{key === "60" ? "1h" : key === "360" ? "6h" : `${key}m`}</strong>
          <span>Hype <b className={(market?.hypeDelta ?? 0) >= 0 ? "buy" : "sell"}>{signed(market?.hypeDelta)}</b></span>
          <span>Volume <b className={(market?.volumeChangePct ?? 0) >= 0 ? "buy" : "sell"}>{signed(market?.volumeChangePct, "%")}</b></span>
          <span>Liquidity <b className={(market?.liquidityChangePct ?? 0) >= 0 ? "buy" : "sell"}>{signed(market?.liquidityChangePct, "%")}</b></span>
          <span>Holders <b className={(holders?.holderGrowthPct ?? 0) >= 0 ? "buy" : "sell"}>{signed(holders?.holderGrowthPct, "%")}</b></span>
        </div>)}
      </div>}

      {(token.riskFactors?.length ?? 0) > 0 && <details className="risk-factor-list">
        <summary>Why Risk is {riskLabel}</summary>
        <ul>
          {token.riskFactors!.map((factor) => <li key={factor.label}>
            <span>{factor.label}</span><b>+{factor.points}</b>
          </li>)}
        </ul>
        <small>{token.riskCoverage || "Risk is heuristic and not a security audit."}</small>
      </details>}
    </section>
  );
}
