# Kōv — AI Prompt Registry Reference

> Purpose: every Claude call in Kōv must be server-owned (Supabase Edge Function), versioned, and schema-constrained — never a raw client-supplied prompt, and never the source of a final commercial figure (Cahier §3: *"Les calculs commerciaux sont déterministes... L'IA propose des lignes ; le code calcule les montants"*). This document defines the **contract** (not the exact wording) for each Claude call the agent builds in `03_MasterPrompts.md` Step 9 (AI-assisted quote drafting) and Step 12 (Kōv Agent). Exact prompt copy should be written in French (product language, informal "tu" register per `01_ScopeDocument.md` §1) by the agent during implementation, following these contracts exactly.

---

## 1. General rules for every prompt in this registry

1. **Server-owned only.** Lives in an Edge Function (`supabase/functions/<name>`), never accepts a client-supplied `system` prompt or arbitrary `max_tokens`.
2. **Structured output only.** Use Claude's structured-outputs/tool-use JSON schema feature — never parse free text with fence-stripping or brace-slicing.
3. **Versioned.** Every call records a `prompt_version` string on the resulting `ai_runs` row (see `05_DataModel.md` §2.21).
4. **Minimized context.** Only fetch and include the specific fields a given prompt needs — never dump the owner's entire client list or full journal history into every call.
5. **Idempotency key required** on every call that can produce a mutation-triggering proposal (`ai_runs.idempotency_key`, `agent_action_plans` keyed to its source `ai_run_id`).
6. **Timeout + retry**: one documented retry on 5xx/timeout only, never a retry that could double-commit an action once a plan has already been confirmed.
7. **Guardrail language embedded in every prompt**: the model must be instructed to state only what it can support from the given context — no invented client facts, no invented catalogue items, and **never** a final total, VAT amount, or margin figure — those are always server-calculated by deterministic code, never model output (KOV-FR-007, KOV-FR-008, KOV-FR-014).
8. **No send without confirmation.** Neither prompt in this registry, nor any code path that consumes their output, may cause a message to reach a client without an explicit human "OUI"/confirm action recorded first. This is architectural (Cahier §6.5), not a UX nicety.

---

## 2. Prompt catalog

### 2.1 `quote-draft-assist` (AI-assisted quote line drafting — module 6.4, KOV-FR-008)

**Trigger.** The artisan types or dictates a free-text description of the work into the quote editor's "Travaux" step and taps "Assister avec l'IA."

**Input context:**
```json
{
  "description": "string — the artisan's free-text description of the work",
  "trade": "plomberie_chauffage",
  "active_catalogue": [
    { "id": "uuid", "label": "string", "unit": "string", "sale_price": "number", "category": "string" }
  ],
  "business_context": {
    "default_vat_rate": "number",
    "client_vat_applicable": "standard | franchise | autoliquidation | export"
  }
}
```
Only the owner's **active** price-library items are sent (`price_items.active = true`), scoped to their own `owner_id` — never another owner's catalogue, never inactive/archived items.

**Output schema:**
```json
{
  "proposed_lines": [
    {
      "catalogue_item_id": "uuid | null",
      "matched_label": "string",
      "suggested_quantity": "number | null",
      "unit": "string",
      "confidence": "number (0-1)",
      "needs_clarification": "boolean"
    }
  ],
  "clarification_questions": [
    "string — a specific question the artisan should answer before this line can be finalized"
  ],
  "unmatched_notes": [
    "string — description fragments that didn't match any catalogue item and weren't turned into a line"
  ]
}
```

**Worked example.** Input description: *"Remplacement complet salle de bain, douche italienne, WC suspendu, chauffe-eau à changer aussi je crois"*:
```json
{
  "proposed_lines": [
    { "catalogue_item_id": "a1b2c3d4-...", "matched_label": "Receveur douche italienne 90x90", "suggested_quantity": 1, "unit": "u", "confidence": 0.91, "needs_clarification": false },
    { "catalogue_item_id": "b2c3d4e5-...", "matched_label": "WC suspendu + bâti-support", "suggested_quantity": 1, "unit": "u", "confidence": 0.88, "needs_clarification": false },
    { "catalogue_item_id": null, "matched_label": "Chauffe-eau (type/capacité à préciser)", "suggested_quantity": null, "unit": "u", "confidence": 0.4, "needs_clarification": true }
  ],
  "clarification_questions": [
    "Quel type de chauffe-eau (électrique, thermodynamique) et quelle capacité (litres) ?"
  ],
  "unmatched_notes": []
}
```

**Guardrails (hard, enforced by the Edge Function before any response leaves the server):**
- Every `catalogue_item_id` in the output **must** exist in the `active_catalogue` array that was sent as input, or be explicitly `null` — the Edge Function validates every returned ID against the actual set sent, rejecting/stripping any hallucinated ID before returning the response to the client.
- **Never emits `unit_price`, `subtotal`, `total`, or any VAT/margin figure.** The output schema above has no field for a price or amount at all — this is deliberate. Once the artisan applies a proposed line, the real `unit_price`/`purchase_price` are populated from the matched `price_items` row by application code (or left blank for the artisan to fill in if `catalogue_item_id` is `null`), never from the model's text.
- If `catalogue_item_id` is `null`, `needs_clarification` must be `true` — an unmatched line is never silently turned into a priced line item.
- The artisan must explicitly apply each proposed line (or apply-all) — nothing is written to `quote_lines` automatically on response; this mirrors KOV-FR-008's "l'artisan revoit et applique explicitement."
- If the Edge Function call fails or times out, the manual quote editor must remain fully usable with zero degradation — this is tested explicitly in `03_MasterPrompts.md`'s Step 9 testing block (KOV-FR-008 acceptance criterion: *"En cas de panne IA, l'éditeur manuel reste pleinement utilisable"*).

---

### 2.2 `agent-intent-extract` (Kōv Agent — natural-language intent understanding, module 6.5, KOV-FR-014)

**Trigger.** The artisan types or dictates a free-text utterance into the Kōv Agent input.

**Input context:**
```json
{
  "utterance": "string — the artisan's raw text/voice-transcribed input",
  "time_of_day": "morning | evening",
  "recent_context": {
    "recent_clients": [{ "id": "uuid", "name": "string" }],
    "recent_projects": [{ "id": "uuid", "name": "string", "client_id": "uuid" }],
    "open_invoices_summary": { "count": "number", "total_overdue": "number" }
  }
}
```
`recent_clients`/`recent_projects` are a bounded recent-activity window (e.g. last 60 days), never the owner's full client/project history — matches the "minimized context" rule in §1.

**Recognition approach (Cahier §6.5 — a specified mechanism, not left to the model's own discretion).** The system prompt for this call must instruct the model to combine three signals when matching intent and client/project names, exactly as specified in the Cahier: (1) **whole-phrase pattern matching** on known job-site turns of phrase (e.g. "il me manque," "m'a viré," "vient d'arriver" — these are examples, not an exhaustive list; the agent building this should compile a broader French job-site phrase list per intent during implementation), (2) **weighted trade vocabulary** (plumbing/heating-specific terms carry more matching weight than generic words), and (3) **fault tolerance via Levenshtein (edit) distance** on client/project name matching specifically, so a misspelled or mis-transcribed name (e.g. voice-dictation errors) still resolves correctly — implement the Levenshtein-distance fuzzy matching for `matched_client`/`matched_project` name resolution as an explicit, testable function (it does not need to be inside the Claude call itself — a deterministic pre/post-processing step in the Edge Function that fuzzy-matches the model's `name_as_understood` string against the real `recent_clients`/`recent_projects` list is an acceptable and arguably more testable implementation than asking the model to do exact-string matching internally). Write a specific test case with a deliberately misspelled/mis-transcribed client name and confirm it still resolves to the correct client above the match-confidence threshold.

**Output schema:**
```json
{
  "detected_intent": "rapport_termine | paiement_recu | relance | impayes | conflit_planning | livraison | commande | journee | semaine | marge | retard | absence_salarie | acompte | depense | nouveau_client | prospection | null",
  "intent_confidence": "number (0-1)",
  "second_best_confidence": "number (0-1)",
  "matched_client": { "id": "uuid | null", "name_as_understood": "string | null", "match_confidence": "number (0-1)" },
  "matched_project": { "id": "uuid | null", "name_as_understood": "string | null", "match_confidence": "number (0-1)" },
  "needs_disambiguation": "boolean",
  "fallback_suggestions": [
    { "label": "string", "intent": "string" }
  ]
}
```

**Worked example.** Utterance: *"il me manque le double vasque pour Bernard, la commande est pas arrivée"*:
```json
{
  "detected_intent": "livraison",
  "intent_confidence": 0.86,
  "second_best_confidence": 0.31,
  "matched_client": { "id": "c-9f21...", "name_as_understood": "Bernard", "match_confidence": 0.93 },
  "matched_project": { "id": "p-4a10...", "name_as_understood": "Salle de bain Bernard", "match_confidence": 0.89 },
  "needs_disambiguation": false,
  "fallback_suggestions": []
}
```

**Worked example — low-confidence/ambiguous case.** Utterance: *"ça avance pas terrible en ce moment"*:
```json
{
  "detected_intent": null,
  "intent_confidence": 0.22,
  "second_best_confidence": 0.19,
  "matched_client": { "id": null, "name_as_understood": null, "match_confidence": 0 },
  "matched_project": { "id": null, "name_as_understood": null, "match_confidence": 0 },
  "needs_disambiguation": true,
  "fallback_suggestions": [
    { "label": "Voir les chantiers en retard", "intent": "retard" },
    { "label": "Voir les impayés du moment", "intent": "impayes" },
    { "label": "Résumé de la journée", "intent": "journee" }
  ]
}
```

**Guardrails (hard):**
- An intent is only auto-selected downstream (i.e. `agent-plan-generate`, §2.3, is called with that intent pre-filled) when **both** `intent_confidence` exceeds a server-configured threshold (recommended starting point: 0.6) **and** the margin over `second_best_confidence` exceeds a server-configured gap (recommended starting point: 0.2) — this is the exact "score dépasse un seuil ET se détache nettement de la deuxième hypothèse" rule from Cahier §6.5. Otherwise `needs_disambiguation` must be `true` and the UI presents the disambiguation chip + candidate actions, never a silent best-guess.
- If `detected_intent` is `null` (nothing understood), `fallback_suggestions` must be populated with exactly three time-of-day-appropriate candidate actions (per Cahier §6.5's "il propose les trois actions les plus probables du moment (différentes le matin et le soir)") — never an empty response with no path forward for the artisan.
- Client/project matching never auto-commits to an action against a match below its own confidence threshold — a low-confidence match is surfaced for confirmation ("tu parles du chantier Bernard ?"), never silently assumed.
- This call **never** writes to any domain table itself — its only output is written to `agent_action_plans` as a `proposed` row (see `05_DataModel.md` §2.22); execution is a fully separate, human-gated step (§2.3 below).

---

### 2.3 `agent-plan-generate` (Kōv Agent — action plan construction, module 6.5, KOV-FR-014)

**Trigger.** Follows a successful (or user-disambiguated) `agent-intent-extract` result; builds the concrete, reviewable action plan.

**Input context:**
```json
{
  "detected_intent": "string — from 2.1's output, or a user-selected fallback",
  "matched_client_id": "uuid",
  "matched_project_id": "uuid | null",
  "relevant_records": {
    "open_invoice": "object | null",
    "recent_journal_entries": "array, bounded (last 5)",
    "project_summary": "object | null"
  }
}
```

**Output schema:**
```json
{
  "plan_summary": "string — one-sentence description of what this plan will do",
  "steps": [
    {
      "step_id": "string",
      "step_type": "send_message | log_note | create_reminder | update_status",
      "removable": "boolean",
      "target_channel": "sms | email | recommande_ar | null",
      "recipient": "string | null",
      "message_text": "string | null — REQUIRED and must be the full, exact text if step_type is send_message; never a placeholder or summary",
      "description": "string — human-readable summary of a non-message step"
    }
  ]
}
```

**Worked example.** Continuing the "livraison" intent example from §2.2, plan for a supplier-delay notification to the client:
```json
{
  "plan_summary": "Prévenir Bernard du retard de livraison et mettre à jour le chantier",
  "steps": [
    {
      "step_id": "s1",
      "step_type": "send_message",
      "removable": true,
      "target_channel": "sms",
      "recipient": "Bernard (06 XX XX XX XX)",
      "message_text": "Bonjour M. Bernard, petit contretemps : le double vasque commandé pour votre salle de bain n'est pas encore arrivé. On vous tient au courant dès réception, probablement sous 2-3 jours. Merci de votre patience. — Martin",
      "description": null
    },
    {
      "step_id": "s2",
      "step_type": "log_note",
      "removable": true,
      "target_channel": null,
      "recipient": null,
      "message_text": null,
      "description": "Ajouter une note chantier : retard livraison double vasque"
    }
  ]
}
```

**Guardrails (hard):**
- Every `send_message` step's `message_text` must be the **complete, final text**, never a summary or template placeholder — the "Lire le message" UI affordance (module 6.5, `02_ThemeGuideline.md` §6.9) opens exactly this text, editable in full, before send.
- Every step carries `removable: true` unless it is a purely internal logging step with no external effect — even then, the UI should generally still allow removal; the schema's `removable` flag exists precisely so the model (or a later business rule) can flag a step as non-removable only in a well-justified case, which should be rare.
- **Nothing in this response is executed automatically.** The Edge Function's only job is to write the response into `agent_action_plans.plan_steps` with `status='proposed'`. A separate, explicit client-initiated "OUI" confirmation is required to move to execution — see the execution rule below.
- **Execution contract (implemented in application code, not in the model call):** on explicit "OUI" confirm, the application iterates `plan_steps` in order, executing only the steps that were **not** individually removed by the artisan beforehand, and for each `send_message` step, executing only the **edited** text if the artisan changed it via "Lire le message" — never the original model-proposed text once edited. Each executed step:
  1. Performs its real effect (sends the SMS/email, updates the record, etc.).
  2. **Automatically inserts a `journal` row** (module 6.11's automatic-feed rule — `05_DataModel.md` §2.19) for any client-facing step.
  3. Updates `agent_action_plans.status` to `confirmed` (all steps executed) or `partially_confirmed` (some steps were removed before confirm).
- A plan left unconfirmed for a defined window (recommended: 24 hours) transitions to `status='expired'` via a scheduled check and is no longer executable — re-triggering the same intent produces a fresh plan rather than resurrecting a stale one.

---

## 3. Deterministic (non-AI) calculations — explicitly listed so the agent never mistakes them for Claude calls

These are **not** Claude prompts. They are listed here only to make explicit what must never be delegated to the model, per Cahier §3's "les calculs commerciaux sont déterministes."

### 3.1 `quote-totals-calc` (deterministic)
Pure server-side/shared-module TypeScript function: given `quote_lines` rows, computes `quantity × unit_price` per line, sums to subtotal, applies the quote's `vat_rate`, computes `total_ttc`, and computes `projected_margin_pct` from `(sale_price - purchase_price)` summed across lines versus subtotal. Explicit rounding rule: round to two decimal places using banker's rounding (round-half-to-even) at the final total only, never per intermediate line — this specific rounding contract must be covered by the validated test fixtures required by KOV-FR-007, at minimum one fixture per VAT rate (0%, 5.5%, 10%, 20%) and at least two fixtures exercising a rounding-boundary case (e.g. a subtotal ending in exactly `.005`).

### 3.2 `margin-tier-calc` (deterministic)
Pure function mapping a margin percentage to one of the four tiers defined in `02_ThemeGuideline.md` §2.4 — **green** >30% (`--vert`), **steel-blue** >20% (`--accent-500`, the brand color reused deliberately, not urgency-orange), **gold** >10% (`--gold-500` — note: NOT orange/amber-hued, see the naming note in `01_ScopeDocument.md` §5.4; some earlier cross-references in this doc set call this tier "amber," but the authoritative color is gold), **red** ≤0% (`--rouge`). By implication, a defined but unstyled "neutral low-positive" state for the 0–10% band should default to the gold tier's styling per the Cahier's ">10%" wording, i.e. anything from just-above-zero up to 10% reads as gold, not an undefined fifth state. Used identically by the quote editor's live margin box and the chantier profitability screen — never re-implemented separately in two places.

### 3.3 `project-profitability-calc` (deterministic)
Pure function: given a `projects` row's `planned_margin_pct`/`planned_value_ttc` and its associated `project_costs` rows, computes the real margin, the gap in points versus planned, and the "what ate the margin" breakdown (each `project_costs` row's `amount`/`hours×hourly_rate` grouped and compared against the quote's planned allocation for that cost category). Always reads from persisted `project_costs` rows — never a demo/placeholder value (KOV-FR-012).

### 3.4 `financing-simulation-calc` (deterministic)
Pure function: standard amortization formula given `amount`, `term_months`, `rate_pct`, producing `monthly_payment`. **Never AI-estimated.** Every simulation record defaults `indicative_only = true` and the UI must display this indicative character prominently, per the legal-caution note in `01_ScopeDocument.md` §9/§11 — this module must never present hardcoded eligibility rules as reliable financial advice.

### 3.5 `dunning-level-calc` (deterministic)
Pure function/scheduled check: given an invoice's `due_date` and current date, computes the correct `dunning_level` (0 = not due, 1 = ≥1 day overdue, 2 = ≥15 days overdue, 3 = ≥30 days overdue) per the exact thresholds in Cahier §6.8. Drives which pre-written message template is offered, but the actual send still requires the artisan's channel choice and explicit action — this calculation only ever proposes readiness for the next escalation level, never auto-sends.

---

## 4. Cost & rate controls (apply across the whole registry)

- Per-owner daily/monthly token quota, enforced server-side before calling Anthropic.
- Endpoint-specific `max_tokens` caps (never client-configurable).
- Bounded context per call (see §1 rule 4).
- Aggregate usage recorded on `ai_runs` for later visibility — never store full raw prompt/response text in routine logs; redact client PII and financial detail by default (NFR, `01_ScopeDocument.md` §7).

---

## 5. How the agent should use this doc

When building any AI feature (`03_MasterPrompts.md` Step 9 onward), find the matching entry above, implement it as its own Edge Function (`supabase/functions/<slug-matching-section-name>`), with the exact output schema as a Zod/JSON-schema contract validated server-side before anything is written to `agent_action_plans` or applied to a domain table. If a feature doesn't map cleanly to an existing entry here, flag it to the human operator rather than inventing a new unreviewed AI behavior — this mirrors the same rule already established in the sibling Claré project's registry and applies with equal force here, given Kōv's even stricter "AI never sets a figure, never sends without confirmation" architecture.
