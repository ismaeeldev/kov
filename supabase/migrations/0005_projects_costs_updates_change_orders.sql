-- Kōv — Migration 0005: projects, project_costs, project_updates, change_orders
-- Source: docs/05_DataModel.md §2.11, §2.12, §2.13, §2.14

-- ============================================================
-- projects (chantiers)
-- ============================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  source_quote_id uuid references public.quotes(id) not null,
  source_quote_version_id uuid references public.quote_versions(id) not null,
  name text not null,
  status text check (status in ('planned','in_progress','awaiting_payment','closed')) not null default 'planned',
  planned_value_ttc numeric(10,2) not null,
  planned_margin_pct numeric(5,2) not null,
  assigned_employee_ids uuid[] default '{}',
  start_date date,
  end_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- Unique constraint on source_quote_id is what makes quote-to-chantier conversion
  -- idempotent (KOV-FR-011) — a second conversion attempt is rejected at the DB level.
  unique (source_quote_id)
);

alter table public.projects enable row level security;

create policy "projects_select_own" on public.projects
  for select using (auth.uid() = owner_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = owner_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = owner_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- project_costs
-- ============================================================
-- NOTE: source_order_id references public.orders(id), but `orders` is not created
-- until migration 0007. The column is created here WITHOUT the foreign-key
-- constraint; migration 0007 adds the constraint once `orders` exists.
create table public.project_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) not null,
  owner_id uuid references auth.users(id) not null,
  cost_type text check (cost_type in ('supply','labor_hours','misc')) not null,
  description text not null,
  amount numeric(10,2),
  hours numeric(6,2),
  hourly_rate numeric(6,2) default 38,
  source_order_id uuid,  -- FK to public.orders(id) added in migration 0007
  incurred_at date not null default current_date,
  created_at timestamptz default now()
);

alter table public.project_costs enable row level security;

create policy "project_costs_select_own" on public.project_costs
  for select using (auth.uid() = owner_id);
create policy "project_costs_insert_own" on public.project_costs
  for insert with check (auth.uid() = owner_id);
create policy "project_costs_update_own" on public.project_costs
  for update using (auth.uid() = owner_id);
create policy "project_costs_delete_own" on public.project_costs
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- project_updates
-- ============================================================
create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) not null,
  owner_id uuid references auth.users(id) not null,
  text_content text not null,
  progress_pct int check (progress_pct between 0 and 100),
  input_method text check (input_method in ('typed','voice')) default 'typed',
  sent_to_client boolean not null default false,
  client_sms_sent_at timestamptz,
  created_at timestamptz default now()
);

alter table public.project_updates enable row level security;

create policy "project_updates_select_own" on public.project_updates
  for select using (auth.uid() = owner_id);
create policy "project_updates_insert_own" on public.project_updates
  for insert with check (auth.uid() = owner_id);
create policy "project_updates_update_own" on public.project_updates
  for update using (auth.uid() = owner_id);
create policy "project_updates_delete_own" on public.project_updates
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- change_orders (avenants)
-- ============================================================
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) not null,
  owner_id uuid references auth.users(id) not null,
  generated_from_cost_ids uuid[] not null,
  lines jsonb not null,
  status text check (status in ('draft','sent','accepted','declined')) not null default 'draft',
  resulting_quote_id uuid references public.quotes(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.change_orders enable row level security;

create policy "change_orders_select_own" on public.change_orders
  for select using (auth.uid() = owner_id);
create policy "change_orders_insert_own" on public.change_orders
  for insert with check (auth.uid() = owner_id);
create policy "change_orders_update_own" on public.change_orders
  for update using (auth.uid() = owner_id);
create policy "change_orders_delete_own" on public.change_orders
  for delete using (auth.uid() = owner_id);
