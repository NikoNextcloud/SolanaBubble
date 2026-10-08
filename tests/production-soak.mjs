import assert from "node:assert/strict";

const CHROME=process.env.CHROME_DEBUG_URL||"http://127.0.0.1:9222";
const APP=process.env.SOAK_URL||"https://solanabubble.vercel.app";
const minutes=Math.max(1,Math.min(300,Number(process.env.SOAK_MINUTES||30)));
const intervalMs=30_000;
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
async function getJson(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(url+" HTTP "+r.status);return r.json();}

const target=await fetch(CHROME+"/json/new?about:blank",{method:"PUT"}).then(r=>r.json());
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
let nextId=0;const pending=new Map();const exceptions=[];
ws.addEventListener("message",(event)=>{
 const m=JSON.parse(String(event.data));
 if(m.method==="Runtime.exceptionThrown")exceptions.push(m.params?.exceptionDetails?.exception?.description||m.params?.exceptionDetails?.text||"runtime exception");
 if(!m.id)return;const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);
});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async(expression)=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||"evaluation failed");return r.result.value;};
await send("Page.enable");await send("Runtime.enable");await send("Page.navigate",{url:APP});
for(let i=0;i<100;i++){if(await evaluate("document.readyState===\"complete\"&&Boolean(document.querySelector(\".alpha-shell\"))"))break;await sleep(250);}
assert.equal(await evaluate("Boolean(document.querySelector(\".alpha-shell\"))"),true,"production shell must render");

const samples=[];const loops=Math.max(2,Math.ceil(minutes*60_000/intervalMs));
for(let i=0;i<loops;i++){
 const health=await getJson(APP+"/api/health");
 assert.equal(health.ok,true,"production health must remain ok");
 assert.ok(["ok","running"].includes(health.workerState),"worker must remain healthy");
 assert.ok(Number(health.marketAgeSec)>=0&&Number(health.marketAgeSec)<900,"market snapshot must remain under 15 minutes old");
 const browser=await evaluate('(()=>({shell:Boolean(document.querySelector(".alpha-shell")),bubbles:document.querySelectorAll(".market-token-bubble").length,heap:performance.memory?.usedJSHeapSize??null,visibility:document.visibilityState}))()');
 assert.equal(browser.shell,true,"market shell must remain mounted");
 samples.push({at:Date.now(),heap:browser.heap,bubbles:browser.bubbles,marketAgeSec:health.marketAgeSec});
 if(i<loops-1)await sleep(intervalMs);
}
assert.equal(exceptions.length,0,"browser runtime exceptions during soak: "+exceptions.slice(0,3).join(" | "));
const heaps=samples.map(s=>s.heap).filter(v=>typeof v==="number"&&Number.isFinite(v));
if(heaps.length>=2){const first=heaps[0],last=heaps.at(-1);assert.ok(last<Math.max(first*2.5,first+150*1024*1024),"browser heap grew excessively during soak");}
console.log("Production soak passed",JSON.stringify({minutes,samples:samples.length,exceptions:exceptions.length,last:samples.at(-1)}));
ws.close();
