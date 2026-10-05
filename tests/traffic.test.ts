import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeDirectSwap,decodeRoutedSwap,JUPITER_V6_PROGRAM,USDC_MINT,WSOL_MINT,type RecognizedSwap} from '../lib/market/traffic/decode';
import {swapPrograms} from '../lib/market/traffic/programs';
import {summarizeTraffic} from '../lib/market/traffic/summary';
import {bubbleSignal,trafficConfidence} from '../lib/market/map-signals';
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

function routedFixture(side:'buy'|'sell'='buy',quote=USDC_MINT){
 const sign=side==='buy'?1:-1;
 const balance=(index:number,mint:string,amount:number)=>({accountIndex:index,mint,owner:'buyer',uiTokenAmount:{uiAmountString:String(amount)}});
 return {version:0,blockTime:now/1000,transaction:{signatures:['jup-signature'],message:{accountKeys:[{pubkey:'buyer',signer:true},{pubkey:'pool',signer:false},{pubkey:'targetAta',signer:false},{pubkey:'quoteAta',signer:false},{pubkey:JUPITER_V6_PROGRAM,signer:false}],instructions:[{programId:JUPITER_V6_PROGRAM,accounts:[0,1,2,3]}]}},meta:{err:null,preTokenBalances:[balance(2,'mint',100),balance(3,quote,1000)],postTokenBalances:[balance(2,'mint',100+sign*10),balance(3,quote,1000-sign*20)]}};
}

test('Jupiter selected-pool routes are inferred from signer balance deltas and remain labelled routed',()=>{
 for(const side of ['buy','sell'] as const){
  const result=decodeRoutedSwap(routedFixture(side),'mint','pool',100);
  assert.equal(result?.side,side);assert.equal(result?.token_amount,10);assert.equal(result?.usd_value,20);assert.equal(result?.evidence,'routed');assert.match(result?.program??'',/Jupiter/);
 }
 const wrongPool=routedFixture();assert.equal(decodeRoutedSwap(wrongPool,'mint','other',100),null);
 const noJupiter=routedFixture() as any;noJupiter.transaction.message.instructions[0].programId='other';assert.equal(decodeRoutedSwap(noJupiter,'mint','pool',100),null);
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
test('traffic evidence distinguishes usable samples from RPC degradation',()=>{
 const usable=summarizeTraffic(Array.from({length:5},(_,i)=>row(`u${i}`,i)),[{listed:5,parsed:5,recognized:5,unavailable:0,unrecognized:0,failures:{}}],at,'pool');assert.equal(usable.evidence,'usable');
 const degraded=summarizeTraffic([], [{listed:5,parsed:0,recognized:0,unavailable:1,unrecognized:0,failures:{rate_limited:1}}],at,'pool');assert.equal(degraded.evidence,'degraded');
 const sparse=summarizeTraffic([], [{listed:5,parsed:5,recognized:0,unavailable:0,unrecognized:5,failures:{}}],at,'pool');assert.equal(sparse.evidence,'sparse');
});
test('traffic confidence separates reliable, partial and insufficient evidence',()=>{
 const usable=summarizeTraffic(Array.from({length:5},(_,i)=>row(`c${i}`,i)),[{listed:5,parsed:5,recognized:5,unavailable:0,unrecognized:0,failures:{}}],at,'pool');
 const degraded=summarizeTraffic([], [{listed:5,parsed:0,recognized:0,unavailable:1,unrecognized:0,failures:{rate_limited:1}}],at,'pool');
 const sparse=summarizeTraffic([], [{listed:5,parsed:5,recognized:0,unavailable:0,unrecognized:5,failures:{}}],at,'pool');
 assert.equal(trafficConfidence(usable,now).level,'reliable');
 assert.equal(trafficConfidence(degraded,now).level,'partial');
 assert.equal(trafficConfidence(sparse,now).level,'insufficient');
 assert.equal(trafficConfidence({...usable,observedAt:new Date(now-11*60000).toISOString()},now).level,'insufficient');
 assert.equal(trafficConfidence(null,now).level,'insufficient');
});
test('routed-only usable samples stay partial confidence until direct evidence is present',()=>{
 const rows=Array.from({length:5},(_,i)=>({...row(`r${i}`,i),evidence:'routed' as const,program:'Jupiter v6 route'}));
 const routed=summarizeTraffic(rows,[{listed:5,parsed:5,recognized:5,directRecognized:0,routedRecognized:5,unavailable:0,unrecognized:0,failures:{}}],at,'pool');
 assert.equal(routed.evidence,'usable');assert.equal(routed.directRecognizedTransactions,0);assert.equal(routed.routedRecognizedTransactions,5);assert.equal(trafficConfidence(routed,now).level,'partial');
});
test('fresh sufficient swap sample drives map; stale or sparse sample keeps count heuristic',()=>{
 const sample=summarizeTraffic(Array.from({length:8},(_,i)=>row(`w${i}`,i)),[],at,'pool');const t={mint:'mint',marketObservedAt:at,buys1h:50,sells1h:50,hypeVelocity:0,trafficSample:sample};
 assert.equal(bubbleSignal(t,now).state,'up');assert.match(bubbleSignal(t,now).label,/sample/);
 assert.equal(bubbleSignal({...t,trafficSample:{...sample,observedAt:new Date(now-11*60000).toISOString()}},now).state,'stable');
 assert.equal(bubbleSignal({...t,trafficSample:summarizeTraffic([row('one',1)],[],at,'pool')},now).state,'stable');
});

test('parsed v1 resource config preserves direct swap evidence; future/binary formats stay unknown',()=>{
 const tx:any=fixture();tx.version=1;tx.transaction.message.transactionConfig={computeUnitLimit:30000,heapSize:null,loadedAccountsDataSizeLimit:200000,priorityFee:null};assert.equal(decodeDirectSwap(tx,'mint','pool',null)?.side,'buy');tx.version=2;assert.equal(decodeDirectSwap(tx,'mint','pool',null),null);assert.equal(decodeDirectSwap({version:1,blockTime:now/1000,meta:{err:null},transaction:['bytes','base64']},'mint','pool',null),null);
});
