-- Kōv — Migration 0007: orders, order_lines
-- Source: docs/05_DataModel.md §2.17, §2.18

-- ============================================================
-- orders (material orders)
-- ============================================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  project_id uuid references public.projects(id) not null,
  supplier_name text,
  delivery_mode text check (delivery_mode in ('chantier','agence')) not null,
  delivery_slot tstzrange,
  status text check (status in ('transmitted_pending','confirmed')) not null default 'transmitted_pending',
  supplier_order_number text,
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.orders enable row level security;

create policy "orders_select_own" on public.orders
  for select using (auth.uid() = owner_id);
create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = owner_id);
create policy "orders_update_own" on public.orders
  for update using (auth.uid() = owner_id);
create policy "orders_delete_own" on public.orders
  for delete using (auth.uid() = owner_id);

-- Now that orders exists, add the deferred foreign-key constraint on project_costs
-- (created in migration 0005 without this constraint — see that file's comment).
alter table public.project_costs
  add constraint project_costs_source_order_id_fkey
  foreign key (source_order_id) references public.orders(id);

-- ============================================================
-- order_lines
-- ============================================================
create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) not null,
  owner_id uuid references auth.users(id) not null,
  price_item_id uuid references public.price_items(id) not null,
  reference_label text not null,
  quantity numeric(10,3) not null,
  stock_state text check (stock_state in ('available','in_transit','out_of_stock')) not null,
  depot_label text,
  lead_time_days int,
  created_at timestamptz default now()
);

alter table public.order_lines enable row level security;

create policy "order_lines_select_own" on public.order_lines
  for select using (auth.uid() = owner_id);
create policy "order_lines_insert_own" on public.order_lines
  for insert with check (auth.uid() = owner_id);
create policy "order_lines_update_own" on public.order_lines
  for update using (auth.uid() = owner_id);
create policy "order_lines_delete_own" on public.order_lines
  for delete using (auth.uid() = owner_id);
