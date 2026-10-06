import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildWalletProfiles,classifyMarketRegime,smartMoneySummary,validateSignals} from '../lib/market/intelligence-core';

const at=Date.parse('2026-10-06T12:00:00Z');
const iso=(minutes:number)=>new Date(at+minutes*60000).toISOString();

test('wallet intelligence rewards repeated direct accumulation and penalizes quick flips',()=>{
 const rows=[
  {wallet:'smart',side:'buy' as const,usd_value:1800,block_at:iso(-90),evidence:'direct' as const},
  {wallet:'smart',side:'buy' as const,usd_value:2200,block_at:iso(-70),evidence:'direct' as const},
  {wallet:'smart',side:'buy' as const,usd_value:2600,block_at:iso(-50),evidence:'direct' as const},
  {wallet:'flipper',side:'buy' as const,usd_value:100,block_at:iso(-18),evidence:'routed' as const},
  {wallet:'flipper',side:'sell' as const,usd_value:105,block_at:iso(-12),evidence:'routed' as const},
  {wallet:'flipper',side:'buy' as const,usd_value:90,block_at:iso(-10),evidence:'routed' as const},
  {wallet:'flipper',side:'sell' as const,usd_value:95,block_at:iso(-5),evidence:'routed' as const},
 ];
 const profiles=buildWalletProfiles(rows,at);
 const smart=profiles.find(p=>p.wallet==='smart')!,flipper=profiles.find(p=>p.wallet==='flipper')!;
 assert.ok(smart.score>flipper.score);
 assert.ok(smart.directSharePct===100);
 assert.ok(flipper.quickFlips>=2);
 assert.ok(['Smart','Constructive'].includes(smart.label));
 const summary=smartMoneySummary(profiles);
 assert.ok(summary.smartWalletCount>=1);
 assert.ok((summary.netUsd??0)>0);
});

test('signal validation measures forward returns only for qualified snapshots',()=>{
 const rows=[
  {observed_at:iso(-360),payload:{priceUsd:1,opportunityScore:82,signalConfidenceScore:80,manipulationRiskScore:20}},
  {observed_at:iso(-345),payload:{priceUsd:1.10}},
  {observed_at:iso(-300),payload:{priceUsd:1.25}},
  {observed_at:iso(-240),payload:{priceUsd:1.3,opportunityScore:78,signalConfidenceScore:70,manipulationRiskScore:25}},
  {observed_at:iso(-225),payload:{priceUsd:1.2}},
  {observed_at:iso(-180),payload:{priceUsd:1.1}},
  {observed_at:iso(-120),payload:{priceUsd:2,opportunityScore:40,signalConfidenceScore:90,manipulationRiskScore:10}},
  {observed_at:iso(-105),payload:{priceUsd:3}},
 ];
 const result=validateSignals(rows);
 assert.equal(result.qualifiedSamples,2);
 assert.equal(result.windows['15'].samples,2);
 assert.equal(result.windows['15'].wins,1);
 assert.equal(result.windows['15'].winRate,50);
});

test('market regime distinguishes risk-on, mania and distribution states',()=>{
 assert.equal(classifyMarketRegime(Array.from({length:5},()=>({priceChange1h:6,hypeScore:84,capitalFlowScore:76,manipulationRiskScore:25}))).key,'mania');
 assert.equal(classifyMarketRegime(Array.from({length:5},()=>({priceChange1h:3,hypeScore:55,capitalFlowScore:72,manipulationRiskScore:30}))).key,'risk-on');
 assert.equal(classifyMarketRegime(Array.from({length:5},()=>({priceChange1h:-6,hypeScore:40,capitalFlowScore:30,manipulationRiskScore:78}))).key,'distribution');
});
