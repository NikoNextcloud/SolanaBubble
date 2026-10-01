create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- A new task-scoped credential. Existing Vault credentials are never inspected.
create table if not exists public.market_worker_config (
  id int primary key check (id=1),
  secret text not null,
  endpoint text
);
alter table public.market_worker_config enable row level security;
revoke all on public.market_worker_config from anon, authenticated;
grant all on public.market_worker_config to service_role;
insert into public.market_worker_config(id,secret) values(1,gen_random_uuid()::text || gen_random_uuid()::text) on conflict do nothing;
select cron.schedule('solanabubble-market-snapshots', '*/5 * * * *', $job$
  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 180000
  ) from public.market_worker_config where id=1 and endpoint is not null;
$job$);
