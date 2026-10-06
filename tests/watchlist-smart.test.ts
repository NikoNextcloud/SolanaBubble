import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptySmartWatchState,evaluateSmartPersonalAlerts,normalizeSmartWatchState} from '../lib/watchlist-smart';
import type {WatchToken} from '../lib/watchlist';
const mint='So11111111111111111111111111111111111111112',at='2026-10-02T07:00:00Z',now=Date.parse(at);
const token:WatchToken={mint,symbol:'SOL',marketObservedAt:at,hypeScore:80,riskScore:20,buys1h:30,sells1h:10};

test('smart personal rules fire once and rearm after the setup clears',()=>{
 const state={...emptySmartWatchState(),smartRules:{[mint]:{strongSetup:true}}};
 const high={...token,opportunityScore:86,signalConfidenceScore:82,manipulationRiskScore:28};
 const first=evaluateSmartPersonalAlerts(state,[high],now);assert.equal(first.smartAlerts[0]?.key,'strongSetup');assert.match(first.smartAlerts[0]?.message??'',/Strong Buy/);
 const low=evaluateSmartPersonalAlerts(first,[{...high,opportunityScore:60,marketObservedAt:'2026-10-02T07:01:00Z'}],now+60000);
 const again=evaluateSmartPersonalAlerts(low,[{...high,marketObservedAt:'2026-10-02T07:02:00Z'}],now+120000);
 assert.equal(again.smartAlerts.filter(a=>a.key==='strongSetup').length,2);
});

test('smart divergence liquidity and whale rules stay evidence gated',()=>{
 const state={...emptySmartWatchState(),smartRules:{[mint]:{bullishDivergence:true,bearishDivergence:true,liquidityDanger:true,whaleExit:true}}};
 const observed={...token,signalConfidenceScore:72,divergenceSignal:'bullish' as const,liquidityWarning:true,liquidityChangePct:-18,whaleExit:2};
 const first=evaluateSmartPersonalAlerts(state,[observed],now);
 assert.ok(first.smartAlerts.some(a=>a.key==='bullishDivergence'));assert.ok(first.smartAlerts.some(a=>a.key==='liquidityDanger'));assert.ok(first.smartAlerts.some(a=>a.key==='whaleExit'));assert.ok(!first.smartAlerts.some(a=>a.key==='bearishDivergence'));
});

test('smart sync payload normalization rejects invalid mints keys and alert shapes',()=>{
 const state=normalizeSmartWatchState({smartRules:{[mint]:{strongSetup:true,bad:true},bad:{strongSetup:true}},smartAlerts:[{id:'x',mint,key:'whaleExit',value:1,at,message:'Whale exit activity detected'},{id:'bad',mint:'bad',key:'whaleExit',value:1,at,message:'x'}]});
 assert.equal(state.smartRules[mint]?.strongSetup,true);assert.equal(Object.keys(state.smartRules).length,1);assert.equal(state.smartAlerts.length,1);
});
