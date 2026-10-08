import { NextResponse } from "next/server";
import webpush from "web-push";
import { admin } from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type PushJob={syncHash:string;alert:{id:string;mint:string;symbol?:string|null;key:string;value:number;threshold:number;at:string;message?:string}};

export async function POST(req:Request){
  const expected=process.env.PUSH_DISPATCH_SECRET;
  const got=req.headers.get("x-push-dispatch-secret");
  if(!expected||!got||got!==expected)return NextResponse.json({error:"unauthorized"},{status:401});
  const pub=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,priv=process.env.VAPID_PRIVATE_KEY;
  if(!pub||!priv)return NextResponse.json({error:"push_not_configured"},{status:503});
  const body=await req.json().catch(()=>null);
  const jobs:Array<PushJob>=Array.isArray(body?.jobs)?body.jobs.slice(0,50):[];
  if(!jobs.length)return NextResponse.json({ok:true,sent:0});
  webpush.setVapidDetails("mailto:alerts@solanabubble.app",pub,priv);
  const db=admin();let sent=0,removed=0,failed=0;
  for(const job of jobs){
    if(!/^[a-f0-9]{64}$/.test(job.syncHash)||!job.alert?.mint)continue;
    const {data,error}=await db.from("push_subscriptions").select("endpoint,p256dh,auth").eq("sync_hash",job.syncHash).limit(20);
    if(error){failed++;console.error("[push-dispatch-db]",error.message);continue;}
    const title=`${job.alert.symbol||job.alert.mint.slice(0,6)} · ${job.alert.key.replaceAll("-"," ")}`;
    const body=job.alert.message||`Signal ${Number(job.alert.value).toFixed(2)} crossed ${job.alert.threshold}`;
    const payload=JSON.stringify({title,body,url:`/token/${job.alert.mint}`,tag:job.alert.id});
    for(const sub of data??[]){
      try{
        await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,{TTL:300,urgency:"high"});
        sent++;
      }catch(error:any){
        const status=Number(error?.statusCode??0);
        if(status===404||status===410){await db.from("push_subscriptions").delete().eq("endpoint",sub.endpoint);removed++;}
        else{failed++;console.error("[push-delivery]",JSON.stringify({statusCode:status,endpointHost:(()=>{try{return new URL(sub.endpoint).host;}catch{return "invalid";}})()}));}
      }
    }
  }
  if(failed)console.error("[push-dispatch-summary]",JSON.stringify({sent,removed,failed,jobs:jobs.length}));
  else console.info("[push-dispatch-summary]",JSON.stringify({sent,removed,failed,jobs:jobs.length}));
  return NextResponse.json({ok:true,sent,removed,failed});
}
