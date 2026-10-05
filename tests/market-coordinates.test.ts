import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKET_X_TICKS,
  MARKET_Y_TICKS,
  applyMarketViewport,
  marketCoordinateBase,
  signedChangeScale,
} from "../lib/market/coordinates";

test("Lovable market coordinate system uses fixed market-cap decades", () => {
  const width = 1000;
  const height = 600;
  const xs = MARKET_X_TICKS.map(({ value }) => marketCoordinateBase(value, 0, width, height).x);

  assert.equal(MARKET_X_TICKS[0].label, "$10K");
  assert.equal(MARKET_X_TICKS.at(-1)?.label, "$100M");
  assert.ok(xs.every((x, i) => i === 0 || x > xs[i - 1]));
  assert.ok(Math.abs((xs[1] - xs[0]) - (xs[2] - xs[1])) < 0.001);
});

test("Lovable price-change scale keeps zero central and expands large moves logarithmically", () => {
  assert.equal(signedChangeScale(0), 0);
  assert.ok(signedChangeScale(50) > signedChangeScale(10));
  assert.ok(signedChangeScale(-50) < signedChangeScale(-10));

  const zero = marketCoordinateBase(1e6, 0, 1000, 600);
  const up = marketCoordinateBase(1e6, 500, 1000, 600);
  const down = marketCoordinateBase(1e6, -50, 1000, 600);
  assert.ok(up.y < zero.y);
  assert.ok(down.y > zero.y);
  assert.deepEqual(MARKET_Y_TICKS, [-50, -10, 0, 10, 50, 200, 500, 2000]);
});

test("pan and zoom transform the coordinate plane without changing data coordinates", () => {
  const base = marketCoordinateBase(1e6, 50, 1000, 600);
  const moved = applyMarketViewport(base, { x: 40, y: -30, k: 1.5 });

  assert.equal(moved.x, 40 + base.x * 1.5);
  assert.equal(moved.y, -30 + base.y * 1.5);
  assert.deepEqual(base, marketCoordinateBase(1e6, 50, 1000, 600));
});
