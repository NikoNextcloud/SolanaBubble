import { randomUUID } from 'node:crypto';
import { admin } from '../db';
import { collectMarket } from './collect';
import { observeHolders } from './holders';
import { deriveSignals, evaluateAlerts, type SignalToken, type Intelligence, type SignalAlert } from './signals';

export async function ingestMarket() {
  const db = admin(), lease = randomUUID();
  const claim = await db.rpc('claim_market_ingestion', { p_lease: lease });
  if (claim.error) throw claim.error;
  if (!claim.data) return { skipped: true, reason: 'Ingestion already running' };
  try {
    const { data: cached, error } = await db.from('api_cache').select('payload').eq('cache_key', 'market:snapshot').maybeSingle();
    if (error) throw error;
    const previous = cached?.payload;
    const base = await collectMarket(previous);
    const prevTokens = new Map<string, SignalToken>((previous?.tokens ?? []).map((t: SignalToken) => [t.mint, t]));
    const mints = base.tokens.map(t => t.mint);
    const { data: holders, error: holderError } = await db.from('api_cache').select('cache_key,payload,updated_at').in('cache_key', mints.map(m => `intelligence:holders:${m}`));
    if (holderError) throw holderError;
    const observations = new Map<string, Intelligence>((holders ?? []).map(h => [h.cache_key.split(':').at(-1)!, h.payload.metrics]));
    const budget = Math.min(6, Math.max(0, Number(process.env.MARKET_HOLDER_BUDGET ?? 2) || 0));
    const cursor = Number(previous?.holderCursor ?? 0) % Math.max(1, mints.length);
    const failures: string[] = [];
    // Sequential bounded work protects rate-limited providers. It never runs in a UI GET.
    for (let i=0; i<Math.min(budget,mints.length); i++) {
      const t = base.tokens[(cursor+i) % mints.length];
      try { observations.set(t.mint, await observeHolders(t.mint, t.priceUsd)); }
      catch { failures.push(t.mint); }
    }
    const at = new Date().toISOString();
    const tokens = base.tokens.map(t => {
      const holder = observations.get(t.mint);
      const fresh = holder?.holderObservedAt && Date.now() - Date.parse(holder.holderObservedAt) < 60 * 60_000;
      const metrics: Intelligence = fresh ? holder : { holderCount: null, holderGrowth: null, holderGrowthPct: null, freshWallets: null, top10SupplyPct: null, linkedWallets: null, suspiciousWallets: null, whaleEnter: null, whaleExit: null, smartMoneyFlowUsd: null, holderObservedAt: holder?.holderObservedAt ?? null };
      const enriched = { ...t, ...metrics };
      return { ...enriched, ...deriveSignals(enriched, prevTokens.get(t.mint), at, previous?.fetchedAt),
        // Directional volume estimate based on trade counts, not measured capital transfers.
        netFlowUsd1h: t.volume1h * (t.buys1h - t.sells1h) / Math.max(1, t.trades1h) };
    });
    const alerts = tokens.flatMap(t => evaluateAlerts(t, prevTokens.get(t.mint), at));
    const history = await db.from('market_alerts').select('payload').gte('observed_at',new Date(Date.now()-24*60*60_000).toISOString()).order('observed_at',{ascending:false}).limit(80);
    if (history.error) throw history.error;
    const seen = new Set<string>();
    const recentAlerts = [...alerts, ...(history.data ?? []).map(r => r.payload as SignalAlert)].filter(a => !seen.has(a.id) && !!seen.add(a.id)).slice(0,80);
    const payload = { ...base, tokens, fetchedAt: at, holderCursor: (cursor+budget)%Math.max(1,mints.length),
      alerts: recentAlerts, recentEvents: base.recentEvents,
      ingestion: { holderBudget: budget, holderFailures: failures.length, source: 'server-worker', interval: '5m target; scheduler dependent' },
      metricNotes: { flow: 'USD estimate from rolling 1h trade counts', freshWallets: 'newly observed token holders; not wallet creation age', whales: 'owners ≥1% supply; pool/program owners included', smartMoney: 'whale balance change at current price; not verified swap flow', volumeAcceleration: 'acceleration of rolling 1h volume, USD/min²', risk: 'heuristic, not a security audit' } };
    const saved = await db.rpc('commit_market_snapshot', { p_lease: lease, p_payload: payload, p_alerts: alerts });
    if (saved.error) throw saved.error;
    return { ok: true, tokens: tokens.length, alerts: alerts.length, holderFailures: failures.length, fetchedAt: at };
  } finally {
    await db.rpc('release_market_ingestion', { p_lease: lease });
  }
}
