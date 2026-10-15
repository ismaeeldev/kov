# Kōv — Supabase Data Model Reference

> Source: Cahier des charges §5 ("Modèle de données") plus the detailed field lists embedded in each module description of §6. This is the agent's single source of truth for schema from Step 5 (`03_MasterPrompts.md`) onward. Every table has `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()` unless noted. Every owner-scoped table has an `owner_id uuid references auth.users(id) not null` column and **RLS enabled with a policy restricting all operations to `auth.uid() = owner_id`** (directly or via a join to an owner-scoped parent) unless explicitly noted otherwise.
>
> Kōv's data model is deliberately **single-tenant-per-owner**: one authenticated `auth.users` row = one `businesses` row = the artisan's whole account. There is no separate "organization" or "team" table — the employees referenced in planning (module 6.10) are simple named resources belonging to the business, not separate authenticated users, unless the client later decides employees need their own logins (out of scope for Phase 2; flag if requested).

---

## 1. Table list (Phase 2 — build these, and only these)

| Table | Purpose |
|---|---|
| `profiles` | Owner account identity — one row per authenticated user |
| `businesses` | Business/company settings: legal name, SIREN, trade, default VAT, legal mentions |
| `employees` | Named team members (Lucas, Karim, Pierre style) for planning assignment — module 6.10 |
| `price_items` | The artisan's price library — module 6.16 |
| `technical_sheets` | Product/technical sheets linked to price items — module 6.16 |
| `clients` | Client directory — module 6.3 |
| `quotes` | Quote headers — module 6.4 |
| `quote_lines` | Quote line items (live/editable, pre-issuance) — module 6.4 |
| `quote_versions` | Immutable snapshot taken at issuance — module 6.4 |
| `quote_events` | Issuance/acceptance/decline event log — module 6.4 |
| `projects` | Chantiers, created from an accepted quote — module 6.9 |
| `project_costs` | Real costs logged against a chantier (supplies, hours, misc) — module 6.9 |
| `project_updates` | Chantier reports/progress notes, with client-send flag — module 6.12 |
| `change_orders` | Avenants generated from profitability overruns — module 6.9 |
| `invoices` | Invoices generated from a quote/chantier — module 6.7 |
| `dunning_events` | Individual dunning/reminder sends per invoice — module 6.8 |
| `orders` | Material orders placed against a chantier — module 6.6 |
| `order_lines` | Line items of a material order, with stock/lead-time snapshot — module 6.6 |
| `journal` | The main courante — one unified activity log per client — module 6.11 |
| `documents` | Uploaded/generated files, linked to a client or chantier — module 6.3, 6.13 |
| `ai_runs` | Every Claude call, logged with redacted input/output, cost, timing — cross-cutting |
| `agent_action_plans` | Kōv Agent's proposed multi-step plans and their execution state — module 6.5 |
| `financing_simulations` | Financing simulation records sent to clients — module 6.15 |
| `accounting_exports` | Generated quarterly accounting export records — module 6.13 |
| `migration_imports` | Data-migration/import job records — module 6.14 |

---

## 2. Schema detail

### 2.1 `profiles`

```sql
id uuid primary key references auth.users(id) on delete cascade,
display_name text,
onboarding_step int not null default 0,          -- resume-in-progress onboarding (single flow, per KOV-FR-002)
onboarding_complete boolean not null default false,
trade text check (trade in ('plomberie_chauffage')) not null default 'plomberie_chauffage', -- extensible enum; only one trade ships at launch per Cahier §9/§8
team_mode text check (team_mode in ('solo','equipe')) not null default 'equipe', -- client decision locks this to 'equipe' as the target, but the field remains editable — see 01_ScopeDocument.md §8
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: `select`/`update` where `auth.uid() = id`. No client-side `insert` policy — the row is created by a trigger on `auth.users` insert (`handle_new_user()` function), never directly by the client. No `delete` policy for the client role — account deletion goes through a dedicated Edge Function that cascades a full data wipe (KOV-FR-020) and only then removes the `auth.users` row.

### 2.2 `businesses`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null unique,   -- one business per owner in Phase 2
legal_name text not null,                -- raison sociale
siren text,
address jsonb,                            -- { street, postal_code, city }
phone text, email text,
default_vat_rate numeric(4,2) check (default_vat_rate in (0, 5.5, 10, 20)) not null default 20,
legal_mentions jsonb not null default '{}', -- freeform structured legal-mention config (reverse-charge / franchise / export text overrides)
currency text not null default 'EUR',
legal_fields_complete boolean not null default false,   -- must be true before any quote can be issued (KOV-FR-002)
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation four-policy pattern (§3).

### 2.3 `employees`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
name text not null,
role text,                       -- e.g. "Plombier", "Apprenti"
active boolean not null default true,
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Referenced by `projects.assigned_employee_ids` (array) for planning/conflict detection (module 6.10).

### 2.4 `price_items`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
label text not null,
unit text not null,                          -- e.g. "m²", "u", "h", "forfait"
purchase_price numeric(10,2) not null default 0,
sale_price numeric(10,2) not null,
default_vat_rate numeric(4,2) check (default_vat_rate in (0, 5.5, 10, 20)) not null,
category text,                                -- trade-layer categorization, e.g. "sanitaire", "chauffage"
is_supply boolean not null default true,      -- true = material/supply line (orderable, module 6.6); false = labor/flat-fee (excluded from ordering)
active boolean not null default true,
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Index: `(owner_id, active)` for fast library search. **Historical-copy rule applies to any table that references this one** — see §4.

### 2.5 `technical_sheets`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
price_item_id uuid references price_items(id),
title text not null,
body text,
attachment_document_id uuid references documents(id),
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern.

### 2.6 `clients`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
name text not null,
address jsonb,                    -- { street, postal_code, city }
phone text, email text,
siren text,
vat_applicable text check (vat_applicable in ('standard','franchise','autoliquidation','export')) default 'standard',
status text check (status in ('active','archived')) not null default 'active',
next_followup_reminder date,      -- "prochain rappel d'entretien"
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Index: `(owner_id, status)`, full-text/`ilike` search index on `(name, (address->>'city'))` for module 6.3's real-time search. **Archiving sets `status='archived'` and must never cascade-delete linked quotes** (KOV-FR-005 acceptance criterion).

### 2.7 `quotes`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
client_id uuid references clients(id) not null,
reference text not null,                  -- human-readable quote number, e.g. "DEV-2026-0042"
status text check (status in ('draft','issued','accepted','declined','expired_cancelled')) not null default 'draft',
vat_rate numeric(4,2) check (vat_rate in (0, 5.5, 10, 20)) not null,
vat_mention_code text check (vat_mention_code in (null,'autoliquidation','franchise','export')),
subtotal_ht numeric(10,2),                -- computed, always server-side (KOV-FR-007)
total_ttc numeric(10,2),                  -- computed
projected_margin_pct numeric(5,2),        -- computed
current_version_id uuid references quote_versions(id),   -- null until first issuance
issued_at timestamptz,
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Unique: `(owner_id, reference)`. **A quote row itself is mutable only while `status='draft'`** — the application layer (not RLS) enforces that editing an `issued`/`accepted`/`declined` quote instead creates a new draft + new `quote_versions` row on next issuance (KOV-FR-006/KOV-FR-010); RLS alone cannot express this business rule and must not be relied on for it — enforce it in the Edge Function/service layer that handles quote mutation.

### 2.8 `quote_lines`

```sql
id uuid primary key default gen_random_uuid(),
quote_id uuid references quotes(id) not null,
owner_id uuid references auth.users(id) not null,        -- denormalized for RLS simplicity
price_item_id uuid references price_items(id),            -- null for free-entry lines
designation text not null,                                 -- copied from price_items.label at add-time, or free text
unit text not null,                                         -- copied or free text
quantity numeric(10,3) not null,
unit_price numeric(10,2) not null,                          -- copied from price_items.sale_price at add-time, editable
purchase_price numeric(10,2) not null default 0,             -- copied from price_items.purchase_price at add-time, editable
line_margin_pct numeric(5,2),                                -- computed
sort_order int not null default 0,
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern (via denormalized `owner_id`). Index: `(quote_id, sort_order)`. **This table implements the historical-copy rule** — see §4 for the full statement of that rule.

### 2.9 `quote_versions`

```sql
id uuid primary key default gen_random_uuid(),
quote_id uuid references quotes(id) not null,
owner_id uuid references auth.users(id) not null,
version_number int not null,
snapshot jsonb not null,           -- full frozen copy: client info, business info, all lines, totals, VAT, legal mentions — everything the PDF needs, nothing fetched live at render time
snapshot_hash text not null,       -- integrity hash of the snapshot, referenced by quote_events and the PDF generator
pdf_document_id uuid references documents(id),
generated_by_model text,           -- set only if this quote's lines were AI-drafted (KOV-FR-008); null for fully manual quotes
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Unique: `(quote_id, version_number)`. **This table is the literal implementation of "chaque devis émis est une version immuable" (Cahier §3) — rows here are never updated after insert, only inserted.** The PDF generator (Step 9 of `03_MasterPrompts.md`) reads exclusively from `snapshot`, never from live `quotes`/`quote_lines` state — this is the direct fix for the known PDF-selector defect (`01_ScopeDocument.md` §9).

### 2.10 `quote_events`

```sql
id uuid primary key default gen_random_uuid(),
quote_id uuid references quotes(id) not null,
owner_id uuid references auth.users(id) not null,
quote_version_id uuid references quote_versions(id),
event_type text check (event_type in ('issued','accepted','declined')) not null,
note text,
actor text check (actor in ('owner','client_manual_entry')) not null default 'owner',  -- who recorded the event
acceptance_method text check (acceptance_method in (null,'canvas_mark','email_reply','verbal_recorded','esignature')),
-- acceptance_method='canvas_mark' must NEVER be labeled "signature" anywhere in the UI — see 01_ScopeDocument.md §9. It is recorded honestly here as a non-probative mark, distinct from a real 'esignature' integration.
occurred_at timestamptz not null default now(),
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. **An `accepted` event must always reference an `issued` quote_version_id** — enforce via application logic (a quote cannot be marked accepted while `status='draft'`), matching KOV-FR-010's acceptance criterion.

### 2.11 `projects` (chantiers)

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
client_id uuid references clients(id) not null,
source_quote_id uuid references quotes(id) not null,
source_quote_version_id uuid references quote_versions(id) not null,
name text not null,                       -- e.g. "Salle de bain Bernard"
status text check (status in ('planned','in_progress','awaiting_payment','closed')) not null default 'planned',
planned_value_ttc numeric(10,2) not null,   -- carried over from the source quote at conversion time
planned_margin_pct numeric(5,2) not null,   -- carried over from the source quote at conversion time
assigned_employee_ids uuid[] default '{}',
start_date date, end_date date,
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern. **Unique constraint: `(source_quote_id)`** — this is what makes conversion idempotent (KOV-FR-011): a second conversion attempt against the same quote must be rejected/short-circuited by the application layer, which then returns the existing `projects` row rather than erroring or duplicating. Conversion is only permitted when `quotes.status = 'accepted'`.

### 2.12 `project_costs`

```sql
id uuid primary key default gen_random_uuid(),
project_id uuid references projects(id) not null,
owner_id uuid references auth.users(id) not null,
cost_type text check (cost_type in ('supply','labor_hours','misc')) not null,
description text not null,
amount numeric(10,2),                 -- for 'supply' and 'misc' types
hours numeric(6,2),                   -- for 'labor_hours' type
hourly_rate numeric(6,2) default 38,  -- reference hourly rate per Cahier §6.9, editable per business
source_order_id uuid references orders(id),  -- populated when a cost originates from a confirmed material order
incurred_at date not null default current_date,
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. **This table is the sole source of real-cost data for the chantier profitability calculation (module 6.9) — the real margin is always computed from persisted rows here, never from demo/placeholder values** (a hard requirement, KOV-FR-012).

### 2.13 `project_updates`

```sql
id uuid primary key default gen_random_uuid(),
project_id uuid references projects(id) not null,
owner_id uuid references auth.users(id) not null,
text_content text not null,
progress_pct int check (progress_pct between 0 and 100),
input_method text check (input_method in ('typed','voice')) default 'typed',
sent_to_client boolean not null default false,
client_sms_sent_at timestamptz,
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. On `sent_to_client = true`, a corresponding `journal` row is auto-inserted (module 6.11's automatic-feed rule).

### 2.14 `change_orders` (avenants)

```sql
id uuid primary key default gen_random_uuid(),
project_id uuid references projects(id) not null,
owner_id uuid references auth.users(id) not null,
generated_from_cost_ids uuid[] not null,   -- the project_costs rows whose overruns produced this avenant
lines jsonb not null,                       -- proposed additional quote_line-shaped entries, editable before send
status text check (status in ('draft','sent','accepted','declined')) not null default 'draft',
resulting_quote_id uuid references quotes(id),  -- once sent as a real supplementary quote
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern.

### 2.15 `invoices`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
client_id uuid references clients(id) not null,
quote_id uuid references quotes(id) not null,
project_id uuid references projects(id),
invoice_type text check (invoice_type in ('acompte','situation','solde','totalite')) not null,
amount_ttc numeric(10,2) not null,
payment_term text check (payment_term in ('a_reception','15_jours','30_jours')) not null,
status text check (status in ('draft','sent','paid','overdue','cancelled')) not null default 'draft',
issued_at date,
due_date date,
paid_at date,
dunning_level int not null default 0,   -- 0 = not yet overdue, 1/2/3 per module 6.8
late_penalty_mention boolean not null default true,   -- auto-included per Cahier §6.7
recovery_indemnity_eur numeric(6,2) not null default 40,  -- €40 flat-rate, art. L441-10
document_id uuid references documents(id),
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern. On insert/status-change, feeds `journal` automatically (module 6.11).

### 2.16 `dunning_events`

```sql
id uuid primary key default gen_random_uuid(),
invoice_id uuid references invoices(id) not null,
owner_id uuid references auth.users(id) not null,
level int check (level in (1,2,3)) not null,
channel text check (channel in ('sms','email','recommande_ar')) not null,
message_text text not null,          -- the actual pre-written+edited message sent
sent_at timestamptz not null default now(),
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Every row here auto-inserts a corresponding `journal` entry at send time (module 6.11's automatic-feed rule).

### 2.17 `orders` (material orders)

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
project_id uuid references projects(id) not null,
supplier_name text,
delivery_mode text check (delivery_mode in ('chantier','agence')) not null,
delivery_slot tstzrange,
status text check (status in ('transmitted_pending','confirmed')) not null default 'transmitted_pending',
supplier_order_number text,             -- populated once status = 'confirmed'
confirmed_at timestamptz,
created_at timestamptz default now(),
updated_at timestamptz default now()
```
RLS: standard owner-isolation pattern. **`status` transitions from `transmitted_pending` to `confirmed` must reflect a real supplier signal in production** — never a fixed timer standing in for one (defect-to-avoid, `01_ScopeDocument.md` §9).

### 2.18 `order_lines`

```sql
id uuid primary key default gen_random_uuid(),
order_id uuid references orders(id) not null,
owner_id uuid references auth.users(id) not null,
price_item_id uuid references price_items(id) not null,
reference_label text not null,           -- copied at order time
quantity numeric(10,3) not null,
stock_state text check (stock_state in ('available','in_transit','out_of_stock')) not null,
depot_label text,
lead_time_days int,
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern.

### 2.19 `journal` (main courante — the unified activity log)

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
client_id uuid references clients(id) not null,
entry_type text check (entry_type in ('sms','email','recommande','appel','rapport','devis','facture','note','agent_message')) not null,
direction text check (direction in ('inbound','outbound')) not null,
title text not null,
body text,
related_quote_id uuid references quotes(id),
related_invoice_id uuid references invoices(id),
related_project_id uuid references projects(id),
occurred_at timestamptz not null default now(),
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Index: `(owner_id, client_id, occurred_at desc)` for the per-client timeline, and `(owner_id, occurred_at desc)` for the cross-client Messages view. **This table is written to automatically by dunning sends, invoice issuance, chantier reports sent to client, and Kōv Agent outbound messages — never directly and only by the application/Edge Function layer, matching the "alimentation automatique" requirement (Cahier §6.11).** Retention: rows are never deleted by any routine process — ten-year retention is a product commitment (module 6.11).

### 2.20 `documents`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
client_id uuid references clients(id),
project_id uuid references projects(id),
name text not null,
doc_type text check (doc_type in ('quote_pdf','invoice_pdf','upload_file','upload_photo','upload_scan','accounting_export')) not null,
storage_path text not null,          -- Supabase Storage path, private bucket, owner-scoped
mime_type text,
size_bytes bigint,
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern on the table row; the underlying Supabase Storage bucket uses a matching owner-prefixed path policy so storage access itself is also RLS-gated, not just the metadata row (KOV-FR-009's "téléchargement réservé au propriétaire").

### 2.21 `ai_runs`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
run_type text check (run_type in ('quote_draft','agent_intent','agent_plan')) not null,
input_summary jsonb,           -- redacted/minimized — never full raw client PII beyond what's operationally needed
output_summary jsonb,
model_id text not null,
prompt_version text not null,
cost_usd numeric(8,4),
duration_ms int,
status text check (status in ('completed','failed','timeout')) not null,
idempotency_key text unique,
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. Logging must be redacted by default (NFR, `01_ScopeDocument.md` §7) — never store full client financial/personal detail beyond what's needed to debug a failed run.

### 2.22 `agent_action_plans`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
ai_run_id uuid references ai_runs(id) not null,
source_utterance text not null,             -- the artisan's original text/voice input
detected_intent text,                        -- one of the ~15 intents, or null if unresolved
matched_client_id uuid references clients(id),
matched_project_id uuid references projects(id),
match_confidence numeric(4,3),
plan_steps jsonb not null,                   -- ordered array of proposed steps, each with its own type/target/removable flag/message text if outbound
status text check (status in ('proposed','confirmed','partially_confirmed','dismissed','expired')) not null default 'proposed',
executed_at timestamptz,
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. **Never write to any domain table (invoices, journal, dunning_events, etc.) except through the confirm-and-execute path that reads this table's `plan_steps` after explicit user "OUI" confirmation** — see `06_AIPromptRegistry.md` §2 for the full contract.

### 2.23 `financing_simulations`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
client_id uuid references clients(id) not null,
project_id uuid references projects(id),
partner text check (partner in ('eco_ptz','domofinance','franfinance','sofinco')) not null,
amount numeric(10,2) not null,
term_months int not null,
rate_pct numeric(5,3) not null,
monthly_payment numeric(10,2) not null,       -- computed deterministically, never AI-estimated
indicative_only boolean not null default true, -- always true unless a real partner-data integration is later approved — see 01_ScopeDocument.md §9/§11 legal-caution note
sent_to_client boolean not null default false,
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern. On `sent_to_client = true`, auto-inserts a `journal` row.

### 2.24 `accounting_exports`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
period_start date not null, period_end date not null,
format text check (format in ('pennylane','tiime','fec','pdf_excel')) not null,
included_categories jsonb not null,     -- { sales_invoices, purchase_invoices, vat_summary, receivables }
missing_documents jsonb default '[]',    -- flagged gaps
result_document_id uuid references documents(id),
status text check (status in ('generated','sent','downloaded')) not null default 'generated',
created_at timestamptz default now()
```
RLS: standard owner-isolation pattern.

### 2.25 `migration_imports`

```sql
id uuid primary key default gen_random_uuid(),
owner_id uuid references auth.users(id) not null,
source_software text check (source_software in ('tolteck','obat','batigest','ebp','excel_papier','autre')) not null,
imported_categories jsonb not null,   -- { clients: bool, price_library: bool, quotes_invoices: bool, projects_in_progress: bool }
-- projects_in_progress is unchecked by default per Cahier §6.14's transparency decision — never default it to true in the UI or here
status text check (status in ('started','completed','failed')) not null default 'started',
summary jsonb,
created_at timestamptz default now(),
completed_at timestamptz
```
RLS: standard owner-isolation pattern.

---

## 3. RLS policy pattern (apply to every owner-scoped table)

```sql
alter table <table> enable row level security;

create policy "select_own" on <table> for select using (auth.uid() = owner_id);
create policy "insert_own" on <table> for insert with check (auth.uid() = owner_id);
create policy "update_own" on <table> for update using (auth.uid() = owner_id);
create policy "delete_own" on <table> for delete using (auth.uid() = owner_id);
```

For tables without a direct `owner_id` column (none in this schema — every table above carries a denormalized `owner_id` specifically so this single pattern applies uniformly, even on child tables like `quote_lines` and `order_lines`), the pattern would instead need a subquery join; this schema avoids that complexity by denormalizing `owner_id` everywhere a foreign key chain would otherwise require one.

**Test every table's RLS with a two-owner cross-access attempt before moving past the schema step** — this is a hard acceptance criterion (KOV-FR-003), not optional. Also verify: **no service-role key or Anthropic key ever appears in a client-shipped bundle** (grep `dist/assets/*.js` after every `npm run build` as part of the acceptance test).

---

## 4. The historical-copy rule (explicit statement — applies wherever `price_items` is referenced)

**Rule.** When a `quote_lines` row (or `order_lines` row) is created by referencing a `price_items` row, the relevant values (`designation`/`reference_label`, `unit`, `unit_price`/`sale_price`, `purchase_price`) are **copied at that moment** into the child row's own columns. The `price_item_id` foreign key is retained for traceability, but **the copied values are what the application reads and displays from then on** — a later edit to the `price_items` row's `sale_price` or `purchase_price` must **never** retroactively change any already-created `quote_lines` row, any already-issued `quote_versions` snapshot, or any already-placed `order_lines` row.

This is not an incidental implementation detail — it is a named acceptance criterion (KOV-FR-004: *"les lignes de devis conservent les valeurs copiées si le tarif change ensuite"*) and a direct consequence of the "chaque devis émis est une version immuable" architecture principle (Cahier §3). Implement it by making the copy happen in application code at line-creation time (never a live join/lookup at render time for an existing line), and cover it with an explicit test: change a `price_items.sale_price`, then re-open a previously-created quote and confirm its existing lines are unchanged.

---

## 5. Migration approach

Use Supabase CLI migrations (`supabase migration new <name>`), one migration file per logical table group rather than one giant file — keeps history reviewable and matches the maintainability NFR (`01_ScopeDocument.md` §7). Suggested grouping, matching the build sequence in `03_MasterPrompts.md`:

```
0001_profiles_businesses_employees.sql
0002_price_items_technical_sheets.sql
0003_clients.sql
0004_quotes_lines_versions_events.sql
0005_projects_costs_updates_change_orders.sql
0006_invoices_dunning.sql
0007_orders_order_lines.sql
0008_journal_documents.sql
0009_ai_runs_agent_action_plans.sql
0010_financing_accounting_migration.sql
```

Never edit a migration that has already been applied to a shared environment (staging or production) — write a new one instead.
