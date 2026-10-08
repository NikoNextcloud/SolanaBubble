import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildWalletProfiles,classifyMarketRegime,computeAdaptiveOpportunity,deriveSmartAlerts,detectCoordinatedWallets,smartMoneySummary,validateGoodOpportunities,validateSignals} from '../lib/market/intelligence-core';

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
 assert.equal(result.windows['15'].calibratedWinRate,50);
 assert.ok(result.windows['15'].confidence<20);
});

test('validation shrinks tiny perfect samples toward neutral instead of overclaiming accuracy',()=>{
 const result=validateSignals([
  {observed_at:iso(-30),payload:{priceUsd:1,opportunityScore:90,signalConfidenceScore:90,manipulationRiskScore:10}},
  {observed_at:iso(-15),payload:{priceUsd:1.2}},
 ]);
 assert.equal(result.windows['15'].winRate,100);
 assert.equal(result.windows['15'].calibratedWinRate,60);
 assert.ok(result.windows['15'].confidence<10);
});

test('market regime distinguishes risk-on, mania and distribution states',()=>{
 assert.equal(classifyMarketRegime(Array.from({length:5},()=>({priceChange1h:6,hypeScore:84,capitalFlowScore:76,manipulationRiskScore:25}))).key,'mania');
 assert.equal(classifyMarketRegime(Array.from({length:5},()=>({priceChange1h:3,hypeScore:55,capitalFlowScore:72,manipulationRiskScore:30}))).key,'risk-on');
 assert.equal(classifyMarketRegime(Array.from({length:5},()=>({priceChange1h:-6,hypeScore:40,capitalFlowScore:30,manipulationRiskScore:78}))).key,'distribution');
});


test('coordinated wallet detection requires multiple distinct wallets in a tight window',()=>{
 const rows=[
  {wallet:'a',side:'buy' as const,usd_value:1000,block_at:iso(-3),evidence:'direct' as const},
  {wallet:'b',side:'buy' as const,usd_value:1200,block_at:iso(-2.5),evidence:'direct' as const},
  {wallet:'c',side:'buy' as const,usd_value:900,block_at:iso(-2),evidence:'direct' as const},
  {wallet:'solo',side:'sell' as const,usd_value:400,block_at:iso(-1),evidence:'direct' as const},
 ];
 const clusters=detectCoordinatedWallets(rows,90);
 assert.equal(clusters.length,1);
 assert.equal(clusters[0].side,'buy');
 assert.equal(clusters[0].wallets.length,3);
 assert.ok(clusters[0].score>=58);
});

test('adaptive opportunity uses validated outcomes, smart flow and coordination without exceeding bounds',()=>{
 const validation=validateSignals([
  {observed_at:iso(-360),payload:{priceUsd:1,opportunityScore:80,signalConfidenceScore:80,manipulationRiskScore:20}},
  {observed_at:iso(-345),payload:{priceUsd:1.1}},
  {observed_at:iso(-300),payload:{priceUsd:1.2}},
  {observed_at:iso(-240),payload:{priceUsd:1,opportunityScore:82,signalConfidenceScore:80,manipulationRiskScore:20}},
  {observed_at:iso(-225),payload:{priceUsd:1.15}},
  {observed_at:iso(-180),payload:{priceUsd:1.25}},
 ]);
 const profiles=buildWalletProfiles([
  {wallet:'smart',side:'buy',usd_value:3000,block_at:iso(-20),evidence:'direct'},
  {wallet:'smart',side:'buy',usd_value:3500,block_at:iso(-10),evidence:'direct'},
  {wallet:'smart',side:'buy',usd_value:4000,block_at:iso(-5),evidence:'direct'},
 ]);
 const smart=smartMoneySummary(profiles);
 const clusters=detectCoordinatedWallets([
  {wallet:'a',side:'buy',usd_value:1000,block_at:iso(-3),evidence:'direct'},
  {wallet:'b',side:'buy',usd_value:1000,block_at:iso(-2.5),evidence:'direct'},
  {wallet:'c',side:'buy',usd_value:1000,block_at:iso(-2),evidence:'direct'},
 ]);
 const adaptive=computeAdaptiveOpportunity(78,validation,smart,clusters,{manipulationRiskScore:20,signalConfidenceScore:80});
 assert.ok(adaptive.score>=78&&adaptive.score<=100);
 assert.ok(adaptive.confidence>=30&&adaptive.confidence<=100);
 assert.ok(adaptive.delta>=0);
});

test('smart alerts surface coordinated selling and high-confidence opportunity',()=>{
 const sample:any={recentBuys:[],recentSells:[
  {signature:'s1',wallet:'a',usdValue:1000,quoteMint:'q',quoteAmount:1,blockAt:iso(-1),pool:'p',evidence:'direct',program:'x',whale:false,walletPctSupply:null},
  {signature:'s2',wallet:'b',usdValue:1200,quoteMint:'q',quoteAmount:1,blockAt:iso(-.7),pool:'p',evidence:'direct',program:'x',whale:false,walletPctSupply:null},
  {signature:'s3',wallet:'c',usdValue:900,quoteMint:'q',quoteAmount:1,blockAt:iso(-.4),pool:'p',evidence:'direct',program:'x',whale:false,walletPctSupply:null},
 ]};
 const alerts=deriveSmartAlerts([{mint:'m',symbol:'M',opportunityScore:84,signalConfidenceScore:82,manipulationRiskScore:30,trafficSample:sample}],iso(0));
 assert.ok(alerts.some(a=>a.kind==='smart-opportunity'));
 assert.ok(alerts.some(a=>a.kind==='coordinated-selling'));
});


test('GOOD v2 validation uses bounded entries and measures MFE/MAE without look-ahead',()=>{
 const rows=[
  {observed_at:iso(-180),payload:{priceUsd:1,goodOpportunityActive:true,goodOpportunityTier:'strong' as const,goodOpportunityScore:86}},
  {observed_at:iso(-175),payload:{priceUsd:1.03,goodOpportunityActive:true,goodOpportunityTier:'strong' as const,goodOpportunityScore:87}},
  {observed_at:iso(-165),payload:{priceUsd:1.02,goodOpportunityActive:true,goodOpportunityTier:'good' as const,goodOpportunityScore:82}},
  {observed_at:iso(-120),payload:{priceUsd:1.08,goodOpportunityActive:true,goodOpportunityTier:'good' as const,goodOpportunityScore:81}},
  {observed_at:iso(-105),payload:{priceUsd:1.12,goodOpportunityActive:false,goodOpportunityTier:'watch' as const,goodOpportunityScore:68}},
  {observed_at:iso(-60),payload:{priceUsd:1.04,goodOpportunityActive:true,goodOpportunityTier:'good' as const,goodOpportunityScore:79}},
  {observed_at:iso(-45),payload:{priceUsd:1.09,goodOpportunityActive:false,goodOpportunityTier:'watch' as const,goodOpportunityScore:69}},
  {observed_at:iso(0),payload:{priceUsd:1.15}},
 ];
 const v=validateGoodOpportunities(rows);
 assert.ok(v.entries>=2);
 assert.ok(v.windows['15'].samples>=2);
 assert.ok((v.windows['15'].medianMfePct??0)>=0);
 assert.ok((v.windows['15'].medianMaePct??0)<=0);
 assert.ok((v.windows['15'].calibratedPositiveRate??0)>50);
});

test('adaptive opportunity can use GOOD v2 outcome edge conservatively',()=>{
 const validation=validateSignals([
  {observed_at:iso(-60),payload:{priceUsd:1,opportunityScore:82,signalConfidenceScore:80,manipulationRiskScore:20}},
  {observed_at:iso(0),payload:{priceUsd:1.1}},
 ]);
 const goodValidation:any={entries:10,samples:10,calibrationLabel:'developing',note:'test',windows:{
  '15':{minutes:15,signals:10,samples:10,wins:8,positiveRate:80,calibratedPositiveRate:71.4,hit2Rate:75,confidence:50,medianReturnPct:3,medianMfePct:5,medianMaePct:-1.2},
  '60':{minutes:60,signals:10,samples:10,wins:8,positiveRate:80,calibratedPositiveRate:71.4,hit2Rate:70,confidence:50,medianReturnPct:5,medianMfePct:8,medianMaePct:-2},
  '360':{minutes:360,signals:10,samples:6,wins:4,positiveRate:66.7,calibratedPositiveRate:60,hit2Rate:62.5,confidence:30,medianReturnPct:7,medianMfePct:12,medianMaePct:-4},
 }};
 const smart=smartMoneySummary([]);
 const adaptive=computeAdaptiveOpportunity(75,validation,smart,[],{manipulationRiskScore:25,signalConfidenceScore:80},goodValidation);
 assert.ok(adaptive.goodOutcomeAdjustment>0);
 assert.ok(adaptive.score>=75);
});
