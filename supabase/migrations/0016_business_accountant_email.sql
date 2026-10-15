-- Kōv — Migration 0016: businesses.accountant_email
-- Source: docs/01_ScopeDocument.md §5.13 "Direct send to the accountant or
-- download." — scope audit finding (2026-09-26): only download existed, no
-- accountant contact was ever stored anywhere to send to.

alter table public.businesses add column accountant_email text;
