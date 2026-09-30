-- Count repeated cluster signals without duplicating wallet_links rows.
alter table public.wallet_links
  add column if not exists signal_count int not null default 1,
  add column if not exists last_seen timestamptz not null default now();

update public.wallet_links
set last_seen = coalesce(last_seen, created_at, now())
where last_seen is null;
