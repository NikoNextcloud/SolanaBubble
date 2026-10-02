import { randomUUID } from 'node:crypto';
import { admin } from '../db';
import { collectMarket } from './collect';
import { compareMarketWindows, type MarketBaseline } from './windows';
import { observeHolders } from './holders';
import { deriveSignals, evaluateAlerts, type SignalToken, type Intelligence, type SignalAlert } from './signals';

export async function ingestMarket() {
  const db = admin(), lease = randomUUID();
  const claim = await db.rpc('claim_market_ingestion', { p_lease: lease });
  if (claim.error) throw claim.error;
  if (!claim.data) return { skipped: true, reason: 'Ingestion already running' };
  try {
    const storage = await db.rpc('enforce_market_storage_limit');
    if(storage.error) throw storage.error;
    const { data: cached, error } = await db.from('api_cache').select('payload').eq('cache_key', 'market:snapshot').maybeSingle();
    if (error) throw error;
    const previous = cached?.payload;
    const tracked=await db.from('tokens').select('mint').order('metadata_updated_at',{ascending:false,nullsFirst:false}).limit(20);
    if(tracked.error) throw tracked.error;
    const base = await collectMarket(previous,(tracked.data ?? []).map(t=>t.mint));
    const prevTokens = new Map<string, SignalToken>((previous?.tokens ?? []).map((t: SignalToken) => [t.mint, t]));
    const mints = base.tokens.map(t => t.mint);
    const { data: holders, error: holderError } = await db.from('api_cache').select('cache_key,payload,updated_at').in('cache_key', mints.map(m => `intelligence:holders:${m}`));
    if (holderError) throw holderError;
    const observations = new Map<string, Intelligence>((holders ?? []).map(h => [h.cache_key.split(':').at(-1)!, h.payload.metrics]));
    const budget = Math.min(6, Math.max(0, Number(process.env.MARKET_HOLDER_BUDGET ?? 4) || 0));
    const cursor = Number(previous?.holderCursor ?? 0) % Math.max(1, mints.length);
    const failures: string[] = [];
    // Keep the two most active tracked tokens fresh each cycle; rotate the rest.
    const trackedSet=new Set((tracked.data ?? []).map(t=>t.mint));
    const priority=base.tokens.filter(t=>trackedSet.has(t.mint)).slice(0,2);
    const rotation=base.tokens.filter(t=>!priority.some(p=>p.mint===t.mint));
    const candidates=[...priority];
    for(let i=0;i<rotation.length&&candidates.length<budget;i++) candidates.push(rotation[(cursor+i)%rotation.length]);
    let completed=0;
    const started=Date.now();
    for(const t of candidates.slice(0,budget)) {
      if(Date.now()-started>85_000) break;
      try { observations.set(t.mint,await observeHolders(t.mint,t.priceUsd)); }
      catch { failures.push(t.mint); }
      completed++;
    }
    const at = new Date().toISOString();
    const baselines=await db.rpc('market_window_baselines',{p_mints:mints,p_at:at});
    if(baselines.error) throw baselines.error;
    const tokens = base.tokens.map(t => {
      const holder = observations.get(t.mint);
      const fresh = holder?.holderObservedAt && Date.now() - Date.parse(holder.holderObservedAt) < 60 * 60_000;
      const metrics: Intelligence = fresh ? holder : { holderCount: null, holderGrowth: null, holderGrowthPct: null, freshWallets: null, top10SupplyPct: null, linkedWallets: null, suspiciousWallets: null, whaleEnter: null, whaleExit: null, smartMoneyFlowUsd: null, holderObservedAt: holder?.holderObservedAt ?? null };
      if(!fresh) Object.assign(metrics,{newHolders:null,exitedHolders:null,largestHolderPct:null,whaleConcentrationPct:null,linkedSupplyPct:null,holderWindows:{},topHolderSales:[]});
      const enriched = { ...t, ...metrics };
      return { ...enriched, windows:compareMarketWindows(enriched,at,(baselines.data ?? []) as MarketBaseline[]), ...deriveSignals(enriched, prevTokens.get(t.mint), at, previous?.fetchedAt),
        // Directional volume estimate based on trade counts, not measured capital transfers.
        netFlowUsd1h: t.volume1h * (t.buys1h - t.sells1h) / Math.max(1, t.trades1h) };
    });
    const alerts = tokens.flatMap(t => evaluateAlerts(t, prevTokens.get(t.mint), at));
    const history = await db.from('market_alerts').select('payload').gte('observed_at',new Date(Date.now()-24*60*60_000).toISOString()).order('observed_at',{ascending:false}).limit(80);
    if (history.error) throw history.error;
    const seen = new Set<string>();
    const recentAlerts = [...alerts, ...(history.data ?? []).map(r => r.payload as SignalAlert)].filter(a => !seen.has(a.id) && !!seen.add(a.id)).slice(0,80);
    const payload = { ...base, tokens, fetchedAt: at, holderCursor: (cursor+Math.max(0,completed-priority.length))%Math.max(1,rotation.length),
      alerts: recentAlerts, recentEvents: base.recentEvents,
      storage: storage.data, ingestion: { holderCompleted:completed, priorityMints:priority.map(t=>t.mint), holderBudget: budget, holderFailures: failures.length, source: 'server-worker', interval: '5m target; scheduler dependent' },
      metricNotes: { flow: 'USD estimate from rolling 1h trade counts', freshWallets: 'newly observed token holders; not wallet creation age', whales: 'owners ≥1% supply; pool/program owners included', smartMoney: 'whale balance change at current price; not verified swap flow', volumeAcceleration: 'acceleration of rolling 1h volume, USD/min²', risk: 'heuristic, not a security audit' } };
    const saved = await db.rpc('commit_market_snapshot', { p_lease: lease, p_payload: payload, p_alerts: alerts });
    if (saved.error) throw saved.error;
    return { ok: true, tokens: tokens.length, alerts: alerts.length, holderFailures: failures.length, fetchedAt: at };
  } finally {
    await db.rpc('release_market_ingestion', { p_lease: lease });
  }
}
