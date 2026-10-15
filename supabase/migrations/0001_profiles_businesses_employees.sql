-- Kōv — Migration 0001: profiles, businesses, employees
-- Source: docs/05_DataModel.md §2.1, §2.2, §2.3

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  onboarding_step int not null default 0,
  onboarding_complete boolean not null default false,
  trade text check (trade in ('plomberie_chauffage')) not null default 'plomberie_chauffage',
  team_mode text check (team_mode in ('solo','equipe')) not null default 'equipe',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- profiles: select/update only, per docs/05_DataModel.md §2.1 — no client-side insert
-- (the auth.users trigger below creates the row) and no client-side delete (account
-- deletion goes through the Step 5.4 Edge Function using the service_role key).
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profiles row whenever a new auth.users row is inserted
-- (docs/05_DataModel.md §2.1: "profiles has no client-side insert policy").
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- businesses
-- ============================================================
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null unique,
  legal_name text not null,
  siren text,
  address jsonb,
  phone text,
  email text,
  default_vat_rate numeric(4,2) check (default_vat_rate in (0, 5.5, 10, 20)) not null default 20,
  legal_mentions jsonb not null default '{}',
  currency text not null default 'EUR',
  legal_fields_complete boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.businesses enable row level security;

create policy "businesses_select_own" on public.businesses
  for select using (auth.uid() = owner_id);
create policy "businesses_insert_own" on public.businesses
  for insert with check (auth.uid() = owner_id);
create policy "businesses_update_own" on public.businesses
  for update using (auth.uid() = owner_id);
create policy "businesses_delete_own" on public.businesses
  for delete using (auth.uid() = owner_id);

-- ============================================================
-- employees
-- ============================================================
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  name text not null,
  role text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.employees enable row level security;

create policy "employees_select_own" on public.employees
  for select using (auth.uid() = owner_id);
create policy "employees_insert_own" on public.employees
  for insert with check (auth.uid() = owner_id);
create policy "employees_update_own" on public.employees
  for update using (auth.uid() = owner_id);
create policy "employees_delete_own" on public.employees
  for delete using (auth.uid() = owner_id);
