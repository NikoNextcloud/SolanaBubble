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
      traceBuyDots: document.querySelectorAll(".flow-trade-buy").length,
      traceSellDots: document.querySelectorAll(".flow-trade-sell").length,
      strengthTickCount: document.querySelectorAll(".wave-strength-tick").length,
      visibleTokenCount: Number(document.querySelector(".market-pan-surface")?.getAttribute("data-visible-tokens") || 0),
      focusInfo: document.querySelector("[class*=focusInfo]")?.textContent || "",
      livingWaveCount: document.querySelectorAll(".living-wave-path").length,
      livingHeadCount: document.querySelectorAll(".living-wave-head").length,
      waveMotion: document.querySelector(".living-wave-layer")?.getAttribute("data-wave-motion"),
      movingParticleCount: document.querySelectorAll(".moving-flow-particle animateMotion").length,
      opportunityWaveCount: document.querySelectorAll(".opportunity-wave-path").length,
      strongOpportunityCount: document.querySelectorAll('.opportunity-wave-group[data-strength="strong"]').length,
      hypeAuraCount: document.querySelectorAll(".token-hype-aura").length,
      hypeFlareCount: document.querySelectorAll(".token-hype-flare").length,
      morphAnimationCount: document.querySelectorAll(".living-wave-path > animate").length,
      particleMpathCount: document.querySelectorAll(".moving-flow-particle animateMotion mpath").length,
      opportunityAnimations: [...document.querySelectorAll(".opportunity-wave-path")].map((el) => getComputedStyle(el).animationPlayState),
      animationStates: [...document.querySelectorAll(".living-wave-path")].map((el) => {
        const style = getComputedStyle(el);
        return { name: style.animationName, state: style.animationPlayState, offset: style.strokeDashoffset };
      }),
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
  assert.equal(ui.waveMotion, "continuous", "living-wave layer must use continuous motion");
  assert.ok(ui.animationStates.every((row) => row.name !== "none" && row.state === "running"), "all focus-token waves must be actively animated");
  assert.ok(ui.movingParticleCount >= 4, "retained real BUY/SELL samples must travel along the living waves");
  assert.ok(ui.opportunityWaveCount >= 1, "qualified token must render a white opportunity wave");
  assert.ok(ui.strongOpportunityCount >= 1, "high-confidence low-risk fixture must render a strong opportunity wave");
  assert.ok(ui.hypeAuraCount >= 1, "high-hype token must render a stronger hype aura");
  assert.ok(ui.hypeFlareCount >= 1, "high-hype token must render a bright flare");
  assert.equal(ui.morphAnimationCount, ui.visibleTokenCount, "every visible wave must morph its SVG shape");
  assert.ok(ui.particleMpathCount >= 4, "real BUY/SELL particles must follow the morphing wave path");
  assert.ok(ui.opportunityAnimations.every((state) => state === "running"), "opportunity waves must stay animated");
  const offsetBefore = ui.animationStates[0]?.offset;
  const shapeBefore = await page.evaluate(`(() => {
    const path=document.querySelector(".living-wave-path");
    if(!path)return null;
    const point=path.getPointAtLength(path.getTotalLength()*.37);
    return {x:point.x,y:point.y};
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 420));
  const offsetAfter = await page.evaluate("getComputedStyle(document.querySelector('.living-wave-path')).strokeDashoffset");
  const shapeAfter = await page.evaluate(`(() => {
    const path=document.querySelector(".living-wave-path");
    if(!path)return null;
    const point=path.getPointAtLength(path.getTotalLength()*.37);
    return {x:point.x,y:point.y};
  })()`);
  assert.notEqual(offsetAfter, offsetBefore, "living wave dash motion must visibly advance over time");
  assert.ok(shapeBefore&&shapeAfter&&Math.abs(shapeAfter.y-shapeBefore.y)>.02, "living wave geometry must morph over time, not remain rigid");
}
