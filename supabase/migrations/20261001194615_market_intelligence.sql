create table if not exists public.market_snapshots (
  mint text not null,
  observed_at timestamptz not null,
  payload jsonb not null,
  primary key (mint, observed_at)
);
create index if not exists market_snapshots_time_idx on public.market_snapshots(observed_at);
create table if not exists public.market_alerts (
  id text primary key,
  mint text not null,
  kind text not null,
  observed_at timestamptz not null,
  payload jsonb not null
);
create index if not exists market_alerts_time_idx on public.market_alerts(observed_at desc);
create table if not exists public.market_ingestion_state (
  id int primary key check (id = 1),
  lease uuid,
  lease_until timestamptz,
  last_success timestamptz
);
insert into public.market_ingestion_state(id) values (1) on conflict do nothing;
alter table public.market_snapshots enable row level security;
alter table public.market_alerts enable row level security;
alter table public.market_ingestion_state enable row level security;
revoke all on public.market_snapshots, public.market_alerts, public.market_ingestion_state from anon, authenticated;
grant all on public.market_snapshots, public.market_alerts, public.market_ingestion_state to service_role;

create or replace function public.claim_market_ingestion(p_lease uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update public.market_ingestion_state set lease = p_lease, lease_until = now() + interval '4 minutes'
  where id=1 and (lease_until is null or lease_until < now());
  return found;
end $$;
create or replace function public.release_market_ingestion(p_lease uuid)
returns void language sql security invoker set search_path = public as $$
  update public.market_ingestion_state set lease_until = null, lease = null where id=1 and lease=p_lease;
$$;
create or replace function public.commit_market_snapshot(p_lease uuid, p_payload jsonb, p_alerts jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.market_ingestion_state where id=1 and lease=p_lease and lease_until > now() for update;
  if not found then raise exception 'Ingestion lease expired'; end if;
  insert into public.market_snapshots(mint,observed_at,payload)
    select t->>'mint', (p_payload->>'fetchedAt')::timestamptz, t from jsonb_array_elements(p_payload->'tokens') t
    on conflict do nothing;
  insert into public.market_alerts(id,mint,kind,observed_at,payload)
    select a->>'id', a->>'mint', a->>'kind', (a->>'at')::timestamptz, a from jsonb_array_elements(p_alerts) a
    on conflict do nothing;
  insert into public.api_cache(cache_key,payload,updated_at) values ('market:snapshot',p_payload,(p_payload->>'fetchedAt')::timestamptz)
    on conflict(cache_key) do update set payload=excluded.payload, updated_at=excluded.updated_at;
  delete from public.market_snapshots where observed_at < now()-interval '7 days';
  delete from public.market_alerts where observed_at < now()-interval '7 days';
  update public.market_ingestion_state set last_success=now(),lease=null,lease_until=null where id=1;
end $$;
revoke all on function public.claim_market_ingestion(uuid), public.release_market_ingestion(uuid), public.commit_market_snapshot(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.claim_market_ingestion(uuid), public.release_market_ingestion(uuid), public.commit_market_snapshot(uuid,jsonb,jsonb) to service_role;
