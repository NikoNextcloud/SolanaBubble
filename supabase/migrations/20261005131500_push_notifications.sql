-- Browser push subscriptions for synced anonymous watchlists.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  sync_hash text not null references public.watchlist_sync(sync_hash) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_sync_hash_idx on public.push_subscriptions(sync_hash);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
grant all on public.push_subscriptions to service_role;

create table if not exists public.push_dispatch_config (
  id integer primary key check(id=1),
  endpoint text not null,
  secret text not null,
  updated_at timestamptz not null default now()
);
alter table public.push_dispatch_config enable row level security;
revoke all on public.push_dispatch_config from public,anon,authenticated;
grant all on public.push_dispatch_config to service_role;
