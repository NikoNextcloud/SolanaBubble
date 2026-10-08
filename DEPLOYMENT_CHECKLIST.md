# Production checklist

- [ ] Supabase project is connected and all migrations are applied
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is server-side only
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured
- [ ] Optional `SOLANA_RPC_URL` is configured if you want a dedicated RPC provider
- [ ] Optional `SOLSCAN_API_KEY` is configured for enrichment
- [ ] `ADMIN_SECRET` is configured
- [ ] Market overview loads from DexScreener
- [ ] Public RPC health is visible in /admin
- [ ] Holder refresh works for a tracked mint
- [ ] Live refresh pauses when the browser tab is hidden
- [ ] Database purge removes rows but keeps schema/migrations intact

- [ ] Market snapshot migrations, service-only permissions and ingestion lease verified
- [ ] `market-snapshot` Edge Function regenerated from shared sources and deployed
- [ ] Five-minute Supabase cron job active and recent invocation returned HTTP 200
- [ ] Historical snapshots and alert rows accumulate without opening the UI
- [ ] Missing/stale holder data displayed as unknown, with sampling coverage
- [ ] `npm test`, `npm run build`, `npm run test:api` pass
- [ ] Map/List drag and zoom visually verified in a browser
- [ ] Vercel production deployment is explicitly requested by the user; otherwise do not deploy

## v1 final completion

- [ ] `/api/health` returns `ok:true`, worker age <15m and sanitized RPC readiness
- [ ] Dedicated traffic/holder RPC credentials configured if a paid provider has been provisioned
- [ ] GOOD v2 15m/1h/6h historical calibration is visible in Decision Terminal
- [ ] Production Monitor workflow is green; optional Telegram GitHub secrets configured if failure notifications are desired
- [ ] Daily Production Soak workflow is green; manual soak can run up to 300 minutes
- [ ] PWA icon, maskable icon, Open Graph preview and sitemap return HTTP 200
- [ ] Post-deploy runtime error scan is clean
- [ ] Deployment lock restored after the controlled production release

### Recovery

1. If production health fails after a release, inspect Vercel runtime/build logs and the GitHub Production Monitor result.
2. Roll back to the preceding READY Vercel production deployment if the regression is release-specific.
3. Do not delete Supabase schema to recover application code. Market snapshots and caches are replaceable; service credentials and migrations are not.
4. If RPC failures spike, reduce `MARKET_TRAFFIC_BUDGET` / `MARKET_HOLDER_BUDGET` or remove the failing dedicated endpoint so the public failover chain can resume.
5. Re-run CI and production smoke before promoting a repaired commit.
