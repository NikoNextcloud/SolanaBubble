import assert from 'node:assert/strict';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function checkContinuousMotion(page){
  const select=async mode=>{
    await page.evaluate(`(() => {const el=document.querySelector('select[aria-label="Wave motion"]'); if(!el)throw Error('Motion control missing');el.value=${JSON.stringify(mode)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  const sample=()=>page.evaluate(`(() => {
    const svg=document.querySelector('.market-pan-surface');
    return {good:svg.querySelector('.living-wave-path').getAttribute('d'),early:svg.querySelector('.early-living-wave').getAttribute('d'),frame:Number(svg.dataset.motionFrame),state:svg.dataset.motionState,style:svg.dataset.motionStyle,smil:svg.querySelectorAll('animate,animateMotion').length};
  })()`);
  await select('live');
  await page.waitFor("document.querySelector('.market-pan-surface')?.dataset.motionState === 'running'");
  const before=await sample();await sleep(550);const after=await sample();
  assert.notEqual(before.good,after.good,'GOOD geometry must really change, not just its CSS animation flag');
  assert.notEqual(before.early,after.early,'EARLY geometry must really change');
  assert.ok(after.frame>before.frame&&after.frame-before.frame<45,'one throttled frame loop must advance');
  assert.equal(after.smil,0,'motion must not depend on native SMIL support');

  await select('off');
  await page.waitFor("document.querySelector('.market-pan-surface')?.dataset.motionState === 'paused'");
  const paused=await sample();await sleep(450);const still=await sample();
  assert.equal(paused.good,still.good);assert.equal(paused.early,still.early);
  assert.equal(paused.frame,still.frame,'pause must actually cancel the animation loop');
  await select('live');await sleep(450);
  assert.notEqual((await sample()).good,still.good,'explicit play must resume movement');

  await page.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await select('auto');
  await page.waitFor("document.querySelector('.market-pan-surface')?.dataset.motionStyle === 'gentle'");
  const gentle=await sample();await sleep(550);
  assert.notEqual((await sample()).early,gentle.early,'Auto with reduced motion is gentle, not silently frozen');
  await select('live');
  await page.waitFor("document.querySelector('.market-pan-surface')?.dataset.motionStyle === 'live'");

  await page.evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));`);
  await page.waitFor("document.querySelector('.market-pan-surface')?.dataset.motionState === 'background'");
  const hidden=await sample();await sleep(400);assert.equal((await sample()).frame,hidden.frame);
  await page.evaluate(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));`);
  await page.waitFor("document.querySelector('.market-pan-surface')?.dataset.motionState === 'running'");
  await sleep(450);assert.notEqual((await sample()).good,hidden.good,'returning to the tab restarts the same clock');
  await page.send('Emulation.setEmulatedMedia',{features:[]});
  await page.screenshot('/tmp/solanabubble-motion-proof.png');
  console.log('smoke: continuous geometry, bounded loop, pause/resume, reduced-motion override, hidden-tab recovery');
}
