import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../components/WorkspaceShell.tsx", import.meta.url), "utf8");
const market = readFileSync(new URL("../components/MarketMap.tsx", import.meta.url), "utf8");
const theme = readFileSync(new URL("../app/lovable-theme.css", import.meta.url), "utf8");
const holder = readFileSync(new URL("../components/BubbleMap.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../workers/holder-physics.worker.ts", import.meta.url), "utf8");
const wave = readFileSync(new URL("../components/MarketWaveMap.tsx", import.meta.url), "utf8");
const liveWs = readFileSync(new URL("../components/useSolanaLiveSwaps.ts", import.meta.url), "utf8");
const liveRealtime = readFileSync(new URL("../components/useLiveMarketEvents.ts", import.meta.url), "utf8");

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
  assert.match(wave, /quick-detail-action/);
  assert.match(theme, /is-token-selected\.is-mobile-open/);
  assert.match(theme, /safe-area-inset-bottom/);
  assert.match(wave, /ORDER FLOW/);
  assert.match(wave, /STRENGTH/);
  assert.match(market, /MarketWaveMap/);
  assert.match(market, /market-fullscreen-button/);
});

test("large holder maps use worker physics and hybrid canvas rendering", () => {
  assert.match(holder, /holder-physics\.worker\.ts/);
  assert.match(holder, /HolderCanvasLayer/);
  assert.match(holder, /visibleNodes\.length>=280/);
  assert.match(worker, /forceSimulation/);
});

test("live wave particles are event-only and support dual realtime transports", () => {
  assert.doesNotMatch(wave, /setCycle/);
  assert.match(wave, /activeWaveEvents/);
  assert.match(wave, /selectWaveTokens/);
  assert.match(wave, /data-visible-tokens/);
  assert.match(wave, /data-event-only="true"/);
  assert.match(wave, /particle\.side==="buy"/);
  assert.match(wave, /particle\.side==="sell"/);
  assert.match(liveWs, /logsSubscribe/);
  assert.match(liveWs, /targets\.slice\(0,16\)/);
  assert.match(liveWs, /getTransaction/);
  assert.match(liveWs, /existing=queue\.findIndex/);
  assert.match(wave, /Math\.max\(8,Math\.floor\(\(safeHeight-180\)\/82\)\)/);
  assert.match(liveRealtime, /postgres_changes/);
});

test("Wave Core preserves LOD, capital-flow mode, pulsing tokens and server live ingestion",()=>{
  const market=readFileSync(new URL("../components/MarketMap.tsx",import.meta.url),"utf8");
  const wave=readFileSync(new URL("../components/MarketWaveMap.tsx",import.meta.url),"utf8");
  const helius=readFileSync(new URL("../app/api/webhooks/helius/route.ts",import.meta.url),"utf8");
  assert.match(wave,/data-lod/);
  assert.match(market,/capital-flow-toggle/);
  assert.match(market,/market-live-latency/);
  assert.match(wave,/animateMotion/);
  assert.match(wave,/token-pulse-halo/);
  assert.doesNotMatch(wave,/recentBuys\.map/);
  assert.match(helius,/HELIUS_WEBHOOK_SECRET/);
  assert.match(helius,/live_market_events/);
});
