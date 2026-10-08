import {NextResponse} from "next/server";
import {admin} from "@/lib/db";
import {rpcProviderReadiness} from "@/lib/rpc-readiness";
export const dynamic="force-dynamic";

export async function GET(){
 const now=Date.now(),rpc=rpcProviderReadiness();
 try{
  const db=admin();
  const [worker,errors]=await Promise.all([
   db.from("api_cache").select("payload,updated_at").eq("cache_key","worker:status").maybeSingle(),
   db.from("client_error_events").select("id",{count:"exact",head:true}).gte("created_at",new Date(now-60*60_000).toISOString()),
  ]);
  const w=worker.data?.payload;
  const marketAt=w?.lastSuccessAt??null;
  const ageSec=marketAt?Math.max(0,(now-Date.parse(marketAt))/1000):null;
  const ok=Boolean(marketAt&&ageSec!=null&&ageSec<15*60&&w?.state!=="error");
  return NextResponse.json({
   ok,
   version:"1.0.0",
   marketAt,
   marketAgeSec:ageSec,
   workerState:w?.state??"unknown",
   clientErrors1h:errors.error?null:(errors.count??0),
   rpcMode:rpc.mode,
   rpc,
   swapCoverage:"sampled",
   fullFirehose:rpc.fullFirehose,
   checkedAt:new Date(now).toISOString(),
  },{status:ok?200:503,headers:{"cache-control":"no-store"}});
 }catch{
  return NextResponse.json({ok:false,version:"1.0.0",error:"health_unavailable",checkedAt:new Date(now).toISOString()},{status:503,headers:{"cache-control":"no-store"}});
 }
}
