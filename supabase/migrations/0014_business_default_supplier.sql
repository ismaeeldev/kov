-- Kōv — Migration 0014: businesses.default_supplier_name
-- Source: docs/04_ApplicationFlow.md §3.9 (mo-fournisseur modal, business
-- settings entry point). A scope-compliance audit (2026-09-26) found the
-- mo-fournisseur modal was named in the spec but never built — this column
-- backs its "business settings" entry point (a default supplier preference,
-- distinct from a per-order choice which uses the existing
-- orders.supplier_name column from migration 0007).

alter table public.businesses
  add column default_supplier_name text;
