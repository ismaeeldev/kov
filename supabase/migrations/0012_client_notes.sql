-- Kōv — Migration 0012: client_notes
-- Source: docs/01_ScopeDocument.md §5.3 ("notes libres avec étiquetage et
-- dictée vocale"), docs/04_ApplicationFlow.md §2.7's client-record "internal
-- notes" section. Deferred from Step 7.3 (text-only, no dictation wiring
-- yet) to Step 13.2, which adds voice dictation via src/hooks/useDictation.ts
-- once it exists. No client_notes table existed anywhere in the schema
-- before this migration — the client record's notes section had nowhere
-- real to persist to.

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  text_content text not null,
  tags text[] not null default '{}',
  input_method text check (input_method in ('typed', 'voice')) not null default 'typed',
  created_at timestamptz default now()
);

alter table public.client_notes enable row level security;

create policy "client_notes_select_own" on public.client_notes
  for select using (auth.uid() = owner_id);
create policy "client_notes_insert_own" on public.client_notes
  for insert with check (auth.uid() = owner_id);
create policy "client_notes_update_own" on public.client_notes
  for update using (auth.uid() = owner_id);
create policy "client_notes_delete_own" on public.client_notes
  for delete using (auth.uid() = owner_id);

create index client_notes_owner_client_idx on public.client_notes (owner_id, client_id, created_at desc);
