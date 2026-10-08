import {NextRequest,NextResponse} from "next/server";
import {admin} from "@/lib/db";
import {validateGoodOpportunities,type SignalObservation} from "@/lib/market/intelligence-core";
import {validMint} from "@/lib/watchlist";

export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
  const mint=req.nextUrl.searchParams.get("mint")||"";
  if(!validMint(mint))return NextResponse.json({error:"invalid_mint"},{status:400,headers:{"cache-control":"private, no-store"}});
  const db=admin();
  const since=new Date(Date.now()-7*24*60*60_000).toISOString();
  const {data,error}=await db.from("market_snapshots")
    .select("observed_at,payload")
    .eq("mint",mint)
    .gte("observed_at",since)
    .order("observed_at",{ascending:true})
    .limit(2500);
  if(error)return NextResponse.json({error:"validation_unavailable"},{status:503,headers:{"cache-control":"private, no-store"}});
  const rows=(data??[]).map(row=>({observed_at:row.observed_at,payload:row.payload})) as SignalObservation[];
  const summary=validateGoodOpportunities(rows);
  return NextResponse.json({
    mint,
    lookbackDays:7,
    observations:rows.length,
    ...summary,
    generatedAt:new Date().toISOString(),
  },{headers:{"cache-control":"private, max-age=0, s-maxage=300, stale-while-revalidate=600"}});
}
