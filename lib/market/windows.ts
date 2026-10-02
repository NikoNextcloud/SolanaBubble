import { percentChange, type MarketWindows, type SignalToken, type WindowMinutes } from './signals';
export type MarketBaseline = { mint:string;window_minutes:number;observed_at:string;payload:SignalToken };
export function compareMarketWindows(token:SignalToken,at:string,baselines:MarketBaseline[]):MarketWindows {
  const windows:MarketWindows={};
  for(const b of baselines) {
    if(b.mint!==token.mint || b.payload.pairAddress!==token.pairAddress) continue;
    windows[String(b.window_minutes) as WindowMinutes]={baselineAt:b.observed_at,observedAt:at,elapsedMinutes:(Date.parse(at)-Date.parse(b.observed_at))/60000,
      hypeDelta:(token.hypeScore ?? 0)-(b.payload.hypeScore ?? 0),
      volumeChangePct:percentChange(token.volume1h ?? 0,b.payload.volume1h ?? 0),
      liquidityChangePct:percentChange(token.liquidityUsd ?? 0,b.payload.liquidityUsd ?? 0),
      priceChangePct:percentChange(token.priceUsd ?? 0,b.payload.priceUsd ?? 0)};
  }
  return windows;
}
