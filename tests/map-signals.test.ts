import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bubbleSignal} from '../lib/market/map-signals';
import type {WatchToken} from '../lib/watchlist';
const at='2026-10-02T08:00:00Z',now=Date.parse(at);
const token:WatchToken={mint:'mint',marketObservedAt:at,buys1h:80,sells1h:20,hypeVelocity:2,liquidityChangePct:1,holderObservedAt:at};
test('fresh count pressure plus rising hype shows upward support',()=>{const s=bubbleSignal(token,now);assert.equal(s.state,'up');assert.equal(s.arrow,'↑');assert.equal(s.flow,'in');assert.ok(s.label.includes('оц.'));});
test('missing, stale or sparse observations stay unknown and neutral',()=>{
  for(const t of [{...token,marketObservedAt:null},{...token,hypeVelocity:null},{...token,buys1h:3,sells1h:1}]){const s=bubbleSignal(t,now);assert.equal(s.state,'unknown');assert.equal(s.flow,'flat');}
  assert.equal(bubbleSignal(token,now+10*60000).state,'unknown');assert.equal(bubbleSignal(token,NaN).state,'unknown');
});
test('hype rising without count or liquidity support is explicit',()=>{assert.equal(bubbleSignal({...token,buys1h:30,sells1h:70},now).state,'unbacked');assert.equal(bubbleSignal({...token,liquidityChangePct:-15},now).state,'unbacked');});
test('sell dominance and balanced observations remain distinct',()=>{assert.equal(bubbleSignal({...token,buys1h:20,sells1h:80,hypeVelocity:-1},now).state,'down');assert.equal(bubbleSignal({...token,buys1h:50,sells1h:50,hypeVelocity:0},now).state,'stable');});
test('whale badges expire at 5m and liquidity/risk warnings are separate',()=>{const t={...token,whaleEnter:2,whaleExit:1,riskScore:80,liquidityWarning:true,liquidityChangePct:-30};const s=bubbleSignal(t,now);assert.equal(s.whaleLabel,'Whale +2 / −1');assert.equal(s.liquidityDrop,true);assert.equal(s.riskWarning,true);assert.equal(bubbleSignal(t,now+5*60000).whaleLabel,'');assert.equal(bubbleSignal({...token,whaleExit:2},now).whaleLabel,'Whale −2');assert.equal(bubbleSignal(t,now+10*60000).liquidityDrop,false);});
test('old holders cannot negate fresh market buying support',()=>{const t={...token,holderObservedAt:'2026-10-02T07:00:00Z',holderWindows:{'5':{baselineAt:'2026-10-02T06:55:00Z',observedAt:'2026-10-02T07:00:00Z',elapsedMinutes:5,holderGrowthPct:-20}}};assert.equal(bubbleSignal(t,now).state,'up');const fresh={...t,holderObservedAt:at,holderWindows:{'5':{...t.holderWindows['5'],observedAt:at}}};assert.equal(bubbleSignal(fresh,now).state,'unbacked');});
