-- Kōv — Migration 0004: quotes, quote_lines, quote_versions, quote_events
-- Source: docs/05_DataModel.md §2.7, §2.8, §2.9, §2.10

-- ============================================================
-- quotes
-- ============================================================
-- NOTE: quotes.current_version_id references quote_versions(id), but
-- quote_versions.quote_id also references quotes(id) — a genuine circular
-- foreign-key dependency between the two tables. Resolved by creating
-- `quotes` first WITHOUT the current_version_id foreign-key constraint, then
-- `quote_versions` (which can reference quotes(id) immediately since quotes
-- already exists), then adding the deferred constraint on quotes at the end
-- of this file once quote_versions exists.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  reference text not null,
  status text check (status in ('draft','issued','accepted','declined','expired_cancelled')) not null default 'draft',
  vat_rate numeric(4,2) check (vat_rate in (0, 5.5, 10, 20)) not null,
  vat_mention_code text check (vat_mention_code in (null,'autoliquidation','franchise','export')),
  subtotal_ht numeric(10,2),
  total_ttc numeric(10,2),
  projected_margin_pct numeric(5,2),
  current_version_id uuid,  -- FK to quote_versions(id) added at the end of this file
  issued_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (owner_id, reference)
);

alter table public.quotes enable row level security;

create policy "quotes_select_own" on public.quotes
  for select using (auth.uid() = owner_id);
create policy "quotes_insert_own" on public.quotes
  for insert with check (auth.uid() = owner_id);
create policy "quotes_update_own" on public.quotes
  for update using (auth.uid() = owner_id);
create policy "quotes_delete_own" on public.quotes
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- quote_lines
-- ============================================================
create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) not null,
  owner_id uuid references auth.users(id) not null,
  price_item_id uuid references public.price_items(id),
  designation text not null,
  unit text not null,
  quantity numeric(10,3) not null,
  unit_price numeric(10,2) not null,
  purchase_price numeric(10,2) not null default 0,
  line_margin_pct numeric(5,2),
  sort_order int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.quote_lines enable row level security;

create policy "quote_lines_select_own" on public.quote_lines
  for select using (auth.uid() = owner_id);
create policy "quote_lines_insert_own" on public.quote_lines
  for insert with check (auth.uid() = owner_id);
create policy "quote_lines_update_own" on public.quote_lines
  for update using (auth.uid() = owner_id);
create policy "quote_lines_delete_own" on public.quote_lines
  for delete using (auth.uid() = owner_id);

create index quote_lines_quote_sort_idx on public.quote_lines (quote_id, sort_order);

-- ============================================================
-- quote_versions
-- ============================================================
create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) not null,
  owner_id uuid references auth.users(id) not null,
  version_number int not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  pdf_document_id uuid,  -- FK to public.documents(id) added in migration 0008 (same forward-reference pattern as technical_sheets.attachment_document_id)
  generated_by_model text,
  created_at timestamptz default now(),
  unique (quote_id, version_number)
);

alter table public.quote_versions enable row level security;

create policy "quote_versions_select_own" on public.quote_versions
  for select using (auth.uid() = owner_id);
create policy "quote_versions_insert_own" on public.quote_versions
  for insert with check (auth.uid() = owner_id);
-- No update/delete policy for quote_versions: rows here are never updated after
-- insert (docs/05_DataModel.md §2.9's "chaque devis émis est une version immuable").

-- Now that quote_versions exists, add the deferred foreign-key constraint on quotes.
alter table public.quotes
  add constraint quotes_current_version_id_fkey
  foreign key (current_version_id) references public.quote_versions(id);

-- ============================================================
-- quote_events
-- ============================================================
create table public.quote_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references public.quotes(id) not null,
  owner_id uuid references auth.users(id) not null,
  quote_version_id uuid references public.quote_versions(id),
  event_type text check (event_type in ('issued','accepted','declined')) not null,
  note text,
  actor text check (actor in ('owner','client_manual_entry')) not null default 'owner',
  -- acceptance_method='canvas_mark' must NEVER be labeled "signature" anywhere in the
  -- UI (docs/01_ScopeDocument.md §9) — recorded honestly here as a non-probative mark,
  -- distinct from a real 'esignature' integration.
  acceptance_method text check (acceptance_method in (null,'canvas_mark','email_reply','verbal_recorded','esignature')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table public.quote_events enable row level security;

create policy "quote_events_select_own" on public.quote_events
  for select using (auth.uid() = owner_id);
create policy "quote_events_insert_own" on public.quote_events
  for insert with check (auth.uid() = owner_id);
create policy "quote_events_update_own" on public.quote_events
  for update using (auth.uid() = owner_id);
create policy "quote_events_delete_own" on public.quote_events
  for delete using (auth.uid() = owner_id);
