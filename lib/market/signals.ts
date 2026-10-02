export type WindowMinutes = '5' | '15' | '60' | '360';
export type WindowComparison = {
  baselineAt: string; observedAt: string; elapsedMinutes: number;
  hypeDelta?: number | null; volumeChangePct?: number | null; liquidityChangePct?: number | null; priceChangePct?: number | null;
  holderGrowth?: number | null; holderGrowthPct?: number | null; newHolders?: number | null; exitedHolders?: number | null;
};
export type MarketWindows = Partial<Record<WindowMinutes,WindowComparison>>;
export type Intelligence = {
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
  return { hypeDelta, hypeVelocity, hypeAcceleration, fdvLiquidityRatio, riskFactors,
    volumeDelta, volumeVelocity, volumeAcceleration: acceleration, liquidityChange, liquidityChangePct,
    buyPressure: trades ? (t.buys1h ?? 0) / trades * 100 : null,
    liquidityWarning, baselineAt: comparable ? baselineAt : null,
    riskScore: Math.round(Math.min(100, risk)), riskReasons: reasons,
    riskCoverage: finite(t.top10SupplyPct) ? 'market + observed holders (heuristic)' : 'market only; holder risk unknown' };
}
export function evaluateAlerts(t: SignalToken, previous: SignalToken | undefined, at: string): SignalAlert[] {
  const alerts: SignalAlert[] = [];
  const add = (kind: string, value: number, message: string, severity: SignalAlert['severity'] = 'info') => alerts.push({
    id: `${t.mint}:${kind}:${at}`, mint: t.mint, symbol: t.symbol ?? null, kind, severity, value, message, at,
    deltaTrades: 0, deltaVolume: t.volumeDelta ?? 0, hypeDelta: t.hypeDelta ?? 0 });
  if ((t.hypeScore ?? 0) >= 70 && (previous?.hypeScore ?? 0) < 70) add('hype-threshold',t.hypeScore!, 'Hype crossed 70/100');
  if ((t.hypeVelocity ?? 0) >= 3 && (previous?.hypeVelocity ?? 0) < 3) add('hype-velocity',t.hypeVelocity!, 'Hype rises ≥3 points/min');
  if ((t.hypeAcceleration ?? 0) >= .3 && (previous?.hypeAcceleration ?? 0) < .3) add('hype-acceleration',t.hypeAcceleration!, 'Hype velocity accelerates ≥0.3 points/min²');
  if ((t.hypeDelta ?? 0) >= 5 && (previous?.hypeDelta ?? 0) < 5) add('hype', t.hypeDelta!, 'Hype increased ≥5 points');
  const holderGrowth = t.holderWindows?.['5']?.holderGrowthPct;
  const holderMinutes = t.holderBaselineAt && t.holderObservedAt ? (Date.parse(t.holderObservedAt)-Date.parse(t.holderBaselineAt))/60000 : null;
  const fastHolders = holderGrowth ?? (holderMinutes != null && holderMinutes <= 8 ? t.holderGrowthPct : null);
  if ((fastHolders ?? 0) >= 5 && t.holderObservedAt !== previous?.holderObservedAt) add('holder-growth',fastHolders!, 'Observed holders grew ≥5% over roughly 5m');
  if (finite(t.buyPressure) && t.buyPressure >= 70 && (t.buys1h ?? 0) + (t.sells1h ?? 0) >= 20 && (previous?.buyPressure ?? 0) < 70) add('buy-pressure', t.buyPressure, 'Buy count share crossed 70%');
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
