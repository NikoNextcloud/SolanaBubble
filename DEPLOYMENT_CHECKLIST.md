# Production checklist

## Data & security
- [ ] Supabase project is connected and all migrations are applied
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, worker credentials, `ADMIN_SECRET` and push secrets are server-side only
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and optional VAPID public key are configured
- [ ] Traffic and holder RPC failover chains are configured or their public fallbacks are intentionally accepted
- [ ] `market-snapshot` Edge Function matches `npm run worker:bundle` and the scheduled worker is returning recent success
- [ ] Public `/api/market/status` reports worker freshness, sampled traffic coverage and observed-at live event coverage without exposing credentials
- [ ] Admin Production Health shows runtime SHA, database usage, worker failures and live arrival latency
- [ ] Missing/sparse/degraded coverage is labelled; no UI treats missing evidence as zero activity

## Product
- [ ] First-run quick guide appears once and can be reopened from the sidebar
- [ ] Global search works with Ctrl/Cmd+K and `/`
- [ ] Map/List, 12-token desktop focus layout, mobile focus cap, pan/zoom and fullscreen are verified
- [ ] Every focus token has a living wave; hype/activity change turbulence
- [ ] Real BUY/SELL samples travel as green/red particles; fresh observed-at events receive the event-only impulse
- [ ] FoMo/GmGn single click, Holder Map double click and Details navigation work
- [ ] Watchlist local persistence, private-key sync, personal thresholds and optional Web Push work
- [ ] Alerts inbox supports type/severity filtering, unread state and mark-all-read
- [ ] Decision Terminal, Smart Money / Wallet Intelligence, Capital Flow and Time Machine/Backtesting remain reachable

## Release gate
- [ ] `npm run security:audit`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run worker:check`
- [ ] `npm run check:budgets`
- [ ] `npm run build`
- [ ] `npm run test:api`
- [ ] Chromium mobile + desktop browser smoke
- [ ] Production deployment created only after explicit user authorization
- [ ] Production alias returns HTTP 200 and runtime error check is clean
- [ ] Deployment lock restored: `commandForIgnoringBuildStep = "exit 0"`, `previewDeploymentsDisabled = true`, `vercel.json -> git.deploymentEnabled = false`
