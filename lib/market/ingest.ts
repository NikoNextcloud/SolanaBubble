import {selectHolderWork} from './scheduling';
import {adaptiveTrafficBudget,selectAdaptiveTrafficWork} from './adaptive-traffic';
import { randomUUID } from 'node:crypto';
import { admin } from '../db';
import { collectMarket } from './collect';
import { compareMarketWindows, type MarketBaseline } from './windows';
import {observeTraffic} from './traffic/observe';
import {WSOL_MINT} from './traffic/decode';
import {fetchDexScreenerToken} from '../solana-public';
import { observeHolders } from './holders';
import { collapseAlertHistory, deriveSignals, evaluateAlerts, prioritizeAlerts, suppressRepeatedAlerts, type SignalToken, type Intelligence, type SignalAlert } from './signals';
import { evaluateSyncedWatchlists } from '../watchlist-server';
import {goodOpportunitySignal,tokenStrength} from './wave-map';

export async function ingestMarket() {
  const ingestionStarted=Date.now();
  const db = admin(), lease = randomUUID();
  const claim = await db.rpc('claim_market_ingestion', { p_lease: lease });
  if (claim.error) throw claim.error;
  if (!claim.data) return { skipped: true, reason: 'Ingestion already running' };
  let lastSuccessAt:string|null=null;
  try {
    const status=await db.from('api_cache').select('payload').eq('cache_key','worker:status').maybeSingle();
    const lastStatus=status.data?.payload??{};lastSuccessAt=lastStatus.lastSuccessAt??null;
    const statusStart=await db.from('api_cache').upsert({cache_key:'worker:status',payload:{state:'running',startedAt:new Date(ingestionStarted).toISOString(),lastSuccessAt},updated_at:new Date().toISOString()});if(statusStart.error)throw statusStart.error;
    const storage = await db.rpc('enforce_market_storage_limit');
    if(storage.error) throw storage.error;
    const { data: cached, error } = await db.from('api_cache').select('payload').eq('cache_key', 'market:snapshot').maybeSingle();
    if (error) throw error;
    const previous = cached?.payload;
    const tracked=await db.from('tokens').select('mint').order('metadata_updated_at',{ascending:false,nullsFirst:false}).limit(20);
    if(tracked.error) throw tracked.error;
    const priorities=await db.from('holder_priorities').select('mint,requested_at').gt('expires_at',new Date().toISOString()).order('requested_at',{ascending:true}).limit(20);if(priorities.error)throw priorities.error;
    const wanted=(priorities.data??[]).map(p=>p.mint);
    const trackedMints=[...new Set([...wanted,...(tracked.data??[]).map(t=>t.mint)])].slice(0,20);
    const base = await collectMarket(previous,trackedMints);
    const prevTokens = new Map<string, SignalToken>((previous?.tokens ?? []).map((t: SignalToken) => [t.mint, t]));
    const mints = base.tokens.map(t => t.mint);
    const { data: holders, error: holderError } = await db.from('api_cache').select('cache_key,payload,updated_at').in('cache_key', mints.map(m => `intelligence:holders:${m}`));
    if (holderError) throw holderError;
    const observations = new Map<string, Intelligence>((holders ?? []).map(h => [h.cache_key.split(':').at(-1)!, h.payload.metrics]));
    const holderCeiling=Math.min(6,Math.max(0,Number(process.env.MARKET_HOLDER_BUDGET??3)||0));
    const stablePrevious=Number(lastStatus.durationMs??Infinity)<20000&&Number(lastStatus.holderFailures??1)===0&&Number(lastStatus.trafficFailures??1)===0;
    const budget=Math.min(holderCeiling,stablePrevious?3:2);
    const cursor = Number(previous?.holderCursor ?? 0) % Math.max(1, mints.length);
    const failures: string[] = [];
    const trackedSet=new Set(trackedMints);
    const work=selectHolderWork(base.tokens.filter(t=>trackedSet.has(t.mint)),wanted,cursor,budget);
    const {priority,rotating:rotation,candidates}=work;
    let completed=0;
    for(const t of candidates.slice(0,budget)) {
      if(Date.now()-ingestionStarted>55_000) break;
      try { observations.set(t.mint,await observeHolders(t.mint,t.priceUsd));
        const requested=(priorities.data??[]).find(p=>p.mint===t.mint);if(requested){const removed=await db.from('holder_priorities').delete().eq('mint',t.mint).lte('requested_at',requested.requested_at);if(removed.error)throw removed.error;}
      }
      catch { failures.push(t.mint); }
      completed++;
    }
    // Traffic stays on the worker, under a global time and RPC budget.
    const trafficUniverse=base.tokens.filter(t=>trackedSet.has(t.mint)&&t.pairAddress).slice(0,20).map(t=>({
      ...t,
      trafficObservedAt:prevTokens.get(t.mint)?.trafficObservedAt??null,
      trafficEvidence:prevTokens.get(t.mint)?.trafficEvidence??null,
    }));
    const trafficCeiling=Math.min(6,Math.max(0,Number(process.env.MARKET_TRAFFIC_BUDGET??5)||0));
    const trafficBudget=adaptiveTrafficBudget(trafficCeiling,lastStatus);
    const trafficWork=selectAdaptiveTrafficWork(trafficUniverse,wanted,Number(previous?.trafficCursor??0),trafficBudget);
    const trafficCandidates=trafficWork.candidates;
    let trafficCompleted=0,trafficFailures=0;
    const trafficByMint=new Map<string,any>();
    const trafficCache=await db.from('api_cache').select('cache_key,payload').in('cache_key',mints.map(m=>`intelligence:traffic:${m}`));
    if(trafficCache.error)throw trafficCache.error;
    for(const row of trafficCache.data??[])trafficByMint.set(row.cache_key.split(':').at(-1)!,row.payload);
    const solMarket=trafficCandidates.length?await fetchDexScreenerToken(WSOL_MINT).catch(()=>null):null;
    for(let i=0;i<Math.min(trafficBudget,trafficCandidates.length)&&Date.now()-ingestionStarted<90000;i++){
      const t=trafficCandidates[i];
      try{trafficByMint.set(t.mint,await observeTraffic(t,solMarket?.priceUsd??null,observations.get(t.mint),ingestionStarted+110000));}catch{trafficFailures++;}
      trafficCompleted++;
    }
    const at = new Date().toISOString();
    const baselines=await db.rpc('market_window_baselines',{p_mints:mints,p_at:at});
    if(baselines.error) throw baselines.error;
    const tokens = base.tokens.map(t => {
      const holder = observations.get(t.mint);
      const fresh = holder?.holderObservedAt && Date.now() - Date.parse(holder.holderObservedAt) < 60 * 60_000;
      const metrics: Intelligence = fresh ? holder : { holderCount: null, holderGrowth: null, holderGrowthPct: null, freshWallets: null, top10SupplyPct: null, linkedWallets: null, suspiciousWallets: null, whaleEnter: null, whaleExit: null, smartMoneyFlowUsd: null, holderObservedAt: holder?.holderObservedAt ?? null };
      if(!fresh) Object.assign(metrics,{newHolders:null,exitedHolders:null,largestHolderPct:null,whaleConcentrationPct:null,linkedSupplyPct:null,holderWindows:{},topHolderSales:[]});
      const sample=trafficByMint.get(t.mint);
      const enriched = { ...t, ...metrics,trafficSample:sample?.pools?.includes(t.pairAddress)?sample:sample?.pool===t.pairAddress?sample:null };
      const windows=compareMarketWindows(enriched,at,(baselines.data ?? []) as MarketBaseline[];
      const derived=deriveSignals({...enriched,windows}, prevTokens.get(t.mint), at, previous?.fetchedAt);
      const withSignals={...enriched,windows,...derived,
        // Directional volume estimate based on trade counts, not measured capital transfers.
        netFlowUsd1h: t.volume1h * (t.buys1h - t.sells1h) / Math.max(1, t.trades1h)};
      const flow5=withSignals.trafficSample?.windows?.['5'];
      const strength=tokenStrength(flow5?.buys??withSignals.buys1h??0,flow5?.sells??withSignals.sells1h??0,flow5?.buyUsd??null,flow5?.sellUsd??null);
      const good=goodOpportunitySignal(withSignals as any,strength);
      return {...withSignals,goodOpportunityScore:good.score,goodOpportunityTier:good.tier,goodOpportunityActive:good.active,goodOpportunityStrength:strength,goodOpportunityReasons:good.reasons,goodOpportunityBlockers:good.blockers};
    });
    const [history,cooldownHistory]=await Promise.all([
      db.from('market_alerts').select('payload').gte('observed_at',new Date(Date.now()-24*60*60_000).toISOString()).order('observed_at',{ascending:false}).limit(80),
      db.from('market_alerts').select('payload').gte('observed_at',new Date(Date.now()-30*60_000).toISOString()).order('observed_at',{ascending:false}).limit(500)
    ]);
    if(history.error||cooldownHistory.error)throw history.error??cooldownHistory.error;
    const historicalAlerts=(history.data??[]).map(r=>r.payload as SignalAlert),cooldownAlerts=(cooldownHistory.data??[]).map(r=>r.payload as SignalAlert),alerts=prioritizeAlerts(suppressRepeatedAlerts(tokens.flatMap(t=>evaluateAlerts(t,prevTokens.get(t.mint),at)),cooldownAlerts));
    const recentAlerts=collapseAlertHistory([...alerts,...historicalAlerts]).slice(0,80);
    const payload = { ...base, tokens, fetchedAt: at, holderCursor: (cursor+Math.max(0,completed-priority.length))%Math.max(1,rotation.length),
      trafficCursor:(Number(previous?.trafficCursor??0)+1)%Math.max(1,trafficWork.rotation.length), alerts: recentAlerts, recentEvents: base.recentEvents,
      storage: storage.data, ingestion: { trafficCompleted,trafficFailures,trafficUniverse:trafficUniverse.length,trafficBudget,holderCompleted:completed, priorityMints:priority.map(t=>t.mint), holderBudget: budget, holderFailures: failures.length, source: 'server-worker', interval: '5m target; scheduler dependent' },
      metricNotes: { trafficScheduler: 'adaptive activity + staleness ranking with one fair-rotation slot', flow: 'USD estimate from rolling 1h trade counts', freshWallets: 'newly observed token holders; not wallet creation age', whales: 'owners ≥1% supply; pool/program owners included', smartMoney: 'whale balance change at current price; not verified swap flow', volumeAcceleration: 'acceleration of rolling 1h volume, USD/min²', risk: 'heuristic, not a security audit' } };
    const saved = await db.rpc('commit_market_snapshot', { p_lease: lease, p_payload: payload, p_alerts: alerts });
    if (saved.error) throw saved.error;
    let syncedWatchlists=0;
    try {
      const syncResult=await evaluateSyncedWatchlists(tokens.map(t=>({...t,marketObservedAt:at})),at);
      syncedWatchlists=syncResult.updated;
      if(syncResult.jobs.length){
        const config=await db.from('push_dispatch_config').select('endpoint,secret').eq('id',1).maybeSingle();
        if(config.data?.endpoint&&config.data?.secret){
          await fetch(config.data.endpoint,{
            method:'POST',
            headers:{'content-type':'application/json','x-push-dispatch-secret':config.data.secret},
            body:JSON.stringify({jobs:syncResult.jobs}),
            signal:AbortSignal.timeout(8000),
          }).catch(()=>{});
        }
      }
    } catch {
      // Personal sync/push must never make market ingestion fail.
    }
    const finishedAt=new Date().toISOString();
    const statusDone=await db.from('api_cache').upsert({cache_key:'worker:status',payload:{state:'ok',startedAt:new Date(ingestionStarted).toISOString(),finishedAt,lastSuccessAt:at,durationMs:Date.now()-ingestionStarted,holderFailures:failures.length,trafficFailures,holderCompleted:completed,trafficCompleted,tokens:tokens.length,recentHolders:tokens.filter(t=>t.holderObservedAt&&Date.now()-Date.parse(t.holderObservedAt)<3600000).length,recentTraffic:tokens.filter(t=>t.trafficObservedAt&&Date.now()-Date.parse(t.trafficObservedAt)<600000).length,usableTraffic:tokens.filter(t=>t.trafficEvidence==='usable'&&t.trafficObservedAt&&Date.now()-Date.parse(t.trafficObservedAt)<600000).length,holderBudget:budget,trafficBudget,trafficCeiling,trafficScheduler:'adaptive-v1',trafficDiagnostics:tokens.reduce((acc:Record<string,number>,t)=>{for(const [k,v] of Object.entries(t.trafficSample?.failures??{}))acc[k]=(acc[k]??0)+Number(v);return acc;},{}),priorityMints:priority.map(t=>t.mint),syncedWatchlists},updated_at:finishedAt});if(statusDone.error)throw statusDone.error;
    return { ok: true, tokens: tokens.length, alerts: alerts.length, holderFailures: failures.length, fetchedAt: at };
  } catch(error) {
    await db.from('api_cache').upsert({cache_key:'worker:status',payload:{state:'error',startedAt:new Date(ingestionStarted).toISOString(),finishedAt:new Date().toISOString(),lastSuccessAt,error:'Background ingestion failed; previous market cache retained'},updated_at:new Date().toISOString()});throw error;
  } finally {
    await db.rpc('release_market_ingestion', { p_lease: lease });
  }
}
