-- Project hardening: serialize expensive token bootstrap work, sync watchlists securely, and lock down DB helpers.
create table if not exists public.watchlist_sync (
  sync_hash text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '365 days'
);
create index if not exists watchlist_sync_expires_idx on public.watchlist_sync(expires_at);
alter table public.watchlist_sync enable row level security;
revoke all on public.watchlist_sync from public,anon,authenticated;
grant all on public.watchlist_sync to service_role;

create table if not exists public.token_bootstrap_leases (
  mint text primary key,
  lease_until timestamptz not null default '-infinity',
  started_at timestamptz,
  finished_at timestamptz,
  last_error text
);
alter table public.token_bootstrap_leases enable row level security;
revoke all on public.token_bootstrap_leases from public,anon,authenticated;
grant all on public.token_bootstrap_leases to service_role;

create or replace function public.claim_token_bootstrap(
  p_mint text,
  p_lease interval default interval '5 minutes'
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  changed integer := 0;
  active_count integer := 0;
begin
  if p_mint is null or p_mint !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    return false;
  end if;

  -- One global lock keeps the active bootstrap ceiling deterministic across serverless instances.
  perform pg_advisory_xact_lock(hashtext('solanabubble:token-bootstrap'));
  select count(*) into active_count
  from public.token_bootstrap_leases
  where lease_until > now() and mint <> p_mint;

  if active_count >= 3 then
    return false;
  end if;

  insert into public.token_bootstrap_leases(mint,lease_until,started_at,finished_at,last_error)
  values(p_mint,now()+p_lease,now(),null,null)
  on conflict(mint) do update
    set lease_until=excluded.lease_until,
        started_at=excluded.started_at,
        finished_at=null,
        last_error=null
  where public.token_bootstrap_leases.lease_until <= now()
    and (
      public.token_bootstrap_leases.last_error is null
      or public.token_bootstrap_leases.started_at <= now()-interval '2 minutes'
    );

  get diagnostics changed = row_count;
  return changed > 0;
end
$$;

create or replace function public.finish_token_bootstrap(p_mint text,p_error text default null)
returns void
language sql
security definer
set search_path=public,pg_temp
as $$
  update public.token_bootstrap_leases
  set lease_until=now(),
      finished_at=now(),
      last_error=left(p_error,120)
  where mint=p_mint;
$$;

revoke all on function public.claim_token_bootstrap(text,interval) from public,anon,authenticated;
revoke all on function public.finish_token_bootstrap(text,text) from public,anon,authenticated;
grant execute on function public.claim_token_bootstrap(text,interval) to service_role;
grant execute on function public.finish_token_bootstrap(text,text) to service_role;

-- This helper is service-only; production drift previously left it callable from exposed roles.
revoke all on function public.database_size_bytes() from public,anon,authenticated;
grant execute on function public.database_size_bytes() to service_role;

-- Preserve evidence quality when broadening traffic coverage.
alter table public.traffic_swaps add column if not exists evidence text not null default 'direct';
alter table public.traffic_swaps drop constraint if exists traffic_swaps_evidence_check;
alter table public.traffic_swaps add constraint traffic_swaps_evidence_check check(evidence in ('direct','routed'));

create or replace function public.save_traffic_sample(p_mint text,p_at timestamptz,p_swaps jsonb,p_scan jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
 insert into public.traffic_swaps
  (mint,pool,signature,wallet,side,token_amount,quote_mint,quote_amount,usd_value,block_at,observed_at,program,evidence)
 select p_mint,s.pool,s.signature,s.wallet,s.side,s.token_amount,s.quote_mint,s.quote_amount,s.usd_value,s.block_at,p_at,s.program,coalesce(s.evidence,'direct')
 from jsonb_to_recordset(p_swaps) as s(pool text,signature text,wallet text,side text,token_amount double precision,quote_mint text,quote_amount double precision,usd_value double precision,block_at timestamptz,program text,evidence text)
 on conflict do nothing;
 insert into public.traffic_scans values(p_mint,p_at,p_scan) on conflict do nothing;
 delete from public.traffic_swaps where block_at<now()-interval '2 hours';
 delete from public.traffic_scans where scanned_at<now()-interval '2 hours';
end $$;
revoke all on function public.save_traffic_sample(text,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_traffic_sample(text,timestamptz,jsonb,jsonb) to service_role;
