"use client";

function value(v:unknown,fallback="—"){return v==null?fallback:String(v);}
export default function ProjectHealthDashboard({usage}:{usage:any}){
 const h=usage?.health,w=h?.worker;
 const workerAge=h?.workerUpdatedAt?Math.max(0,(Date.now()-Date.parse(h.workerUpdatedAt))/60000):null;
 const workerState=!w?"unknown":w.state==="ok"&&workerAge!=null&&workerAge<15?"healthy":w.state==="error"?"error":"warning";
 const direct=Number(h?.directTraffic2h??0),routed=Number(h?.routedTraffic2h??0),total=direct+routed;
 const directPct=total?direct/total*100:null;
 return <section className="project-health-dashboard" aria-label="Production Health Dashboard">
   <div className="admin-section-title"><div><span>Production Health</span><strong>Backend & runtime</strong></div><small>Last observed server-side state</small></div>
   <div className="health-grid">
     <article className={`health-card health-${workerState}`}>
       <span>Market worker</span><strong>{w?.state??"unknown"}</strong>
       <small>{w?.durationMs!=null?`${(w.durationMs/1000).toFixed(1)}s cycle`:"no duration"} · {workerAge!=null?`${workerAge.toFixed(0)}m ago`:"never"}</small>
     </article>
     <article className="health-card">
       <span>Holder / Traffic failures</span><strong>{value(w?.holderFailures)} / {value(w?.trafficFailures)}</strong>
       <small>last worker cycle</small>
     </article>
     <article className="health-card">
       <span>RPC diagnostics</span><strong>{Number(Object.values((w?.trafficDiagnostics??{}) as Record<string,unknown>).reduce((sum:number,item)=>sum+Number(item||0),0))}</strong>
       <small>{Object.entries(w?.trafficDiagnostics??{}).slice(0,3).map(([k,v])=>`${k}: ${v}`).join(" · ")||"no classified failures"}</small>
     </article>
     <article className="health-card">
       <span>Bootstrap queue</span><strong>{value(h?.activeBootstraps, "0")}</strong>
       <small>active leases · global ceiling 3</small>
     </article>
     <article className="health-card">
       <span>Traffic evidence · 2h</span><strong>{direct} direct / {routed} routed</strong>
       <small>{directPct!=null?`${directPct.toFixed(0)}% verified-direct`:"no retained swaps"}</small>
     </article>
     <article className="health-card">
       <span>Synced watchlists</span><strong>{value(h?.syncedWatchlists, "0")}</strong>
       <small>active anonymous sync profiles</small>
     </article>
     <article className="health-card">
       <span>Market snapshots</span><strong>{value(h?.marketSnapshots, "0")}</strong>
       <small>retained server snapshots</small>
     </article>
     <article className="health-card">
       <span>Runtime</span><strong>{h?.runtime?.environment??"local"} · Node {String(h?.runtime?.node??"").replace(/^v/,"")||"—"}</strong>
       <small>{h?.runtime?.gitSha?String(h.runtime.gitSha).slice(0,10):"no Vercel SHA"}{h?.runtime?.region?` · ${h.runtime.region}`:""}</small>
     </article>
   </div>
 </section>;
}
