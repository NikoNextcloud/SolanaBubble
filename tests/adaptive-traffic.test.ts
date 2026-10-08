import test from "node:test";
import assert from "node:assert/strict";
import {adaptiveTrafficBudget,selectAdaptiveTrafficWork} from "../lib/market/adaptive-traffic";

test("adaptive traffic budget grows on healthy fast cycles and shrinks on failures",()=>{
  assert.equal(adaptiveTrafficBudget(6,{durationMs:8000,trafficFailures:0,holderFailures:0}),5);
  assert.equal(adaptiveTrafficBudget(6,{durationMs:14000,trafficFailures:0,holderFailures:0}),4);
  assert.equal(adaptiveTrafficBudget(6,{durationMs:40000,trafficFailures:0,holderFailures:0}),2);
  assert.equal(adaptiveTrafficBudget(6,{durationMs:9000,trafficFailures:1,holderFailures:0}),2);
});

test("adaptive scheduler favors stale active tokens but preserves one rotation slot",()=>{
  const now=Date.parse("2026-10-05T12:00:00Z");
  const tokens=[
    {mint:"hot",volume1h:100000,trades1h:900,hypeScore:88,trafficObservedAt:"2026-10-05T11:59:00Z",trafficEvidence:"usable"},
    {mint:"stale",volume1h:1000,trades1h:12,hypeScore:40,trafficObservedAt:"2026-10-05T10:00:00Z",trafficEvidence:"sparse"},
    {mint:"cold",volume1h:50,trades1h:1,hypeScore:10,trafficObservedAt:"2026-10-05T11:59:00Z",trafficEvidence:"usable"},
  ];
  const work=selectAdaptiveTrafficWork(tokens,[],0,2,now);
  assert.equal(work.candidates.length,2);
  assert.ok(work.candidates.some(t=>t.mint==="stale"));
  assert.ok(work.rotation.length>=1);
});
