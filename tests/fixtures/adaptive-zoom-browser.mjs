import assert from "node:assert/strict";

export async function checkAdaptiveZoomDensity(page){
  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Zoom out']")?.click()`);
  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Zoom out']")?.click()`);
  await page.waitFor("Number(document.querySelector('.market-pan-surface')?.getAttribute('data-visible-tokens') || 0) === 18");
  assert.equal(await page.evaluate("document.querySelector('.market-pan-surface')?.getAttribute('data-focus-capacity')"),"18");

  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Zoom out']")?.click()`);
  await page.waitFor("Number(document.querySelector('.market-pan-surface')?.getAttribute('data-visible-tokens') || 0) === 24");

  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Zoom out']")?.click()`);
  await page.waitFor("Number(document.querySelector('.market-pan-surface')?.getAttribute('data-visible-tokens') || 0) === 30");

  const state=await page.evaluate(`(() => {
    const bubbles=[...document.querySelectorAll(".market-token-bubble")].map((el)=>{
      const rect=el.getBoundingClientRect();
      return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,r:rect.width/2};
    });
    let clearance=Infinity;
    for(let i=0;i<bubbles.length;i++)for(let j=i+1;j<bubbles.length;j++){
      const a=bubbles[i],b=bubbles[j];
      clearance=Math.min(clearance,Math.hypot(a.x-b.x,a.y-b.y)-a.r-b.r);
    }
    return {
      count:bubbles.length,
      waves:document.querySelectorAll(".living-wave-path").length,
      columns:new Set(bubbles.map(b=>Math.round(b.x))).size,
      clearance,
      hypeSecondary:document.querySelectorAll(".token-hype-aura-secondary").length,
    };
  })()`);

  assert.equal(state.count,30,"deep zoom-out must reveal thirty focus tokens");
  assert.equal(state.waves,30,"every zoomed-out token must keep a living wave");
  assert.ok(state.columns>=3,"dense zoom-out layout must expand into at least three token columns");
  assert.ok(state.clearance>=5,"dense zoom-out token circles must not overlap");
  assert.ok(state.hypeSecondary>=1,"extreme hype token must render the stronger secondary beacon");

  await page.evaluate(`document.querySelector(".market-zoom-controls button[aria-label='Reset zoom']")?.click()`);
  await page.waitFor("Number(document.querySelector('.market-pan-surface')?.getAttribute('data-visible-tokens') || 0) === 12");
}
