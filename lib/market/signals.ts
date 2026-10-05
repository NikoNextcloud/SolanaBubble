export type WindowMinutes = '5' | '15' | '60' | '360';
export type WindowComparison = {
  baselineAt: string; observedAt: string; elapsedMinutes: number;
  hypeDelta?: number | null; volumeChangePct?: number | null; liquidityChangePct?: number | null; priceChangePct?: number | null;
  holderGrowth?: number | null; holderGrowthPct?: number | null; newHolders?: number | null; exitedHolders?: number | null;
};
export type MarketWindows = Partial<Record<WindowMinutes,WindowComparison>>;
export type Intelligence = {
  trafficSample?: import('./traffic/summary').TrafficSummary | null;
  trafficEvidence?: import('./traffic/summary').TrafficEvidence | null;
  trafficObservedAt?: string | null;
  observedBuyPressure15m?: number | null;
  observedNetFlowUsd15m?: number | null;
  hypeDelta?: number | null;
  hypeVelocity?: number | null;
  hypeAcceleration?: number | null;
  windows?: MarketWindows;
  holderWindows?: MarketWindows;
  newHolders?: number | null;
  exitedHolders?: number | null;
  largestHolderPct?: number | null;
  whaleConcentrationPct?: number | null;
  linkedSupplyPct?: number | null;
  topHolderSales?: { wallet: string; signature: string; amount: number; at: string }[];
  fdvLiquidityRatio?: number | null;
  riskFactors?: { label: string; points: number; value: number }[];
  volumeDelta?: number | null;
  volumeVelocity?: number | null;
  volumeAcceleration?: number | null;
  liquidityChange?: number | null;
  liquidityChangePct?: number | null;
  buyPressure?: number | null;
  holderCount?: number | null;
  holderGrowth?: number | null;
  holderGrowthPct?: number | null;
  freshWallets?: number | null;
  top10SupplyPct?: number | null;
  linkedWallets?: number | null;
  suspiciousWallets?: number | null;
  whaleEnter?: number | null;
  whaleExit?: number | null;
  smartMoneyFlowUsd?: number | null;
  relationshipCoverage?: string;
  walletEvidence?: { wallets: string[]; kind: string; evidence: string[] }[];
  holderObservedAt?: string | null;
  holderBaselineAt?: string | null;
  riskScore?: number | null;
  riskReasons?: string[];
  riskCoverage?: string;
  liquidityWarning?: boolean;
  opportunityScore?: number | null;
  opportunityCoverage?: string;
  opportunityFactors?: { label: string; points: number; evidence: string }[];
  momentumScore?: number | null;
  capitalFlowScore?: number | null;
  holderQualityScore?: number | null;
  liquidityHealthScore?: number | null;
  manipulationRiskScore?: number | null;
  signalDimensionsCoverage?: string;
  baselineAt?: string | null;
};
export type SignalToken = Intelligence & {
  mint: string; symbol?: string | null; pairAddress?: string | null;
  hypeScore?: number; volume1h?: number; liquidityUsd?: number;
  buys1h?: number; sells1h?: number; priceUsd?: number; fdv?: number | null; netFlowUsd1h?: number;
};
export type SignalAlert = {
  id: string; mint: string; symbol: string | null; kind: string;
  severity: 'info' | 'warning' | 'critical'; value: number;
  message: string; at: string; deltaTrades: number; deltaVolume: number; hypeDelta: number;
};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export const percentChange = (value: number, previous: number) => previous > 0 ? (value - previous) / previous * 100 : null;

export function computeSignalDimensions(t: SignalToken) {
  const clamp=(n:number)=>Math.max(0,Math.min(100,Math.round(n)));
  const hype=finite(t.hypeScore)?t.hypeScore:50;
  const velocity=finite(t.hypeVelocity)?t.hypeVelocity:0;
  const acceleration=finite(t.hypeAcceleration)?t.hypeAcceleration:0;
  const momentum=clamp(48+hype*.34+velocity*5+acceleration*18);

  const pressure=finite(t.observedBuyPressure15m)?t.observedBuyPressure15m:finite(t.buyPressure)?t.buyPressure:50;
  const flow=finite(t.observedNetFlowUsd15m)?t.observedNetFlowUsd15m:finite(t.netFlowUsd1h)?t.netFlowUsd1h:0;
  const flowBoost=Math.tanh(flow/12000)*24;
  const evidenceBoost=t.trafficEvidence==='usable'?12:t.trafficEvidence==='sparse'?4:t.trafficEvidence==='degraded'?-4:0;
  const capitalFlow=clamp(50+(pressure-50)*.55+flowBoost+evidenceBoost);

  const holderGrowth=finite(t.holderGrowthPct)?t.holderGrowthPct:0;
  const concentration=finite(t.top10SupplyPct)?t.top10SupplyPct:50;
  const linked=finite(t.linkedSupplyPct)?t.linkedSupplyPct:0;
  const holderQuality=clamp(58+holderGrowth*2.2-Math.max(0,concentration-35)*.65-linked*.55);

  const liquidity=finite(t.liquidityUsd)?t.liquidityUsd:0;
  const liqChange=finite(t.liquidityChangePct)?t.liquidityChangePct:0;
  const fdvRatio=finite(t.fdvLiquidityRatio)?t.fdvLiquidityRatio:null;
  const liquidityHealth=clamp(
    40+Math.log10(Math.max(1,liquidity))*8+Math.max(-20,Math.min(20,liqChange*.35))-(fdvRatio!=null&&fdvRatio>100?Math.min(28,Math.log10(fdvRatio/100+1)*24):0)
  );

  const risk=finite(t.riskScore)?t.riskScore:50;
  const manipulationRisk=clamp(risk+(finite(t.suspiciousWallets)?Math.min(18,t.suspiciousWallets*2):0)+(finite(t.whaleConcentrationPct)&&t.whaleConcentrationPct>35?12:0));

  const observed=[
    finite(t.hypeScore),finite(t.hypeVelocity),finite(t.observedBuyPressure15m)||finite(t.buyPressure),
    finite(t.observedNetFlowUsd15m)||finite(t.netFlowUsd1h),finite(t.holderGrowthPct),finite(t.top10SupplyPct),
    finite(t.liquidityUsd),finite(t.riskScore)
  ].filter(Boolean).length;
  return {momentumScore:momentum,capitalFlowScore:capitalFlow,holderQualityScore:holderQuality,liquidityHealthScore:liquidityHealth,manipulationRiskScore:manipulationRisk,signalDimensionsCoverage:`${observed}/8 signal families observed`};
}

export function computeOpportunityScore(t: SignalToken) {
  const factors:{label:string;points:number;evidence:string}[]=[];
  const add=(label:string,points:number,evidence:string)=>factors.push({label,points:Math.round(points),evidence});
  const hype=finite(t.hypeScore)?Math.max(0,Math.min(100,t.hypeScore)):0;
  add('Hype',hype*.20,`Hype ${Math.round(hype)}/100`);

  if(finite(t.hypeVelocity)) add('Hype velocity',Math.max(-8,Math.min(10,t.hypeVelocity*2.4)),`${t.hypeVelocity.toFixed(2)} H/min`);
  const pressure=finite(t.observedBuyPressure15m)?t.observedBuyPressure15m:finite(t.buyPressure)?t.buyPressure:null;
  if(pressure!=null) add('Buy pressure',Math.max(-8,Math.min(15,(pressure-50)*.45)),`${pressure.toFixed(1)}%${finite(t.observedBuyPressure15m)?' observed swaps':' aggregate counts'}`);
  if(finite(t.holderGrowthPct)) add('Holder growth',Math.max(-8,Math.min(15,t.holderGrowthPct*1.8)),`${t.holderGrowthPct.toFixed(2)}%`);
  if(finite(t.liquidityChangePct)) add('Liquidity trend',Math.max(-12,Math.min(10,t.liquidityChangePct*.35)),`${t.liquidityChangePct.toFixed(1)}%`);
  if(finite(t.smartMoneyFlowUsd)) add('Observed whale balance Δ',Math.max(-8,Math.min(8,t.smartMoneyFlowUsd/2500)),`${Math.round(t.smartMoneyFlowUsd).toLocaleString()}`);
  if(t.trafficEvidence==='usable'){
    const direct=t.trafficSample?.directRecognizedTransactions??t.trafficSample?.recognizedTransactions??0;
    add('Traffic evidence',direct>=3?10:5,direct>=3?`${direct} verified-direct swaps`:'mostly routed evidence');
  }
  if(finite(t.riskScore)) add('Risk penalty',-(t.riskScore*.28),`Risk ${Math.round(t.riskScore)}/100`);
  if(t.liquidityWarning) add('Liquidity warning',-15,'Liquidity dropped ≥25%');

  const raw=45+factors.reduce((sum,f)=>sum+f.points,0);
  const score=Math.max(0,Math.min(100,Math.round(raw)));
  const observed=[
    finite(t.hypeScore),finite(t.hypeVelocity),pressure!=null,finite(t.holderGrowthPct),
    finite(t.liquidityChangePct),finite(t.smartMoneyFlowUsd),t.trafficEvidence!=null,finite(t.riskScore)
  ].filter(Boolean).length;
  return {score,factors,coverage:`${observed}/8 signal families observed`};
}
export function deriveSignals(t: SignalToken, previous: SignalToken | undefined, at: string, baselineAt?: string): Intelligence {
  const minutes = baselineAt ? (Date.parse(at) - Date.parse(baselineAt)) / 60_000 : 0;
  const comparable = previous && minutes > 0 && minutes <= 60 && previous.pairAddress === t.pairAddress;
  const hypeDelta = comparable ? (t.hypeScore ?? 0) - (previous.hypeScore ?? 0) : null;
  const volumeDelta = comparable ? (t.volume1h ?? 0) - (previous.volume1h ?? 0) : null;
  const volumeVelocity = volumeDelta == null ? null : volumeDelta / minutes;
  const liquidityChange = comparable ? (t.liquidityUsd ?? 0) - (previous.liquidityUsd ?? 0) : null;
  const liquidityChangePct = comparable ? percentChange(t.liquidityUsd ?? 0, previous.liquidityUsd ?? 0) : null;
  const trades = (t.buys1h ?? 0) + (t.sells1h ?? 0);
  const liquidityWarning = liquidityChangePct != null && liquidityChangePct <= -25 && (previous?.liquidityUsd ?? 0) >= 5000;
  const riskFactors: {label:string;points:number;value:number}[] = [];
  const factor = (label:string,points:number,value:number) => riskFactors.push({label,points:Math.round(points),value});
  if ((t.liquidityUsd ?? 0) < 10000) factor('Low liquidity (< $10k)',20,t.liquidityUsd ?? 0);
  if (liquidityWarning) factor('Liquidity dropped ≥25%',25,liquidityChangePct!);
  if (finite(t.top10SupplyPct) && t.top10SupplyPct > 40) factor('Top 10 concentration (pool/program owners included)',Math.min(20,(t.top10SupplyPct-40)*.4),t.top10SupplyPct);
  if (finite(t.largestHolderPct) && t.largestHolderPct > 10) factor('Large holder dominance',Math.min(20,(t.largestHolderPct-10)),t.largestHolderPct);
  if (finite(t.linkedSupplyPct) && t.linkedSupplyPct > 10) factor('Linked-wallet supply concentration',Math.min(15,(t.linkedSupplyPct-10)*.5),t.linkedSupplyPct);
  else if (finite(t.suspiciousWallets) && t.suspiciousWallets > 0) factor('Wallet relationship evidence',Math.min(10,t.suspiciousWallets*2),t.suspiciousWallets);
  if (trades > 20 && (t.buys1h ?? 0)/trades < .3) factor('Strong sell pressure',15,(t.sells1h ?? 0)/trades*100);
  const fdvLiquidityRatio = finite(t.fdv) && t.fdv > 0 && (t.liquidityUsd ?? 0)>0 ? t.fdv/(t.liquidityUsd!) : null;
  if (fdvLiquidityRatio != null && fdvLiquidityRatio > 100) factor('FDV / liquidity imbalance',Math.min(15,Math.log10(fdvLiquidityRatio/100)*15+5),fdvLiquidityRatio);
  const risk = riskFactors.reduce((n,f)=>n+f.points,0);
  const reasons = riskFactors.map(f=>f.label);
  const hypeVelocity = hypeDelta == null ? null : hypeDelta/minutes;
  const hypeAcceleration = hypeVelocity != null && finite(previous?.hypeVelocity) ? (hypeVelocity-previous.hypeVelocity)/minutes : null;
  const acceleration = volumeVelocity != null && finite(previous?.volumeVelocity) ? (volumeVelocity - previous.volumeVelocity) / minutes : null;
  const sample=t.trafficSample,sampleAge=sample?(Date.parse(at)-Date.parse(sample.observedAt))/60000:null,sample15=sample?.windows?.['15'];
  const observedSample=sample&&sample15&&sampleAge!=null&&sampleAge>=-1&&sampleAge<10&&sample15.swaps>=5;
  const derivedInput={...t,hypeDelta,hypeVelocity,hypeAcceleration,volumeDelta,volumeVelocity,volumeAcceleration:acceleration,liquidityChange,liquidityChangePct,buyPressure:trades?(t.buys1h??0)/trades*100:null,liquidityWarning,riskScore:Math.round(Math.min(100,risk)),riskFactors,trafficEvidence:sample?.evidence??null,trafficObservedAt:sample?.observedAt??null,observedBuyPressure15m:observedSample?sample15.buys/sample15.swaps*100:null,observedNetFlowUsd15m:observedSample?sample15.netUsd:null};
  const opportunity=computeOpportunityScore(derivedInput);
  const dimensions=computeSignalDimensions(derivedInput);
  return { hypeDelta, hypeVelocity, hypeAcceleration, fdvLiquidityRatio, riskFactors,
    volumeDelta, volumeVelocity, volumeAcceleration: acceleration, liquidityChange, liquidityChangePct,
    buyPressure: trades ? (t.buys1h ?? 0) / trades * 100 : null,
    liquidityWarning, baselineAt: comparable ? baselineAt : null,
    riskScore: Math.round(Math.min(100, risk)), riskReasons: reasons,
    trafficEvidence:sample?.evidence??null,trafficObservedAt:sample?.observedAt??null,
    observedBuyPressure15m:observedSample?sample15.buys/sample15.swaps*100:null,
    observedNetFlowUsd15m:observedSample?sample15.netUsd:null,
    opportunityScore:opportunity.score,opportunityFactors:opportunity.factors,opportunityCoverage:opportunity.coverage,
    ...dimensions,
    riskCoverage: finite(t.top10SupplyPct) ? 'market + observed holders (heuristic)' : 'market only; holder risk unknown' };
}
export function evaluateAlerts(t: SignalToken, previous: SignalToken | undefined, at: string): SignalAlert[] {
  const alerts: SignalAlert[] = [];
  const add = (kind: string, value: number, message: string, severity: SignalAlert['severity'] = 'info') => alerts.push({
    id: `${t.mint}:${kind}:${at}`, mint: t.mint, symbol: t.symbol ?? null, kind, severity, value, message, at,
    deltaTrades: 0, deltaVolume: t.volumeDelta ?? 0, hypeDelta: t.hypeDelta ?? 0 });
  if ((t.opportunityScore ?? 0) >= 75 && (previous?.opportunityScore ?? 0) < 75) add('opportunity',t.opportunityScore!, 'Opportunity Score crossed 75/100');
  if ((t.hypeScore ?? 0) >= 70 && (previous?.hypeScore ?? 0) < 70) add('hype-threshold',t.hypeScore!, 'Hype crossed 70/100');
  if ((t.hypeVelocity ?? 0) >= 3 && (previous?.hypeVelocity ?? 0) < 3) add('hype-velocity',t.hypeVelocity!, 'Hype rises ≥3 points/min');
  if ((t.hypeAcceleration ?? 0) >= .3 && (previous?.hypeAcceleration ?? 0) < .3) add('hype-acceleration',t.hypeAcceleration!, 'Hype velocity accelerates ≥0.3 points/min²');
  if ((t.hypeDelta ?? 0) >= 5 && (previous?.hypeDelta ?? 0) < 5) add('hype', t.hypeDelta!, 'Hype increased ≥5 points');
  const holderGrowth = t.holderWindows?.['5']?.holderGrowthPct;
  const holderMinutes = t.holderBaselineAt && t.holderObservedAt ? (Date.parse(t.holderObservedAt)-Date.parse(t.holderBaselineAt))/60000 : null;
  const fastHolders = holderGrowth ?? (holderMinutes != null && holderMinutes <= 8 ? t.holderGrowthPct : null);
  if ((fastHolders ?? 0) >= 5 && t.holderObservedAt !== previous?.holderObservedAt) add('holder-growth',fastHolders!, 'Observed holders grew ≥5% over roughly 5m');
  const trades=(t.buys1h??0)+(t.sells1h??0),observed=finite(t.observedBuyPressure15m),pressure=observed?t.observedBuyPressure15m:(trades>=20?t.buyPressure:null);
  const previousPressure=observed?previous?.observedBuyPressure15m:previous?.buyPressure;
  if (finite(pressure) && pressure >= 70 && (previousPressure ?? 0) < 70) add('buy-pressure', pressure, observed?'Observed swap sample buy share crossed 70%':'Aggregated buy count share crossed 70%');
  if (t.liquidityWarning && !previous?.liquidityWarning) add('liquidity-disappearing', t.liquidityChangePct!, 'Liquidity dropped ≥25%', 'critical');
  else if (finite(t.liquidityChangePct) && t.liquidityChangePct >= 20 && (previous?.liquidityChangePct ?? 0) < 20) add('liquidity', t.liquidityChangePct, 'Liquidity increased ≥20%');
  if (t.holderObservedAt !== previous?.holderObservedAt) {
    if ((t.whaleEnter ?? 0) > 0) add('whale-enter', t.whaleEnter!, 'Owners crossed into ≥1% supply positions (includes program owners)');
    if ((t.whaleExit ?? 0) > 0) add('whale-exit', t.whaleExit!, 'Owners left ≥1% supply positions', 'warning');
  }
  if (t.holderObservedAt !== previous?.holderObservedAt) for (const sale of t.topHolderSales ?? []) {
    if ((previous?.topHolderSales ?? []).some(p=>p.signature===sale.signature && p.wallet===sale.wallet)) continue;
    add('top-holder-selling',sale.amount,`Top owner ${sale.wallet.slice(0,6)} has swap-like outflow; inspect ${sale.signature}`, 'warning');
    alerts.at(-1)!.id = `${t.mint}:top-holder-selling:${sale.wallet}:${sale.signature}`;
  }
  return alerts;
}
export function suppressRepeatedAlerts(candidates:SignalAlert[],history:SignalAlert[],cooldownMinutes=30){
  const ids=new Set(history.map(a=>a.id)),latest=new Map<string,number>();
  for(const a of history){const key=`${a.mint}:${a.kind}`,time=Date.parse(a.at);if(Number.isFinite(time)&&time>(latest.get(key)??-Infinity))latest.set(key,time);}
  return candidates.filter(a=>{if(ids.has(a.id))return false;const prior=latest.get(`${a.mint}:${a.kind}`),time=Date.parse(a.at);return prior==null||!Number.isFinite(time)||time-prior>=cooldownMinutes*60000;});
}
export function collapseAlertHistory(alerts:SignalAlert[]){const seen=new Set<string>();return alerts.filter(a=>{const key=`${a.mint}:${a.kind}`;return !seen.has(key)&&!!seen.add(key);});}
export function prioritizeAlerts(alerts:SignalAlert[],limit=8){
  const severity={critical:3,warning:2,info:1},rank=(a:SignalAlert)=>severity[a.severity]*1e9+Math.abs(a.value||0);
  const strongest=new Map<string,SignalAlert>();for(const alert of alerts){const current=strongest.get(alert.mint);if(!current||rank(alert)>rank(current))strongest.set(alert.mint,alert);}
  return [...strongest.values()].sort((a,b)=>rank(b)-rank(a)).slice(0,limit);
}
export const moverCategories = [
  { key: 'hypeVelocity', label: 'Hype Movers', unit: 'H/min' },
  { key: 'holderGrowthPct', label: 'Holder Movers', unit: '%' },
  { key: 'volumeAcceleration', label: 'Volume Movers', unit: '$/min²' },
  { key: 'liquidityChangePct', label: 'Liquidity Movers', unit: '%' },
  { key: 'smartMoneyFlowUsd', label: 'Smart Money Movers', unit: '$ observed whale balance Δ' },
] as const;
export function rankMovers<T extends Intelligence>(tokens: T[], key: typeof moverCategories[number]['key']) {
  return tokens.filter(t => finite(t[key])).sort((a, b) => Math.abs(b[key]!) - Math.abs(a[key]!));
}
