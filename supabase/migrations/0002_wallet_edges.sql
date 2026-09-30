-- Directed wallet-to-wallet token flow edges for InsightX-style graph rendering.
create table wallet_edges (
  token_mint text references tokens(mint) on delete cascade,
  from_wallet text not null,
  to_wallet text not null,
  kind text not null check (kind in ('swap','transfer')),
  amount numeric not null default 0,
  usd_value numeric not null default 0,
  tx_count int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_signature text,
  primary key (token_mint, from_wallet, to_wallet, kind),
  check (from_wallet <> to_wallet)
);
create index wallet_edges_token_target_idx on wallet_edges (token_mint, to_wallet, last_seen desc);
create index wallet_edges_token_source_idx on wallet_edges (token_mint, from_wallet, last_seen desc);
alter table wallet_edges enable row level security;
create policy "public read" on wallet_edges for select using (true);
alter publication supabase_realtime add table wallet_edges;
