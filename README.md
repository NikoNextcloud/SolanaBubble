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

`holders.ts` uses the `HolderProvider` adapter, backed by `SOLANA_RPC_URL`. The worker observes at most two holder mints per run by default: one active tracked token plus a rotating market token, subject to a shared deadline. It aggregates token accounts by owner, calculates Top 10 supply %, holder growth, newly observed holders, whale threshold crossings and whale balance value changes. Counts are unknown until an observation exists; growth/enter/exit require a second holder observation. Holder metrics older than one hour are excluded from current rankings. Wallet relationship analysis samples four largest owners and two recent signatures each, combining common/direct funding evidence with existing stored wallet links. Sampling coverage and evidence are displayed in the card.

### Interpretation

- Market inflow/outflow is an estimate from buy/sell transaction counts and rolling volume. It does not measure individual swap dollars.
- Fresh holders means owners newly present since the preceding holder observation, not newly created Solana accounts.
- Whales are owners with ≥1% of supply; pool, exchange and program owners may be included. Enter/exit means crossing that threshold. Smart Money Movers ranks observed whale balance changes valued at the current price; transfers can also cause these changes.
- Relationship evidence is a heuristic, not proof of coordinated trading or abuse. A zero from a bounded sample does not establish that all wallets are unlinked.
- Risk Score is a capped 0–100 heuristic using low liquidity, abrupt liquidity loss, owner concentration, relationship evidence and sell pressure. The card states its coverage; it is not a contract security audit.
- Alerts are persisted threshold-crossing events (hype +5, holders +5%, buy count share 70% with ≥20 trades, liquidity +20% or −25% with prior liquidity ≥$5k, whale enter/exit). Re-reading the same holder observation does not repeat whale alerts.

### Storage and ingestion

Apply migrations through `20261002083402_swap_traffic.sql`. Snapshot and alert writes plus cache publication are atomic. A four-minute database lease prevents overlapping worker executions. History and alerts are retained for seven days; the UI presents 24-hour selectable Hype, rolling volume, liquidity, price and sampled holder history plus alerts. Failed upstream collections preserve the last successful market snapshot.

`npm run worker:bundle` generates `supabase/functions/market-snapshot/index.js` from the shared TypeScript implementation. Redeploy this function after changing the ingestion implementation, using `deno.json` as the explicit import-map path. Its custom authorization validates a new task-scoped 72-character credential stored in a service-only RLS table; an unauthenticated request cannot collect data. The cron job reads this credential internally. Configure `market_worker_config.endpoint` to the project's `/functions/v1/market-snapshot` URL; do not expose or commit its credential.

`npm run market:ingest` runs the same worker locally with server-side Supabase environment variables. The GitHub ingestion workflow is manual-only and requires repository secrets for the Supabase URL/service key; it is a recovery option, not the active schedule. The recovery `POST /api/market/ingest` requires `CRON_SECRET` and explicit `ALLOW_VERCEL_INGEST=true`; it is disabled by default. `GET /api/market/history?mint=...&hours=24` exposes bounded market history through the server, not service credentials.

### UI and release policy

The Lovable layout retains only Map/List, mouse panning, draggable tokens, pinned positions and scroll zoom. Bubble size represents Hype; brightness follows Hype Velocity, green/red glow follows estimated flow, pulse duration follows acceleration, outlines widen with positive holder growth, and risk ≥50 or disappearing liquidity adds a warning ring. Token Signal Card is available from the market selection and holder overview. Top Movers provides Hype, Holder, Volume, Liquidity and Smart Money categories.

`vercel.json` keeps Git-triggered deployment disabled. GitHub CI typechecks, tests, builds and runs API smoke checks. Pushing to `main` does not authorize Vercel production deployment; that requires an explicit “deploy”.

### Verification

- `npm run typecheck`
- `npm test` (baseline, normalization, risk, alert deduplication and mover data availability)
- `npm run build`
- `npm run test:api` (requires the production build; uses a local fixture database and checks cached reads, history validation/bounds, worker authentication, Map/List and section routes)

### Window comparisons and retention guard

Market deltas and separate holder membership comparisons support 5m / 15m / 1h / 6h. Each carries its actual elapsed interval and observation time. A missing comparable baseline remains unknown; changed pools cannot generate comparable market deltas. Holder membership is retained eight hours. Public RPC limits mean rotating tokens may not have short-window holder observations. Hype acceleration is the change in velocity per elapsed minute. Risk also covers largest holder dominance, linked supply concentration and FDV/liquidity imbalance. Top owner sell alerts require negative token and positive quote-token balance changes in the same transaction and are labelled swap-like evidence, not verified trades.

At 499,000,000 bytes of Postgres database allocation, a minute cron guard and ingestion guard recycle bounded batches of old market snapshots/alerts (preserving seven hours), holder observations older than eight hours and analytics holder caches older than 24 hours. Current market cache, token records, holdings, transaction records and relationship data are preserved. This deliberately does not reset the database. DELETE frees reusable pages after vacuum and does not immediately shrink allocated database files; this policy cannot guarantee a hard total database cap or control Storage object usage.

FoMo links use its direct `/coin?address=<mint>&chainId=1399811149` route. FoMo controls its own authentication. Map forces and collision resolution keep a gap around bubbles; deliberately pinned tokens retain their chosen positions.

## Personal Watchlist and Data Quality

Use ☆ Add to Watchlist in the Token Signal Card, or add a mint on `/market/watchlist`. Favorites (up to 50), search/minimum Hype/maximum Risk/favorites-only filters and per-token alert thresholds are stored in versioned browser localStorage. Existing `solanabubble:wishlist` entries migrate on the first edit. Storage failures are displayed, never silently presented as saved. Browser settings do not sync between devices and are removed if browser storage is cleared.

Watchlist reads fresh market cache or the latest persisted snapshot for mints outside the current discovery universe; missing observations remain unknown. GET `/api/market/watchlist?mints=...` validates and bounds requests and never triggers collection. Open a token's holder page to track a token with no observation yet. Filters apply to Map and List and are shared with Watchlist. Drag/pan/zoom and the Map/List modes remain intact.

Personal alerts evaluate cached observations while Map or Watchlist is open. Rules cover Hype, Hype Velocity, roughly-five-minute holder growth, buy count pressure (at least 20 trades) and liquidity drop. Unknown/stale observations cannot fire. Crossings persist once and rearm after the condition clears; edits reset that rule's condition. These are in-app alerts, not server-side subscriptions, push, email or unattended background delivery.

Data Quality exposes actual market and holder observation timestamps and age, recent/stale/unknown status, sampled wallet relationship coverage and available comparison baselines. Market becomes stale at 10 minutes, holders at 60 minutes. It distinguishes upstream/RPC observations, computed scores/deltas, estimated flow and heuristic risk/relationships. Unknown timestamps are never replaced with the current time.

## Readable Map signals

Bubble labels now expose a direction arrow and a Bulgarian status. The descriptive buying-pressure heuristic requires a fresh market observation (<10m), ≥20 rolling 1h trades and a comparable Hype velocity. Rising buying support uses ≥60% buy-count share and Hype velocity ≥0.5 H/min with no material liquidity decline. Rising Hype paired with weak buy-count share, declining liquidity or a fresh negative roughly-5m holder comparison is labelled “Hype без подкрепа”. Sell dominance or weakening Hype/support receives a downward status; other comparable observations show balance. Missing/stale data stays unknown and neutral. These are estimates, not measured capital flow, swap attribution or price predictions. Risk remains a separate ring/score.

Liquidity loss gets a red warning ring and explicit Liquidity ↓ text. Fresh whale threshold events (owners crossing 1% of supply) are displayed for five minutes from their holder observation; pool/program owners are included and the event does not establish a buy/sell. Hover/focus labels expose actual reasons and coverage. Text, arrows and color communicate together. Labels have additional layout spacing, and pinned positions, drag, scroll zoom, Map/List and auto graph remain intact.

The Map legend is visible again, collapsible, and explains size, brightness, pulse, contours, warnings and estimated direction. A separate animations switch persists in this browser without pausing market refresh; CSS reduced-motion preferences override animation effects.


## Swap traffic and free-tier CPU controls

Recognized direct single swaps from PumpSwap and Raydium CPMM are sampled on the Supabase worker. A scan reads at most 12 signatures for one selected pool; up to two of the 20 active tracked token pools rotate per five-minute worker cycle. The rotation can leave long gaps (about 50m for 20 pools), and public RPC failures further reduce coverage. Unknown programs, routers, multi-leg trades, failed transactions and ambiguous movements are excluded. This is not complete token-wide traffic. Compact swaps/scans are retained for two hours with idempotent writes and service-only RLS. All RPC requests still use the replaceable provider boundary; no Helius or Solscan.

The Traffic card has 5m/15m/1h windows ending at the actual scan timestamp, unique buyer/seller signers, first-seen/returning sampled buyers, buy sizes, top-three buyer concentration, quick resales and sampled links. Retention requires a later, recent holder observation; it is not profitability. USD is pool quote-vault movement valued at USDC=$1 or SOL’s scan-time price, not historical execution value or whole-market inflow. Missing USD/retention/relationship evidence stays unknown. Map sample direction requires a scan younger than 10m and at least five swaps; otherwise its existing count/Hype estimate remains. Liquidity and risk warnings remain separate.

Market GET never starts ingestion, including on cache miss. Public market/price responses use Vercel CDN caching for 120s, history/expansion/holder observations for 300s; private watchlists are excluded. Map/market/watchlist poll every 120s, tracked signal cards and holder observations every 300s; existing hidden-tab/live guards remain. Holder refresh now reads a top-500 observation overlay without RPC, writes or deletions. Core holdings, historical trading totals and relationship records are preserved; holder graph overlay updates do not rewrite historical activity. Tracking a new token still bootstraps once and can incur Vercel CPU; opening already tracked tokens no longer requests upstream metadata refresh. The old transaction feed remains historical data, not this new recognized-swap feed.

These limits reduce origin requests and expensive work, but do not guarantee staying below a team-wide CPU quota. Other projects in the same Vercel team can consume it. GitHub pushes remain deployment-disabled; the frontend/API changes affect production only after an explicitly authorized Vercel deployment. Supabase migrations and its background worker are deployed separately.

## Holder map observation controls

The token page shows the actual holder scan timestamp, recent/stale/unknown state (60m), the rendered count and top-500 coverage. Realtime subscription connectivity is labelled Connected, separately from data freshness. Top 10/50/100/500 and existing minimum supply filters reduce visual noise. Selecting a wallet dims unrelated nodes/edges; Escape or the full-map button restores the overview without changing pan, zoom or pins. Green/red outer contours reflect token balance increases/decreases only between two loaded holder observations, on owners present in both top-500 samples. A missing sampled owner is not classified as an exit. The changes panel uses background holder metrics for new/exited counts and Top 10 supply, with their true comparison timestamp; local balance comparisons carry a separate interval and expire visually after 60m. No new RPC requests, scheduler or database mutation.

Recorded transaction summaries remain partial legacy observations, separate from the recognized swap sample. Transfer rows are excluded from buy/sell USD totals. Empty or incompletely priced samples show unknown USD flow, not +$0 or Positive. Source volume is the sum of observed buy/sell USD, not the old divided-by-two estimate. High-link hub detection is labelled heuristic and does not claim verified pool/program classification. Loading fallbacks and route error boundaries preserve the flat Lovable styling.


## Background reliability and active-token priority

Opening a tracked token requests an expiring background priority, renewed at most every five minutes while its visible Live view is active. Requests only queue work: they do not invoke RPC on Vercel. The service-only SQL function accepts existing tracked tokens, serializes enqueue decisions, deduplicates within five minutes, caps the queue at 20 and expires priorities after 15 minutes. One oldest requested token plus a rotating tracked token share the unchanged holder budget of two. Successful priority work is consumed without deleting a newer request. Traffic uses the same bounded prioritization, subject to time and RPC coverage limits; the timing is best effort, not a 5m freshness guarantee.

The replaceable RPC transport serializes getTransaction calls across holder relationship and traffic consumers. HTTP 429, 401/403 and timeouts/network failures activate a 60s transaction circuit break without flooding retries. Failures are classified as rate_limited, forbidden, timeout, network, not_found, invalid_response, HTTP error or RPC error/code; endpoint credentials and upstream messages are never published. Traffic retains up to 12 pending signatures in compact scans, skips signatures younger than 10s, retries retained pending signatures in oldest-first order within one hour, and honors the worker's shared deadline. Unsupported programs remain unrecognized and do not count as verified swaps.

worker:status records start, finish, duration, failures and last success in the existing service-only cache. Market Map and token views expose only sanitized public status through a CDN-cached GET; status polling performs no RPC calls. A running worker older than four minutes is shown as delayed. A worker "ok" means a market snapshot was saved, not full traffic coverage. This does not measure Vercel billing or guarantee a free-tier quota. Vercel production deployment remains explicitly gated by the user.
