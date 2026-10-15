-- Kōv — Migration 0011: documents Storage bucket + owner-scoped RLS
-- Source: docs/05_DataModel.md §2.20, docs/03_MasterPrompts.md §9.4,
-- docs/01_ScopeDocument.md KOV-FR-009 ("téléchargement réservé au
-- propriétaire" — download restricted to the owner).
--
-- Private bucket. Every stored file's path is prefixed with the owning
-- user's id (storage_path convention: "<owner_id>/<doc_type>/<filename>"),
-- and these RLS policies enforce that a caller can only read/write objects
-- under their OWN id prefix — this is what makes KOV-FR-009 a real storage-
-- level guarantee, not just a UI-hidden download button.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_bucket_select_own"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_bucket_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents_bucket_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update policy — generated PDFs are immutable once stored (a new
-- issuance/version writes a new object, never overwrites an existing one),
-- matching quote_versions' own immutability rule.
