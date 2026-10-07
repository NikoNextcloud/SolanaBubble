export async function proveObservedAtImpulses(page, testMint) {
  await page.evaluate(`(() => {
    const observed = new Date().toISOString();
    const block = new Date(Date.now() - 12000).toISOString();
    const emit = (detail) => window.dispatchEvent(new CustomEvent("solanabubble:browser-smoke-live-event", { detail }));
    const base = {
      quote_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      evidence: "direct",
      program: "Browser DEX",
      block_at: block,
      observed_at: observed,
    };
    emit({...base,mint:"7YttLkHDoV7WJpV8R1F5r4PpWn2YxQ3Zs6AbCdEfGh12",signature:"browser-live-buy",wallet:"BrowserLiveBuyWallet111111111111111111111111",pool:"BrowserPair111",side:"buy",usd_value:4200,quote_amount:4200,whale:true,wallet_pct_supply:1.2});
    emit({...base,mint:"5OverlapHype111111111111111111111111111111111",signature:"browser-live-sell",wallet:"BrowserLiveSellWallet22222222222222222222222",pool:"BrowserPair333",side:"sell",usd_value:1800,quote_amount:1800,whale:false,wallet_pct_supply:null});
  })()`);
  await page.waitFor("document.querySelectorAll('.wave-buy-path').length >= 1 && document.querySelectorAll('.wave-sell-path').length >= 1");
  const proof = await page.evaluate(`(() => ({
    buy: document.querySelectorAll(".wave-buy-path").length,
    sell: document.querySelectorAll(".wave-sell-path").length,
    active: Number(document.querySelector(".market-pan-surface")?.getAttribute("data-active-pulses") || 0),
    visible: Number(document.querySelector(".market-pan-surface")?.getAttribute("data-visible-tokens") || 0),
  }))()`);
  if (proof.buy < 1 || proof.sell < 1 || proof.active < 2 || proof.visible > 6) {
    throw new Error(`live impulse proof failed: ${JSON.stringify(proof)}`);
  }
  await page.screenshot("/tmp/solanabubble-live-impulses.png");
  await new Promise((resolve) => setTimeout(resolve, 900));
  if (!(await page.evaluate("document.querySelectorAll('.wave-buy-path,.wave-sell-path').length >= 2"))) {
    throw new Error("observed_at impulses expired before their arrival TTL");
  }
  await new Promise((resolve) => setTimeout(resolve, 3600));
  await page.waitFor("document.querySelectorAll('.wave-buy-path,.wave-sell-path').length === 0");
}
