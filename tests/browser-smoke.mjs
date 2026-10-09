import assert from "node:assert/strict";
import fs from "node:fs";
import {decisionTerminalFixture} from "./fixtures/decision-terminal-browser.mjs";
import {installDecisionFixture,checkDecisionTerminal} from "./fixtures/decision-terminal-browser-check.mjs";
import {proveObservedAtImpulses} from "./fixtures/live-impulse-browser.mjs";
import {checkFlowTrajectoryUi} from "./fixtures/flow-trajectory-browser.mjs";
import {checkAdaptiveZoomDensity} from "./fixtures/adaptive-zoom-browser.mjs";

const CHROME = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9222";
const APP = process.env.BROWSER_SMOKE_URL || "http://127.0.0.1:3000";
const TEST_MINT = "7YttLkHDoV7WJpV8R1F5r4PpWn2YxQ3Zs6AbCdEfGh12";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url, options, attempts = 60) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function openCdpPage() {
  const target = await waitForJson(`${CHROME}/json/new?about:blank`, { method: "PUT" });
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result.value;
  }

  async function setViewport(width, height, mobile) {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
  }

  async function waitFor(expression, attempts = 80) {
    for (let i = 0; i < attempts; i += 1) {
      if (await evaluate(expression)) return;
      await sleep(125);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  async function navigate(url = APP) {
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Page.navigate", { url });
    await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('.alpha-shell'))");
  }

  async function clickAt(x, y, clickCount = 1) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount });
  }

  async function doubleClickAt(x, y) {
    await clickAt(x, y, 1);
    await sleep(90);
    await clickAt(x, y, 2);
  }

  async function drag(x1, y1, x2, y2) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + (x2 - x1) * 0.45, y: y1 + (y2 - y1) * 0.45, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x2, y: y2, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
  }

  async function screenshot(path) {
    const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    fs.writeFileSync(path, Buffer.from(result.data, "base64"));
  }

  return { ws, send, evaluate, setViewport, waitFor, navigate, clickAt, doubleClickAt, drag, screenshot };
}

const snapshot = {
  fetchedAt: new Date().toISOString(),
  stale: false,
  warming: false,
  network: { swaps1h: 42 },
  alerts: [],
  hotPath: [],
  recentEvents: Array.from({ length: 18 }, (_, i) => ({
    mint: i % 2 === 0 ? TEST_MINT : "5OverlapHype111111111111111111111111111111111",
    symbol: i % 2 === 0 ? "BTEST" : "HYPE",
    kind: i % 3 === 0 ? "surge" : "buy-pressure",
    deltaTrades: 9 + i,
    deltaVolume: 12000 + i * 1300,
    hypeDelta: 5 + (i % 5),
    at: new Date(Date.now() - i * 1000).toISOString(),
  })),
  flows: [],
  tokens: [
    {
      mint: TEST_MINT,
      name: "Browser Test",
      symbol: "BTEST",
      dex: "raydium",
      pairAddress: "BrowserPair111",
      priceUsd: 0.00123,
      marketCap: 420000,
      liquidityUsd: 96000,
      volume1h: 35000,
      volume24h: 290000,
      buys1h: 81,
      sells1h: 34,
      trades1h: 115,
      priceChange1h: 8.2,
      priceChange24h: 24.4,
      boost: 7,
      hypeScore: 72,
      traffic: "in",
      netFlowUsd1h: 14800,
      activityDelta: 12,
      hypeDelta: 6,
      hypeVelocity: 1.4,
      hypeAcceleration: 0.22,
      observedBuyPressure15m: 72,
      liquidityChangePct: 4.8,
      trendPersistenceScore: 84,
      trafficEvidence: "usable",
      holderGrowthPct: 4.1,
      holderObservedAt: new Date().toISOString(),
      opportunityScore: 81,
      signalConfidenceScore: 82,
      manipulationRiskScore: 28,
      capitalFlowScore: 78,
      momentumScore: 74,
      divergenceSignal: "bullish",
      opportunityCoverage: "7/8 signal families observed",
      opportunityFactors: [{ label: "Hype", points: 14, evidence: "Hype 72/100" }],
      trafficSample: {
        observedAt: new Date().toISOString(),
        pool: "BrowserPair111",
        pools: ["BrowserPair111"],
        coverage: "partial",
        evidence: "usable",
        failures: {},
        scans: 2,
        listedSignatures: 18,
        parsedTransactions: 18,
        recognizedTransactions: 18,
        directRecognizedTransactions: 18,
        routedRecognizedTransactions: 0,
        unavailableTransactions: 0,
        unrecognizedTransactions: 0,
        limitedScans: 0,
        rowLimitReached: false,
        windows: {
          "15": { swaps: 18, buys: 18, sells: 0, buyers: 18, sellers: 0, netUsd: 18900, quickResellers: 0, newBuyers: 18, top3BuyerSharePct: 31 },
          "30": { swaps: 18, buys: 18, sells: 0, buyers: 18, sellers: 0, netUsd: 18900, quickResellers: 0, newBuyers: 18, top3BuyerSharePct: 31 },
          "60": { swaps: 18, buys: 18, sells: 0, buyers: 18, sellers: 0, netUsd: 18900, quickResellers: 0, newBuyers: 18, top3BuyerSharePct: 31 },
        },
        recentBuys: Array.from({ length: 18 }, (_, i) => ({
          signature: `browser-buy-${i}`,
          wallet: `7xGBrowserSmart${String(i % 4).padStart(2, "0")}4b`,
          usdValue: 700 + i * 125,
          quoteMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          quoteAmount: 700 + i * 125,
          blockAt: new Date(Date.now() - i * 1000).toISOString(),
          pool: "BrowserPair111",
          evidence: i % 4 === 0 ? "routed" : "direct",
          program: i % 4 === 0 ? "Jupiter v6 route" : "Browser DEX",
          whale: i === 0,
          walletPctSupply: i === 0 ? 1.4 : null,
        })),
        recentSells: Array.from({ length: 6 }, (_, i) => ({
          signature: `browser-sell-${i}`,
          wallet: `9xSBrowserWallet${String(i).padStart(2, "0")}8z`,
          usdValue: 450 + i * 90,
          quoteMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          quoteAmount: 450 + i * 90,
          blockAt: new Date(Date.now() - i * 1200).toISOString(),
          pool: "BrowserPair111",
          evidence: "direct",
          program: "Browser DEX",
          whale: false,
          walletPctSupply: null,
        })),
        note: "browser fixture",
      },
    },
    {
      mint: "9AbCdEfGh12YttLkHDoV7WJpV8R1F5r4PpWn2YxQ3Zs6",
      name: "Second Browser Test",
      symbol: "BTWO",
      dex: "orca",
      pairAddress: "BrowserPair222",
      priceUsd: 0.0042,
      marketCap: 280000,
      liquidityUsd: 73000,
      volume1h: 18000,
      volume24h: 170000,
      buys1h: 29,
      sells1h: 42,
      trades1h: 71,
      priceChange1h: -3.2,
      priceChange24h: -9.6,
      boost: 2,
      hypeScore: 44,
      traffic: "out",
      netFlowUsd1h: -6200,
      activityDelta: -3,
      hypeDelta: -2,
    },
    {
      mint: "5OverlapHype111111111111111111111111111111111",
      name: "Overlap Hype",
      symbol: "HYPE",
      dex: "raydium",
      pairAddress: "BrowserPair333",
      priceUsd: 0.00125,
      marketCap: 420000,
      liquidityUsd: 112000,
      volume1h: 64000,
      volume24h: 510000,
      buys1h: 140,
      sells1h: 38,
      trades1h: 178,
      priceChange1h: 8.2,
      priceChange24h: 31.1,
      boost: 11,
      hypeScore: 94,
      hypeVelocity: -1.2,
      hypeAcceleration: -0.18,
      observedBuyPressure15m: 48,
      liquidityChangePct: -3,
      trendPersistenceScore: 76,
      trafficEvidence: "usable",
      opportunityScore: 67,
      signalConfidenceScore: 73,
      manipulationRiskScore: 54,
      capitalFlowScore: 49,
      momentumScore: 63,
      traffic: "in",
      netFlowUsd1h: 28700,
      activityDelta: 34,
      hypeDelta: 14,
    },
  ],
};


for (let i=0;i<29;i+=1) snapshot.tokens.push({
  mint:"ExtraBrowserMint"+String(i).padStart(2,"0")+"111111111111111111111111",
  name:"Extra Browser "+i,symbol:"X"+i,dex:"raydium",pairAddress:"ExtraPair"+i,
  priceUsd:.001,marketCap:50000+i*1000,liquidityUsd:12000,volume1h:500+i*50,volume24h:5000,
  buys1h:4+i%3,sells1h:3+i%2,trades1h:8+i%4,priceChange1h:0,priceChange24h:0,boost:0,
  hypeScore:10+i,traffic:"flat",netFlowUsd1h:0,activityDelta:0,hypeDelta:0,
});


const intelligenceFixture = decisionTerminalFixture(TEST_MINT);

const page = await openCdpPage();

try {
  await page.setViewport(390, 844, true);
  await page.navigate();
  await page.evaluate(`localStorage.setItem("solanabubble:market-snapshot:free", ${JSON.stringify(JSON.stringify(snapshot))})`);
  await page.navigate();
  await page.waitFor("document.querySelectorAll('.market-token-bubble').length >= 2");
  await installDecisionFixture(page,intelligenceFixture);


  const mobileInitial = await page.evaluate(`(() => {
    const nav = document.querySelector(".alpha-sidebar");
    const searchToggle = document.querySelector(".mobile-search-toggle");
    const filterToggle = document.querySelector(".mobile-tools-toggle");
    const navRect = nav?.getBoundingClientRect();
    const searchStyle = searchToggle ? getComputedStyle(searchToggle) : null;
    const filterStyle = filterToggle ? getComputedStyle(filterToggle) : null;
    return {
      width: innerWidth,
      docWidth: document.documentElement.scrollWidth,
      navBottom: navRect?.bottom ?? -1,
      navTop: navRect?.top ?? -1,
      searchVisible: Boolean(searchToggle && searchStyle?.display !== "none"),
      filterVisible: Boolean(filterToggle && filterStyle?.display !== "none"),
    };
  })()`);

  assert.equal(mobileInitial.searchVisible, true, "mobile search toggle must be visible");
  assert.equal(mobileInitial.filterVisible, true, "mobile filter toggle must be visible");
  assert.ok(mobileInitial.docWidth <= mobileInitial.width + 1, "mobile layout must not overflow horizontally");
  assert.ok(Math.abs(mobileInitial.navBottom - 844) <= 2, "bottom navigation must stay inside the viewport");
  assert.ok(mobileInitial.navTop >= 760, "bottom navigation must remain thumb reachable");

  await checkFlowTrajectoryUi(page);

  await proveObservedAtImpulses(page, TEST_MINT);
  console.log("smoke: observed-at-live-impulses");

  assert.match(await page.evaluate("document.querySelector('.market-live-latency')?.textContent || ''"), /Live|Delayed|Snapshot/);
  assert.equal(await page.evaluate("document.querySelector('.market-pan-surface')?.getAttribute('data-lod')"), "mid");
  await page.evaluate("document.querySelector('.capital-flow-toggle')?.click()");
  assert.equal(await page.evaluate("document.querySelector('.market-pan-surface')?.getAttribute('data-capital-flow-only')"), "true");
  await page.evaluate("document.querySelector('.capital-flow-toggle')?.click()");
  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Zoom out']")?.click()`);
  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Zoom out']")?.click()`);
  assert.equal(await page.evaluate("document.querySelector('.market-pan-surface')?.getAttribute('data-lod')"), "far");
  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Reset zoom']")?.click()`);
  await page.waitFor("document.querySelector('.market-pan-surface')?.getAttribute('data-lod') === 'mid'");

  const fixedBefore = await page.evaluate(`(() => {
    const el = document.querySelector(".market-token-bubble");
    const rect = el?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  await sleep(700);
  const fixedAfter = await page.evaluate(`(() => {
    const el = document.querySelector(".market-token-bubble");
    const rect = el?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  assert.ok(fixedBefore && fixedAfter);
  assert.ok(Math.abs(fixedAfter.x - fixedBefore.x) < 0.5, "coin x position must stay fixed in the left flow column");
  assert.ok(Math.abs(fixedAfter.y - fixedBefore.y) < 0.5, "coin y position must stay fixed in the flow layout");

  const declutterState = await page.evaluate(`(() => {
    const bubbles = [...document.querySelectorAll(".market-token-bubble")].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        r: rect.width / 2,
      };
    });
    let minimumClearance = Infinity;
    for (let i = 0; i < bubbles.length; i += 1) {
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const a = bubbles[i];
        const b = bubbles[j];
        const clearance = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
        minimumClearance = Math.min(minimumClearance, clearance);
      }
    }
    return { minimumClearance };
  })()`);
  assert.ok(declutterState.minimumClearance >= 55, "left-side coin layout must keep a readable visual gap");

  const mobileMapBounds = await page.evaluate(`(() => {
    const map = document.querySelector(".market-map")?.getBoundingClientRect();
    const bubbles = [...document.querySelectorAll(".market-token-bubble")].map((el) => el.getBoundingClientRect());
    const ticks = [...document.querySelectorAll(".wave-strength-tick")].map((el) => el.getBoundingClientRect());
    if (!map) return { bubblesInside: false, scaleInside: false, coinsOnLeft: false };
    const inside = (rect, pad = 1) =>
      rect.left >= map.left + pad &&
      rect.right <= map.right - pad &&
      rect.top >= map.top + pad &&
      rect.bottom <= map.bottom - pad;
    return {
      bubblesInside: bubbles.length > 0 && bubbles.every((rect) => inside(rect, 1)),
      scaleInside: ticks.length === 9 && ticks.every((rect) => inside(rect, 1)),
      coinsOnLeft: bubbles.length > 0 && bubbles.every((rect) => rect.left + rect.width / 2 < map.left + map.width * 0.48),
    };
  })()`);
  assert.equal(mobileMapBounds.bubblesInside, true, "coins inside map");
  assert.equal(mobileMapBounds.scaleInside, true, "strength scale visible");
  assert.equal(mobileMapBounds.coinsOnLeft, true, "coins stay left");
  console.log("smoke: focus-layout");

  await page.evaluate("document.querySelector('.mobile-search-toggle')?.click()");
  await page.waitFor("Boolean(document.querySelector('.lovable-header-search.is-mobile-open'))");
  await page.evaluate("document.querySelector('.mobile-search-toggle')?.click()");
  await page.evaluate("document.querySelector('.mobile-tools-toggle')?.click()");
  await page.waitFor("Boolean(document.querySelector('.market-tools-drawer.is-open'))");
  await page.evaluate("document.querySelector('.mobile-tools-toggle')?.click()");

  assert.equal(await page.evaluate("document.querySelectorAll('.rail-chart').length"),3,"desktop/mobile market rail must expose exactly three primary charts");
  assert.equal(await page.evaluate("document.querySelector('.sidebar-secondary')?.hasAttribute('open')"),false,"secondary alerts/live activity must stay collapsed by default");

  const bubble = await page.evaluate(`(() => {
    const el = document.querySelector('.market-token-bubble[aria-label^="BTEST:"]');
    const rect = el?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  assert.ok(bubble, "BTEST bubble must have a browser position");

  await page.clickAt(bubble.x, bubble.y);
  await page.waitFor("Boolean(document.querySelector('.token-quick-actions-overlay'))");
  const quick = await page.evaluate(`(() => {
    const panel = document.querySelector(".token-quick-actions-overlay");
    const rect = panel?.getBoundingClientRect();
    const hrefs = [...(panel?.querySelectorAll("a") || [])].map((a) => a.href);
    return {
      text: panel?.textContent || "",
      hrefs,
      inside: Boolean(rect && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
    };
  })()`);
  assert.match(quick.text, /FoMo/);
  assert.match(quick.text, /GmGn/);
  assert.match(quick.text, /Details/);
  assert.match(quick.text, /Holders/);
  assert.ok(quick.hrefs.some((href) => href.includes(TEST_MINT)), "quick links must preserve the selected mint");
  assert.equal(quick.inside, true, "quick actions must stay inside the mobile viewport");
  console.log("smoke: quick-actions");

  await page.evaluate("document.querySelector('.quick-detail-action')?.click()");
  await page.waitFor("Boolean(document.querySelector('.reference-market-side.is-mobile-open'))");
  const detailsOpen = await page.evaluate(`(() => {
    const el = document.querySelector(".reference-market-side.is-mobile-open");
    return Boolean(el && getComputedStyle(el).display !== "none");
  })()`);
  assert.equal(detailsOpen, true, "mobile token details must open only from the explicit Details action");
  assert.match(await page.evaluate("document.querySelector('.signal-summary-grid')?.textContent || ''"), /Opportunity/);
  assert.match(await page.evaluate("document.querySelector('.signal-summary-grid')?.textContent || ''"), /Capital Flow/);
  await checkDecisionTerminal(page);

  assert.ok(await page.evaluate("Boolean(document.querySelector('.token-sparkline'))"),"selected token must keep the trend chart");
  assert.ok(await page.evaluate("Boolean(document.querySelector('.token-flow-chart'))"),"selected token must show compact buy/sell flow chart");
  assert.equal(await page.evaluate("document.querySelector('.compact-advanced-details')?.hasAttribute('open')"),false,"advanced token details must be collapsed by default");
  await page.evaluate("document.querySelector('.market-back')?.click()");
  await page.waitFor("!document.querySelector('.reference-market-side.is-mobile-open')");
  await page.screenshot("/tmp/solanabubble-mobile.png");
  console.log("smoke: mobile-details");

  const dragBubble = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll(".market-token-bubble")];
    const picked = els.find((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return x >= 40 && x <= innerWidth - 80 && y >= 140 && y <= innerHeight - 150;
    }) || els[0];
    const rect = picked?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  assert.ok(dragBubble);
  const beforeDragPath = await page.evaluate("location.pathname");
  await page.drag(dragBubble.x, dragBubble.y, Math.min(360, dragBubble.x + 54), Math.min(700, dragBubble.y + 38));
  await sleep(180);
  const afterDragPath = await page.evaluate("location.pathname");
  assert.equal(afterDragPath, beforeDragPath, "dragging a bubble must not open a token route");

  const panPoint = await page.evaluate(`(() => {
    const svg = document.querySelector(".market-pan-surface");
    const rect = svg?.getBoundingClientRect();
    if (!rect) return null;
    const candidates = [];
    for (let y = rect.top + 110; y < rect.bottom - 90; y += 42) {
      for (let x = rect.left + 24; x < rect.right - 24; x += 42) {
        const hit = document.elementFromPoint(x, y);
        if (!hit) continue;
        if (!svg.contains(hit) && hit !== svg) continue;
        if (hit.closest?.(".market-node-group, .token-quick-actions-overlay, .market-zoom-controls, .market-legend")) continue;
        candidates.push({ x, y });
      }
    }
    return candidates[0] || null;
  })()`);
  assert.ok(panPoint, "a free map background point must be available for panning");
  const panBefore = await page.evaluate("document.querySelector('.market-pan-layer')?.getAttribute('transform') || ''");
  await page.drag(panPoint.x, panPoint.y, panPoint.x - 48, panPoint.y - 42);
  await sleep(180);
  const panAfter = await page.evaluate("document.querySelector('.market-pan-layer')?.getAttribute('transform') || ''");
  assert.notEqual(panAfter, panBefore, "dragging the map background must pan the map");
  console.log("smoke: pan");
  assert.equal(await page.evaluate("location.pathname"), "/", "panning must not open a token route");

  await page.evaluate(`(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (String(input).includes("/api/tokens/track")) {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return originalFetch(input, init);
    };
  })()`);
  const doubleBubble = await page.evaluate(`(() => {
    const el = document.querySelector('.market-token-bubble[aria-label^="BTEST:"]');
    const rect = el?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  assert.ok(doubleBubble, "BTEST bubble must remain clickable after pan");
  await page.doubleClickAt(doubleBubble.x, doubleBubble.y);
  await page.waitFor(`location.pathname === "/token/${TEST_MINT}"`);
  assert.equal(await page.evaluate("location.pathname"), `/token/${TEST_MINT}`, "double click must open the Holder Map route");
  console.log("smoke: holder-route");

  await page.setViewport(1440, 900, false);
  await page.navigate();
  await page.waitFor("document.querySelectorAll('.market-token-bubble').length >= 2");

  const desktop = await page.evaluate(`(() => {
    const sidebar = document.querySelector(".alpha-sidebar");
    const side = document.querySelector(".reference-market-side");
    const searchToggle = document.querySelector(".mobile-search-toggle");
    const sidebarRect = sidebar?.getBoundingClientRect();
    return {
      width: innerWidth,
      docWidth: document.documentElement.scrollWidth,
      sidebarWidth: sidebarRect?.width ?? 0,
      sideVisible: Boolean(side && getComputedStyle(side).display !== "none"),
      mobileSearchHidden: Boolean(searchToggle && getComputedStyle(searchToggle).display === "none"),
    };
  })()`);

  assert.ok(desktop.sidebarWidth >= 180, "desktop sidebar must retain the Lovable workspace layout");
  assert.equal(desktop.sideVisible, true, "desktop market intelligence rail must remain visible");
  assert.equal(desktop.mobileSearchHidden, true, "mobile search toggle must stay hidden on desktop");
  assert.ok(desktop.docWidth <= desktop.width + 1, "desktop layout must not overflow horizontally");
  const desktopCometCount = await page.evaluate("document.querySelectorAll('.targeted-comet').length");
  assert.equal(desktopCometCount, 0, "desktop idle state must not replay retained trades");
  assert.equal(await page.evaluate("Number(document.querySelector('.market-pan-surface')?.getAttribute('data-visible-tokens') || 0)"), 12, "desktop map must render twelve focus tokens at normal zoom");
  assert.equal(await page.evaluate("document.querySelectorAll('.living-wave-path').length"), 12, "all twelve normal-zoom focus tokens must have a living wave");

  await checkAdaptiveZoomDensity(page);
  console.log("smoke: adaptive-zoom-density");

  const desktopBubble = await page.evaluate(`(() => {
    const el = document.querySelector('.market-token-bubble[aria-label^="BTEST:"]');
    const rect = el?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  assert.ok(desktopBubble);
  await page.clickAt(desktopBubble.x, desktopBubble.y);
  await page.waitFor("Boolean(document.querySelector('.token-quick-actions-overlay'))");
  const desktopQuickInside = await page.evaluate(`(() => {
    const rect = document.querySelector(".token-quick-actions-overlay")?.getBoundingClientRect();
    const map = document.querySelector(".market-map")?.getBoundingClientRect();
    return Boolean(rect && map && rect.left >= map.left && rect.top >= map.top && rect.right <= map.right && rect.bottom <= map.bottom);
  })()`);
  assert.equal(desktopQuickInside, true, "desktop quick actions must stay within the map");

  // Regression: EARLY is rendered in the SAME SVG as continuously moving legacy GOOD waves.
  const earlyMint="7YttLkHDoV7WJpV8R1F5r4PpWn2YxQ3Zs6AbCdEfGh13";
  await page.evaluate(`(() => {
    const originalFetch=window.fetch.bind(window);
    const fixture={ok:true,observedAt:new Date().toISOString(),pools:[{
      id:"solana_early_fixture",mint:${JSON.stringify(earlyMint)},name:"EARLYTEST / SOL",ageMinutes:8,
      liquidityUsd:88000,buys5m:26,sells5m:9,stage:"early-watch",
      reasons:["Independent buyers and mint security not verified"],
      sourceUrl:"https://www.geckoterminal.com/solana/pools"
    }]};
    window.fetch=(input,options)=>String(input).includes("/api/market/early")
      ? Promise.resolve(new Response(JSON.stringify(fixture),{status:200,headers:{"content-type":"application/json"}}))
      : originalFetch(input,options);
    document.querySelector('[aria-label="Обнови EARLY"]')?.click();
  })()`);
  await page.waitFor("document.querySelectorAll('.early-living-wave').length === 1");
  const united=await page.evaluate(`(() => ({
    svgCount:document.querySelectorAll('.market-pan-surface').length,
    goodWaveCount:document.querySelectorAll('.living-wave-path').length,
    earlyWaveCount:document.querySelectorAll('.early-living-wave').length,
    goodAnimated:document.querySelector('.living-wave-path')?.getAttribute('data-shape-motion'),
    earlyAnimated:document.querySelector('.early-living-wave')?.getAttribute('data-shape-motion'),
    earlyIsLiveSwap:document.querySelectorAll('.early-wave-layer .flow-trade-dot').length,
    earlyWaveRunning:getComputedStyle(document.querySelector('.early-living-wave')).animationPlayState,
    mode:document.querySelector('.market-pan-surface')?.getAttribute('data-map-mode'),
  }))()`);
  assert.equal(united.svgCount,1,"GOOD and EARLY must use one SVG map, not overlay two charts");
  assert.equal(united.mode,"unified");
  assert.ok(united.goodWaveCount>=2,"original GOOD wave engine must remain visible");
  assert.equal(united.earlyWaveCount,1,"EARLY candidate must appear opposite GOOD");
  assert.equal(united.goodAnimated,"morph");
  assert.equal(united.earlyAnimated,"morph");
  assert.equal(united.earlyWaveRunning,"running");
  assert.equal(united.earlyIsLiveSwap,0,"sampled EARLY must not fabricate real trade markers");

  await page.evaluate("document.querySelector('.early-wave-group [role=button]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  await page.waitFor("Boolean(document.querySelector('.early-token-quick-actions'))");
  const earlyLinks=await page.evaluate("Array.from(document.querySelectorAll('.early-token-quick-actions a')).map(a=>a.href)");
  assert.ok(earlyLinks.some(h=>h.includes("fomo.family/coin")),"EARLY must provide FoMo action");
  assert.ok(earlyLinks.some(h=>h.includes("gmgn.ai/sol/token/")),"EARLY must provide GmGn action");
  await page.evaluate("document.querySelector('.go-live-control')?.click()");
  await page.waitFor("document.querySelector('.go-live-control')?.textContent?.includes('Go Live')");
  assert.equal(await page.evaluate("document.querySelector('.living-wave-path')?.getAttribute('data-shape-motion')"),"morph","data pause must not freeze visual wave animation");
  assert.equal(await page.evaluate("document.querySelector('.early-living-wave')?.getAttribute('data-shape-motion')"),"morph","EARLY wave animation must survive a data pause");
  console.log("smoke: unified-dual-wave-live-motion");

  await page.screenshot("/tmp/solanabubble-desktop.png");
  console.log("Browser smoke passed: event-only trade impulses + pulsing token circles + v5 flows.");
} finally {
  page.ws.close();
}
