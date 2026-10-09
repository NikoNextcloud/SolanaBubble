import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
type Pool={id:string;name:string;createdAt:string|null;ageMinutes:number|null;liquidityUsd:number|null;volume5m:number|null;buys5m:number|null;sells5m:number|null;priceChange5m:number|null;priceChange1h:number|null;sourceUrl:string;stage:"early-watch"|"insufficient-data"|"late-risk"|"liquidity-risk";reasons:string[]};
const finite=(v:unknown):number|null=>{const n=Number(v);return v===null||v===undefined||v===""||!Number.isFinite(n)?null:n};
const nonnegative=(v:unknown)=>{const n=finite(v);return n===null?null:Math.max(0,n)};
function classifyEarlyPool(p:Pick<Pool,"ageMinutes"|"liquidityUsd"|"buys5m"|"sells5m"|"priceChange5m"|"priceChange1h">):Pick<Pool,"stage"|"reasons">{
 const reasons:string[]=[];
 if(p.ageMinutes===null||p.liquidityUsd===null||p.buys5m===null||p.sells5m===null)reasons.push("Missing age, liquidity or trade evidence");
 if(p.liquidityUsd!==null&&p.liquidityUsd<30000)reasons.push("Liquidity under $30k");
 if(p.ageMinutes!==null&&p.ageMinutes>60)reasons.push("Pool older than 60m");
 if((p.priceChange1h??0)>120||(p.priceChange5m??0)>65)reasons.push("Rapid prior price rise: possible late entry");
 const total=(p.buys5m??0)+(p.sells5m??0);
 if(total<15)reasons.push("Insufficient 5m trades");
 else if((p.buys5m??0)/total<0.6)reasons.push("BUY pressure under 60%");
 // Aggregate DEX data does not identify independent wallets or validate token authorities.
 reasons.push("Independent buyers and mint security not verified");
 const stage:Pool["stage"]=reasons.some(r=>r.startsWith("Liquidity"))?"liquidity-risk":reasons.some(r=>r.startsWith("Rapid"))?"late-risk":reasons.some(r=>r.startsWith("Missing"))?"insufficient-data":"early-watch";
 return {stage,reasons};
}
export async function GET(){
 try{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),6500);
  let response:Response;try{response=await fetch("https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1",{headers:{accept:"application/json"},signal:controller.signal,cache:"no-store"});}finally{clearTimeout(timeout)}
  if(!response.ok)throw new Error("upstream_"+response.status);
  const payload=await response.json() as {data?:Array<{id?:string;attributes?:Record<string,unknown>;relationships?:Record<string,unknown>}>};
  const now=Date.now();
  const pools:Pool[]=(payload.data??[]).slice(0,30).map(raw=>{
   const a=raw.attributes??{},timestamp=typeof a.pool_created_at==="string"?a.pool_created_at:null,ms=timestamp?Date.parse(timestamp):NaN;
   const ageMinutes=Number.isFinite(ms)?Math.max(0,Math.floor((now-ms)/60000)):null;
   const tx=(a.transactions??{}) as Record<string,Record<string,unknown>>;
   const change=(a.price_change_percentage??{}) as Record<string,unknown>;
   const volume=(a.volume_usd??{}) as Record<string,unknown>;
   const poolId=String(raw.id??"");
   const address=typeof a.address==="string"?a.address:"";
   const sourceUrl=address&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)?"https://www.geckoterminal.com/solana/pools/"+address:"https://www.geckoterminal.com/solana/pools";
   const common={ageMinutes,liquidityUsd:nonnegative(a.reserve_in_usd),buys5m:nonnegative(tx.m5?.buys),sells5m:nonnegative(tx.m5?.sells),priceChange5m:finite(change.m5),priceChange1h:finite(change.h1)};
   return {id:poolId,name:String(a.name??"Unknown pool").slice(0,90),createdAt:timestamp,...common,volume5m:nonnegative(volume.m5),sourceUrl,...classifyEarlyPool(common)};
  }).filter(p=>p.id&&p.ageMinutes!==null&&p.ageMinutes<=120).sort((a,b)=>(a.ageMinutes??9999)-(b.ageMinutes??9999));
  return NextResponse.json({ok:true,source:"GeckoTerminal new pools (public discovery, incomplete coverage)",observedAt:new Date(now).toISOString(),verifiedSwaps:false,independentBuyersVerified:false,safetyVerified:false,goodSignals:0,pools},{headers:{"cache-control":"no-store, max-age=0"}});
 }catch{return NextResponse.json({ok:false,error:"early_discovery_upstream_unavailable",pools:[],observedAt:new Date().toISOString()},{status:503,headers:{"cache-control":"no-store"}})}
}
