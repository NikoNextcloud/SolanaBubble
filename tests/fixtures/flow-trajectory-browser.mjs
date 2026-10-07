import assert from "node:assert/strict";

export async function checkFlowTrajectoryUi(page) {
  const ui = await page.evaluate(`(() => {
    const map = document.querySelector(".market-map")?.getBoundingClientRect();
    const full = document.querySelector(".market-fullscreen-button");
    const rect = full?.getBoundingClientRect();
    const style = full ? getComputedStyle(full) : null;
    return {
      axisTitle: [...document.querySelectorAll(".wave-axis-title")].map((el) => el.textContent).join(" · "),
      fullscreenButton: Boolean(full),
      fullscreenVisible: Boolean(full && rect && style?.display !== "none" && style?.visibility !== "hidden" && rect.width > 0 && rect.height > 0),
      fullscreenInsideMap: Boolean(map && rect && rect.left >= map.left && rect.right <= map.right && rect.top >= map.top && rect.bottom <= map.bottom),
      cometCount: document.querySelectorAll(".targeted-comet").length,
      buyWaveCount: document.querySelectorAll(".wave-buy-path").length,
      sellWaveCount: document.querySelectorAll(".wave-sell-path").length,
      pulseHaloCount: document.querySelectorAll(".token-pulse-halo").length,
      eventOnly: document.querySelector(".targeted-comet-layer")?.getAttribute("data-event-only"),
      realSwapTrace: document.querySelector(".flow-history-layer")?.getAttribute("data-real-swaps-only"),
      traceSegments: document.querySelectorAll(".flow-trace-segment").length,
      traceBuyDots: document.querySelectorAll(".flow-trade-buy").length,
      traceSellDots: document.querySelectorAll(".flow-trade-sell").length,
      strengthTickCount: document.querySelectorAll(".wave-strength-tick").length,
      visibleTokenCount: Number(document.querySelector(".market-pan-surface")?.getAttribute("data-visible-tokens") || 0),
      focusInfo: document.querySelector("[class*=focusInfo]")?.textContent || "",
      livingWaveCount: document.querySelectorAll(".living-wave-path").length,
      livingHeadCount: document.querySelectorAll(".living-wave-head").length,
      wavePhase: document.querySelector(".living-wave-layer")?.getAttribute("data-wave-phase"),
    };
  })()`);
  assert.match(ui.axisTitle, /TOKENS/);
  assert.match(ui.axisTitle, /ORDER FLOW/);
  assert.match(ui.axisTitle, /STRENGTH/);
  assert.equal(ui.buyWaveCount, 0, "idle market must not render BUY impulses");
  assert.equal(ui.sellWaveCount, 0, "idle market must not render SELL impulses");
  assert.equal(ui.cometCount, 0, "retained traffic must not replay as fake live impulses");
  assert.equal(ui.eventOnly, "true", "fresh impulse layer must be event-only");
  assert.equal(ui.realSwapTrace, "true", "trajectory history must be built from real swaps only");
  assert.ok(ui.traceSegments >= 4, "retained real swaps must form a visible order-flow trajectory");
  assert.ok(ui.traceBuyDots >= 1, "real BUY swaps must render green trajectory dots");
  assert.ok(ui.traceSellDots >= 1, "real SELL swaps must render red trajectory dots");
  assert.ok(ui.pulseHaloCount >= 2, "token circles must keep the pulsing halo");
  assert.equal(ui.strengthTickCount, 9, "strength ticks required");
  assert.ok(ui.visibleTokenCount <= 6, "mobile map must cap focus tokens");
  assert.match(ui.focusInfo, /more available in List/);
  assert.equal(ui.fullscreenButton, true, "map must expose a fullscreen control");
  assert.equal(ui.fullscreenVisible, true, "fullscreen control must be visibly reachable");
  assert.equal(ui.fullscreenInsideMap, true, "fullscreen control must stay inside the map");
  assert.equal(ui.livingWaveCount, ui.visibleTokenCount, "every visible focus token must have its own living wave");
  assert.equal(ui.livingHeadCount, ui.visibleTokenCount, "every visible focus token must have a moving head marker");
  const phaseBefore = ui.wavePhase;
  await new Promise((resolve) => setTimeout(resolve, 360));
  const phaseAfter = await page.evaluate("document.querySelector('.living-wave-layer')?.getAttribute('data-wave-phase')");
  assert.notEqual(phaseAfter, phaseBefore, "living waves must continuously advance, not remain static");
}
