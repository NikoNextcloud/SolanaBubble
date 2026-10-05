import type {RecognizedSwap} from './decode';
export type TrafficWindow={minutes:number;swaps:number;buys:number;sells:number;buyers:number;sellers:number;newSampleBuyers:number;repeatSampleBuyers:number;quickResellers:number;buyUsd:number|null;sellUsd:number|null;netUsd:number|null;medianBuyUsd:number|null;largestBuyUsd:number|null;top3BuyerSharePct:number|null;retainedBuyers:number|null;retentionChecked:number;linkedBuyers:number|null;firstSwapAt:string|null;lastSwapAt:string|null};
export type TrafficEvidence='warming'|'sparse'|'usable'|'degraded';
export type TrafficSummary={
 observedAt:string;pool:string;pools:string[];coverage:'partial';evidence:TrafficEvidence;failures?:Record<string,number>;
 scans:number;listedSignatures:number;parsedTransactions:number;recognizedTransactions:number;directRecognizedTransactions:number;routedRecognizedTransactions:number;
 unavailableTransactions:number;unrecognizedTransactions:number;limitedScans:number;rowLimitReached:boolean;windows:Record<string,TrafficWindow>;
 recentBuys:TrafficRecentSwap[];
 recentSells:TrafficRecentSwap[];
 note:string;
};
export type TrafficRecentSwap={signature:string;wallet:string;usdValue:number|null;quoteMint:string;quoteAmount:number;blockAt:string;pool:string;evidence:'direct'|'routed';program:string;whale:boolean;walletPctSupply:number|null};
export function summarizeTraffic(rows:RecognizedSwap[],scans:any[],at:string,pool:string|string[],context?:{holderAt?:string|null;wallets?:Set<string>;linkedWallets?:Set<string>;walletPctSupply?:Map<string,number>},rowLimitReached=false):TrafficSummary {
 const pools=Array.isArray(pool)?[...new Set(pool)]:[pool],primaryPool=pools[0]??'';
 const now=Date.parse(at),sorted=[...rows].filter(s=>pools.includes(s.pool)&&Date.parse(s.block_at)<=now).sort((a,b)=>Date.parse(a.block_at)-Date.parse(b.block_at));
 const windows:Record<string,TrafficWindow>={};
 for(const minutes of [5,15,60]){
  const cutoff=now-minutes*60000,sample=sorted.filter(s=>Date.parse(s.block_at)>=cutoff),buy=sample.filter(s=>s.side==='buy'),sell=sample.filter(s=>s.side==='sell');
  const buyers=new Set(buy.map(s=>s.wallet)),sellers=new Set(sell.map(s=>s.wallet));
  const earlier=new Set(sorted.filter(s=>Date.parse(s.block_at)<cutoff&&s.side==='buy').map(s=>s.wallet));
  const quick=new Set<string>();for(const b of buy)if(sample.some(s=>s.wallet===b.wallet&&s.side==='sell'&&Date.parse(s.block_at)>Date.parse(b.block_at)&&Date.parse(s.block_at)-Date.parse(b.block_at)<=15*60000))quick.add(b.wallet);
  const allPriced=sample.length>0&&sample.every(s=>s.usd_value!=null&&Number.isFinite(s.usd_value));
  const amount=(r:RecognizedSwap[])=>allPriced?r.reduce((n,s)=>n+(s.usd_value??0),0):null;
  const buyUsd=amount(buy),sellUsd=amount(sell),sizes=buy.filter(s=>s.usd_value!=null).map(s=>s.usd_value!).sort((a,b)=>a-b);
  const spend=new Map<string,number>();for(const b of buy)spend.set(b.wallet,(spend.get(b.wallet)??0)+(b.usd_value??0));
  const holderTime=context?.holderAt?Date.parse(context.holderAt):NaN,holderFresh=Number.isFinite(holderTime)&&now-holderTime>=0&&now-holderTime<60*60000&&context?.wallets;
  const assessed=holderFresh?[...buyers].filter(w=>buy.filter(s=>s.wallet===w).every(s=>Date.parse(s.block_at)<=holderTime)):[];
  windows[minutes]={minutes,swaps:sample.length,buys:buy.length,sells:sell.length,buyers:buyers.size,sellers:sellers.size,newSampleBuyers:[...buyers].filter(w=>!earlier.has(w)).length,repeatSampleBuyers:[...buyers].filter(w=>earlier.has(w)).length,quickResellers:quick.size,buyUsd,sellUsd,netUsd:buyUsd!=null&&sellUsd!=null?buyUsd-sellUsd:null,medianBuyUsd:sizes.length?(sizes[Math.floor((sizes.length-1)/2)]+sizes[Math.floor(sizes.length/2)])/2:null,largestBuyUsd:sizes.length?sizes.at(-1)!:null,top3BuyerSharePct:buyUsd!=null&&buyUsd>0?[...spend.values()].sort((a,b)=>b-a).slice(0,3).reduce((n,v)=>n+v,0)/buyUsd*100:null,retainedBuyers:assessed.length?assessed.filter(w=>context?.wallets?.has(w)).length:null,retentionChecked:assessed.length,linkedBuyers:context?.linkedWallets?[...buyers].filter(w=>context.linkedWallets!.has(w)).length:null,firstSwapAt:sample[0]?.block_at??null,lastSwapAt:sample.at(-1)?.block_at??null};
 }
 const failures=scans.reduce((acc:Record<string,number>,s)=>{for(const [k,v] of Object.entries(s.failures??{}))acc[k]=(acc[k]??0)+Number(v);return acc;},{}),parsed=scans.reduce((n,s)=>n+(s.parsed??0),0),recognized=scans.reduce((n,s)=>n+(s.recognized??0),0),unavailable=scans.reduce((n,s)=>n+(s.unavailable??0),0);
 const directRecognized=scans.reduce((n,s)=>n+(s.directRecognized??s.recognized??0),0),routedRecognized=scans.reduce((n,s)=>n+(s.routedRecognized??0),0);
 const evidence:TrafficEvidence=unavailable>0||Object.values(failures).some(v=>v>0)?'degraded':recognized>=5?'usable':parsed>=5?'sparse':'warming';
 const recent=(side:'buy'|'sell')=>sorted.filter(s=>s.side===side).slice(-16).reverse().map(s=>{const pct=context?.walletPctSupply?.get(s.wallet)??null;return {signature:s.signature,wallet:s.wallet,usdValue:s.usd_value,quoteMint:s.quote_mint,quoteAmount:s.quote_amount,blockAt:s.block_at,pool:s.pool,evidence:s.evidence??'direct',program:s.program,whale:pct!=null&&pct>=1,walletPctSupply:pct};});
 const recentBuys=recent('buy'),recentSells=recent('sell');
 return {observedAt:at,pool:primaryPool,pools,coverage:'partial',evidence,failures,scans:scans.length,listedSignatures:scans.reduce((n,s)=>n+(s.listed??0),0),parsedTransactions:parsed,recognizedTransactions:recognized,directRecognizedTransactions:directRecognized,routedRecognizedTransactions:routedRecognized,unavailableTransactions:unavailable,unrecognizedTransactions:scans.reduce((n,s)=>n+(s.unrecognized??0),0),limitedScans:scans.filter(s=>s.limited).length,rowLimitReached,windows,recentBuys,recentSells,note:`Partial sample across ${pools.length} selected liquid pool${pools.length===1?'':'s'}. Verified-direct adapters: PumpSwap, Raydium CPMM/CLMM, Meteora DLMM and Orca Whirlpool. Jupiter routes are conservative signer-balance inference and are labelled routed, not verified-direct. USD uses USDC=$1 or SOL price at scan time, not historical execution USD. Whale labels require a fresh observed wallet balance ≥1% supply. New buyers means first seen in retained 2h sample; quick resale does not establish profit. No completeness or bot verdict.`};
}
