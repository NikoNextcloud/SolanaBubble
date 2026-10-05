import test from "node:test";
import assert from "node:assert/strict";
import { forceCollide, forceManyBody, forceSimulation } from "d3-force";
import { declutterMarketNodes } from "../lib/market/declutter";

test("500-holder force workload stays within a broad CI performance budget", () => {
  const nodes=Array.from({length:500},(_,i)=>({wallet:`w${i}`,x:(i%25)*12,y:Math.floor(i/25)*12,r:5+(i%7)}));
  const start=performance.now();
  const sim=forceSimulation(nodes as any)
    .force("charge",forceManyBody().strength(-8))
    .force("collide",forceCollide<any>((d)=>d.r+3))
    .stop();
  for(let i=0;i<24;i++)sim.tick();
  const elapsed=performance.now()-start;
  assert.ok(elapsed<5000,`500-holder physics regression: ${elapsed.toFixed(0)}ms`);
});

test("dense 100-token declutter remains deterministic and bounded",()=>{
  const nodes=Array.from({length:100},(_,i)=>({mint:`mint-${i.toString().padStart(3,'0')}`,x:500+(i%5),y:300+(i%7),r:16+(i%8)}));
  const start=performance.now();
  const result=declutterMarketNodes(nodes,{gap:72,maxDisplacement:520,iterations:28,anchorStrength:.015});
  const elapsed=performance.now()-start;
  assert.equal(result.length,100);
  assert.ok(result.every(n=>n.displacement<=520.001));
  assert.ok(elapsed<2500,`declutter regression: ${elapsed.toFixed(0)}ms`);
});
