import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
const mint='So11111111111111111111111111111111111111112';
const at=new Date().toISOString();
const token={mint,hypeScore:50,hypeVelocity:1,holderCount:12,priceUsd:1};
let databaseCalls=0;
let missingMarket=false;
let mutations=0;
const db=http.createServer((req,res)=>{
  databaseCalls++;if(req.method!=='GET'&&req.method!=='HEAD')mutations++;
  res.setHeader('Content-Type','application/json');
  const path=new URL(req.url,'http://localhost').pathname;
  const key=new URL(req.url,'http://localhost').searchParams.get('cache_key')??'';
  if(path==='/rest/v1/api_cache'&&key.includes('intelligence:holders:'))res.end(JSON.stringify([{payload:{supply:100,price:1,balances:[{wallet:'buyer',balance:10}],metrics:{holderCount:1,newHolders:2,exitedHolders:1,top10SupplyPct:50}},updated_at:at}]));
  else if(path==='/rest/v1/api_cache') res.end(JSON.stringify(missingMarket?[]:[{payload:{fetchedAt:at,tokens:[token],flows:[],alerts:[]},updated_at:at}]));
  else if(path==='/rest/v1/tokens')res.end(JSON.stringify([{price_usd:1,metadata_updated_at:at}]));
  else if(path==='/rest/v1/market_snapshots') {const requested=new URL(req.url,'http://localhost').searchParams.get('mint')?.replace(/^eq\./,'')??mint;res.end(JSON.stringify([{observed_at:at,payload:{...token,mint:requested}}]));}
  else {res.statusCode=500;res.end(JSON.stringify({error:'Unexpected database request'}));}
});
await new Promise(resolve=>db.listen(0,'127.0.0.1',resolve));
const dbPort=db.address().port;
const appPort=3131;
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{stdio:['ignore','pipe','pipe'],env:{...process.env,SUPABASE_URL:`http://127.0.0.1:${dbPort}`,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${dbPort}`,SUPABASE_SERVICE_ROLE_KEY:'fixture-key',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-key',CRON_SECRET:'fixture-secret',ALLOW_VERCEL_INGEST:'false'}});
let logs='';app.stdout.on('data',b=>logs+=b);app.stderr.on('data',b=>logs+=b);
try {
  let ready=false;
  for(let i=0;i<100;i++) {try{if((await fetch(`http://127.0.0.1:${appPort}`)).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,`App startup failed: ${logs}`);
  const get=path=>fetch(`http://127.0.0.1:${appPort}${path}`);
  const home=await (await get('/')).text();
  assert.match(home,/Token map/);assert.match(home,/Как да четеш балоните/);assert.match(home,/Анимации/);assert.match(home,/▦ Map/);assert.match(home,/☷ List/);assert.doesNotMatch(home,/>Galaxy</);
  const holderHtml=await (await get(`/token/${mint}`)).text();assert.match(holderHtml,/Какво се промени/);assert.match(holderHtml,/Брой показани holders/);assert.match(holderHtml,/Няма достатъчно наблюдавани сделки/);assert.doesNotMatch(holderHtml,/>Positive</);
  for(const section of ['movers','alerts','watchlist']) assert.equal((await get(`/market/${section}`)).status,200);
  const market=await get('/api/market'); assert.equal(market.status,200);
  const cached=await market.json();assert.equal(cached.cached,true);assert.equal(cached.stale,false);assert.equal(cached.tokens[0].holderCount,12);
  assert.equal((await get('/api/market/history?mint=bad')).status,400);
  const history=await get(`/api/market/history?mint=${mint}&hours=999`);assert.equal(history.status,200);const body=await history.json();assert.equal(body.hours,168);assert.equal(body.snapshots.length,1);
  assert.equal((await fetch(`http://127.0.0.1:${appPort}/api/market/ingest`,{method:'POST'})).status,401);
  assert.equal((await get('/api/market/watchlist?mints=bad')).status,400);
  assert.equal((await get('/api/push/subscription')).status,401);
  assert.equal((await fetch(`http://127.0.0.1:${appPort}/api/push/dispatch`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(`http://127.0.0.1:${appPort}/api/webhooks/helius`,{method:'POST',headers:{'content-type':'application/json'},body:'[]'})).status,401);
  assert.equal((await (await get('/api/market/watchlist')).json()).tokens.length,0);
  const favorites=await (await get(`/api/market/watchlist?mints=${mint}`)).json();assert.equal(favorites.tokens[0].marketObservedAt,at);
  const other='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const fallback=await (await get(`/api/market/watchlist?mints=${other}`)).json();assert.equal(fallback.tokens[0].mint,other);assert.equal(fallback.tokens[0].marketObservedAt,at);
  assert.equal(databaseCalls,5,'Cache reads must not run collection');
  assert.match(market.headers.get('vercel-cdn-cache-control')??'',/s-maxage=120/);
  assert.match(history.headers.get('vercel-cdn-cache-control')??'',/s-maxage=300/);
  const price=await get(`/api/tokens/${mint}/price`);assert.equal(price.status,200);assert.equal((await price.json()).priceUsd,1);
  const refresh=await get(`/api/tokens/${mint}/refresh`);assert.equal(refresh.status,200);const observation=await refresh.json();assert.equal(observation.balances[0].balance,10);assert.equal(observation.cached,true);assert.equal(observation.metrics.top10SupplyPct,50);
  assert.equal((await fetch(`http://127.0.0.1:${appPort}/api/market/ingest`,{method:'POST',headers:{authorization:'Bearer fixture-secret'}})).status,409);
  missingMarket=true;assert.equal((await get('/api/market')).status,202);
  const worker=await get("/api/market/status");assert.equal(worker.status,200);assert.match(worker.headers.get("vercel-cdn-cache-control")??"",/s-maxage=120/);
  assert.equal(mutations,0,'Cache endpoints must never mutate DB or start ingestion');
  console.log('API smoke passed: cached GET, bounded history, ingest auth, Map/List and section routes.');
} finally {app.kill('SIGTERM'); await new Promise(resolve=>db.close(resolve));}
