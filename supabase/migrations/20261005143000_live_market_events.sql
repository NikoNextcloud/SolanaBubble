-- Realtime capital-flow events for the market map. Public read, service-only write.
create table if not exists public.live_market_events (
  mint text not null,
  signature text not null,
  wallet text not null,
  pool text not null,
  side text not null check(side in ('buy','sell')),
  usd_value double precision,
  quote_mint text not null,
  quote_amount double precision not null,
  evidence text not null check(evidence in ('direct','routed')),
  program text not null,
  block_at timestamptz not null,
  whale boolean not null default false,
  wallet_pct_supply double precision,
  observed_at timestamptz not null default now(),
  primary key(mint,signature,wallet)
);
create index if not exists live_market_events_time_idx on public.live_market_events(block_at desc);
create index if not exists live_market_events_mint_time_idx on public.live_market_events(mint,block_at desc);
alter table public.live_market_events enable row level security;
revoke all on public.live_market_events from public,authenticated;
grant select on public.live_market_events to anon;
grant all on public.live_market_events to service_role;
drop policy if exists live_market_events_recent_read on public.live_market_events;
create policy live_market_events_recent_read on public.live_market_events
  for select to anon using (block_at > now()-interval '20 minutes');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='live_market_events'
  ) then
    alter publication supabase_realtime add table public.live_market_events;
  end if;
end $$;
