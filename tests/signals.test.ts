import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSignals, evaluateAlerts, rankMovers, type SignalToken } from '../lib/market/signals';
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
test('unknown metrics excluded from mover ranking; negative movers retained',()=>{
  const list=rankMovers([{hypeVelocity:null},{hypeVelocity:3},{hypeVelocity:-8}], 'hypeVelocity');
  assert.equal(list.length,2); assert.equal(list[0].hypeVelocity,-8);
});
