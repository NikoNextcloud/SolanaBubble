import assert from 'node:assert/strict';
import fs from 'node:fs';

const APP='https://solanabubble.vercel.app';
const CHROME=process.env.CHROME_DEBUG_URL||'http://127.0.0.1:9222';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function json(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});assert.ok(response.ok,`${url}: HTTP ${response.status}`);return response.json();}
const target=await json(CHROME+'/json/new?about:blank',{method:'PUT'});
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
let id=0;const pending=new Map(),exceptions=[];
ws.addEventListener('message',event=>{
  const message=JSON.parse(String(event.data));
  if(message.method==='Runtime.exceptionThrown'&&exceptions.length<10)exceptions.push(message.params.exceptionDetails.text);
  if(!message.id)return;const call=pending.get(message.id);if(!call)return;pending.delete(message.id);clearTimeout(call.timer);
  if(message.error)call.reject(Error(message.error.message));else call.resolve(message.result);
});
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const callId=++id,timer=setTimeout(()=>{pending.delete(callId);reject(Error('CDP timeout: '+method));},15000);
  pending.set(callId,{resolve,reject,timer});ws.send(JSON.stringify({id:callId,method,params}));
});
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;}
async function waitFor(expression){for(let i=0;i<160;i++){if(await evaluate(expression))return;await sleep(250);}throw Error('Production timeout: '+expression);}
const measure=()=>evaluate(`(() => {
 const svg=document.querySelector('.market-pan-surface');
 return {good:[...svg.querySelectorAll('.living-wave-path')].map(p=>p.getAttribute('d')),early:[...svg.querySelectorAll('.early-living-wave')].map(p=>p.getAttribute('d')),state:svg.dataset.motionState,frame:Number(svg.dataset.motionFrame),engine:svg.dataset.motionEngine,width:innerWidth,docWidth:document.documentElement.scrollWidth};
})()`);
try{
  const root=await fetch(APP,{signal:AbortSignal.timeout(15000)});assert.equal(root.status,200);
  const health=await json(APP+'/api/health');assert.equal(health.ok,true,'Production worker health');
  await send('Page.enable');await send('Runtime.enable');
  const reports=[];
  for(const [name,width,height,mobile] of [['desktop',1440,1000,false],['mobile',390,844,true]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:height});
    await send('Page.navigate',{url:APP});
    await waitFor("document.querySelector('.market-pan-surface')?.dataset.motionEngine === 'raf-v2'");
    await waitFor("document.querySelectorAll('.living-wave-path').length > 0");
    await evaluate(`(() => {const select=document.querySelector('select[aria-label="Wave motion"]');select.value='live';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.market-map').scrollIntoView({block:'center'});})()`);
    await waitFor("document.querySelector('.market-pan-surface')?.dataset.motionState === 'running'");
    await sleep(1800);
    const before=await measure();await sleep(800);const after=await measure();
    assert.equal(after.engine,'raf-v2');assert.ok(after.frame>before.frame,'Production frame loop must advance');
    assert.notEqual(before.good[0],after.good[0],'Production GOOD wave geometry must move');
    if(before.early.length&&after.early.length)assert.notEqual(before.early[0],after.early[0],'Production EARLY wave geometry must move');
    assert.ok(after.docWidth<=after.width+1,'No page-level horizontal overflow');
    const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});
    fs.writeFileSync('/tmp/solanabubble-production-'+name+'.png',Buffer.from(shot.data,'base64'));
    reports.push({viewport:name,goodWaves:after.good.length,earlyWaves:after.early.length,earlyMotionChecked:Boolean(before.early.length&&after.early.length),advancedFrames:after.frame-before.frame,state:after.state});
  }
  assert.equal(exceptions.length,0,'Browser runtime exceptions');
  console.log('Production motion verification passed',JSON.stringify({rootHttp:200,health:{ok:health.ok,workerState:health.workerState,swapCoverage:health.swapCoverage,fullFirehose:health.fullFirehose},reports,exceptions}));
}finally{
  for(const call of pending.values())clearTimeout(call.timer);
  ws.close();
}
