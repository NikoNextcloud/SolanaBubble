import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReplaySeries,buildWalletNetwork,computeDecisionTerminal} from '../lib/market/decision-terminal';
import type {AdaptiveOpportunity,ValidationSummary,WalletProfile,CoordinatedCluster} from '../lib/market/intelligence-core';

const at=Date.parse('2026-10-06T12:00:00Z');
const iso=(minutes:number)=>new Date(at+minutes*60000).toISOString();
const validation:ValidationSummary={samples:12,qualifiedSamples:12,calibrationLabel:'developing',note:'test',windows:{
 '15':{minutes:15,samples:12,wins:8,winRate:66.7,calibratedWinRate:62.5,confidence:50,avgReturnPct:3.2,medianReturnPct:2.5,downsideMedianPct:-1.2},
 '60':{minutes:60,samples:10,wins:7,winRate:70,calibratedWinRate:64.3,confidence:42,avgReturnPct:6.1,medianReturnPct:4.9,downsideMedianPct:-2},
 '360':{minutes:360,samples:5,wins:3,winRate:60,calibratedWinRate:55.6,confidence:21,avgReturnPct:8,medianReturnPct:6,downsideMedianPct:-3},
}};
const adaptive:AdaptiveOpportunity={baseScore:78,score:86,delta:8,confidence:76,historyAdjustment:4,goodOutcomeAdjustment:0,smartMoneyAdjustment:3,coordinationAdjustment:1,riskAdjustment:0,reasons:['Validated history +4']};

test('Decision Terminal produces a strong buy only when score confidence and risk align',()=>{
 const replay=buildReplaySeries([
  {observed_at:iso(-60),payload:{priceUsd:1,opportunityScore:72,capitalFlowScore:58,hypeScore:60,riskScore:25}},
  {observed_at:iso(0),payload:{priceUsd:1.08,opportunityScore:86,capitalFlowScore:76,hypeScore:75,manipulationRiskScore:30}},
 ]);
 const result=computeDecisionTerminal({
  current:{signalConfidenceScore:82,manipulationRiskScore:30,capitalFlowScore:76,holderQualityScore:70,divergenceSignal:'bullish'},
  adaptive,validation,smartMoney:{smartWalletCount:3,entering:3,exiting:0,netUsd:9000,confidence:72},clusters:[],replay,now:at
 });
 assert.equal(result.verdict,'STRONG BUY');
 assert.ok(result.confidence>=65);
 assert.ok(result.whyNow.some(x=>/Smart Money|constructive wallets|Capital Flow/.test(x)));
 assert.equal(result.freshness.status,'LIVE');
});

test('Decision Terminal prioritizes exit risk over a high opportunity score',()=>{
 const sell:CoordinatedCluster={id:'s',side:'sell',wallets:['a','b','c'],swaps:3,totalUsd:12000,directSharePct:100,startAt:iso(-1),endAt:iso(0),score:88,confidence:'high'};
 const result=computeDecisionTerminal({current:{signalConfidenceScore:90,manipulationRiskScore:82,capitalFlowScore:75,liquidityWarning:true},adaptive,validation,smartMoney:{smartWalletCount:1,entering:0,exiting:1,netUsd:-5000,confidence:60},clusters:[sell],replay:[],now:at});
 assert.equal(result.verdict,'EXIT RISK');
 assert.ok(result.risks.length>=2);
});

test('replay is bounded and wallet network keeps token and coordinated wallet links',()=>{
 const rows=Array.from({length:220},(_,i)=>({observed_at:iso(i-220),payload:{priceUsd:1+i/1000,opportunityScore:50+i%40,capitalFlowScore:40+i%30}}));
 const replay=buildReplaySeries(rows,48);assert.equal(replay.length,48);assert.equal(replay.at(-1)?.at,rows.at(-1)?.observed_at);
 const profiles:WalletProfile[]=[
  {wallet:'a-wallet',score:84,label:'Smart',swaps:4,buys:4,sells:0,buyUsd:8000,sellUsd:0,netUsd:8000,avgTradeUsd:2000,repeatEntries:3,quickFlips:0,directSharePct:100,firstSeenAt:iso(-20),lastSeenAt:iso(-1),reasons:[]},
  {wallet:'b-wallet',score:72,label:'Constructive',swaps:3,buys:2,sells:1,buyUsd:4000,sellUsd:500,netUsd:3500,avgTradeUsd:1500,repeatEntries:1,quickFlips:0,directSharePct:90,firstSeenAt:iso(-20),lastSeenAt:iso(-1),reasons:[]},
 ];
 const cluster:CoordinatedCluster={id:'c',side:'buy',wallets:['a-wallet','b-wallet'],swaps:3,totalUsd:6000,directSharePct:100,startAt:iso(-2),endAt:iso(-1),score:80,confidence:'high'};
 const network=buildWalletNetwork('mint',profiles,[cluster]);
 assert.equal(network.nodes[0].kind,'token');
 assert.ok(network.links.some(l=>l.kind==='coordinated'));
});


test('Decision Terminal refuses a strong-buy verdict on stale evidence',()=>{
 const replay=buildReplaySeries([
  {observed_at:iso(-90),payload:{priceUsd:1,opportunityScore:86,capitalFlowScore:76,hypeScore:75,manipulationRiskScore:30}},
 ]);
 const result=computeDecisionTerminal({
  current:{signalConfidenceScore:90,manipulationRiskScore:20,capitalFlowScore:80,holderQualityScore:80,divergenceSignal:'bullish'},
  adaptive:{...adaptive,score:92,confidence:90},validation,
  smartMoney:{smartWalletCount:3,entering:3,exiting:0,netUsd:12000,confidence:85},clusters:[],replay,now:at
 });
 assert.notEqual(result.verdict,'STRONG BUY');
 assert.equal(result.freshness.status,'STALE');
 assert.ok(result.confidence<80);
});
