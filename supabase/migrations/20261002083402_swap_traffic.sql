-- Compact, service-only recognized swap samples; no raw transaction payloads.
create table public.traffic_swaps (
 mint text not null,pool text not null,signature text not null,wallet text not null,
 side text not null check(side in ('buy','sell')),token_amount double precision not null,
 quote_mint text not null,quote_amount double precision not null,usd_value double precision,
 block_at timestamptz not null,observed_at timestamptz not null,program text not null,
 primary key(mint,signature,wallet)
);
create index traffic_swaps_mint_time on public.traffic_swaps(mint,block_at);
create index traffic_swaps_time on public.traffic_swaps(block_at);
create table public.traffic_scans(mint text not null,scanned_at timestamptz not null,payload jsonb not null,primary key(mint,scanned_at));
create index traffic_scans_time on public.traffic_scans(scanned_at);
alter table public.traffic_swaps enable row level security;
alter table public.traffic_scans enable row level security;
revoke all on public.traffic_swaps,public.traffic_scans from anon,authenticated;
grant all on public.traffic_swaps,public.traffic_scans to service_role;
create function public.save_traffic_sample(p_mint text,p_at timestamptz,p_swaps jsonb,p_scan jsonb)
returns void language plpgsql security invoker set search_path=public as $$
begin
 insert into public.traffic_swaps
 select p_mint,s.pool,s.signature,s.wallet,s.side,s.token_amount,s.quote_mint,s.quote_amount,s.usd_value,s.block_at,p_at,s.program
 from jsonb_to_recordset(p_swaps) as s(pool text,signature text,wallet text,side text,token_amount double precision,quote_mint text,quote_amount double precision,usd_value double precision,block_at timestamptz,program text)
 on conflict do nothing;
 insert into public.traffic_scans values(p_mint,p_at,p_scan) on conflict do nothing;
 delete from public.traffic_swaps where block_at<now()-interval '2 hours';
 delete from public.traffic_scans where scanned_at<now()-interval '2 hours';
end $$;
revoke all on function public.save_traffic_sample(text,timestamptz,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_traffic_sample(text,timestamptz,jsonb,jsonb) to service_role;

