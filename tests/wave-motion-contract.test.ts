import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('both lanes use one geometry engine without competing SMIL',()=>{
 const wave=source('../components/MarketWaveMap.tsx');
 assert.match(wave,/startContinuousWaves/);
 assert.match(wave,/data-motion-key=\{"good:"\+wave\.mint\}/);
 assert.match(wave,/data-motion-key=\{"early:"\+pool\.id\}/);
 assert.doesNotMatch(wave,/<animate(?:Motion|\s)/);
 assert.match(wave,/data-follow-wave/);
});
test('motion has an explicit choice independent of RPC and system gating',()=>{
 const map=source('../components/MarketMap.tsx');
 const preference=source('../components/useWaveMotionPreference.ts');
 assert.match(map,/aria-label="Wave motion"/);
 assert.match(map,/animateSignals=motion\.enabled/);
 assert.doesNotMatch(map,/changeLive\(false, true\)/);
 assert.doesNotMatch(preference,/getItem\('solanabubble:map-pulses'\)/);
 assert.match(preference,/gentle:mode==='auto'&&reduced/);
});
