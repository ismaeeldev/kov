-- Kōv — Migration 0003: clients
-- Source: docs/05_DataModel.md §2.6

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  name text not null,
  address jsonb,
  phone text,
  email text,
  siren text,
  vat_applicable text check (vat_applicable in ('standard','franchise','autoliquidation','export')) default 'standard',
  status text check (status in ('active','archived')) not null default 'active',
  next_followup_reminder date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.clients enable row level security;

create policy "clients_select_own" on public.clients
  for select using (auth.uid() = owner_id);
create policy "clients_insert_own" on public.clients
  for insert with check (auth.uid() = owner_id);
create policy "clients_update_own" on public.clients
  for update using (auth.uid() = owner_id);
create policy "clients_delete_own" on public.clients
  for delete using (auth.uid() = owner_id);

-- Index for the default client-list filter (docs/05_DataModel.md §2.6).
create index clients_owner_status_idx on public.clients (owner_id, status);

-- Real-time search by name or city (module 6.3) — trigram index on name, plus a
-- btree-friendly expression index on the city field inside the address jsonb.
create extension if not exists pg_trgm;
create index clients_name_trgm_idx on public.clients using gin (name gin_trgm_ops);
create index clients_city_idx on public.clients (((address->>'city')));
