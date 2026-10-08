"use client";
import {useEffect,useState} from "react";

type WindowRow={minutes:number;signals:number;samples:number;wins:number;positiveRate:number|null;calibratedPositiveRate:number|null;hit2Rate:number|null;confidence:number;medianReturnPct:number|null;medianMfePct:number|null;medianMaePct:number|null};
type Payload={calibrationLabel:"insufficient"|"weak"|"developing"|"validated";entries:number;samples:number;windows:Record<string,WindowRow>;note:string;observations:number};

const pct=(v:number|null)=>v==null||!Number.isFinite(v)?"—":(v>0?"+":"")+v.toFixed(1)+"%";
export default function OpportunityValidation({mint}:{mint:string}){
 const [data,setData]=useState<Payload|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setData(null);setFailed(false);fetch("/api/market/opportunity-validation?mint="+encodeURIComponent(mint),{cache:"no-store"})
  .then(r=>{if(!r.ok)throw new Error("validation");return r.json()})
  .then(v=>{if(active)setData(v)}).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false};},[mint]);
 if(failed)return <div className="good-validation"><span>GOOD validation</span><small>Historical calibration unavailable right now.</small></div>;
 if(!data)return <div className="good-validation"><span>GOOD validation</span><small>Calibrating retained observations…</small></div>;
 const rows=["15","60","360"].map(k=>data.windows?.[k]).filter(Boolean) as WindowRow[];
 return <div className="good-validation" aria-label="GOOD historical validation">
  <div className="good-validation-head"><span>GOOD v2 validation</span><b className={"validation-"+data.calibrationLabel}>{data.calibrationLabel.toUpperCase()}</b></div>
  <small>{data.entries} qualified entries · {data.observations} retained observations · 7d lookback</small>
  <div className="good-validation-grid">{rows.map(row=><div key={row.minutes}>
    <span>{row.minutes<60?row.minutes+"m":row.minutes===60?"1h":"6h"}</span>
    <strong>{row.calibratedPositiveRate==null?"—":row.calibratedPositiveRate.toFixed(0)+"%"}</strong>
    <small>positive · n={row.samples}</small>
    <em>Median {pct(row.medianReturnPct)} · MFE {pct(row.medianMfePct)} · MAE {pct(row.medianMaePct)}</em>
  </div>)}</div>
  <small>{data.note}</small>
 </div>;
}
