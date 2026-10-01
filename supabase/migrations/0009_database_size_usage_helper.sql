create or replace function public.database_size_bytes()
returns bigint
language sql
security definer
set search_path = pg_catalog
as $$
  select pg_database_size(current_database());
$$;

revoke all on function public.database_size_bytes() from public;
grant execute on function public.database_size_bytes() to service_role;
