export type BalanceRow={wallet:string;balance:number};
export function balanceChanges(previous:BalanceRow[],current:BalanceRow[]){
 const before=new Map(previous.map(b=>[b.wallet,b.balance]));
 // Only compare owners present in both top-500 samples. Absence is not an exit.
 return current.filter(b=>before.has(b.wallet)&&Number.isFinite(b.balance)&&Number.isFinite(before.get(b.wallet))).map(b=>({wallet:b.wallet,delta:b.balance-before.get(b.wallet)!})).filter(b=>b.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
export function trackedFlow(rows:{side:string;usd_value:number|null;block_time:string}[],now:number){
 const swaps=rows.filter(t=>(t.side==='buy'||t.side==='sell')&&Date.parse(t.block_time)>now-86400000&&Date.parse(t.block_time)<=now);
 const buys=swaps.filter(t=>t.side==='buy'),sells=swaps.filter(t=>t.side==='sell');
 const priced=swaps.length>0&&swaps.every(t=>t.usd_value!=null&&Number.isFinite(Number(t.usd_value))&&Number(t.usd_value)>=0);
 const buyUsd=priced?buys.reduce((v,t)=>v+Number(t.usd_value),0):null,sellUsd=priced?sells.reduce((v,t)=>v+Number(t.usd_value),0):null;
 return {swaps:swaps.length,buys:buys.length,sells:sells.length,buyUsd,sellUsd,volume:buyUsd!=null&&sellUsd!=null?buyUsd+sellUsd:null,net:buyUsd!=null&&sellUsd!=null?buyUsd-sellUsd:null};
}
export function walletFocus(selected:string|null,links:{source:string|{wallet:string};target:string|{wallet:string}}[]){
 const focused=new Set<string>();if(!selected)return focused;focused.add(selected);
 for(const l of links){const a=typeof l.source==='string'?l.source:l.source.wallet,b=typeof l.target==='string'?l.target:l.target.wallet;if(a===selected)focused.add(b);if(b===selected)focused.add(a);}return focused;
}
