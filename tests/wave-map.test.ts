import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeWaveEvents,selectWaveTokens,tokenStrength,waveAmplitude,waveMapLayout,waveMetrics,wavePath} from '../lib/market/wave-map';

test('wave amplitude grows with stronger order flow',()=>{
  assert.ok(waveAmplitude(80,100)>waveAmplitude(20,100));
  assert.ok(waveAmplitude(100,100)<=39);
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
  assert.match(path,/^M20\.0,30\.0/);
  assert.match(path,/L400\.0,80\.0$/);
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

test('desktop wave layout uses two readable token columns without overlap',()=>{
  const tokens=Array.from({length:8},(_,i)=>({mint:String(i).padStart(32,'1'),hypeScore:50}));
  const metrics=new Map(tokens.map((t,i)=>[t.mint,{buys:1,sells:1,buyUsd:null,sellUsd:null,strength:i%2?50:-50,buyIntensity:2,sellIntensity:2,liveCount:0,lastEventAt:null}]));
  const layout=waveMapLayout(tokens,metrics,1000,820);
  assert.equal(layout.length,8);
  assert.equal(new Set(layout.map(p=>p.x)).size,2);
  assert.ok(layout.every(p=>p.x<260));
  assert.ok(layout.every(p=>p.endY>=92&&p.endY<=742));
  for(const x of new Set(layout.map(p=>p.x))){
    const column=layout.filter(p=>p.x===x).sort((a,b)=>a.y-b.y);
    for(let i=1;i<column.length;i++)assert.ok(column[i].y-column[i-1].y>=80);
  }
});

test('active wave event lifetime is based on observed arrival, not older block time',()=>{
  const now=Date.parse('2026-10-07T10:00:00Z');
  const mint='11111111111111111111111111111111';
  const events:any[]=[
    {mint,signature:'fresh-arrival',wallet:'a',side:'buy',usd_value:120,evidence:'direct',whale:false,block_at:'2026-10-07T09:59:48Z',observed_at:'2026-10-07T09:59:58Z'},
    {mint,signature:'old-arrival',wallet:'b',side:'sell',usd_value:80,evidence:'direct',whale:false,block_at:'2026-10-07T09:59:58Z',observed_at:'2026-10-07T09:59:50Z'},
  ];
  const active=activeWaveEvents(events,new Set([mint]),now,4200,10);
  assert.deepEqual(active.map(e=>e.signature),['fresh-arrival']);
  assert.equal(activeWaveEvents([],new Set([mint]),now,4200,10).length,0);
});

test('focus selection caps visual density and prioritizes selected and fresh-live tokens',()=>{
  const now=Date.parse('2026-10-07T10:00:00Z');
  const tokens=Array.from({length:20},(_,i)=>({mint:'mint-'+i,symbol:'T'+i,hypeScore:i,volume1h:i*1000,trades1h:i}));
  const metrics=new Map(tokens.map(t=>[t.mint,{buys:1,sells:1,buyUsd:null,sellUsd:null,strength:0,buyIntensity:1,sellIntensity:1,liveCount:0,lastEventAt:null}]));
  const events:any[]=[{mint:'mint-2',signature:'live',wallet:'w',side:'buy',usd_value:10,evidence:'direct',whale:false,block_at:'2026-10-07T09:59:50Z',observed_at:'2026-10-07T09:59:59Z'}];
  const selected=selectWaveTokens(tokens,events,metrics,'mint-1',6,now);
  assert.equal(selected.length,6);
  assert.ok(selected.some(t=>t.mint==='mint-1'));
  assert.ok(selected.some(t=>t.mint==='mint-2'));
});
