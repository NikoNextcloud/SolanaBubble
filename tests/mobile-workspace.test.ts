import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/WorkspaceShell.tsx", import.meta.url), "utf8");
const market = readFileSync(new URL("../components/MarketMap.tsx", import.meta.url), "utf8");
const theme = readFileSync(new URL("../app/lovable-theme.css", import.meta.url), "utf8");
const holder = readFileSync(new URL("../components/BubbleMap.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../workers/holder-physics.worker.ts", import.meta.url), "utf8");

test("mobile workspace keeps token search reachable", () => {
  assert.match(workspace, /mobile-search-toggle/);
  assert.match(workspace, /is-mobile-open/);
  assert.match(theme, /\.lovable-header-search\.is-mobile-open/);
});

test("mobile market exposes filters and selected token details", () => {
  assert.match(market, /mobile-tools-toggle/);
  assert.match(market, /is-token-selected/);
  assert.match(theme, /\.market-tools-drawer\.is-open/);
  assert.match(theme, /\.reference-market-side\.is-token-selected/);
  assert.match(market, /mobileDetailOpen/);
  assert.match(market, /quick-detail-action/);
  assert.match(theme, /is-token-selected\.is-mobile-open/);
  assert.match(theme, /safe-area-inset-bottom/);
  assert.match(market, /MARKET_X_TICKS/);
  assert.match(market, /PRICE CHANGE · 1H/);
  assert.match(market, /MarketCometLayer/);
  assert.match(market, /market-fullscreen-button/);
});

test("large holder maps use worker physics and hybrid canvas rendering", () => {
  assert.match(holder, /holder-physics\.worker\.ts/);
  assert.match(holder, /HolderCanvasLayer/);
  assert.match(holder, /visibleNodes\.length>=280/);
  assert.match(worker, /forceSimulation/);
});
