# SolanaBubble

Live Solana market and holder visualization built with Next.js, Supabase, Solana Public RPC, DexScreener and optional Solscan enrichment.

## Data flow

```
DexScreener -> live market map (price / liquidity / volume / buy-sell activity)
Solana Public RPC -> token supply / holder balances / holder refresh
Solscan (optional) -> metadata / holder enrichment / usage
Supabase -> cache, tracked tokens, holdings, clusters, history
```

There is no Helius dependency in the active application.

## Live behavior

- Market overview refreshes only while the browser tab is visible.
- Market GET reads the last server snapshot immediately; stale/missing cache warms after the response.
- Supabase cron invokes the authenticated `market-snapshot` Edge worker every five minutes, including while no browser is open.
- Holder pages refresh through Solana Public RPC while Live is enabled.
- Holder refresh is cached and throttled to reduce public RPC load.
- After inactivity the UI can pause animations/refresh and continue from cached data.
- Bubble positions remain interactive and the force layout keeps clusters visually separated.

## Main pages

- `/` - market overview
- `/token/[mint]` - holder / cluster map
- `/admin` - database and API status

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Optional. Defaults to Solana public mainnet RPC.
SOLANA_RPC_URL=

# Optional enrichment source.
SOLSCAN_API_KEY=

ADMIN_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ALERT_BIG_TRADE_USD=5000
ALERT_WHALE_PCT=1.0
```

## Notes

Solana Public RPC is rate-limited and is not a full blockchain firehose. DexScreener is used for market-level activity. The app therefore optimizes around cached snapshots and periodic holder refreshes instead of continuously indexing every Solana transaction.


## Historical market intelligence

`lib/market/collect.ts` collects DexScreener market observations. `signals.ts` derives Hype Δ and velocity (points/min), rolling 1h volume acceleration (USD/min²), liquidity changes and buy count pressure. Hype uses fixed normalization scales so changing the discovery universe does not change every score. Baselines are reset for changed pools or gaps over one hour.

`holders.ts` uses the `HolderProvider` adapter, backed by `SOLANA_RPC_URL`. The worker observes two mints per run by default, rotating through the market universe. It aggregates token accounts by owner, calculates Top 10 supply %, holder growth, newly observed holders, whale threshold crossings and whale balance value changes. Counts are unknown until an observation exists; growth/enter/exit require a second holder observation. Holder metrics older than one hour are excluded from current rankings. Wallet relationship analysis samples four largest owners and two recent signatures each, combining common/direct funding evidence with existing stored wallet links. Sampling coverage and evidence are displayed in the card.

### Interpretation

- Market inflow/outflow is an estimate from buy/sell transaction counts and rolling volume. It does not measure individual swap dollars.
- Fresh holders means owners newly present since the preceding holder observation, not newly created Solana accounts.
- Whales are owners with ≥1% of supply; pool, exchange and program owners may be included. Enter/exit means crossing that threshold. Smart Money Movers ranks observed whale balance changes valued at the current price; transfers can also cause these changes.
- Relationship evidence is a heuristic, not proof of coordinated trading or abuse. A zero from a bounded sample does not establish that all wallets are unlinked.
- Risk Score is a capped 0–100 heuristic using low liquidity, abrupt liquidity loss, owner concentration, relationship evidence and sell pressure. The card states its coverage; it is not a contract security audit.
- Alerts are persisted threshold-crossing events (hype +5, holders +5%, buy count share 70% with ≥20 trades, liquidity +20% or −25% with prior liquidity ≥$5k, whale enter/exit). Re-reading the same holder observation does not repeat whale alerts.

### Storage and ingestion

Apply migrations through `20261001195721_market_worker_schedule.sql`. Snapshot and alert writes plus cache publication are atomic. A four-minute database lease prevents overlapping worker executions. History and alerts are retained for seven days; the UI presents 24-hour Hype history and alerts. Failed upstream collections preserve the last successful market snapshot.

`npm run worker:bundle` generates `supabase/functions/market-snapshot/index.js` from the shared TypeScript implementation. Redeploy this function after changing the ingestion implementation, using `deno.json` as the explicit import-map path. Its custom authorization validates a new task-scoped 72-character credential stored in a service-only RLS table; an unauthenticated request cannot collect data. The cron job reads this credential internally. Configure `market_worker_config.endpoint` to the project's `/functions/v1/market-snapshot` URL; do not expose or commit its credential.

`npm run market:ingest` runs the same worker locally with server-side Supabase environment variables. The GitHub ingestion workflow is manual-only and requires repository secrets for the Supabase URL/service key; it is a recovery option, not the active schedule. An optional `POST /api/market/ingest` requires `CRON_SECRET`. `GET /api/market/history?mint=...&hours=24` exposes bounded market history through the server, not service credentials.

### UI and release policy

The Lovable layout retains only Map/List, mouse panning, draggable tokens, pinned positions and scroll zoom. Bubble size represents Hype; brightness follows Hype Velocity, green/red glow follows estimated flow, pulse duration follows acceleration, outlines widen with positive holder growth, and risk ≥50 or disappearing liquidity adds a warning ring. Token Signal Card is available from the market selection and holder overview. Top Movers provides Hype, Holder, Volume, Liquidity and Smart Money categories.

`vercel.json` keeps Git-triggered deployment disabled. GitHub CI typechecks, tests, builds and runs API smoke checks. Pushing to `main` does not authorize Vercel production deployment; that requires an explicit “deploy”.

### Verification

- `npm run typecheck`
- `npm test` (baseline, normalization, risk, alert deduplication and mover data availability)
- `npm run build`
- `npm run test:api` (requires the production build; uses a local fixture database and checks cached reads, history validation/bounds, worker authentication, Map/List and section routes)
