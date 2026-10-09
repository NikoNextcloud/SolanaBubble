import assert from "node:assert/strict";

export async function checkUnifiedWaveMap(page){
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

}
