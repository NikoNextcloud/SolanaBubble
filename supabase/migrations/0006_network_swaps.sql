-- Live network-wide swap flow captured from DEX program webhooks.
create table if not exists public.network_swaps (
  signature text primary key,
  user_wallet text,
  source text,
  input_mint text not null,
  output_mint text not null,
  input_amount numeric default 0,
  output_amount numeric default 0,
  block_time timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists network_swaps_time_idx
  on public.network_swaps (block_time desc);

create index if not exists network_swaps_pair_time_idx
  on public.network_swaps (input_mint, output_mint, block_time desc);

alter table public.network_swaps enable row level security;

drop policy if exists "public read" on public.network_swaps;
create policy "public read" on public.network_swaps
  for select using (true);
