import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {admin} from "@/lib/db";
import {normalizeWatchState} from "@/lib/watchlist";
import {normalizeSmartWatchState} from "@/lib/watchlist-smart";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store"};

async function accountHash(req:Request){
 const auth=req.headers.get("authorization")||"";
 const token=auth.startsWith("Bearer ")?auth.slice(7).trim():"";
 if(!token)return null;
 const db=admin();
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user)return null;
 return createHash("sha256").update("account:"+data.user.id).digest("hex");
}

export async function GET(req:Request){
 const syncHash=await accountHash(req);
 if(!syncHash)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 try{
  const db=admin();
  const {data,error}=await db.from("watchlist_sync").select("payload,updated_at,expires_at").eq("sync_hash",syncHash).maybeSingle();
  if(error)throw error;
  if(!data)return NextResponse.json({found:false},{status:404,headers});
  return NextResponse.json({found:true,state:{...normalizeWatchState(data.payload),...normalizeSmartWatchState(data.payload)},updatedAt:data.updated_at},{headers});
 }catch{return NextResponse.json({error:"account_sync_unavailable"},{status:503,headers});}
}

export async function PUT(req:Request){
 const syncHash=await accountHash(req);
 if(!syncHash)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const body=await req.json().catch(()=>null);
 if(!body||JSON.stringify(body).length>64_000)return NextResponse.json({error:"invalid_watchlist_state"},{status:400,headers});
 const state={...normalizeWatchState(body),...normalizeSmartWatchState(body)};
 const now=new Date();
 const expires=new Date(now.getTime()+10*365*24*60*60_000);
 try{
  const db=admin();
  const {error}=await db.from("watchlist_sync").upsert({sync_hash:syncHash,payload:state,updated_at:now.toISOString(),expires_at:expires.toISOString()});
  if(error)throw error;
  return NextResponse.json({ok:true,updatedAt:now.toISOString()},{headers});
 }catch{return NextResponse.json({error:"account_sync_unavailable"},{status:503,headers});}
}
