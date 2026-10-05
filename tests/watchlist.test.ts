import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWatchState,emptyWatchState,evaluatePersonalAlerts,matchesWatchFilters,type WatchToken} from '../lib/watchlist';
import {observationQuality} from '../lib/market/quality';
const mint='So11111111111111111111111111111111111111112',at='2026-10-02T07:00:00Z',now=Date.parse(at);
const token:WatchToken={mint,symbol:'SOL',name:'Solana',marketObservedAt:at,hypeScore:80,riskScore:20,buys1h:30,sells1h:10};
const state=()=>({...emptyWatchState(),entries:[{mint,rules:{hypeScore:70}}]});
test('legacy favorites migrate with bounded validated rules and deduplication',()=>{
  const s=normalizeWatchState([{mint,symbol:'SOL'},{mint},{mint:'bad'}]);assert.equal(s.entries.length,1);assert.deepEqual(s.entries[0].rules,{});
  assert.equal(normalizeWatchState({entries:[{mint,rules:{hypeScore:101,hypeVelocity:3}}]}).entries[0].rules.hypeScore,undefined);
  assert.equal(normalizeWatchState({entries:[{mint,rules:{hypeScore:NaN}}]}).entries[0].rules.hypeScore,undefined);
  assert.equal(normalizeWatchState(null).entries.length,0);
});
test('personal alerts fire once, stay quiet above threshold and rearm below it',()=>{
  const first=evaluatePersonalAlerts(state(),[token],now);assert.equal(first.alerts.length,1);
  assert.equal(evaluatePersonalAlerts(first,[token],now),first);
  const second=evaluatePersonalAlerts(first,[{...token,marketObservedAt:'2026-10-02T07:01:00Z'}],now+60000);assert.equal(second.alerts.length,1);
  const cleared=evaluatePersonalAlerts(second,[{...token,hypeScore:60,marketObservedAt:'2026-10-02T07:02:00Z'}],now+120000);
  const rearmed=evaluatePersonalAlerts(cleared,[{...token,marketObservedAt:'2026-10-02T07:03:00Z'}],now+180000);assert.equal(rearmed.alerts.length,2);
});
test('stale, unknown and future observations cannot fire',()=>{
  assert.equal(evaluatePersonalAlerts(state(),[token],now+11*60000).alerts.length,0);
  assert.equal(evaluatePersonalAlerts(state(),[{...token,marketObservedAt:null}],now).alerts.length,0);
  assert.equal(evaluatePersonalAlerts(state(),[{...token,marketObservedAt:'2026-10-02T08:00:00Z'}],now).alerts.length,0);
});
test('holder rule requires its 5m observation; buy pressure requires volume of trades',()=>{
  const s={...state(),entries:[{mint,rules:{holderGrowthPct:5,buyPressure:70,liquidityChangePct:25}}]};
  assert.equal(evaluatePersonalAlerts(s,[{...token,holderGrowthPct:20,buyPressure:90,buys1h:1,sells1h:0}],now).alerts.length,0);
  const m={...token,buyPressure:80,liquidityChangePct:-30,holderWindows:{'5':{baselineAt:'2026-10-02T06:55:00Z',observedAt:at,elapsedMinutes:5,holderGrowthPct:6}}};
  assert.equal(evaluatePersonalAlerts(s,[m],now).alerts.length,3);
});
test('saved filters include favorites and exclude unknown risk when a cap is set',()=>{
  const s=state();assert.equal(matchesWatchFilters(token,{query:'sol',minHype:70,maxRisk:30,onlyFavorites:true},s.entries),true);
  assert.equal(matchesWatchFilters({...token,riskScore:null},{query:'',minHype:0,maxRisk:30,onlyFavorites:false},[]),false);
  assert.equal(matchesWatchFilters(token,{query:'',minHype:0,maxRisk:100,onlyFavorites:true},[]),false);
});
test('quality distinguishes age, unknown timestamps and holder freshness boundary',()=>{
  assert.equal(observationQuality(at,now).status,'recent');assert.equal(observationQuality(at,now+10*60000).status,'stale');assert.equal(observationQuality(at,now+10*60000,60).status,'recent');
  for(const value of [null,'bad','2026-10-02T08:00:00Z'])assert.equal(observationQuality(value,now).status,'unknown');
  assert.equal(observationQuality(at,NaN).status,'unknown');
});

test('out-of-order cached observations cannot rearm a newer alert',()=>{
  const first=evaluatePersonalAlerts(state(),[token],now);
  const older=evaluatePersonalAlerts(first,[{...token,hypeScore:60,marketObservedAt:'2026-10-02T06:59:00Z'}],now);
  assert.equal(older,first);assert.equal(older.active[`${mint}:hypeScore`],true);
});

test('Opportunity Score can trigger and rearm a personal threshold',()=>{
  const s={...emptyWatchState(),entries:[{mint,rules:{opportunityScore:75}}]};
  const high={...token,opportunityScore:82};
  const first=evaluatePersonalAlerts(s,[high],now);assert.equal(first.alerts[0]?.key,'opportunityScore');
  const low=evaluatePersonalAlerts(first,[{...high,opportunityScore:60,marketObservedAt:'2026-10-02T07:01:00Z'}],now+60000);
  const again=evaluatePersonalAlerts(low,[{...high,marketObservedAt:'2026-10-02T07:02:00Z'}],now+120000);
  assert.equal(again.alerts.filter(a=>a.key==='opportunityScore').length,2);
});
