export function decisionTerminalFixture(mint){
 const now=Date.now(),iso=(ms)=>new Date(now-ms).toISOString();
 return {
  observedAt:new Date(now).toISOString(),
  walletProfiles:[
   {wallet:'7xGBrowserSmart004b',score:86,label:'Smart',swaps:5,buys:5,sells:0,buyUsd:7200,sellUsd:0,netUsd:7200,avgTradeUsd:1440,repeatEntries:4,quickFlips:0,directSharePct:100,firstSeenAt:iso(3600000),lastSeenAt:iso(0),reasons:['4 repeat entries in retained traffic']},
   {wallet:'7xGBrowserSmart014b',score:74,label:'Constructive',swaps:4,buys:4,sells:0,buyUsd:4200,sellUsd:0,netUsd:4200,avgTradeUsd:1050,repeatEntries:3,quickFlips:0,directSharePct:75,firstSeenAt:iso(3600000),lastSeenAt:iso(0),reasons:['3 repeat entries in retained traffic']},
  ],
  smartMoney:{wallets:[],smartWalletCount:2,entering:2,exiting:0,netUsd:11400,confidence:78},
  coordinatedClusters:[{id:'buy:test',side:'buy',wallets:['7xGBrowserSmart004b','7xGBrowserSmart014b','7xGBrowserSmart024b'],swaps:6,totalUsd:9000,directSharePct:90,startAt:iso(60000),endAt:iso(0),score:84,confidence:'high'}],
  adaptiveOpportunity:{baseScore:81,score:91,delta:10,confidence:84,historyAdjustment:3,goodOutcomeAdjustment:2,smartMoneyAdjustment:4,coordinationAdjustment:1,riskAdjustment:0,reasons:['Validated history +3','GOOD v2 outcomes +2','Smart Money +4']},
  validation:{samples:18,qualifiedSamples:18,calibrationLabel:'developing',note:'browser fixture',windows:{
   '15':{minutes:15,samples:18,wins:13,winRate:72,calibratedWinRate:68.2,confidence:75,avgReturnPct:3.6,medianReturnPct:2.8,downsideMedianPct:-1.4},
   '60':{minutes:60,samples:14,wins:10,winRate:71,calibratedWinRate:66.7,confidence:58,avgReturnPct:6.4,medianReturnPct:5.2,downsideMedianPct:-2.1},
   '360':{minutes:360,samples:8,wins:5,winRate:62.5,calibratedWinRate:58.3,confidence:33,avgReturnPct:9.1,medianReturnPct:7.4,downsideMedianPct:-3.2},
  }},
  goodValidation:{entries:9,samples:8,calibrationLabel:'developing',note:'browser GOOD v2 fixture',windows:{
   '15':{minutes:15,signals:9,samples:8,wins:6,positiveRate:75,calibratedPositiveRate:66.7,hit2Rate:60,confidence:40,medianReturnPct:2.9,medianMfePct:5.1,medianMaePct:-1.7},
   '60':{minutes:60,signals:9,samples:7,wins:5,positiveRate:71.4,calibratedPositiveRate:63.6,hit2Rate:66.7,confidence:35,medianReturnPct:5.4,medianMfePct:8.8,medianMaePct:-2.4},
   '360':{minutes:360,signals:9,samples:4,wins:3,positiveRate:75,calibratedPositiveRate:62.5,hit2Rate:66.7,confidence:20,medianReturnPct:8.1,medianMfePct:14.2,medianMaePct:-4.3},
  }},
  decision:{verdict:'STRONG BUY',score:91,confidence:84,whyNow:['Smart Money net inflow +$11.4K','Capital Flow accelerated +14 over ~1h','Similar qualified signals: 71% positive at 1h (14 samples)'],risks:['Manipulation risk 28/100'],brief:'Strong setup with 84% evidence confidence.',freshness:{ageMinutes:.2,status:'LIVE'},trend:{pricePct:8.2,opportunityDelta:9,capitalFlowDelta:14}},
  replay:Array.from({length:12},(_,i)=>({at:iso((11-i)*300000),price:.001+i*.000025,opportunity:68+i*2,confidence:70+i,capitalFlow:52+i*2,holderQuality:61+i,hype:60+i,risk:30-i*.2})),
  walletNetwork:{nodes:[
   {id:mint,label:'TOKEN',kind:'token',score:null,netUsd:null},
   {id:'7xGBrowserSmart004b',label:'7xGB…004b',kind:'wallet',score:86,netUsd:7200},
   {id:'7xGBrowserSmart014b',label:'7xGB…014b',kind:'wallet',score:74,netUsd:4200}
  ],links:[
   {source:'7xGBrowserSmart004b',target:mint,kind:'accumulation',weight:86},
   {source:'7xGBrowserSmart014b',target:mint,kind:'accumulation',weight:74},
   {source:'7xGBrowserSmart004b',target:'7xGBrowserSmart014b',kind:'coordinated',weight:84}
  ]},
  evidence:{recognizedSwaps:24,historicalSnapshots:144,note:'browser fixture'}
 };
}
