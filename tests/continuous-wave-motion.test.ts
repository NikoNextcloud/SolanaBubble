import {test} from 'node:test';
import assert from 'node:assert/strict';
import {continuousWaveFrame,type MotionWave} from '../lib/market/continuous-wave-motion';
const wave:MotionWave={key:'good:test',x1:90,y1:160,x2:450,y2:240,phase:.7,dynamics:{amplitude:28,frequency:5,duration:1.5,activity:.8,hypeTrend:'rising',hypeSlope:.4}};
test('continuous geometry advances without data changes and keeps anchors',()=>{
  const first=continuousWaveFrame(wave,0),next=continuousWaveFrame(wave,.6);
  assert.notEqual(first,next);
  assert.match(next,/^M90\.0,160\.0/);assert.match(next,/L450\.0,240\.0$/);
  assert.equal((first.match(/ Q/g)||[]).length,(next.match(/ Q/g)||[]).length);
});
test('EARLY reverse direction uses the same moving geometry',()=>{
  const mirrored={...wave,key:'early:test',x1:820,x2:500};
  const first=continuousWaveFrame(mirrored,0),next=continuousWaveFrame(mirrored,.7);
  assert.notEqual(first,next);assert.match(next,/^M820\.0,160\.0/);assert.match(next,/L500\.0,240\.0$/);
});
test('gentle mode is distinct, deterministic and remains finite during a soak',()=>{
  assert.notEqual(continuousWaveFrame(wave,.5),continuousWaveFrame(wave,.5,true));
  assert.equal(continuousWaveFrame(wave,.5,true),continuousWaveFrame(wave,.5,true));
  for(let i=0;i<1000;i++)assert.doesNotMatch(continuousWaveFrame(wave,i*3.7,i%2===0),/NaN|Infinity/);
});
