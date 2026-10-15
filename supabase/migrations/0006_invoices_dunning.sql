-- Kōv — Migration 0006: invoices, dunning_events
-- Source: docs/05_DataModel.md §2.15, §2.16

-- ============================================================
-- invoices
-- ============================================================
-- NOTE: document_id references public.documents(id), but `documents` is not
-- created until migration 0008. Column created here WITHOUT the foreign-key
-- constraint; migration 0008 adds it once `documents` exists.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  quote_id uuid references public.quotes(id) not null,
  project_id uuid references public.projects(id),
  invoice_type text check (invoice_type in ('acompte','situation','solde','totalite')) not null,
  amount_ttc numeric(10,2) not null,
  payment_term text check (payment_term in ('a_reception','15_jours','30_jours')) not null,
  status text check (status in ('draft','sent','paid','overdue','cancelled')) not null default 'draft',
  issued_at date,
  due_date date,
  paid_at date,
  dunning_level int not null default 0,
  late_penalty_mention boolean not null default true,
  recovery_indemnity_eur numeric(6,2) not null default 40,
  document_id uuid,  -- FK to public.documents(id) added in migration 0008
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.invoices enable row level security;

create policy "invoices_select_own" on public.invoices
  for select using (auth.uid() = owner_id);
create policy "invoices_insert_own" on public.invoices
  for insert with check (auth.uid() = owner_id);
create policy "invoices_update_own" on public.invoices
  for update using (auth.uid() = owner_id);
create policy "invoices_delete_own" on public.invoices
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- dunning_events
-- ============================================================
create table public.dunning_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) not null,
  owner_id uuid references auth.users(id) not null,
  level int check (level in (1,2,3)) not null,
  channel text check (channel in ('sms','email','recommande_ar')) not null,
  message_text text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table public.dunning_events enable row level security;

create policy "dunning_events_select_own" on public.dunning_events
  for select using (auth.uid() = owner_id);
create policy "dunning_events_insert_own" on public.dunning_events
  for insert with check (auth.uid() = owner_id);
create policy "dunning_events_update_own" on public.dunning_events
  for update using (auth.uid() = owner_id);
create policy "dunning_events_delete_own" on public.dunning_events
  for delete using (auth.uid() = owner_id);
