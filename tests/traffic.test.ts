import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeDirectSwap,USDC_MINT,WSOL_MINT,type RecognizedSwap} from '../lib/market/traffic/decode';
import {swapPrograms} from '../lib/market/traffic/programs';
import {summarizeTraffic} from '../lib/market/traffic/summary';
import {bubbleSignal} from '../lib/market/map-signals';
const at='2026-10-02T08:00:00Z',now=Date.parse(at);
function b58(bytes:number[]){let v=0n;for(const b of bytes)v=v*256n+BigInt(b);let s='';const a='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';while(v){s=a[Number(v%58n)]+s;v/=58n;}return s;}
function fixture(adapter=swapPrograms[0] as typeof swapPrograms[number],side:'buy'|'sell'='buy',quote=USDC_MINT){
 const accounts=Array.from({length:13},(_,i)=>`account${i}`);accounts[adapter.poolIndex]='pool';accounts[adapter.userIndex]='buyer';
 const signer=adapter.userIndex,keys=accounts.map((pubkey,i)=>({pubkey,signer:i===signer}));
 const balance=(index:number,mint:string,amount:number,owner:string)=>({accountIndex:index,mint,owner,uiTokenAmount:{uiAmountString:String(amount)}});
 const sign=side==='buy'?1:-1;
 return {blockTime:now/1000,transaction:{signatures:['signature'],message:{accountKeys:keys,instructions:[{programId:adapter.program,accounts,data:b58([...adapter.discriminators[0],...Array(16).fill(0)])}]}},meta:{err:null,preTokenBalances:[balance(adapter.userTokenIndices[0],'mint',100,'buyer'),balance(adapter.vaultIndices[0],'mint',1000,'vault'),balance(adapter.vaultIndices[1],quote,1000,'vault')],postTokenBalances:[balance(adapter.userTokenIndices[0],'mint',100+sign*10,'buyer'),balance(adapter.vaultIndices[0],'mint',1000-sign*10,'vault'),balance(adapter.vaultIndices[1],quote,1000+sign*20,'vault')]}};
}
test('official direct PumpSwap and Raydium accounts decode purchases and sales',()=>{for(const p of swapPrograms)for(const side of ['buy','sell'] as const){const result=decodeDirectSwap(fixture(p,side),'mint','pool',null);assert.equal(result?.side,side);assert.equal(result?.token_amount,10);assert.equal(result?.usd_value,20);assert.equal(result?.program,p.name);}});
test('reject failed, unsigned, other pool, liquidity, truncated and routed transactions',()=>{
 const failed=fixture();failed.meta.err={} as any;
 const unsigned=fixture();unsigned.transaction.message.accountKeys.forEach(k=>k.signer=false);
 const liquidity=fixture();liquidity.transaction.message.instructions[0].data=b58(Array(24).fill(1));
 const truncated=fixture();truncated.transaction.message.instructions[0].data=b58([...swapPrograms[0].discriminators[0]]);
 const routed=fixture() as any;routed.transaction.message.instructions.push({...routed.transaction.message.instructions[0],programId:'router'});
 const transfer=fixture() as any;transfer.transaction.message.instructions.push({programId:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',parsed:{type:'transferChecked'}});
 const multiple=fixture();multiple.transaction.message.instructions.push(multiple.transaction.message.instructions[0]);
 for(const tx of [failed,unsigned,liquidity,truncated,routed,multiple,transfer])assert.equal(decodeDirectSwap(tx,'mint','pool',100),null);
 assert.equal(decodeDirectSwap(fixture(),'mint','other',100),null);
});
test('SOL swaps remain USD unknown without a scan price',()=>{assert.equal(decodeDirectSwap(fixture(swapPrograms[0],'buy',WSOL_MINT),'mint','pool',null)?.usd_value,null);assert.equal(decodeDirectSwap(fixture(swapPrograms[0],'buy',WSOL_MINT),'mint','pool',100)?.usd_value,2000);});
const row=(wallet:string,minutes:number,side:'buy'|'sell'='buy',usd=10):RecognizedSwap=>({wallet,signature:`${wallet}:${minutes}:${side}`,pool:'pool',side,token_amount:1,quote_mint:USDC_MINT,quote_amount:usd,usd_value:usd,block_at:new Date(now-minutes*60000).toISOString(),program:'PumpSwap'});
test('sample buyers, repeat, resale, retention and USD use separate evidence',()=>{
 const rows=[row('a',50),row('a',10),row('b',8),row('a',7,'sell'),row('c',6)];
 const s=summarizeTraffic(rows,[],at,'pool',{holderAt:new Date(now-5*60000).toISOString(),wallets:new Set(['a','c']),linkedWallets:new Set(['a'])});const w=s.windows['15'];
 assert.equal(w.buyers,3);assert.equal(w.sellers,1);assert.equal(w.newSampleBuyers,2);assert.equal(w.repeatSampleBuyers,1);assert.equal(w.quickResellers,1);assert.equal(w.buyUsd,30);assert.equal(w.sellUsd,10);assert.equal(w.netUsd,20);assert.equal(w.retentionChecked,3);assert.equal(w.retainedBuyers,2);assert.equal(w.linkedBuyers,1);assert.equal(s.coverage,'partial');
 const unknown=summarizeTraffic([{...rows[1],usd_value:null}],[],at,'pool').windows['15'];assert.equal(unknown.netUsd,null);assert.equal(unknown.retainedBuyers,null);assert.equal(unknown.linkedBuyers,null);
});
test('future and other pool swaps excluded; older holder samples cannot prove retention',()=>{const s=summarizeTraffic([row('a',-1),{...row('b',1),pool:'other'},row('c',2)],[],at,'pool',{holderAt:new Date(now-10*60000).toISOString(),wallets:new Set(['c'])});assert.equal(s.windows['15'].swaps,1);assert.equal(s.windows['15'].retentionChecked,0);});
test('fresh sufficient swap sample drives map; stale or sparse sample keeps count heuristic',()=>{
 const sample=summarizeTraffic(Array.from({length:8},(_,i)=>row(`w${i}`,i)),[],at,'pool');const t={mint:'mint',marketObservedAt:at,buys1h:50,sells1h:50,hypeVelocity:0,trafficSample:sample};
 assert.equal(bubbleSignal(t,now).state,'up');assert.match(bubbleSignal(t,now).label,/sample/);
 assert.equal(bubbleSignal({...t,trafficSample:{...sample,observedAt:new Date(now-11*60000).toISOString()}},now).state,'stable');
 assert.equal(bubbleSignal({...t,trafficSample:summarizeTraffic([row('one',1)],[],at,'pool')},now).state,'stable');
});
