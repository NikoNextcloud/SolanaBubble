import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("v1 release metadata is locked",()=>{
 const pkg=JSON.parse(read("package.json"));
 assert.equal(pkg.version,"1.0.0");
 assert.match(read("CHANGELOG.md"),/## 1\.0\.0/);
});

test("production trust center is shipped",()=>{
 for(const page of ["app/methodology/page.tsx","app/risk/page.tsx","app/privacy/page.tsx","app/terms/page.tsx"])assert.match(read(page),/LegalPage/);
 assert.match(read("components/WorkspaceFooter.tsx"),/research signals, not financial advice/);
});

test("client observability is bounded and privacy aware",()=>{
 const route=read("app/api/telemetry/error/route.ts");
 assert.match(route,/payload_too_large/);
 assert.match(route,/origin_mismatch/);
 assert.match(route,/\[redacted\]/);
 assert.match(route,/client_error_events/);
 assert.match(read("components/ClientObservability.tsx"),/unhandledrejection/);
});

test("global recovery and 404 experiences exist",()=>{
 assert.match(read("app/global-error.tsx"),/reportClientError/);
 assert.match(read("app/not-found.tsx"),/SOLANABUBBLE · 404/);
 assert.match(read("components/RouteError.tsx"),/route_error/);
});

test("optional account sync uses authenticated Supabase session",()=>{
 assert.match(read("components/AccountMenu.tsx"),/signInWithOtp/);
 assert.match(read("app/api/watchlist/account/route.ts"),/auth\.getUser/);
 assert.match(read("components/useWatchlist.ts"),/pushAccount/);
 assert.match(read("components/useWatchlist.ts"),/accountSync/);
});

test("health and coverage explicitly declare sampled non-firehose data",()=>{
 assert.match(read("app/api/market/status/route.ts"),/fullFirehose:rpc\.fullFirehose/);
 assert.match(read("app/api/market/status/route.ts"),/trafficCoveragePct/);
 assert.match(read("app/api/health/route.ts"),/swapCoverage:"sampled"/);
 assert.match(read("components/LiveReliabilityBadge.tsx"),/not a blockchain firehose/);
});


test("PWA and social metadata are production-ready",()=>{
 const manifest=read("app/manifest.ts");
 assert.match(manifest,/\/icon\.svg/);
 assert.match(manifest,/maskable/);
 assert.match(read("app/layout.tsx"),/opengraph-image/);
 assert.match(read("app/opengraph-image.tsx"),/GOOD Opportunity/);
 assert.match(read("app/sitemap.ts"),/market\/movers/);
});

test("production monitor independently checks the deployed health endpoint",()=>{
 const workflow=read(".github/workflows/production-monitor.yml");
 assert.match(workflow,/cron: "\*\/15 \* \* \* \*"/);
 assert.match(workflow,/solanabubble\.vercel\.app\/api\/health/);
 assert.match(workflow,/marketAgeSec/);
 assert.match(workflow,/TELEGRAM_BOT_TOKEN/);
});

test("provider readiness never exposes configured endpoint values",()=>{
 const rpc=read("lib/rpc-readiness.ts");
 assert.match(rpc,/rpcProviderReadiness/);
 assert.match(rpc,/public-fallback/);
 assert.match(rpc,/dedicated-split/);
});


test("GOOD v2 historical outcome evidence is exposed in token details",()=>{
 const route=read("app/api/market/opportunity-validation/route.ts");
 assert.match(route,/validateGoodOpportunities/);
 assert.match(route,/lookbackDays:7/);
 assert.match(route,/limit\(2500\)/);
 const card=read("components/TokenSignalCard.tsx");
 assert.match(card,/OpportunityValidation/);
 const ingest=read("lib/market/ingest.ts");
 assert.match(ingest,/goodOpportunityScore/);
 assert.match(ingest,/goodOpportunityTier/);
});

test("release operations document the only remaining external RPC dependency",()=>{
 const readme=read("README.md");
 assert.match(readme,/GOOD Opportunity v2 validation/);
 assert.match(readme,/SOLANA_TRAFFIC_RPC_URLS/);
 assert.match(readme,/fullFirehose:false/);
});
