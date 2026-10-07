import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const workspace=readFileSync(new URL("../components/WorkspaceShell.tsx",import.meta.url),"utf8");
const tour=readFileSync(new URL("../components/ProductTour.tsx",import.meta.url),"utf8");
const reliability=readFileSync(new URL("../components/LiveReliabilityBadge.tsx",import.meta.url),"utf8");
const alerts=readFileSync(new URL("../components/AlertsPanel.tsx",import.meta.url),"utf8");
const manifest=readFileSync(new URL("../app/manifest.ts",import.meta.url),"utf8");

test("release workspace exposes onboarding and live reliability",()=>{
  assert.match(workspace,/LiveReliabilityBadge/);
  assert.match(workspace,/ProductTour/);
  assert.match(workspace,/Quick start/);
  assert.match(tour,/solanabubble:onboarding:v1/);
  assert.match(tour,/NEXT_PUBLIC_BROWSER_SMOKE/);
});

test("reliability badge distinguishes healthy partial and delayed data",()=>{
  assert.match(reliability,/\/api\/market\/status/);
  assert.match(reliability,/LIVE DATA/);
  assert.match(reliability,/PARTIAL/);
  assert.match(reliability,/DELAYED/);
  assert.match(reliability,/best-effort/);
});

test("smart alerts persist seen unread state",()=>{
  assert.match(alerts,/solanabubble:alerts:seen:v1/);
  assert.match(alerts,/Mark all seen/);
  assert.match(alerts,/No unread alerts/);
  assert.match(alerts,/Smart Alerts/);
});

test("application exposes installable manifest metadata",()=>{
  assert.match(manifest,/display:"standalone"/);
  assert.match(manifest,/theme_color:"#0b0f14"/);
  assert.match(manifest,/finance/);
});
