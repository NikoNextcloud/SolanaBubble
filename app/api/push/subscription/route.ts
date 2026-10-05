import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { admin } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEY_RE=/^[a-f0-9]{64}$/;
const hashKey=(raw:string)=>createHash("sha256").update(raw).digest("hex");
function syncHash(req:Request){
  const key=(req.headers.get("x-solanabubble-sync-key")||"").trim().toLowerCase();
  return KEY_RE.test(key)?hashKey(key):null;
}

export async function GET(req:Request){
  const hash=syncHash(req);if(!hash)return NextResponse.json({error:"invalid_sync_key"},{status:401});
  const db=admin();
  const {count,error}=await db.from("push_subscriptions").select("endpoint",{count:"exact",head:true}).eq("sync_hash",hash);
  if(error)return NextResponse.json({error:"push_unavailable"},{status:503});
  return NextResponse.json({enabled:(count??0)>0,count:count??0,publicKey:process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY??null},{headers:{"cache-control":"private, no-store"}});
}

export async function POST(req:Request){
  const hash=syncHash(req);if(!hash)return NextResponse.json({error:"invalid_sync_key"},{status:401});
  const body=await req.json().catch(()=>null);
  const endpoint=typeof body?.endpoint==="string"?body.endpoint:"";
  const p256dh=typeof body?.keys?.p256dh==="string"?body.keys.p256dh:"";
  const auth=typeof body?.keys?.auth==="string"?body.keys.auth:"";
  if(!/^https:\/\//.test(endpoint)||endpoint.length>2048||!p256dh||!auth)return NextResponse.json({error:"invalid_subscription"},{status:400});
  const db=admin();
  const watch=await db.from("watchlist_sync").select("sync_hash").eq("sync_hash",hash).maybeSingle();
  if(watch.error||!watch.data)return NextResponse.json({error:"watchlist_not_synced"},{status:409});
  const {error}=await db.from("push_subscriptions").upsert({endpoint,sync_hash:hash,p256dh,auth,updated_at:new Date().toISOString()});
  if(error)return NextResponse.json({error:"push_unavailable"},{status:503});
  return NextResponse.json({ok:true});
}

export async function DELETE(req:Request){
  const hash=syncHash(req);if(!hash)return NextResponse.json({error:"invalid_sync_key"},{status:401});
  const body=await req.json().catch(()=>null);const endpoint=typeof body?.endpoint==="string"?body.endpoint:"";
  if(!endpoint)return NextResponse.json({error:"invalid_subscription"},{status:400});
  const {error}=await admin().from("push_subscriptions").delete().eq("sync_hash",hash).eq("endpoint",endpoint);
  if(error)return NextResponse.json({error:"push_unavailable"},{status:503});
  return NextResponse.json({ok:true});
}
