import { admin } from "./db";
import { evaluatePersonalAlerts, normalizeWatchState, type PersonalAlert, type WatchToken } from "./watchlist";

export type PushJob={syncHash:string;alert:PersonalAlert};

/** Evaluate synced personal rules in the background worker without exposing sync secrets. */
export async function evaluateSyncedWatchlists(tokens: WatchToken[], observedAt: string, limit = 100) {
  const db = admin();
  const { data, error } = await db
    .from("watchlist_sync")
    .select("sync_hash,payload")
    .gt("expires_at", observedAt)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  let updated = 0;
  const jobs:PushJob[]=[];
  const now = Date.parse(observedAt);
  for (const row of data ?? []) {
    const before = normalizeWatchState(row.payload);
    const previousIds=new Set(before.alerts.map(a=>a.id));
    const next = evaluatePersonalAlerts(before, tokens, now);
    if (next === before) continue;
    const write = await db
      .from("watchlist_sync")
      .update({ payload: next, updated_at: observedAt })
      .eq("sync_hash", row.sync_hash);
    if (write.error) throw write.error;
    updated++;
    for(const alert of next.alerts)if(!previousIds.has(alert.id))jobs.push({syncHash:row.sync_hash,alert});
  }
  return {updated,jobs:jobs.slice(0,50)};
}
