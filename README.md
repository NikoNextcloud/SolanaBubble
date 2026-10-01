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
- Free mode uses DexScreener snapshots with a short Supabase/browser cache.
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
