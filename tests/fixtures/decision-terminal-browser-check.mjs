import assert from "node:assert/strict";

export async function installDecisionFixture(page,fixture){
 await page.evaluate(`(() => {
   const originalFetch=window.fetch.bind(window);
   const fixture=${JSON.stringify(fixture)};
   window.fetch=(input,init)=>String(input).includes("/api/market/intelligence")
     ? Promise.resolve(new Response(JSON.stringify(fixture),{status:200,headers:{"content-type":"application/json"}}))
     : originalFetch(input,init);
 })()`);
}

export async function checkWalletCometProfile(page){
 await page.evaluate("document.querySelector('.targeted-comet-smart .targeted-comet-body')?.dispatchEvent(new MouseEvent('click',{bubbles:true}))");
 await page.waitFor("Boolean(document.querySelector('.targeted-comet-detail'))");
 assert.match(await page.evaluate("document.querySelector('.targeted-comet-detail')?.textContent || ''"),/Smart|Constructive|Wallet net|Wallet score/);
 await page.evaluate("document.querySelector('.targeted-comet-detail .detail-close')?.dispatchEvent(new MouseEvent('click',{bubbles:true}))");
}

export async function checkDecisionTerminal(page){
 await page.waitFor("document.querySelector('[aria-label=\"Decision Terminal v5\"]')?.textContent?.includes('STRONG BUY')");
 const terminalText=await page.evaluate("document.querySelector('[aria-label=\"Decision Terminal v5\"]')?.textContent || ''");
 assert.match(terminalText,/Why now|Strong setup/);
 assert.match(terminalText,/GOOD v2/);
 assert.ok(await page.evaluate("Boolean(document.querySelector('[aria-label=\"Time Machine replay\"]'))"),"Decision Terminal must expose Time Machine replay");
 assert.ok(await page.evaluate("Boolean(document.querySelector('input[aria-label=\"Time Machine position\"]'))"),"Time Machine must expose a replay slider");
}
