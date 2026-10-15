# Kōv — Application Flow Map

> Purpose: a single map of every screen, every modal, every navigation path, and every UI state (loading/empty/error/success) so both you and the coding agent know what "the whole app working end-to-end" means. Derived directly from the Cahier des charges §4 ("Cartographie des écrans" — 23 screens, 11 modals), translated to English and expanded with entry/state/exit detail. Referenced heavily by the final audit Master Prompt in `03_MasterPrompts.md`.

---

## 1. Top-level navigation map

```
[Unauthenticated]
  Sign Up
  Sign In
  Forgot Password

[Authenticated, onboarding incomplete]
  Onboarding (single unified flow — see 01_ScopeDocument.md §9, "duplicate onboarding" defect to avoid)
    1. Trade selection (métier)
    2. Team size (solo / avec équipe)
    3. Business information (raison sociale, SIREN, coordonnées, TVA, mentions légales)
    → Home

[Authenticated, onboarding complete]
  Bottom Tab Nav (mobile) / Left Rail (desktop) — 5 tabs + center FAB, per Cahier §4:
    ① Accueil (Home)   — s-home
    ② Planning         — s-planning
    ③ Devis (Quotes)   — s-devis
    ④ Clients          — s-clients
    ⑤ Profil           — s-profil
    [FAB] Nouveau devis (new quote quick-create)

  Screens reachable from these tabs (see §2 for full detail per screen):
    s-new-devis (quote editor, 4-step flow)
    s-fiche-detail (client record)
    s-chantier (chantier detail)
    s-agent (Kōv Agent conversation)
    s-impayes (unpaid invoices)
    s-factures (invoicing)
    s-commandes (material orders)
    s-msg (Messages — cross-client main courante)
    s-compta (accounting export)
    s-migration (data migration)
    s-financeurs (financing)
    s-fiches (technical sheets)
    s-tarifs (price library)
    s-sat (satisfaction)
    s-entreprise (business settings)
    s-marge (margin support screen, embedded in quote editor)
    s-sign (acceptance/signature support screen, embedded in quote flow)

  Modal/overlay flows (see §3):
    mo-commande, mo-facture, mo-relance, mo-envoi, mo-jr, mo-rapport,
    mo-rapport-vue, mo-confirm-envoi, mo-fournisseur, mo-conflit, mo-financement
```

---

## 2. Screen-by-screen flow detail (all 23 screens)

### 2.1 `s-onb` — Onboarding
- **Entry**: first authenticated session with `profiles.onboarding_complete = false`.
- **Flow**: single unified state machine (do not build two parallel onboarding paths — this is the named "double onboarding" defect from `01_ScopeDocument.md` §9, corrected here permanently). Steps: trade selection → team size (solo/équipe) → business info form (raison sociale, SIREN, address, phone, email, default VAT, legal mentions).
- **State persistence**: `profiles.onboarding_step` updates after each step so a refresh mid-flow resumes correctly, matching the reliability principle applied elsewhere in the app.
- **States**: idle → submitting (inline spinner on "Continuer," inputs disabled) → error (inline, field-specific for validation, banner for server errors) → success (advance).
- **Exit**: final step sets `businesses.legal_fields_complete = true` and `profiles.onboarding_complete = true`, redirects to Home. **Legal fields must be validated complete before any quote can later be issued** — if the artisan skips optional detail during onboarding, the quote-issuance flow (§2.5 below) must re-check and block with a clear path back to Business Settings (`s-entreprise`) rather than silently allowing an incomplete legal quote.

### 2.2 `s-home` — Accueil (Home)
- **Entry**: default landing screen after onboarding or any subsequent sign-in.
- **Loading state**: skeleton action-list rows (shimmer, steel-blue tinted per `02_ThemeGuideline.md` §9) while the day's action list is computed.
- **Content**: the smart action list (module 6.2) — concrete items like "6 things to handle · 2 min," each with icon, title, contextual subtitle, action button. **Time-of-day switch**: automatic after 16:00 real time, showing the evening list (report-first, opens dictation directly) versus the morning list. A demo toggle to force either list must be excluded from production builds entirely (not just hidden — genuinely absent from the shipped bundle).
- **Empty state**: "Rien à régler pour le moment ✓" when no real action items exist — never a fabricated item to fill space (KOV-FR-019's "aucune activité fictive").
- **Card tap** → routes to the corresponding screen/modal (a dunning card opens `s-impayes` or `mo-relance` directly; a quote-follow-up card opens `s-devis`/`s-new-devis`; a report card opens `mo-rapport` with dictation auto-starting).
- **Error state**: if the day's data fetch fails, the list area shows a calm inline retry, never a blank crash screen.

### 2.3 `s-planning` — Planning
- **Entry**: Planning tab.
- **Loading state**: week-shaped skeleton (day columns with placeholder chantier chips).
- **Content**: week view, chantiers per day, assigned employees shown per chantier chip. **Conflict detection**: a badge on the Planning tab itself signals when any employee is double-booked on the same day; conflicting chantier chips carry an inline warning icon.
- **Conflict tap** → opens `mo-conflit` (§3 below).
- **Empty state**: "Aucun chantier planifié cette semaine" with a CTA to open a quote/chantier to schedule.
- **Only meaningful in team mode** (`profiles.team_mode = 'equipe'`) per the Cahier's scope note (module 6.10) — if a business is ever set to `solo`, this tab should be visually de-emphasized or show a explanatory empty state rather than a broken/empty planning grid, though `equipe` is the target and default.

### 2.4 `s-devis` — Liste des devis (Quotes list)
- **Entry**: Devis tab.
- **Loading state**: list-row skeleton.
- **Content**: paginated list of quotes with status badges (Draft/Issued/Accepted/Declined/Expired-Cancelled per `02_ThemeGuideline.md` §6.7), search/filter by client or status.
- **Empty state**: "Aucun devis pour l'instant" + CTA to create one (opens the FAB flow, §2.6).
- **Row tap** → opens the quote in `s-new-devis` (if Draft, editable) or a read-only issued-version view (if Issued/Accepted/Declined/Expired).

### 2.5 `s-new-devis` — Éditeur de devis (Quote editor, 4-step flow)
- **Entry**: FAB "Nouveau devis," or tapping a Draft row from `s-devis`, or "Créer un devis" from a client record (`s-fiche-detail`).
- **Four-step flow, exactly per Cahier §6.4**: **Client → Travaux → Devis → Envoyer.**
  - **Step 1 — Client**: select an existing client (search) or create a new one inline (mini version of the client-creation form).
  - **Step 2 — Travaux**: free-text description entry, with an "Assister avec l'IA" action calling `quote-draft-assist` (see `06_AIPromptRegistry.md` §2.1) to propose lines; clarification questions surface here if the AI flags any. This step's loading state (AI call in flight) shows a dedicated inline "Kōv réfléchit..." indicator, never a frozen screen — and the manual line-entry path beneath it remains fully interactive and usable even while the AI call is running or if it fails (KOV-FR-008 hard requirement).
  - **Step 3 — Devis**: the line-item editor itself — add/edit/reorder lines (from the price library or free entry), per-line purchase price and margin, the live margin box (`02_ThemeGuideline.md` §6.6) recalculating on every edit, VAT selector (5.5/10/20/0%) with the correct legal mention auto-applied.
  - **Step 4 — Envoyer**: review screen showing the full quote as it will appear on the PDF, "Émettre le devis" action (see the PDF-generation motion moment, `02_ThemeGuideline.md` §9.2), then a send-channel choice (email at minimum, per the client's decision that a PDF-only flow is commercially insufficient — `01_ScopeDocument.md` §8).
- **States**: draft auto-saves on every field blur (no explicit "save" button needed while in Draft status); issuance ("Émettre") is the one deliberate, confirmed action that freezes the quote into a `quote_versions` snapshot.
- **Exit**: back to `s-devis` list, or directly into the newly issued quote's read-only view with a clear "Devis émis ✓" confirmation.
- **Edit-after-issuance**: attempting to edit an Issued/Accepted/Declined quote does not mutate it in place — it opens a **new draft copy**, and issuing that copy creates `quote_versions.version_number + 1` against the same `quotes.id`, per KOV-FR-006/010.

### 2.6 `s-clients` — Liste clients (Client list)
- **Entry**: Clients tab.
- **Loading state**: avatar+name row skeleton.
- **Content**: real-time search by name or city; each row shows avatar (initials), name, role, status tags.
- **Empty state**: "Aucun client pour l'instant" + CTA to add one.
- **Row tap** → `s-fiche-detail`.
- **Archived clients**: excluded from default search/list, reachable via an explicit "Voir les clients archivés" toggle/filter.

### 2.7 `s-fiche-detail` — Fiche client (Client record)
- **Entry**: tapping any client row (from `s-clients`, `s-msg`, a quote, or a journal reference).
- **Loading state**: profile-header skeleton + tabbed-section skeleton.
- **Content sections** (per Cahier §6.3): contact details (editable), indicators (cumulative revenue, chantier count, next follow-up reminder date), documents (Kōv-generated + artisan-uploaded, with upload affordance), main courante (the vertical timeline component, `02_ThemeGuideline.md` §6.10), internal notes (free text + tags + voice dictation), work history (past quotes and chantiers, linked).
- **Empty states per section**: main courante empty = "Aucun échange pour l'instant"; documents empty = "Aucun document"; notes empty = "Aucune note."
- **Archive action**: confirm-modal, removes from default client search, **never** cascades to delete linked quotes/chantiers/invoices (KOV-FR-005 hard requirement).

### 2.8 `s-chantier` — Chantier
- **Entry**: from a client's work-history list, a Planning chip, a Home action card, or directly after a successful quote→chantier conversion.
- **Loading state**: progress-header skeleton + profitability-block skeleton (sized to its eventual shape to avoid layout shift on load — the profitability reveal motion moment plays only after real data has arrived, never over a skeleton).
- **Content**: status (Planned/In progress/Awaiting payment/Closed), dates, chronological notes/reports, and — directly beneath progress — the **"Ce que ce chantier te rapporte"** real-profitability block (`02_ThemeGuideline.md` §6.6 extended variant): real margin headline, planned margin alongside, gap in points, progress bar with planned-position marker, detail breakdown (billed − supplies − labor-hours×rate − misc), and the "what ate the margin" named list of overruns.
- **Change-order action**: "Générer un avenant" button, present whenever `project_costs` overruns exist against the plan — opens a pre-filled `change_orders` draft (lines derived from the overrun detail), editable before send.
- **Report action** → opens `mo-rapport`.
- **Order action** → opens `mo-commande`.
- **Error state**: if real-cost data fails to load, the profitability block shows an inline retry local to that section — the rest of the chantier screen (status, notes) remains usable.

### 2.9 `s-agent` — Agent Kōv (Kōv Agent conversation)
- **Entry**: dedicated FAB/nav entry point (purple-gradient, per `02_ThemeGuideline.md` §6.9), or a Home card's "Demander à l'agent" action, or the always-available agent entry from any screen's header.
- **Content**: conversation surface on the purple gradient background; text or voice input; on submit, calls `agent-intent-extract` → (if resolved) `agent-plan-generate` (see `06_AIPromptRegistry.md` §2.2–2.3).
- **States**:
  - **Understood, high confidence**: intent-confirmation chip shown, plan-review card follows directly.
  - **Understood, needs disambiguation**: "tu parles du chantier Bernard ?" style confirmation chip with candidate options, before any plan is generated.
  - **Not understood**: three time-of-day-appropriate fallback suggestions shown as tappable chips (never a dead-end "I don't understand" with no path forward).
  - **Plan review**: each step individually removable, "Lire le message" expands any outbound-message step to its full editable text, persistent "Rien n'est envoyé avant validation" banner, final "OUI" confirm / "Annuler" dismiss.
  - **Executing**: the plan-approval sequential-reveal motion (`02_ThemeGuideline.md` §9.2) plays as each non-removed step actually executes, in visible order.
  - **Executed**: confirmation summary, each executed client-facing step now visible in the relevant client's main courante.
- **Error state**: if the Claude call itself fails/times out, a friendly inline retry on the agent surface — never a blank hang, and the artisan's typed/dictated input is never lost.
- **Dictation**: mic control with purple-accent pulsing rings while recording (per `02_ThemeGuideline.md` §9.2); transcript always editable before submission — dictation is never auto-submitted.

### 2.10 `s-impayes` — Impayés (Unpaid invoices)
- **Entry**: Home action card, or a direct nav link from `s-factures`/business menu.
- **Loading state**: list-row skeleton.
- **Content**: total outstanding amount and count of unpaid invoices at the top; list of overdue invoices, each showing client, amount, days overdue, current dunning level (badge, escalating color per `02_ThemeGuideline.md` §6.4).
- **Row tap** → opens `mo-relance` for that invoice.
- **Empty state**: "Aucun impayé actuellement ✓" — a genuinely positive empty state, styled with success-tier color, not a neutral gray "no data" treatment.

### 2.11 `s-factures` — Facturation (Invoicing)
- **Entry**: Devis tab area / chantier detail's "Facturer" action / direct nav.
- **Loading state**: list-row skeleton.
- **Content**: all invoices across all clients/chantiers, filterable by status (draft/sent/paid/overdue/cancelled).
- **Create flow**: from a quote or chantier, opens `mo-facture` (invoice-type selection: acompte/situation/solde/totalité, each shown in euros, plus payment-term choice).
- **Empty state**: "Aucune facture pour l'instant."

### 2.12 `s-commandes` — Commandes (Material orders)
- **Entry**: from a chantier's "Commander" action, or a direct nav link.
- **Loading state**: order-card skeleton.
- **Content**: list of material orders per chantier, each showing status (transmitted-pending / confirmed) and delivery slot.
- **Row tap** → order detail (line items with stock state, depot, lead time).
- **Create flow** → `mo-commande`.
- **Empty state**: "Aucune commande en cours."

### 2.13 `s-msg` — Messages (cross-client main courante view)
- **Entry**: nav link (header icon or Profil sub-menu).
- **Loading state**: thread-row skeleton.
- **Content**: one thread per client, sorted by most recent exchange; three filters — **Tout / Reçus / Sans réponse**; "en attente" badge on threads where the artisan's last message has no client reply yet.
- **Thread tap** → `s-fiche-detail` (the client record, scrolled to the main courante section).
- **Empty state**: "Aucun échange pour l'instant."

### 2.14 `s-compta` — Export comptable (Accounting export)
- **Entry**: Profil menu.
- **Content**: quarter banner (cash collected incl. tax, VAT collected, invoice/purchase-record counts), format selection (Pennylane direct / Tiime direct / FEC file / PDF+Excel folder), category checkboxes (sales invoices, purchase invoices, VAT-by-rate summary, uncollected receivables), missing-documents alert list.
- **Generate action**: inline progress state while the export is prepared (this can take several seconds for a full quarter — show a dedicated progress indicator, never a frozen button), then a completed state with send-to-accountant or download actions.
- **Empty/edge state**: a quarter with zero invoices shows a clear "Rien à exporter pour cette période" rather than a broken/empty-looking report.

### 2.15 `s-migration` — Reprendre mes données (Data migration)
- **Entry**: Profil menu, typically used once near account creation but reachable anytime.
- **Content**: source-software choice (Tolteck/Obat/Batigest/EBP/Excel-papier/Autre), per-source instructions display, category checkboxes for what to import (clients, price library, quotes/invoices as archived PDFs, chantiers in progress — **this last one unchecked by default**, per the Cahier's transparency decision), reassuring "keep your old tool for another year" messaging.
- **Import progress**: a dedicated progress/status state per category being imported, with a completion summary (counts imported per category, any skipped/failed rows flagged).

### 2.16 `s-financeurs` — Financement (Financing)
- **Entry**: from a chantier or quote's "Proposer un financement" action, or Profil menu.
- **Content**: partner list (éco-PTZ, Domofinance, Franfinance, Sofinco), a prominent **"simulation indicative"** disclosure (per the legal-caution defect fix in `01_ScopeDocument.md` §9), simulation form (amount/term/rate) → computed monthly payment (deterministic, see `06_AIPromptRegistry.md` §3.4).
- **Send action** → opens a review-before-send step (consistent with the app-wide "nothing sent without visible confirmation" principle), logs to the client's main courante on send.

### 2.17 `s-fiches` — Fiches techniques (Technical sheets)
- **Entry**: Profil menu / price-library screen.
- **Content**: browsable, filterable product/technical sheets, each optionally linked to a `price_items` row.
- **Empty state**: "Aucune fiche technique pour l'instant" + CTA to add one.

### 2.18 `s-tarifs` — Bibliothèque de prix (Price library)
- **Entry**: Profil menu (business settings area) / from within the quote editor's line-add flow.
- **Loading state**: list-row skeleton.
- **Content**: the artisan's price library — label, unit, purchase price, sale price, default VAT, active toggle; pre-filled at onboarding per trade.
- **Create/edit/deactivate**: standard CRUD, with the historical-copy rule (`05_DataModel.md` §4) explicitly not surfaced as a limitation but simply the correct behavior — editing a price here never retroactively changes an already-issued quote.
- **Empty state**: only possible immediately post-onboarding if trade pre-fill somehow failed — should be rare; if it occurs, "Ta bibliothèque est vide" + CTA to add the first item.

### 2.19 `s-sat` — Satisfaction
- **Entry**: periodic prompt (e.g. after a chantier closes) or Profil menu.
- **Content**: lightweight client-satisfaction follow-up tracking — a simple record of whether a post-chantier check-in was sent/received per client, surfaced from the client record's "next follow-up reminder" field.
- **Empty state**: "Rien à suivre pour le moment."

### 2.20 `s-profil` — Profil
- **Entry**: Profil tab (bottom nav).
- **Content**: menu of secondary functions — Business settings (`s-entreprise`), Price library (`s-tarifs`), Technical sheets (`s-fiches`), Accounting export (`s-compta`), Data migration (`s-migration`), Financing (`s-financeurs`), Satisfaction (`s-sat`), account settings (sign out, password change, account deletion).
- **Account deletion**: multi-step confirm-then-processing state (re-confirm modal → "Suppression en cours..." → final confirmation), never instant/silent, since it's irreversible and must cascade correctly across every owner-scoped table (KOV-FR-020).

### 2.21 `s-entreprise` — Entreprise (Business settings)
- **Entry**: Profil → Entreprise.
- **Content**: the same fields collected at onboarding (raison sociale, SIREN, coordonnées, TVA par défaut, mentions légales), now editable at any time. Reuses the onboarding step's field components rather than a separate implementation.
- **Validation**: legal-fields-complete check re-runs on save; if incomplete, a clear inline warning shows exactly which quote-issuance-blocking fields remain missing.

### 2.22 `s-marge` — support screen (embedded margin detail)
- Not a standalone nav destination — a support view embedded within `s-new-devis` (Step 3) and `s-chantier`, rendering the margin-indicator component (`02_ThemeGuideline.md` §6.6) in its two variants (quote-editor live box; chantier profitability extended block). Documented here as its own entry because the Cahier explicitly names it as a distinct screen ID tied to these modules.

### 2.23 `s-sign` — support screen (embedded acceptance flow)
- Not a standalone nav destination — a support view embedded within the quote's Step 4 (Envoyer) and the issued-quote read-only view, presenting the **"Acceptation du devis"** flow (never labeled "Signature" — see `01_ScopeDocument.md` §9's defect fix). Two paths: (a) manual acceptance recording (artisan marks the quote accepted after receiving verbal/written confirmation, or the client draws a canvas acknowledgment mark explicitly labeled "Acceptation du devis," recorded honestly in `quote_events.acceptance_method = 'canvas_mark'`), or (b) a real e-signature integration path (`acceptance_method = 'esignature'`) per the client's decision that a legally valid e-signature is wanted as a competitive standard (`01_ScopeDocument.md` §8). Both paths write a `quote_events` row with `event_type='accepted'`.

---

## 3. Modal-by-modal flow detail (all 11 modals)

### 3.1 `mo-commande` — Material order modal
- **Opens from**: `s-chantier`'s "Commander" action, or `s-commandes`.
- **Content**: filtered supply lines from the source quote (labor/flat-fee lines excluded), per-reference stock state (available/in transit/out of stock) with depot and lead time, delivery mode toggle (chantier/agence), delivery slot options adapting to the longest lead time among selected references.
- **States**: initial "Commande transmise — en attente de confirmation" on submit, transitioning later to "Le fournisseur a confirmé — bon n°..." **only on a real supplier-side signal in production** — never a fixed timer standing in for confirmation (explicit defect to avoid, `01_ScopeDocument.md` §9).
- **Exit**: creates an `orders` row + `order_lines`, closes back to the originating screen with a toast confirmation.

### 3.2 `mo-facture` — Invoice generation modal
- **Opens from**: a quote or chantier's "Facturer" action.
- **Content**: invoice type selection (acompte 30% / situation 40% / solde / totalité, each shown in euros computed from the source quote's total), payment-term selection (à réception / 15 jours / 30 jours).
- **Exit**: creates an `invoices` row, auto-feeds the client's main courante, closes to `s-factures` or back to the originating chantier with a confirmation.

### 3.3 `mo-relance` — Dunning/reminder modal
- **Opens from**: `s-impayes` row tap.
- **Content**: the pre-written message for the invoice's current dunning level, editable; channel choice (SMS/email/lettre recommandée avec AR).
- **Exit**: sends via the chosen channel, creates a `dunning_events` row, auto-feeds the client's main courante, closes with confirmation.

### 3.4 `mo-envoi` — Read/edit agent message before send
- **Opens from**: the "Lire le message" affordance inside the Kōv Agent's plan-review card (`s-agent`).
- **Content**: full message text (editable), channel, recipient — this is the direct implementation of KOV-FR-014's "tout message destiné à un client est visible avant envoi."
- **Exit**: returns the edited text to the plan-review card's step (does not send by itself — sending only happens on the plan's overall "OUI" confirm).

### 3.5 `mo-jr` — Journal entry detail
- **Opens from**: tapping any main courante entry (in `s-fiche-detail` or `s-msg`).
- **Content**: full text of the exchange, its type/direction/timestamp.
- **Exit**: read-only, close returns to the timeline.

### 3.6 `mo-rapport` — Chantier report entry (with voice)
- **Opens from**: `s-chantier`'s report action, or the Home evening-list "rapport du jour" card (which auto-starts dictation on open).
- **Content**: text field with dictation (mic button, pulsing while active, transcript editable before save), progress percentage, what-was-done summary.
- **Exit**: creates a `project_updates` row, then optionally proceeds to `mo-confirm-envoi` if the artisan chooses to notify the client.

### 3.7 `mo-rapport-vue` — Report view + client SMS
- **Opens from**: `s-chantier`'s notes/history list, tapping a past report.
- **Content**: the report's full text and, if it was sent, the exact SMS text that reached the client.
- **Exit**: read-only.

### 3.8 `mo-confirm-envoi` — Confirm sending a report to the client
- **Opens from**: `mo-rapport`, after saving, if the artisan opts to notify the client.
- **Content**: preview of the summary SMS that will be sent, explicit confirm/cancel.
- **Exit**: on confirm, sends the SMS, sets `project_updates.sent_to_client = true`, auto-feeds the client's main courante.

### 3.9 `mo-fournisseur` — Supplier connection modal
- **Opens from**: `s-commandes` or business settings, for connecting/configuring a supplier channel.
- **Content**: supplier selection/connection flow. **Scope note**: the underlying channel is simulated in the near-term build (per `01_ScopeDocument.md` §11) — the interface behavior here must still be built exactly as specified so a real integration can be substituted later without a UI rewrite.
- **Exit**: returns to the originating screen with connection status shown.

### 3.10 `mo-conflit` — Planning conflict resolution modal
- **Opens from**: `s-planning`'s conflict badge/warning icon tap.
- **Content**: the conflicting chantier/employee pairing shown clearly, proposed resolution options (reassign to a different employee, or reschedule one of the two chantiers), a "notifier le client concerné" toggle.
- **Exit**: applies the reassignment/reschedule to the relevant `projects` row(s), optionally triggers a client notification (feeding the main courante), closes back to `s-planning` with the conflict badge cleared.

### 3.11 `mo-financement` — Financing simulation modal
- **Opens from**: `s-financeurs`, or directly from a chantier/quote's financing action.
- **Content**: partner choice, amount/term/rate inputs, computed monthly payment (deterministic, `06_AIPromptRegistry.md` §3.4), the indicative-only disclosure, send-to-client action.
- **Exit**: creates a `financing_simulations` row; on send, auto-feeds the client's main courante.

---

## 4. Global cross-cutting states (apply to every screen and modal)

Every screen/modal built from Step 5 onward in `03_MasterPrompts.md` (once real data-backed screens start replacing Step 4's placeholder routes) must implement ALL of these states, not just the happy path.

| State | Requirement | Implementation notes |
|---|---|---|
| **Loading (skeleton)** | Skeleton/shimmer matching the real layout of that screen, never a generic spinner-only blank screen | One `<Skeleton>` primitive with a steel-blue-tinted shimmer (per `02_ThemeGuideline.md` §9), then a screen-specific skeleton layout per screen (e.g. `HomeSkeleton`, `ChantierSkeleton` sized to avoid layout shift before the profitability-reveal motion plays) |
| **Loading (inline/action)** | Any control triggering a network call (save, issue quote, confirm plan, send dunning) shows its own inline spinner/disabled state, never a full-screen blocker | Disable the triggering control + show a small spinner inside it |
| **Empty** | Always a warm, specific empty message + a clear next action — never a bare "No data" — and **never fabricated content standing in for a genuine empty state** (a direct KOV-FR-019 requirement extended to every list screen, not just Home) | Empty copy written per-screen (see §2.x above for each screen's exact wording) |
| **Error (recoverable)** | Recoverable, friendly, retry available, local to the affected section — never a blank crash screen | A failed chantier-profitability fetch doesn't blank the whole chantier screen behind it |
| **Offline** | Manual CRUD (clients, price library, quote line edits while in Draft) queues/retries gracefully; AI-dependent actions (quote-draft-assist, Kōv Agent) and anything that would send to a client (dunning, invoicing, agent plan execution) clearly disable with an explanatory message rather than silently failing or, worse, appearing to succeed | Detect via `navigator.onLine` + listeners; never allow a "send" action to appear to succeed while offline |
| **Slow network** | A fetch taking longer than ~2–3s shows a "toujours en cours..." inline indicator rather than looking frozen; every network call has a client-side timeout with a friendly retry prompt | Test explicitly with Chrome DevTools "Slow 3G" per screen |
| **Unauthorized** | Redirect to Sign In, never a silent blank/broken protected page | Protected-route wrapper checks session before rendering |
| **AI unavailable** | Every AI-dependent surface (quote-draft-assist, Kōv Agent) degrades to a clear "l'IA est indisponible, tu peux continuer manuellement" state without blocking the underlying manual flow — this is a named hard requirement (KOV-FR-008) | Test by pointing the Anthropic key at an invalid value and confirming the manual quote editor and manual client/invoice CRUD all still work fully |

---

## 5. How this doc is used during build

- **Step 5** (routing shell) of `03_MasterPrompts.md`: the route list is derived directly from §1/§2 above.
- **Steps 6 onward**: each screen's build Master Prompt references its subsection here (§2.x/§3.x) for exact state/behavior requirements.
- **The final "full scope audit" prompt** (last section of `03_MasterPrompts.md`) walks this entire document top to bottom as its test script, screen by screen and modal by modal.
