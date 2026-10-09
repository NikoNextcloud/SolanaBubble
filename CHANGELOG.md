# Changelog

## Unreleased - continuous wave renderer

- One requestAnimationFrame geometry engine for both GOOD and EARLY, with bounded frame rate and synchronized observed-trade markers.
- Explicit Auto / Live / Pause motion controls. Reduced-motion Auto is gentle instead of a hidden hard stop.
- Visible idle viewing no longer stops market updates after two minutes; hidden tabs still suspend polling and drawing.
- Browser regressions measure real path changes, pause/resume, reduced motion and visibility recovery.
- EARLY remains sampled/unverified; animation is not an execution feed or a profit guarantee.


## 1.0.0 — 2026-10-08

SolanaBubble v1.0 promotes the live Solana market workspace from release candidate to production release.

### Highlights
- Living order-flow waves with real BUY/SELL swap particles and Hype-driven turbulence.
- White Opportunity Wave gated by opportunity, confidence, capital flow and risk.
- Adaptive Map density from 8 detail tokens to 30 zoomed-out focus tokens.
- Smart Alerts inbox, watchlist sync, Web Push and cross-device account sync.
- Live Data reliability and coverage diagnostics for worker, traffic and holder freshness.
- Production observability for client crashes and unhandled promise rejections.
- Dedicated error, 404, privacy, terms, risk and methodology experiences.
- Installable PWA metadata and production release hardening.
- GOOD Opportunity Engine v2 with bounded 15m/1h/6h forward validation, +2% hit rate and MFE/MAE calibration.
- Sanitized dedicated-RPC readiness diagnostics and split traffic/holder provider support.
- Independent 15-minute production health monitoring with optional Telegram failure notification.
- Scheduled production browser soak for runtime exceptions, health drift and bounded heap-growth regression.
- Branded PWA icons, social preview metadata and sitemap.

### Trust model
SolanaBubble distinguishes observed swaps and market data from heuristic scores. Opportunity, Risk, Smart Money and relationship indicators are research signals, not guarantees, audited security conclusions or investment advice.
