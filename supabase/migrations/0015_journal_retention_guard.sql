-- Kōv — Migration 0015: journal ten-year retention guard
-- Source: docs/01_ScopeDocument.md §5.11 "Ten-year retention, aligned with the
-- decennial construction warranty" + docs/05_DataModel.md §2.19 "rows are
-- never deleted by any routine process — ten-year retention is a product
-- commitment (module 6.11)".
--
-- Scope audit finding (2026-09-26): journal_delete_own (0008_journal_documents.sql)
-- lets an owner delete any of their own journal rows with no guard at all —
-- the exact opposite of the documented ten-year commitment, since a dispute
-- ("you never told me that") is precisely the scenario an artisan would want
-- to delete an inconvenient entry in. A trigger enforces this at the DB layer
-- (not just app-code discipline) while still allowing genuine post-retention
-- cleanup once a row is actually older than ten years.

create or replace function public.journal_enforce_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.occurred_at > now() - interval '10 years' then
    raise exception 'journal rows cannot be deleted before their 10-year retention period expires (main courante ten-year retention commitment)';
  end if;
  return old;
end;
$$;

create trigger journal_retention_guard
  before delete on public.journal
  for each row execute function public.journal_enforce_retention();
