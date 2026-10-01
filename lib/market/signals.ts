export type Intelligence = {
  hypeDelta?: number | null;
  hypeVelocity?: number | null;
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
  buys1h?: number; sells1h?: number; priceUsd?: number;
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
  const reasons: string[] = [];
  let risk = 0;
  if ((t.liquidityUsd ?? 0) < 10000) { risk += 30; reasons.push('Low liquidity (< $10k)'); }
  if (liquidityWarning) { risk += 35; reasons.push('Liquidity disappeared ≥25% within the snapshot interval'); }
  if (finite(t.top10SupplyPct) && t.top10SupplyPct > 40) { risk += Math.min(25, (t.top10SupplyPct - 40) * .5); reasons.push('Concentrated supply (may include pool / program owners)'); }
  if (finite(t.suspiciousWallets) && t.suspiciousWallets > 0) { risk += Math.min(15, t.suspiciousWallets * 2); reasons.push('Wallet relationship evidence; investigate linked funding / timing'); }
  if (trades > 20 && (t.buys1h ?? 0) / trades < .3) { risk += 15; reasons.push('Strong sell pressure'); }
  const acceleration = volumeVelocity != null && finite(previous?.volumeVelocity) ? (volumeVelocity - previous.volumeVelocity) / minutes : null;
  return { hypeDelta, hypeVelocity: hypeDelta == null ? null : hypeDelta / minutes,
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
  if ((t.hypeDelta ?? 0) >= 5 && (previous?.hypeDelta ?? 0) < 5) add('hype', t.hypeDelta!, 'Hype increased ≥5 points');
  if ((t.holderGrowthPct ?? 0) >= 5 && t.holderObservedAt !== previous?.holderObservedAt) add('holder-growth', t.holderGrowthPct!, 'Observed holders grew ≥5%');
  if (finite(t.buyPressure) && t.buyPressure >= 70 && (t.buys1h ?? 0) + (t.sells1h ?? 0) >= 20 && (previous?.buyPressure ?? 0) < 70) add('buy-pressure', t.buyPressure, 'Buy count share crossed 70%');
  if (t.liquidityWarning && !previous?.liquidityWarning) add('liquidity-disappearing', t.liquidityChangePct!, 'Liquidity dropped ≥25%', 'critical');
  else if (finite(t.liquidityChangePct) && t.liquidityChangePct >= 20 && (previous?.liquidityChangePct ?? 0) < 20) add('liquidity', t.liquidityChangePct, 'Liquidity increased ≥20%');
  if (t.holderObservedAt !== previous?.holderObservedAt) {
    if ((t.whaleEnter ?? 0) > 0) add('whale-enter', t.whaleEnter!, 'Owners crossed into ≥1% supply positions (includes program owners)');
    if ((t.whaleExit ?? 0) > 0) add('whale-exit', t.whaleExit!, 'Owners left ≥1% supply positions', 'warning');
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
