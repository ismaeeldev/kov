-- Kōv — Migration 0008: journal, documents
-- Source: docs/05_DataModel.md §2.19, §2.20

-- ============================================================
-- journal (main courante — unified activity log)
-- ============================================================
create table public.journal (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  entry_type text check (entry_type in ('sms','email','recommande','appel','rapport','devis','facture','note','agent_message')) not null,
  direction text check (direction in ('inbound','outbound')) not null,
  title text not null,
  body text,
  related_quote_id uuid references public.quotes(id),
  related_invoice_id uuid references public.invoices(id),
  related_project_id uuid references public.projects(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now()
);

alter table public.journal enable row level security;

create policy "journal_select_own" on public.journal
  for select using (auth.uid() = owner_id);
create policy "journal_insert_own" on public.journal
  for insert with check (auth.uid() = owner_id);
create policy "journal_update_own" on public.journal
  for update using (auth.uid() = owner_id);
create policy "journal_delete_own" on public.journal
  for delete using (auth.uid() = owner_id);

-- Indexes per docs/05_DataModel.md §2.19: per-client timeline + cross-client Messages view.
create index journal_owner_client_occurred_idx on public.journal (owner_id, client_id, occurred_at desc);
create index journal_owner_occurred_idx on public.journal (owner_id, occurred_at desc);

-- ============================================================
-- documents
-- ============================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id),
  project_id uuid references public.projects(id),
  name text not null,
  doc_type text check (doc_type in ('quote_pdf','invoice_pdf','upload_file','upload_photo','upload_scan','accounting_export')) not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now()
);

alter table public.documents enable row level security;

create policy "documents_select_own" on public.documents
  for select using (auth.uid() = owner_id);
create policy "documents_insert_own" on public.documents
  for insert with check (auth.uid() = owner_id);
create policy "documents_update_own" on public.documents
  for update using (auth.uid() = owner_id);
create policy "documents_delete_own" on public.documents
  for delete using (auth.uid() = owner_id);

-- Now that `documents` exists, add every foreign-key constraint deferred from
-- earlier migrations (each documented at its point of origin):
alter table public.technical_sheets
  add constraint technical_sheets_attachment_document_id_fkey
  foreign key (attachment_document_id) references public.documents(id);

alter table public.quote_versions
  add constraint quote_versions_pdf_document_id_fkey
  foreign key (pdf_document_id) references public.documents(id);

alter table public.invoices
  add constraint invoices_document_id_fkey
  foreign key (document_id) references public.documents(id);
