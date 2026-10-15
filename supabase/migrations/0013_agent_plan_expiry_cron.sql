-- Kōv — Migration 0013: scheduled job for agent_action_plans 24h expiry sweep
-- Source: docs/06_AIPromptRegistry.md §2.3's "a plan left unconfirmed for a
-- defined window (recommended: 24 hours) transitions to status='expired' via
-- a scheduled check" — a commercial-safety review (2026-09-26) found this
-- was previously only an on-mount client-side effect (AgentPage.tsx), never
-- a real scheduled job. This migration wires pg_cron + pg_net to call the
-- new agent-plan-expiry-sweep Edge Function every hour, independent of any
-- user ever opening the app.
--
-- SETUP STEP REQUIRED AFTER THIS MIGRATION RUNS (cannot be done in SQL alone):
-- 1. `supabase secrets set CRON_SECRET=<a long random string>` — sets the Edge
--    Function's own copy of the secret.
-- 2. Store that SAME value in Supabase Vault so this migration's cron job can
--    read it at schedule-time without ever hardcoding it in a committed file:
--    `select vault.create_secret('<the same long random string>', 'cron_secret');`
--    Run this once, manually, via the SQL editor or `supabase db query --linked`
--    — never commit the actual secret value to a migration file or the repo.
-- Until step 2 is done, the scheduled job's HTTP call will send an empty/
-- wrong secret and the Edge Function will correctly reject it with 401 —
-- safe-by-default (a misconfigured cron job fails closed, never silently
-- sweeps with no auth).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Idempotent: unschedule first if a prior run of this migration already
-- created it (migrations can be re-applied to a fresh environment).
select cron.unschedule('agent-plan-expiry-sweep')
where exists (select 1 from cron.job where jobname = 'agent-plan-expiry-sweep');

select cron.schedule(
  'agent-plan-expiry-sweep',
  '0 * * * *', -- every hour, on the hour — well inside the 24h expiry window's tolerance
  $$
  select net.http_post(
    url := 'https://tgcxsfgzybdqzjlmmrkk.supabase.co/functions/v1/agent-plan-expiry-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        '' -- Vault secret not yet set (see setup step 2 above) — sends an
           -- empty header, which the Edge Function correctly rejects with
           -- 401 rather than sweeping unauthenticated.
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
