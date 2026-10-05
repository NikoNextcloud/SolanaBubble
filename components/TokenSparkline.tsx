"use client";
import type { WatchToken } from "@/lib/watchlist";

function points(token:WatchToken){
  const now=Number(token.hypeScore??0);
  const windows=(["360","60","15","5"] as const).map((key)=>{
    const delta=token.windows?.[key]?.hypeDelta;
    return delta==null?null:now-delta;
  });
  return [...windows,now].filter((v):v is number=>Number.isFinite(v));
}
export default function TokenSparkline({token}:{token:WatchToken}){
  const values=points(token);
  if(values.length<2)return null;
  const min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);
  const coords=values.map((v,i)=>{
    const x=4+i*(112/Math.max(1,values.length-1));
    const y=34-((v-min)/range)*26;
    return [x,y] as const;
  });
  const d=coords.map(([x,y],i)=>`${i?'L':'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const trend=values.at(-1)!-values[0];
  return <div className="token-sparkline" aria-label="Hype trend sparkline">
    <div><span>Hype trend</span><b className={trend>=0?"buy":"sell"}>{trend>=0?"+":""}{trend.toFixed(1)}</b></div>
    <svg viewBox="0 0 120 40" role="img">
      <path d={d} fill="none" className={trend>=0?"sparkline-buy":"sparkline-sell"} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      {coords.map(([x,y],i)=><circle key={i} cx={x} cy={y} r="2" />)}
    </svg>
    <small>6h → 1h → 15m → 5m → now when available</small>
  </div>;
}
