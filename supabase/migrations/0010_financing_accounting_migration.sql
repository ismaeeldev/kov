-- Kōv — Migration 0010: financing_simulations, accounting_exports, migration_imports
-- Source: docs/05_DataModel.md §2.23, §2.24, §2.25

-- ============================================================
-- financing_simulations
-- ============================================================
create table public.financing_simulations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  project_id uuid references public.projects(id),
  partner text check (partner in ('eco_ptz','domofinance','franfinance','sofinco')) not null,
  amount numeric(10,2) not null,
  term_months int not null,
  rate_pct numeric(5,3) not null,
  monthly_payment numeric(10,2) not null,
  indicative_only boolean not null default true,
  sent_to_client boolean not null default false,
  created_at timestamptz default now()
);

alter table public.financing_simulations enable row level security;

create policy "financing_simulations_select_own" on public.financing_simulations
  for select using (auth.uid() = owner_id);
create policy "financing_simulations_insert_own" on public.financing_simulations
  for insert with check (auth.uid() = owner_id);
create policy "financing_simulations_update_own" on public.financing_simulations
  for update using (auth.uid() = owner_id);
create policy "financing_simulations_delete_own" on public.financing_simulations
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- accounting_exports
-- ============================================================
create table public.accounting_exports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  period_start date not null,
  period_end date not null,
  format text check (format in ('pennylane','tiime','fec','pdf_excel')) not null,
  included_categories jsonb not null,
  missing_documents jsonb default '[]',
  result_document_id uuid references public.documents(id),
  status text check (status in ('generated','sent','downloaded')) not null default 'generated',
  created_at timestamptz default now()
);

alter table public.accounting_exports enable row level security;

create policy "accounting_exports_select_own" on public.accounting_exports
  for select using (auth.uid() = owner_id);
create policy "accounting_exports_insert_own" on public.accounting_exports
  for insert with check (auth.uid() = owner_id);
create policy "accounting_exports_update_own" on public.accounting_exports
  for update using (auth.uid() = owner_id);
create policy "accounting_exports_delete_own" on public.accounting_exports
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- migration_imports
-- ============================================================
create table public.migration_imports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  source_software text check (source_software in ('tolteck','obat','batigest','ebp','excel_papier','autre')) not null,
  -- imported_categories.projects_in_progress must default to false wherever the
  -- application constructs this jsonb value — never true (Cahier §6.14's
  -- transparency decision) — this is an application-layer rule, not enforceable
  -- via a plain jsonb column default, so it's documented here for the agent
  -- building Step 13.7's migration UI.
  imported_categories jsonb not null,
  status text check (status in ('started','completed','failed')) not null default 'started',
  summary jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

alter table public.migration_imports enable row level security;

create policy "migration_imports_select_own" on public.migration_imports
  for select using (auth.uid() = owner_id);
create policy "migration_imports_insert_own" on public.migration_imports
  for insert with check (auth.uid() = owner_id);
create policy "migration_imports_update_own" on public.migration_imports
  for update using (auth.uid() = owner_id);
create policy "migration_imports_delete_own" on public.migration_imports
  for delete using (auth.uid() = owner_id);
