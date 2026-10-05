export const MARKET_X_MIN_LOG = 4;
export const MARKET_X_MAX_LOG = 8;

export const MARKET_X_TICKS = [
  { value: 1e4, label: "$10K" },
  { value: 1e5, label: "$100K" },
  { value: 1e6, label: "$1M" },
  { value: 1e7, label: "$10M" },
  { value: 1e8, label: "$100M" },
] as const;

export const MARKET_Y_TICKS = [-50, -10, 0, 10, 50, 200, 500, 2000] as const;

export const MARKET_MAP_PADDING = {
  left: 46,
  right: 20,
  top: 18,
  bottom: 30,
} as const;

export function signedChangeScale(changePct: number) {
  const n = Number.isFinite(changePct) ? changePct : 0;
  return Math.sign(n) * Math.log10(1 + Math.abs(n) / 5);
}

export const MARKET_Y_MIN = signedChangeScale(-80);
export const MARKET_Y_MAX = signedChangeScale(3000);

export function marketCoordinateBase(
  marketCap: number,
  priceChange1h: number,
  width: number,
  height: number,
) {
  const pad = MARKET_MAP_PADDING;
  const innerWidth = Math.max(1, width - pad.left - pad.right);
  const innerHeight = Math.max(1, height - pad.top - pad.bottom);
  const centerX = pad.left + innerWidth / 2;
  const centerY = pad.top + innerHeight / 2;

  const cap = Math.max(1, Number.isFinite(marketCap) ? marketCap : 1);
  const x =
    centerX +
    (((Math.log10(cap) - MARKET_X_MIN_LOG) / (MARKET_X_MAX_LOG - MARKET_X_MIN_LOG)) * innerWidth -
      innerWidth / 2);

  const scaledChange = signedChangeScale(priceChange1h);
  const y =
    centerY +
    ((1 - (scaledChange - MARKET_Y_MIN) / (MARKET_Y_MAX - MARKET_Y_MIN)) * innerHeight -
      innerHeight / 2);

  return { x, y };
}

export function applyMarketViewport(
  point: { x: number; y: number },
  view: { x: number; y: number; k: number },
) {
  return {
    x: view.x + point.x * view.k,
    y: view.y + point.y * view.k,
  };
}
