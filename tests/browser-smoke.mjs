import assert from "node:assert/strict";
import fs from "node:fs";

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

  return { ws, send, evaluate, setViewport, waitFor, navigate, clickAt, drag, screenshot };
}

const snapshot = {
  fetchedAt: new Date().toISOString(),
  stale: false,
  warming: false,
  network: { swaps1h: 42 },
  alerts: [],
  hotPath: [],
  recentEvents: [],
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
      holderGrowthPct: 4.1,
      holderObservedAt: new Date().toISOString(),
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
  ],
};

const page = await openCdpPage();

try {
  await page.setViewport(390, 844, true);
  await page.navigate();
  await page.evaluate(`localStorage.setItem("solanabubble:market-snapshot:free", ${JSON.stringify(JSON.stringify(snapshot))})`);
  await page.navigate();
  await page.waitFor("document.querySelectorAll('.market-token-bubble').length >= 2");

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

  const coordinateUi = await page.evaluate(`(() => {
    const map = document.querySelector(".market-map")?.getBoundingClientRect();
    const full = document.querySelector(".market-fullscreen-button");
    const rect = full?.getBoundingClientRect();
    const style = full ? getComputedStyle(full) : null;
    return {
      axisTitle: [...document.querySelectorAll(".lovable-coordinate-grid .axis-title")].map((el) => el.textContent).join(" · "),
      fullscreenButton: Boolean(full),
      fullscreenVisible: Boolean(full && rect && style?.display !== "none" && style?.visibility !== "hidden" && rect.width > 0 && rect.height > 0),
      fullscreenInsideMap: Boolean(map && rect && rect.left >= map.left && rect.right <= map.right && rect.top >= map.top && rect.bottom <= map.bottom),
      cometCount: document.querySelectorAll(".market-comet-runner").length,
    };
  })()`);
  assert.match(coordinateUi.axisTitle, /PRICE CHANGE · 1H/);
  assert.match(coordinateUi.axisTitle, /MARKET CAP/);
  assert.equal(coordinateUi.fullscreenButton, true, "map must expose a fullscreen control");
  assert.equal(coordinateUi.fullscreenVisible, true, "fullscreen control must be visibly reachable");
  assert.equal(coordinateUi.fullscreenInsideMap, true, "fullscreen control must stay inside the map");
  assert.ok(coordinateUi.cometCount >= 1, "active tokens must render Lovable-style moving comets");

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
  assert.ok(Math.abs(fixedAfter.x - fixedBefore.x) < 0.5, "planet x position must stay fixed on its data coordinate");
  assert.ok(Math.abs(fixedAfter.y - fixedBefore.y) < 0.5, "planet y position must stay fixed on its data coordinate");

  const mobileMapBounds = await page.evaluate(`(() => {
    const map = document.querySelector(".market-map")?.getBoundingClientRect();
    const bubbles = [...document.querySelectorAll(".market-token-bubble")].map((el) => el.getBoundingClientRect());
    const labels = [...document.querySelectorAll(".reference-node-label")].map((el) => el.getBoundingClientRect());
    if (!map) return { bubblesInside: false, labelsInside: false };
    const inside = (rect, pad = 1) =>
      rect.left >= map.left + pad &&
      rect.right <= map.right - pad &&
      rect.top >= map.top + pad &&
      rect.bottom <= map.bottom - pad;
    return {
      bubblesInside: bubbles.length > 0 && bubbles.every((rect) => inside(rect, 1)),
      labelsInside: labels.length > 0 && labels.every((rect) => inside(rect, 4)),
    };
  })()`);
  assert.equal(mobileMapBounds.bubblesInside, true, "mobile bubbles must not be clipped by the map edges");
  assert.equal(mobileMapBounds.labelsInside, true, "mobile bubble labels must remain readable inside the map");

  await page.evaluate("document.querySelector('.mobile-search-toggle')?.click()");
  await page.waitFor("Boolean(document.querySelector('.lovable-header-search.is-mobile-open'))");
  await page.evaluate("document.querySelector('.mobile-search-toggle')?.click()");
  await page.evaluate("document.querySelector('.mobile-tools-toggle')?.click()");
  await page.waitFor("Boolean(document.querySelector('.market-tools-drawer.is-open'))");
  await page.evaluate("document.querySelector('.mobile-tools-toggle')?.click()");

  const bubble = await page.evaluate(`(() => {
    const els = [...document.querySelectorAll(".market-token-bubble")];
    const picked = els.find((el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return x >= 8 && x <= innerWidth - 8 && y >= 90 && y <= innerHeight - 90;
    }) || els[0];
    const rect = picked?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  assert.ok(bubble, "test bubble must have a browser position");

  await page.evaluate("document.querySelector('.market-token-bubble')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))");
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

  await page.evaluate("document.querySelector('.quick-detail-action')?.click()");
  await page.waitFor("Boolean(document.querySelector('.reference-market-side.is-mobile-open'))");
  const detailsOpen = await page.evaluate(`(() => {
    const el = document.querySelector(".reference-market-side.is-mobile-open");
    return Boolean(el && getComputedStyle(el).display !== "none");
  })()`);
  assert.equal(detailsOpen, true, "mobile token details must open only from the explicit Details action");
  await page.evaluate("document.querySelector('.market-back')?.click()");
  await page.waitFor("!document.querySelector('.reference-market-side.is-mobile-open')");
  await page.screenshot("/tmp/solanabubble-mobile.png");

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
    const el = document.querySelector(".market-token-bubble");
    el?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
  })()`);
  await page.waitFor(`location.pathname === "/token/${TEST_MINT}"`);
  assert.equal(await page.evaluate("location.pathname"), `/token/${TEST_MINT}`, "double click must open the Holder Map route");

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

  const desktopBubble = await page.evaluate(`(() => {
    const el = document.querySelector(".market-token-bubble");
    const rect = el?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
  })()`);
  assert.ok(desktopBubble);
  await page.evaluate("document.querySelector('.market-token-bubble')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))");
  await page.waitFor("Boolean(document.querySelector('.token-quick-actions-overlay'))");
  const desktopQuickInside = await page.evaluate(`(() => {
    const rect = document.querySelector(".token-quick-actions-overlay")?.getBoundingClientRect();
    const map = document.querySelector(".market-map")?.getBoundingClientRect();
    return Boolean(rect && map && rect.left >= map.left && rect.top >= map.top && rect.right <= map.right && rect.bottom <= map.bottom);
  })()`);
  assert.equal(desktopQuickInside, true, "desktop quick actions must stay within the map");

  await page.screenshot("/tmp/solanabubble-desktop.png");
  console.log("Browser smoke passed: Lovable coordinates, fixed pulsing planets, comets, fullscreen control, responsive interactions and pan/zoom.");
} finally {
  page.ws.close();
}
