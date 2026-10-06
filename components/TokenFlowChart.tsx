"use client";
import type {WatchToken} from "@/lib/watchlist";

const fmt=(v:number)=>Math.abs(v)>=1e6?"$"+(Math.abs(v)/1e6).toFixed(1)+"M":Math.abs(v)>=1e3?"$"+(Math.abs(v)/1e3).toFixed(1)+"K":"$"+Math.abs(v).toFixed(0);

export default function TokenFlowChart({token}:{token:WatchToken}){
  const sample=token.trafficSample?.windows?.["15"];
  const buys=sample?.buys??token.buys1h??0,sells=sample?.sells??token.sells1h??0,total=Math.max(1,buys+sells);
  const buyPct=buys/total*100,sellPct=100-buyPct;
  const net=sample?.netUsd??token.observedNetFlowUsd15m??token.netFlowUsd1h??null;
  const circumference=2*Math.PI*27;
  return <div className="token-flow-chart" aria-label="Buy sell pressure chart">
    <div className="token-flow-donut">
      <svg viewBox="0 0 72 72" role="img" aria-label={"Buy pressure "+buyPct.toFixed(0)+" percent"}>
        <circle cx="36" cy="36" r="27" className="rail-donut-base"/>
        <circle cx="36" cy="36" r="27" className="rail-donut-buy" strokeDasharray={(circumference*buyPct/100)+" "+circumference} transform="rotate(-90 36 36)"/>
        <text x="36" y="34" textAnchor="middle">{buyPct.toFixed(0)}%</text>
        <text x="36" y="45" textAnchor="middle" className="rail-donut-caption">BUY</text>
      </svg>
    </div>
    <div className="token-flow-copy">
      <span>Buy / sell pressure</span>
      <strong className={(net??0)>=0?"buy":"sell"}>{net==null?"—":(net>=0?"+":"−")+fmt(net)} net</strong>
      <small>{buys} buys · {sells} sells · {sellPct.toFixed(0)}% sell {sample?"· observed 15m":"· aggregate 1h"}</small>
    </div>
  </div>;
}
