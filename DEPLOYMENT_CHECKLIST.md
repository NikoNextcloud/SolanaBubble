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
