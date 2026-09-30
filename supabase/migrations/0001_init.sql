-- Solana Bubbles: схема. Запис само със service role; четене публично (RLS).
create table tokens (
  mint text primary key,
  symbol text, name text,
  decimals int not null default 6,
  supply numeric,
  price_usd numeric default 0,
  bootstrapped_at timestamptz,
  created_at timestamptz default now()
);
create table holdings (
  token_mint text references tokens(mint) on delete cascade,
  wallet text not null,
  balance numeric not null,
  usd_value numeric default 0,
  pct_supply numeric default 0,
  cluster_id int,
  funder text,
  first_activity timestamptz,
  last_activity timestamptz,
  bought_usd numeric default 0,
  sold_usd numeric default 0,
  primary key (token_mint, wallet)
);
create index on holdings (token_mint, balance desc);
create table transactions (
  signature text not null,
  token_mint text references tokens(mint) on delete cascade,
  wallet text not null,
  side text not null check (side in ('buy','sell','transfer_in','transfer_out')),
  amount numeric not null,
  usd_value numeric default 0,
  block_time timestamptz not null,
  primary key (signature, wallet, token_mint)
);
create index on transactions (token_mint, wallet, block_time desc);
create index on transactions (token_mint, block_time desc);
create table wallet_links (
  token_mint text references tokens(mint) on delete cascade,
  wallet_a text not null, wallet_b text not null,
  kind text not null check (kind in ('funder','timing')),
  evidence text,
  created_at timestamptz default now(),
  primary key (token_mint, wallet_a, wallet_b, kind),
  check (wallet_a < wallet_b)
);
alter table tokens enable row level security;
alter table holdings enable row level security;
alter table transactions enable row level security;
alter table wallet_links enable row level security;
create policy "public read" on tokens for select using (true);
create policy "public read" on holdings for select using (true);
create policy "public read" on transactions for select using (true);
create policy "public read" on wallet_links for select using (true);
alter publication supabase_realtime add table holdings, wallet_links;
