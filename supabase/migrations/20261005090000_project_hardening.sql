-- Project hardening: serialize expensive token bootstrap work and lock down DB size helper.
create table if not exists public.token_bootstrap_leases (
  mint text primary key,
  lease_until timestamptz not null default '-infinity',
  started_at timestamptz,
  finished_at timestamptz,
  last_error text
);
alter table public.token_bootstrap_leases enable row level security;
revoke all on public.token_bootstrap_leases from public,anon,authenticated;
grant all on public.token_bootstrap_leases to service_role;

create or replace function public.claim_token_bootstrap(
  p_mint text,
  p_lease interval default interval '5 minutes'
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  changed integer := 0;
  active_count integer := 0;
begin
  if p_mint is null or p_mint !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' then
    return false;
  end if;

  -- One global lock keeps the active bootstrap ceiling deterministic across serverless instances.
  perform pg_advisory_xact_lock(hashtext('solanabubble:token-bootstrap'));
  select count(*) into active_count
  from public.token_bootstrap_leases
  where lease_until > now() and mint <> p_mint;

  if active_count >= 3 then
    return false;
  end if;

  insert into public.token_bootstrap_leases(mint,lease_until,started_at,finished_at,last_error)
  values(p_mint,now()+p_lease,now(),null,null)
  on conflict(mint) do update
    set lease_until=excluded.lease_until,
        started_at=excluded.started_at,
        finished_at=null,
        last_error=null
  where public.token_bootstrap_leases.lease_until <= now()
    and (
      public.token_bootstrap_leases.last_error is null
      or public.token_bootstrap_leases.started_at <= now()-interval '2 minutes'
    );

  get diagnostics changed = row_count;
  return changed > 0;
end
$$;

create or replace function public.finish_token_bootstrap(p_mint text,p_error text default null)
returns void
language sql
security definer
set search_path=public,pg_temp
as $$
  update public.token_bootstrap_leases
  set lease_until=now(),
      finished_at=now(),
      last_error=left(p_error,120)
  where mint=p_mint;
$$;

revoke all on function public.claim_token_bootstrap(text,interval) from public,anon,authenticated;
revoke all on function public.finish_token_bootstrap(text,text) from public,anon,authenticated;
grant execute on function public.claim_token_bootstrap(text,interval) to service_role;
grant execute on function public.finish_token_bootstrap(text,text) to service_role;

-- This helper is service-only; production drift previously left it callable from exposed roles.
revoke all on function public.database_size_bytes() from public,anon,authenticated;
grant execute on function public.database_size_bytes() to service_role;
