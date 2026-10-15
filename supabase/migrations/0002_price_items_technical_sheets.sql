-- Kōv — Migration 0002: price_items, technical_sheets
-- Source: docs/05_DataModel.md §2.4, §2.5

-- ============================================================
-- price_items
-- ============================================================
create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  label text not null,
  unit text not null,
  purchase_price numeric(10,2) not null default 0,
  sale_price numeric(10,2) not null,
  default_vat_rate numeric(4,2) check (default_vat_rate in (0, 5.5, 10, 20)) not null,
  category text,
  is_supply boolean not null default true,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.price_items enable row level security;

create policy "price_items_select_own" on public.price_items
  for select using (auth.uid() = owner_id);
create policy "price_items_insert_own" on public.price_items
  for insert with check (auth.uid() = owner_id);
create policy "price_items_update_own" on public.price_items
  for update using (auth.uid() = owner_id);
create policy "price_items_delete_own" on public.price_items
  for delete using (auth.uid() = owner_id);

-- Index for fast library search (docs/05_DataModel.md §2.4).
create index price_items_owner_active_idx on public.price_items (owner_id, active);

-- ============================================================
-- technical_sheets
-- ============================================================
-- NOTE: attachment_document_id references public.documents(id), but the
-- `documents` table is not created until migration 0008. The column is created
-- here WITHOUT the foreign-key constraint; migration 0008 adds the constraint
-- once `documents` exists (documented there, not a bug — see that migration's
-- header comment for the forward-reference explanation).
create table public.technical_sheets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  price_item_id uuid references public.price_items(id),
  title text not null,
  body text,
  attachment_document_id uuid,  -- FK to public.documents(id) added in migration 0008
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.technical_sheets enable row level security;

create policy "technical_sheets_select_own" on public.technical_sheets
  for select using (auth.uid() = owner_id);
create policy "technical_sheets_insert_own" on public.technical_sheets
  for insert with check (auth.uid() = owner_id);
create policy "technical_sheets_update_own" on public.technical_sheets
  for update using (auth.uid() = owner_id);
create policy "technical_sheets_delete_own" on public.technical_sheets
  for delete using (auth.uid() = owner_id);
