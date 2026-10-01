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
