-- Bounded archive recycling only. Current tokens, holders, transactions and
-- market cache remain intact. DELETE creates reusable space after autovacuum;
-- PostgreSQL allocated files are not guaranteed to shrink to the threshold.
create function public.enforce_market_storage_limit()
returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$
declare
  allocated bigint:=pg_database_size(current_database());
  snapshots_removed int:=0; alerts_removed int:=0; observations_removed int:=0; caches_removed int:=0;
begin
  if allocated>=499000000 then
    if not pg_try_advisory_xact_lock(4992026) then
      return jsonb_build_object('limitBytes',499000000,'databaseBytes',allocated,'cleanupRunning',true);
    end if;
    -- Preserve seven hours, including baselines for the six-hour comparison.
    delete from public.market_snapshots where (mint,observed_at) in
      (select mint,observed_at from public.market_snapshots where observed_at<now()-interval '7 hours' order by observed_at limit 1000);
    get diagnostics snapshots_removed=row_count;
    delete from public.market_alerts where id in
      (select id from public.market_alerts where observed_at<now()-interval '7 hours' order by observed_at limit 500);
    get diagnostics alerts_removed=row_count;
    delete from public.holder_observations where (mint,observed_at) in
      (select mint,observed_at from public.holder_observations where observed_at<now()-interval '8 hours' order by observed_at limit 100);
    get diagnostics observations_removed=row_count;
    delete from public.api_cache where cache_key in
      (select cache_key from public.api_cache where cache_key like 'intelligence:holders:%' and updated_at<now()-interval '24 hours' order by updated_at limit 50);
    get diagnostics caches_removed=row_count;
  end if;
  return jsonb_build_object('limitBytes',499000000,'databaseBytes',allocated,'underPressure',allocated>=499000000,
    'recycledRows',snapshots_removed+alerts_removed+observations_removed+caches_removed,
    'policy','bounded old analytics only; preserve 7h; freed pages reusable after vacuum');
end $$;
revoke all on function public.enforce_market_storage_limit() from public,anon,authenticated;
grant execute on function public.enforce_market_storage_limit() to service_role;
select cron.schedule('solanabubble-storage-retention','* * * * *',$job$ select public.enforce_market_storage_limit(); $job$);
