-- Bounded expiring priorities for already tracked tokens only.
create table public.holder_priorities(mint text primary key references public.tokens(mint) on delete cascade,requested_at timestamptz not null,expires_at timestamptz not null);
alter table public.holder_priorities enable row level security;
revoke all on public.holder_priorities from anon,authenticated;
grant all on public.holder_priorities to service_role;
create function public.request_holder_priority(p_mint text) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(2110552026);
 if not exists(select 1 from public.tokens where mint=p_mint) then return false; end if;
 delete from public.holder_priorities where expires_at<now();
 if exists(select 1 from public.holder_priorities where mint=p_mint and requested_at>now()-interval '5 minutes') then return true; end if;
 if not exists(select 1 from public.holder_priorities where mint=p_mint) and (select count(*) from public.holder_priorities)>=20 then return false; end if;
 insert into public.holder_priorities values(p_mint,now(),now()+interval '15 minutes') on conflict(mint) do update set requested_at=excluded.requested_at,expires_at=excluded.expires_at;
 return true;
end $$;
revoke all on function public.request_holder_priority(text) from public,anon,authenticated;
grant execute on function public.request_holder_priority(text) to service_role;
