-- Holder membership retained for eight hours; public chart history remains seven days.
create table public.holder_observations (
  mint text not null,
  observed_at timestamptz not null,
  wallets text[] not null,
  payload jsonb not null,
  primary key(mint,observed_at)
);
create index holder_observations_time_idx on public.holder_observations(observed_at);
alter table public.holder_observations enable row level security;
revoke all on public.holder_observations from anon,authenticated;
grant all on public.holder_observations to service_role;
insert into public.holder_observations(mint,observed_at,wallets,payload)
select split_part(cache_key,':',3),updated_at,
  array(select h->>'wallet' from jsonb_array_elements(payload->'balances') h),payload->'metrics'
from public.api_cache where cache_key like 'intelligence:holders:%'
  and updated_at > now()-interval '8 hours' and jsonb_typeof(payload->'balances')='array'
on conflict do nothing;

create function public.market_window_baselines(p_mints text[],p_at timestamptz)
returns table(mint text,window_minutes int,observed_at timestamptz,payload jsonb)
language sql stable security invoker set search_path=public as $$
  select m,w.minutes,b.observed_at,b.payload from unnest(p_mints) m
  cross join (values(5,3),(15,4),(60,15),(360,60)) w(minutes,tolerance)
  cross join lateral (
    select s.observed_at,s.payload from public.market_snapshots s
    where s.mint=m and s.observed_at <= p_at-make_interval(mins=>w.minutes)
      and s.observed_at >= p_at-make_interval(mins=>w.minutes+w.tolerance)
    order by s.observed_at desc limit 1
  ) b;
$$;
create function public.holder_window_comparisons(p_mint text,p_at timestamptz,p_wallets text[])
returns jsonb language sql stable security invoker set search_path=public as $$
 select coalesce(jsonb_object_agg(w.minutes::text,jsonb_build_object(
   'baselineAt',b.observed_at,'observedAt',p_at,'elapsedMinutes',extract(epoch from (p_at-b.observed_at))/60,
   'holderGrowth',cardinality(p_wallets)-cardinality(b.wallets),
   'holderGrowthPct',case when cardinality(b.wallets)>0 then (cardinality(p_wallets)-cardinality(b.wallets))*100.0/cardinality(b.wallets) end,
   'newHolders',(select count(*) from (select unnest(p_wallets) except select unnest(b.wallets)) x),
   'exitedHolders',(select count(*) from (select unnest(b.wallets) except select unnest(p_wallets)) x)
  )), '{}'::jsonb)
 from (values(5,3),(15,4),(60,15),(360,60)) w(minutes,tolerance)
 cross join lateral (
  select h.wallets,h.observed_at from public.holder_observations h
  where h.mint=p_mint and h.observed_at<=p_at-make_interval(mins=>w.minutes)
    and h.observed_at>=p_at-make_interval(mins=>w.minutes+w.tolerance)
  order by h.observed_at desc limit 1
 ) b;
$$;
create function public.save_holder_observation(p_mint text,p_at timestamptz,p_payload jsonb,p_wallets text[])
returns void language plpgsql security invoker set search_path=public as $$
begin
  insert into public.holder_observations values(p_mint,p_at,p_wallets,p_payload->'metrics') on conflict do nothing;
  insert into public.api_cache(cache_key,payload,updated_at) values('intelligence:holders:'||p_mint,p_payload,p_at)
    on conflict(cache_key) do update set payload=excluded.payload,updated_at=excluded.updated_at;
  delete from public.holder_observations where observed_at<p_at-interval '8 hours';
end $$;
revoke all on function public.market_window_baselines(text[],timestamptz),public.holder_window_comparisons(text,timestamptz,text[]),public.save_holder_observation(text,timestamptz,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.market_window_baselines(text[],timestamptz),public.holder_window_comparisons(text,timestamptz,text[]),public.save_holder_observation(text,timestamptz,jsonb,text[]) to service_role;

