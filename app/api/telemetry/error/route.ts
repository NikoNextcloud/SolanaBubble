import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {admin} from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store"};

function text(value:unknown,max:number){
 return typeof value==="string"?value.replace(/([?&](?:token|key|secret|auth|signature)=)[^&\s]+/gi,"$1[redacted]").slice(0,max):"";
}

export async function POST(req:Request){
 const size=Number(req.headers.get("content-length")||0);
 if(size>10_000)return NextResponse.json({error:"payload_too_large"},{status:413,headers});
 const origin=req.headers.get("origin");
 const host=req.headers.get("x-forwarded-host")||req.headers.get("host");
 if(origin&&host){
  try{if(new URL(origin).host!==host)return NextResponse.json({error:"origin_mismatch"},{status:403,headers});}
  catch{return NextResponse.json({error:"invalid_origin"},{status:403,headers});}
 }
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object")return NextResponse.json({error:"invalid_payload"},{status:400,headers});
 const event={
  event_id:randomUUID(),
  kind:text((body as any).kind,60)||"client_error",
  route:text((body as any).route,240)||"/",
  message:text((body as any).message,900)||"Unknown client error",
  stack:text((body as any).stack,4000)||null,
  source:text((body as any).source,240)||null,
  app_version:text((body as any).version,32)||"unknown",
  user_agent:text(req.headers.get("user-agent"),500)||null,
 };
 console.error("[client-error]",JSON.stringify(event));
 try{
  const db=admin();
  const insert=await db.from("client_error_events").insert(event);
  if(insert.error)throw insert.error;
  await db.from("client_error_events").delete().lt("created_at",new Date(Date.now()-7*24*60*60_000).toISOString());
 }catch(error){
  console.error("[client-error-storage]",error instanceof Error?error.message:String(error));
 }
 return new NextResponse(null,{status:204,headers});
}
