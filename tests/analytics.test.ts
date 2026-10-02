import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deriveSignals,evaluateAlerts,type SignalToken} from '../lib/market/signals';
import {compareMarketWindows} from '../lib/market/windows';
import {separateMapNodes} from '../lib/market/layout';
import {detectSwapLikeSale} from '../lib/market/sales';
import {fomoTokenUrl} from '../lib/token-links';
import {PublicSolanaRpcProvider,setSolanaRpcProvider,solanaRpc} from '../lib/rpc-provider';
const mint='So11111111111111111111111111111111111111112';
const token:SignalToken={mint,pairAddress:'pool',hypeScore:18,volume1h:100,liquidityUsd:10000,priceUsd:1};
test('18 → 42 → 67 detects positive velocity and acceleration',()=>{
  const second={...token,hypeScore:42,...deriveSignals({...token,hypeScore:42},token,'2026-10-02T12:05:00Z','2026-10-02T12:00:00Z')};
  const third=deriveSignals({...token,hypeScore:67},second,'2026-10-02T12:10:00Z','2026-10-02T12:05:00Z');
  assert.equal(second.hypeVelocity,4.8);assert.equal(third.hypeVelocity,5);assert.ok(third.hypeAcceleration!>0);
});
test('windows preserve actual intervals, missing baselines and pool changes',()=>{
  const w=compareMarketWindows({...token,hypeScore:42,volume1h:150,liquidityUsd:8000,priceUsd:2},'2026-10-02T12:05:30Z',[{mint,window_minutes:5,observed_at:'2026-10-02T12:00:00Z',payload:token},{mint,window_minutes:15,observed_at:'2026-10-02T11:50:00Z',payload:{...token,pairAddress:'other'}}]);
  assert.equal(w['5']?.elapsedMinutes,5.5);assert.equal(w['5']?.hypeDelta,24);assert.equal(w['5']?.liquidityChangePct,-20);assert.equal(w['5']?.volumeChangePct,50);assert.equal(w['5']?.priceChangePct,100);assert.equal(w['15'],undefined);assert.equal(w['360'],undefined);
});
test('risk separates dominance, linked concentration and FDV/liquidity',()=>{
  const m=deriveSignals({...token,largestHolderPct:45,linkedSupplyPct:40,fdv:10000000},undefined,'2026-10-02T12:05:00Z');
  assert.equal(m.riskFactors?.length,3);assert.equal(m.fdvLiquidityRatio,1000);assert.ok(m.riskScore!>=50);assert.equal(m.hypeVelocity,null);
});
test('holder alerts require a roughly 5m baseline, not a slow rotation',()=>{
  const at='2026-10-02T12:05:00Z';
  const t={...token,holderGrowthPct:20,holderObservedAt:at,holderBaselineAt:'2026-10-02T11:05:00Z'};
  assert.equal(evaluateAlerts(t,undefined,at).some(a=>a.kind==='holder-growth'),false);
  assert.equal(evaluateAlerts({...t,holderWindows:{'5':{baselineAt:'2026-10-02T12:00:00Z',observedAt:at,elapsedMinutes:5,holderGrowthPct:6}}},undefined,at).some(a=>a.kind==='holder-growth'),true);
});
test('swap-like detection rejects transfers, failed or old transactions',()=>{
  const row=(mint:string,amount:number)=>({mint,owner:'owner',uiTokenAmount:{uiAmountString:String(amount)}});
  const tx={blockTime:1790942700,transaction:{signatures:['sig']},meta:{err:null,preTokenBalances:[row('token',100),row(mint,1)],postTokenBalances:[row('token',80),row(mint,2)]}};
  const since=new Date((tx.blockTime-60)*1000).toISOString();
  assert.equal(detectSwapLikeSale(tx,'token','owner',since)?.amount,20);
  assert.equal(detectSwapLikeSale({...tx,meta:{...tx.meta,postTokenBalances:[row('token',80),row(mint,1)]}},'token','owner',since),null);
  assert.equal(detectSwapLikeSale({...tx,meta:{...tx.meta,err:{failed:true}}},'token','owner',since),null);
  assert.equal(detectSwapLikeSale(tx,'token','owner',new Date(tx.blockTime*1000).toISOString()),null);
});
test('collision spacing separates a dense map while preserving pins',()=>{
  const nodes=Array.from({length:12},(_,i)=>({x:i%3,y:Math.floor(i/3),r:20,fx:i===0?0:null,fy:i===0?0:null}));
  separateMapNodes(nodes,40,200);
  assert.equal(nodes[0].x,0);assert.equal(nodes[0].y,0);
  for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) assert.ok(Math.hypot(nodes[i].x-nodes[j].x,nodes[i].y-nodes[j].y)>=79.99);
});
test('FoMo points to the selected mint and Solana chain',()=>{
  const url=new URL(fomoTokenUrl(mint));assert.equal(url.pathname,'/coin');assert.equal(url.searchParams.get('address'),mint);assert.equal(url.searchParams.get('chainId'),'1399811149');
});
test('the RPC adapter can be replaced without touching consumers',async()=>{
  let method='';setSolanaRpcProvider({async request<T>(name:string){method=name;return 'ok' as T;}});
  try {assert.equal(await solanaRpc('getHealth',[]),'ok');assert.equal(method,'getHealth');}finally{setSolanaRpcProvider(new PublicSolanaRpcProvider());}
});
