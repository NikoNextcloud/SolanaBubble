import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapseAlertHistory, computeOpportunityScore, computeSignalDimensions, computeSignalEngineV3, deriveSignals, evaluateAlerts, prioritizeAlerts, rankMovers, suppressRepeatedAlerts, type SignalAlert, type SignalToken } from '../lib/market/signals';
const at = '2026-10-01T12:05:00Z', before = '2026-10-01T12:00:00Z';
const token: SignalToken = {mint:'mint',pairAddress:'pair',hypeScore:55,volume1h:2000,liquidityUsd:6000,buys1h:80,sells1h:20};
const prev: SignalToken = {...token,hypeScore:45,volume1h:1000,liquidityUsd:10000,volumeVelocity:100};
test('time-normalized metrics and acceleration use elapsed minutes',()=>{
  const m=deriveSignals(token,prev,at,before);
  assert.equal(m.hypeDelta,10); assert.equal(m.hypeVelocity,2); assert.equal(m.volumeVelocity,200); assert.equal(m.volumeAcceleration,20); assert.equal(m.buyPressure,80); assert.equal(m.liquidityChangePct,-40); assert.equal(m.liquidityWarning,true);
});
test('first observation, changed pool, zero baseline and stale history are unknown',()=>{
  assert.equal(deriveSignals(token,undefined,at).hypeDelta,null);
  assert.equal(deriveSignals(token,{...prev,pairAddress:'different'},at,before).liquidityChangePct,null);
  assert.equal(deriveSignals(token,{...prev,liquidityUsd:0},at,before).liquidityChangePct,null);
  assert.equal(deriveSignals(token,prev,at,'2026-10-01T10:00:00Z').hypeVelocity,null);
  assert.equal(deriveSignals({...token,buys1h:0,sells1h:0},undefined,at).buyPressure,null);
});
test('risk score bounded with transparent missing-holder coverage',()=>{
  const m=deriveSignals({...token,top10SupplyPct:90,suspiciousWallets:40},prev,at,before);
  assert.ok(m.riskScore!<=100); assert.ok(m.riskReasons!.length>=3);
  assert.match(deriveSignals(token,prev,at,before).riskCoverage!,/holder risk unknown/);
});
test('alerts fire on crossings; repeated observations do not repeat whale events',()=>{
  const t={...token,...deriveSignals(token,prev,at,before),holderObservedAt:at,holderBaselineAt:before,holderGrowthPct:10,whaleEnter:2,whaleExit:1};
  const first=evaluateAlerts(t,{...prev,buyPressure:50},at);
  assert.deepEqual(first.map(a=>a.kind).sort(),['buy-pressure','holder-growth','hype','liquidity-disappearing','whale-enter','whale-exit'].sort());
  assert.equal(evaluateAlerts(t,t,at).length,0);
});
test('fresh direct-swap evidence drives buy pressure alert and expires after 10m',()=>{
 const sample:any={observedAt:at,pool:'pair',coverage:'partial',evidence:'usable',windows:{'15':{swaps:10,buys:8,sells:2,netUsd:250}},scans:1,listedSignatures:10,parsedTransactions:10,recognizedTransactions:10,unavailableTransactions:0,unrecognizedTransactions:0,limitedScans:0,rowLimitReached:false,note:''};
 const current={...token,buys1h:1,sells1h:99,trafficSample:sample,...deriveSignals({...token,buys1h:1,sells1h:99,trafficSample:sample},prev,at,before)};
 assert.equal(current.observedBuyPressure15m,80);assert.equal(current.observedNetFlowUsd15m,250);assert.match(evaluateAlerts(current,prev,at).find(a=>a.kind==='buy-pressure')?.message??'',/Observed swap sample/);
 const stale=deriveSignals({...token,trafficSample:{...sample,observedAt:'2026-10-01T11:54:59Z'}},prev,at,before);assert.equal(stale.observedBuyPressure15m,null);
});
test('server alerts have a cooldown and history collapses by token and kind',()=>{
 const alert=(minutes:number,kind='hype'):SignalAlert=>({id:`mint:${kind}:${minutes}`,mint:'mint',symbol:'M',kind,severity:'info',value:1,message:'x',at:new Date(Date.parse(at)+minutes*60000).toISOString(),deltaTrades:0,deltaVolume:0,hypeDelta:1});
 assert.equal(suppressRepeatedAlerts([alert(10)],[alert(0)]).length,0);assert.equal(suppressRepeatedAlerts([alert(31)],[alert(0)]).length,1);assert.equal(suppressRepeatedAlerts([alert(31)],[alert(31)]).length,0);
 assert.deepEqual(collapseAlertHistory([alert(31),alert(0),alert(1,'liquidity')]).map(a=>a.kind),['hype','liquidity']);
});
test('server alert batch keeps one strongest signal per token and stays bounded',()=>{
 const make=(mint:string,kind:string,severity:SignalAlert['severity'],value:number):SignalAlert=>({id:`${mint}:${kind}`,mint,symbol:mint,kind,severity,value,message:'x',at,deltaTrades:0,deltaVolume:0,hypeDelta:0});
 const selected=prioritizeAlerts([make('a','hype','info',99),make('a','risk','critical',1),make('b','whale','warning',2),make('c','hype','info',100)],2);
 assert.deepEqual(selected.map(a=>a.kind),['risk','whale']);
});
test('unknown metrics excluded from mover ranking; negative movers retained',()=>{
  const list=rankMovers([{hypeVelocity:null},{hypeVelocity:3},{hypeVelocity:-8}], 'hypeVelocity');
  assert.equal(list.length,2); assert.equal(list[0].hypeVelocity,-8);
});

test('Opportunity Score is bounded and explains positive and negative factors',()=>{
 const strong=computeOpportunityScore({...token,hypeScore:88,hypeVelocity:4,buyPressure:78,holderGrowthPct:7,liquidityChangePct:12,smartMoneyFlowUsd:9000,riskScore:12});
 const weak=computeOpportunityScore({...token,hypeScore:20,hypeVelocity:-3,buyPressure:25,holderGrowthPct:-4,liquidityChangePct:-35,riskScore:80,liquidityWarning:true});
 assert.ok(strong.score>=0&&strong.score<=100);assert.ok(weak.score>=0&&weak.score<=100);assert.ok(strong.score>weak.score);
 assert.ok(strong.factors.some(f=>f.points>0));assert.ok(weak.factors.some(f=>f.points<0));assert.match(strong.coverage,/signal families observed/);
});

test('Signal Engine v2 dimensions are bounded and react to better flow/liquidity quality',()=>{
 const strong=computeSignalDimensions({...token,hypeScore:85,hypeVelocity:4,hypeAcceleration:.5,observedBuyPressure15m:80,observedNetFlowUsd15m:18000,holderGrowthPct:6,top10SupplyPct:28,linkedSupplyPct:4,liquidityUsd:180000,liquidityChangePct:15,riskScore:18,trafficEvidence:'usable'});
 const weak=computeSignalDimensions({...token,hypeScore:25,hypeVelocity:-3,hypeAcceleration:-.4,observedBuyPressure15m:25,observedNetFlowUsd15m:-18000,holderGrowthPct:-5,top10SupplyPct:75,linkedSupplyPct:35,liquidityUsd:3000,liquidityChangePct:-35,riskScore:82,trafficEvidence:'degraded'});
 for(const value of [strong.momentumScore,strong.capitalFlowScore,strong.holderQualityScore,strong.liquidityHealthScore,strong.manipulationRiskScore,weak.momentumScore,weak.capitalFlowScore,weak.holderQualityScore,weak.liquidityHealthScore,weak.manipulationRiskScore])assert.ok(value>=0&&value<=100);
 assert.ok(strong.capitalFlowScore>weak.capitalFlowScore);
 assert.ok(strong.liquidityHealthScore>weak.liquidityHealthScore);
 assert.ok(strong.manipulationRiskScore<weak.manipulationRiskScore);
});


test('Signal Engine v3 scores confidence, persistence and bearish divergence from observed evidence',()=>{
 const intelligence=computeSignalEngineV3({
   ...token,
   opportunityScore:82,
   capitalFlowScore:38,
   holderQualityScore:44,
   manipulationRiskScore:32,
   hypeVelocity:2,
   liquidityChangePct:5,
   trafficEvidence:'usable',
   observedNetFlowUsd15m:-9000,
   holderGrowthPct:-2,
   priceChange1h:8,
   top10SupplyPct:25,
   riskScore:25,
   windows:{
     '5':{baselineAt:before,observedAt:at,elapsedMinutes:5,priceChangePct:4,hypeDelta:3,volumeChangePct:12},
     '15':{baselineAt:before,observedAt:at,elapsedMinutes:15,priceChangePct:7,hypeDelta:5,volumeChangePct:18},
     '60':{baselineAt:before,observedAt:at,elapsedMinutes:60,priceChangePct:8,hypeDelta:6,volumeChangePct:25},
   },
 });
 assert.ok(intelligence.confidenceScore>=75);
 assert.equal(intelligence.signalConfidenceLabel,'High');
 assert.ok(intelligence.trendPersistenceScore>=60);
 assert.equal(intelligence.divergenceSignal,'bearish');
 assert.ok(intelligence.divergenceReasons.length>=1);
 assert.match(intelligence.signalThesis,/Caution/);
});

test('Signal Engine v3 identifies constructive pullback divergence',()=>{
 const intelligence=computeSignalEngineV3({
   ...token,
   opportunityScore:70,
   capitalFlowScore:72,
   holderQualityScore:68,
   manipulationRiskScore:25,
   observedNetFlowUsd15m:12000,
   holderGrowthPct:2,
   priceChange1h:-6,
   trafficEvidence:'usable',
   riskScore:20,
   liquidityChangePct:3,
 });
 assert.equal(intelligence.divergenceSignal,'bullish');
 assert.match(intelligence.signalThesis,/Constructive divergence/);
});
