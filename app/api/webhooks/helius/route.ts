import {NextResponse} from "next/server";
import {admin} from "@/lib/db";

export const runtime="nodejs";
export const dynamic="force-dynamic";

const USDC="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL="So11111111111111111111111111111111111111112";

type Transfer={mint?:string;fromUserAccount?:string;toUserAccount?:string;tokenAmount?:number};
type EnhancedTx={
  signature?:string;
  timestamp?:number;
  feePayer?:string;
  source?:string;
  tokenTransfers?:Transfer[];
  nativeTransfers?:{fromUserAccount?:string;toUserAccount?:string;amount?:number}[];
};

function authorized(req:Request){
  const expected=process.env.HELIUS_WEBHOOK_SECRET;
  if(!expected)return false;
  const header=req.headers.get("x-helius-webhook-secret")||"";
  const url=new URL(req.url);
  return header===expected||url.searchParams.get("secret")===expected;
}

export async function POST(req:Request){
  if(!authorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  const txs:Array<EnhancedTx>=Array.isArray(body)?body:Array.isArray(body?.transactions)?body.transactions:[];
  if(!txs.length)return NextResponse.json({ok:true,accepted:0});

  const db=admin();
  const snapshot=await db.from("api_cache").select("payload").eq("cache_key","market:snapshot").maybeSingle();
  if(snapshot.error)return NextResponse.json({error:"snapshot_unavailable"},{status:503});
  const tokens:Array<any>=snapshot.data?.payload?.tokens??[];
  const tracked=new Map(tokens.map(t=>[String(t.mint),t]));
  const rows:any[]=[];

  for(const tx of txs.slice(0,100)){
    const signature=String(tx.signature??"");
    const wallet=String(tx.feePayer??"");
    if(!signature||!wallet)continue;
    const transfers=Array.isArray(tx.tokenTransfers)?tx.tokenTransfers:[];
    const quoteTransfers=transfers.filter(t=>t.mint===USDC||t.mint===WSOL);
    const native=Array.isArray(tx.nativeTransfers)?tx.nativeTransfers:[];

    for(const transfer of transfers){
      const mint=String(transfer.mint??"");
      const token=tracked.get(mint);
      if(!token||mint===USDC||mint===WSOL)continue;
      const amount=Math.abs(Number(transfer.tokenAmount??0));
      if(!(amount>0))continue;
      const inbound=transfer.toUserAccount===wallet;
      const outbound=transfer.fromUserAccount===wallet;
      if(inbound===outbound)continue;
      const side=inbound?"buy":"sell";

      let quoteMint=USDC,quoteAmount=0,usdValue:null|number=null;
      const quote=quoteTransfers.find(q=>side==="buy"?q.fromUserAccount===wallet:q.toUserAccount===wallet);
      if(quote){
        quoteMint=String(quote.mint);
        quoteAmount=Math.abs(Number(quote.tokenAmount??0));
        if(quoteMint===USDC)usdValue=quoteAmount;
      }else{
        const sol=native.find(n=>side==="buy"?n.fromUserAccount===wallet:n.toUserAccount===wallet);
        if(sol){
          quoteMint=WSOL;
          quoteAmount=Math.abs(Number(sol.amount??0))/1e9;
        }
      }
      if(!(quoteAmount>0))continue;

      const holder=await db.from("holdings").select("pct_supply").eq("token_mint",mint).eq("wallet",wallet).maybeSingle();
      const pct=Number(holder.data?.pct_supply??NaN);
      rows.push({
        mint,signature,wallet,pool:String(token.pairAddress??"helius:enhanced"),side,
        usd_value:usdValue,quote_mint:quoteMint,quote_amount:quoteAmount,
        evidence:"routed",program:String(tx.source??"Helius enhanced"),block_at:new Date(Number(tx.timestamp??Date.now()/1000)*1000).toISOString(),
        whale:Number.isFinite(pct)&&pct>=1,wallet_pct_supply:Number.isFinite(pct)?pct:null,observed_at:new Date().toISOString(),
      });
    }
  }

  if(rows.length){
    const write=await db.from("live_market_events").upsert(rows,{onConflict:"mint,signature,wallet"});
    if(write.error)return NextResponse.json({error:"write_failed"},{status:503});
  }
  return NextResponse.json({ok:true,accepted:rows.length});
}
