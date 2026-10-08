import assert from "node:assert/strict";
import test from "node:test";
import { PublicSolanaRpcProvider,rpcProviderReadiness } from "../lib/rpc-provider";

test("RPC provider fails over after rate limits and cools down the failed endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls:string[]=[];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url=String(input);calls.push(url);
    if(url==="https://primary.invalid") return new Response("rate limited",{status:429});
    return Response.json({jsonrpc:"2.0",id:1,result:{value:"ok"}});
  }) as typeof fetch;
  try{
    const provider=new PublicSolanaRpcProvider(()=>["https://primary.invalid","https://secondary.invalid"]);
    assert.deepEqual(await provider.request("getSignaturesForAddress",["pool"]),{value:"ok"});
    assert.deepEqual(calls,["https://primary.invalid","https://secondary.invalid"]);
    calls.length=0;
    assert.deepEqual(await provider.request("getSignaturesForAddress",["pool"]),{value:"ok"});
    assert.deepEqual(calls,["https://secondary.invalid"]);
  }finally{globalThis.fetch=originalFetch;}
});

test("RPC provider falls back on timeout/network failures but not on not-found results", async () => {
  const originalFetch = globalThis.fetch;
  let mode:"network"|"not-found"="network";
  const calls:string[]=[];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url=String(input);calls.push(url);
    if(url.endsWith("one")){
      if(mode==="network") throw new TypeError("network");
      return Response.json({jsonrpc:"2.0",id:1,result:null});
    }
    return Response.json({jsonrpc:"2.0",id:1,result:"healthy"});
  }) as typeof fetch;
  try{
    const first=new PublicSolanaRpcProvider(()=>["https://rpc/one","https://rpc/two"]);
    assert.equal(await first.request("getHealth",[]),"healthy");
    assert.equal(calls.length,2);

    mode="not-found";calls.length=0;
    const second=new PublicSolanaRpcProvider(()=>["https://rpc/one","https://rpc/two"]);
    await assert.rejects(()=>second.request("getHealth",[]),/not_found/);
    assert.deepEqual(calls,["https://rpc/one"]);
  }finally{globalThis.fetch=originalFetch;}
});


test("RPC readiness reports public fallback without configured credentials",()=>{
 const r=rpcProviderReadiness({});
 assert.equal(r.mode,"public-fallback");
 assert.equal(r.dedicated,false);
 assert.equal(r.fullFirehose,false);
 assert.equal(r.trafficConfigured,0);
 assert.equal(r.holderConfigured,0);
});

test("RPC readiness reports split dedicated routing without exposing URLs",()=>{
 const r=rpcProviderReadiness({
  SOLANA_TRAFFIC_RPC_URLS:"https://one.invalid,https://two.invalid",
  SOLANA_HOLDER_RPC_URL:"https://holders.invalid",
 });
 assert.equal(r.mode,"dedicated-split");
 assert.equal(r.dedicated,true);
 assert.equal(r.trafficConfigured,2);
 assert.equal(r.holderConfigured,1);
 assert.doesNotMatch(JSON.stringify(r),/one\.invalid|holders\.invalid/);
});
