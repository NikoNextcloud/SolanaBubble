alter table public.tokens
  add column if not exists icon text,
  add column if not exists creator text,
  add column if not exists solscan_holder_count bigint,
  add column if not exists metadata_updated_at timestamptz;

create table if not exists public.api_cache (
  cache_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.api_cache enable row level security;
