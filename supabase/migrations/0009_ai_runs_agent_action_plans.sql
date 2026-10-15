-- Kōv — Migration 0009: ai_runs, agent_action_plans
-- Source: docs/05_DataModel.md §2.21, §2.22

-- ============================================================
-- ai_runs
-- ============================================================
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  run_type text check (run_type in ('quote_draft','agent_intent','agent_plan')) not null,
  input_summary jsonb,
  output_summary jsonb,
  model_id text not null,
  prompt_version text not null,
  cost_usd numeric(8,4),
  duration_ms int,
  status text check (status in ('completed','failed','timeout')) not null,
  idempotency_key text unique,
  created_at timestamptz default now()
);

alter table public.ai_runs enable row level security;

create policy "ai_runs_select_own" on public.ai_runs
  for select using (auth.uid() = owner_id);
create policy "ai_runs_insert_own" on public.ai_runs
  for insert with check (auth.uid() = owner_id);
create policy "ai_runs_update_own" on public.ai_runs
  for update using (auth.uid() = owner_id);
create policy "ai_runs_delete_own" on public.ai_runs
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- agent_action_plans
-- ============================================================
create table public.agent_action_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  ai_run_id uuid references public.ai_runs(id) not null,
  source_utterance text not null,
  detected_intent text,
  matched_client_id uuid references public.clients(id),
  matched_project_id uuid references public.projects(id),
  match_confidence numeric(4,3),
  plan_steps jsonb not null,
  status text check (status in ('proposed','confirmed','partially_confirmed','dismissed','expired')) not null default 'proposed',
  executed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.agent_action_plans enable row level security;

create policy "agent_action_plans_select_own" on public.agent_action_plans
  for select using (auth.uid() = owner_id);
create policy "agent_action_plans_insert_own" on public.agent_action_plans
  for insert with check (auth.uid() = owner_id);
create policy "agent_action_plans_update_own" on public.agent_action_plans
  for update using (auth.uid() = owner_id);
create policy "agent_action_plans_delete_own" on public.agent_action_plans
  for delete using (auth.uid() = owner_id);
