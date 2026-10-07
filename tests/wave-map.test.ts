import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenStrength,waveAmplitude,waveMapLayout,waveMetrics,wavePath} from '../lib/market/wave-map';

test('wave amplitude grows with stronger order flow',()=>{
  assert.ok(waveAmplitude(80,100)>waveAmplitude(20,100));
  assert.ok(waveAmplitude(100,100)<=31);
});

test('token strength stays bounded and blends count with priced flow',()=>{
  assert.equal(tokenStrength(10,0),100);
  assert.equal(tokenStrength(0,10),-100);
  assert.equal(tokenStrength(5,5),0);
  const priced=tokenStrength(8,2,800,200);
  assert.ok(priced>0&&priced<=100);
});

test('wave path starts and ends at requested anchors',()=>{
  const path=wavePath(20,30,400,80,18,0);
  assert.match(path,/^M20\.00,30\.00/);
  assert.match(path,/L400\.00,80\.00$/);
});

test('wave metrics augment retained sample only with newer live events',()=>{
  const now=Date.parse('2026-10-07T10:00:00Z');
  const token:any={mint:'11111111111111111111111111111111',buys1h:20,sells1h:10,trafficSample:{
    observedAt:'2026-10-07T09:59:00Z',
    windows:{'5':{buys:4,sells:2,buyUsd:400,sellUsd:200}},
  }};
  const events:any[]=[
    {mint:token.mint,side:'buy',usd_value:100,block_at:'2026-10-07T09:59:30Z'},
    {mint:token.mint,side:'sell',usd_value:50,block_at:'2026-10-07T09:58:30Z'},
  ];
  const result=waveMetrics(token,events,now);
  assert.equal(result.buys,5);
  assert.equal(result.sells,2);
  assert.equal(result.buyUsd,500);
  assert.equal(result.sellUsd,200);
  assert.ok(result.strength>0);
});

test('wave layout keeps every token in the left region and strength endpoint on scale',()=>{
  const tokens=Array.from({length:12},(_,i)=>({mint:String(i).padStart(32,'1'),hypeScore:50}));
  const metrics=new Map(tokens.map((t,i)=>[t.mint,{buys:1,sells:1,buyUsd:null,sellUsd:null,strength:i%2?50:-50,buyIntensity:2,sellIntensity:2,liveCount:0,lastEventAt:null}]));
  const layout=waveMapLayout(tokens,metrics,1000,600);
  assert.equal(layout.length,12);
  assert.ok(layout.every(p=>p.x<340));
  assert.ok(layout.every(p=>p.endY>=70&&p.endY<=546));
});
