"use client";

type SidebarToken={
  mint:string;symbol?:string|null;name?:string|null;
  opportunityScore?:number|null;signalConfidenceScore?:number|null;
  manipulationRiskScore?:number|null;riskScore?:number|null;
  netFlowUsd1h?:number|null;observedNetFlowUsd15m?:number|null;
  hypeScore?:number|null;buys1h?:number|null;sells1h?:number|null;
};

const n=(v:number|null|undefined)=>Number.isFinite(Number(v))?Number(v):0;
const money=(v:number)=>Math.abs(v)>=1e6?"$"+(Math.abs(v)/1e6).toFixed(1)+"M":Math.abs(v)>=1e3?"$"+(Math.abs(v)/1e3).toFixed(1)+"K":"$"+Math.abs(v).toFixed(0);
const label=(t:SidebarToken)=>(t.symbol||t.name||t.mint.slice(0,6)).slice(0,10);

export default function MarketSidebarCharts({tokens,regime,onSelect}:{tokens:SidebarToken[];regime:{label:string;score:number;reason:string};onSelect:(mint:string)=>void}){
  const leaders=[...tokens].filter(t=>Number.isFinite(Number(t.opportunityScore))).sort((a,b)=>n(b.opportunityScore)-n(a.opportunityScore)).slice(0,5);
  const flows=[...tokens].map(t=>({...t,flow:Number.isFinite(Number(t.observedNetFlowUsd15m))?Number(t.observedNetFlowUsd15m):Number(t.netFlowUsd1h??0)})).filter(t=>Number.isFinite(t.flow)).sort((a,b)=>Math.abs(b.flow)-Math.abs(a.flow)).slice(0,5);
  const maxFlow=Math.max(1,...flows.map(t=>Math.abs(t.flow)));
  const buys=tokens.reduce((sum,t)=>sum+n(t.buys1h),0),sells=tokens.reduce((sum,t)=>sum+n(t.sells1h),0),trades=buys+sells;
  const buyPct=trades?buys/trades*100:50,sellPct=100-buyPct;
  const circumference=2*Math.PI*28;

  return <div className="market-sidebar-charts" aria-label="Market overview charts">
    <section className="rail-chart reference-side-card" aria-label="Opportunity leaders chart">
      <div className="rail-chart-title"><strong>Opportunity leaders</strong><span>score / confidence</span></div>
      <div className="rail-bar-chart">
        {leaders.map(t=><button key={t.mint} onClick={()=>onSelect(t.mint)} aria-label={"Open "+label(t)}>
          <span className="rail-bar-label">{label(t)}</span>
          <i className="rail-bar-track"><em style={{width:Math.max(0,Math.min(100,n(t.opportunityScore)))+"%"}}/></i>
          <b>{Math.round(n(t.opportunityScore))}</b>
          <small>{Math.round(n(t.signalConfidenceScore))}% conf</small>
        </button>)}
        {!leaders.length&&<p className="signal-note">Waiting for Opportunity data.</p>}
      </div>
    </section>

    <section className="rail-chart reference-side-card" aria-label="Capital flow chart">
      <div className="rail-chart-title"><strong>Capital flow</strong><span>largest observed net flow</span></div>
      <div className="rail-flow-chart">
        {flows.map(t=>{const width=Math.max(3,Math.abs(t.flow)/maxFlow*48);return <button key={t.mint} onClick={()=>onSelect(t.mint)} className={t.flow>=0?"buy":"sell"}>
          <span>{label(t)}</span>
          <i className="rail-flow-track"><em className={t.flow>=0?"flow-positive":"flow-negative"} style={{width:width+"%"}}/></i>
          <b>{t.flow>=0?"+":"−"}{money(t.flow)}</b>
        </button>})}
        {!flows.length&&<p className="signal-note">Waiting for flow evidence.</p>}
      </div>
    </section>

    <section className="rail-chart rail-pressure-card reference-side-card" aria-label="Market pressure chart">
      <div className="rail-chart-title"><strong>Market pressure</strong><span>{regime.label}</span></div>
      <div className="rail-pressure-layout">
        <svg viewBox="0 0 72 72" role="img" aria-label={"Buy pressure "+buyPct.toFixed(0)+" percent"}>
          <circle cx="36" cy="36" r="28" className="rail-donut-base"/>
          <circle cx="36" cy="36" r="28" className="rail-donut-buy" strokeDasharray={(circumference*buyPct/100)+" "+circumference} transform="rotate(-90 36 36)"/>
          <text x="36" y="34" textAnchor="middle">{buyPct.toFixed(0)}%</text>
          <text x="36" y="45" textAnchor="middle" className="rail-donut-caption">BUY</text>
        </svg>
        <div>
          <strong className={regime.score>=0?"buy":"sell"}>{regime.score>=0?"+":""}{regime.score}</strong>
          <span>{regime.reason}</span>
          <small>{buys.toLocaleString()} buys · {sells.toLocaleString()} sells · {sellPct.toFixed(0)}% sell</small>
        </div>
      </div>
    </section>
  </div>;
}
