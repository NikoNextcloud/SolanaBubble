"use client";

import FavoriteButton from "./FavoriteButton";
import TrafficCard from "./TrafficCard";
import TokenSparkline from "./TokenSparkline";
import DecisionTerminalV5 from "./DecisionTerminalV5";
import TokenFlowChart from "./TokenFlowChart";
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
  const risk = token.riskScore ?? null;
  const riskClass = risk == null ? "" : risk >= 65 ? "sell" : risk >= 35 ? "risk-medium" : "buy";
  const riskLabel = risk == null ? "Unknown" : risk >= 65 ? "High" : risk >= 35 ? "Medium" : "Low";
  const primaryRows: [string,string,string?][] = [
    ["Hype",number(token.hypeScore," / 100")],
    ["Buy pressure · 15m",number(token.observedBuyPressure15m,"%")],
    ["Net flow · 15m",signed(token.observedNetFlowUsd15m," $"),(token.observedNetFlowUsd15m??0)>=0?"buy":"sell"],
    ["Holder growth",signed(token.holderGrowthPct,"%"),(token.holderGrowthPct??0)>=0?"buy":"sell"],
    ["Liquidity Δ",signed(token.liquidityChangePct,"%"),(token.liquidityChangePct??0)>=0?"buy":"sell"],
  ];

  return <section className="signal-card reference-side-card compact-signal-card" aria-label="Token Signal Card">
    <div className="market-hot-title">
      <strong>Signal overview</strong>
      <b className={riskClass}>Risk {number(risk)} / 100 · {riskLabel}</b>
    </div>
    <FavoriteButton token={token}/>

    <div className="signal-summary-grid">
      <div><span>Opportunity</span><strong>{number(token.opportunityScore," / 100")}</strong></div>
      <div><span>Confidence</span><strong>{number(token.signalConfidenceScore," / 100")}</strong></div>
      <div><span>Capital Flow</span><strong>{number(token.capitalFlowScore," / 100")}</strong></div>
      <div><span>Momentum</span><strong>{number(token.momentumScore," / 100")}</strong></div>
    </div>

    <DecisionTerminalV5 mint={token.mint}/>
    <TokenSparkline token={token}/>
    <TokenFlowChart token={token}/>

    {token.liquidityWarning&&<p className="signal-warning" role="alert">⚠ Liquidity disappearing: {number(token.liquidityChangePct,"%")}</p>}

    <details className="signal-disclosure compact-advanced-details">
      <summary>Advanced details</summary>
      <div className="signal-dimensions" aria-label="Signal Engine dimensions">
        {[
          ["Momentum",token.momentumScore],
          ["Capital Flow",token.capitalFlowScore],
          ["Holder Quality",token.holderQualityScore],
          ["Liquidity Health",token.liquidityHealthScore],
          ["Manipulation Risk",token.manipulationRiskScore],
        ].map(([label,value])=><div key={String(label)}>
          <span>{label}</span><b>{number(value as number|null|undefined)}</b>
          <i><em style={{width:`${Math.max(0,Math.min(100,Number(value??0)))}%`}}/></i>
        </div>)}
      </div>
      <dl className="market-token-stats signal-primary-stats">
        {primaryRows.map(([label,value,cls])=><div key={label}><dt>{label}</dt><dd className={cls||""}>{value}</dd></div>)}
      </dl>
      <TrafficCard sample={token.trafficSample}/>
      {(token.riskFactors?.length??0)>0&&<details className="risk-factor-list">
        <summary>Why Risk is {riskLabel}</summary>
        <ul>{token.riskFactors!.map(factor=><li key={factor.label}><span>{factor.label}</span><b>+{factor.points}</b></li>)}</ul>
        <small>{token.riskCoverage||"Risk is heuristic and not a security audit."}</small>
      </details>}
    </details>
  </section>;
}
