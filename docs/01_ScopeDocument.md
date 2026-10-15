# Kōv — Phase 2 Scope Document (Agent Reference)

> Source of truth: `Refrence/Kov_Cahier_des_charges (7).pdf` (KOV-CDC-F-001, v1.0 — "Périmètre complet"). This document restates it as a single build-oriented reference for the coding agent, translated to English and expanded with column/table structure the agent can act on directly. Where the Cahier and this document ever disagree, **the Cahier des charges PDF wins** — flag the conflict to the human operator, don't silently pick one.
>
> `Kov_SRS_Phase_2.pdf` (KOV-SRS-P2-001) is cited throughout this document only for its still-valid technical findings (confirmed stack, known defects, architecture principles) — **never** for its proposed reduced scope, which the client explicitly rejected in the Cahier's section 9 ("Décisions produit tranchées").

---

## 1. What Kōv is

Kōv is a **mobile-first, French-language, field-management application for artisans du bâtiment (building-trade tradespeople) employing between one and three salaried staff**. It is neither a simple quoting tool nor a simple job-tracking tool: it covers the entire lifecycle of a job, from first client contact through quote, chantier (job site), invoicing, unpaid-invoice collection, and client-relationship history.

**Strategic positioning.** Kōv's promise is to bring the management quality of large firms within reach of small artisan businesses: *"gérez vos chantiers comme une entreprise de cinquante personnes, sans en avoir une"* ("run your jobs like a fifty-person company, without being one"). Where competitors (Tolteck, Obat, VOX BATI) offer quote-centric tools with AI assistance, Kōv differentiates through an **agent that executes chains of actions** and **end-to-end functional coverage**.

**Differentiators that must be preserved without dilution:**
- **The execution agent.** The AI doesn't just suggest — it chains concrete actions (identifying unanswered quotes, preparing collection reminders, scheduling follow-up) after the artisan's validation. Every message going to a client is visible and editable before it is sent.
- **Real chantier profitability.** Real-time comparison between the margin planned at quote time and the margin actually achieved, with a breakdown of overruns and one-click change-order (avenant) generation. No competitor offers this.
- **Three-level unpaid-invoice escalation.** Automatic escalation from a courteous reminder to a formal notice (mise en demeure), with pre-written messages carrying the correct legal mentions. Unpaid invoices are artisans' #1 pain point.
- **The client main courante (activity journal).** A time-stamped journal of everything exchanged with each client, retained for ten years, admissible in the event of a dispute.
- **Understanding of job-site language.** The artisan speaks naturally; the system understands trade phrasing and identifies the client and chantier concerned.

**Visual identity.** Mobile-first interface, dark background and off-white, steel-blue `#4A7FA5` as the accent color, DM Sans and Playfair Display typefaces. Concise language and informal address ("tu"), suited to an artisan checking the app on a job site. This identity, praised in the technical audit, must be preserved through the rebuild (see `02_ThemeGuideline.md`).

**Current state (as of audit):** a single static HTML file (`kov_V3_accueil_actions.html`, 6,503 lines, 23 screens, 11 modals, ~180 functions), all data held in in-memory JavaScript arrays, lost on page reload. No database, no real authentication, no server-side calculation guarantees, no real PDF generation or storage, embedded demo PII, and some confirmations are simulated with timers rather than real actions. **Not production-safe. Never shipped as-is** — reference-only for visual language and behavior.

**Phase 2 target:** a secure, account-based, full-scope Kōv covering all 16 modules described in section 6 below, built on React/TypeScript/Vite + Supabase, with deterministic server-side commercial calculations, real persistence, real RLS-enforced multi-tenant isolation, and a working AI boundary (quote-drafting assistance and the Kōv Agent) that never sets a final figure or sends anything without human confirmation.

---

## 2. Target user and reference persona

All product design in this document is anchored to a single reference persona, used as the throughline for development and for demo/seed data.

| Attribute | Value |
|---|---|
| Persona | Martin Da Silva |
| Trade | Plumber-heating engineer (plombier-chauffagiste) |
| Location | Rennes (Ille-et-Vilaine), France |
| Team size | Three salaried employees: Lucas, Karim, Pierre |
| Revenue | Roughly €300,000/year |
| Equipment | Smartphone, used while traveling and on job sites |
| Core pains | Unpaid invoices, evening admin work, pricing/margin accuracy, team coordination |

**Commercial target.** Kōv targets the artisan **with employees**, not the solo micro-entrepreneur. This distinction is structural: it justifies the pricing position (roughly €59/month versus €19–39 for solo tools) and drives specific requirements for team coordination and multi-chantier tracking. Every module described below must be built with a 1–3-person crew in mind, not a solo operator — planning/conflict detection (module 6.10) is central to this, not an optional add-on.

---

## 3. Confirmed technology stack (Phase 2)

Both source documents (SRS and Cahier) independently converge on this stack — it is not in dispute, only the functional scope was.

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | **React + TypeScript + Vite** | NOT Next.js. Both source documents explicitly specify Vite. There is no existing codebase to refactor — this is a **greenfield** build, guided by the HTML prototype as reference, not a migration. |
| Styling | **Tailwind CSS + shadcn/ui** | Implements the design system in `02_ThemeGuideline.md`, extracted verbatim from the client's HTML custom properties. |
| Animation | **Framer Motion** (primary, component-level) + **GSAP + ScrollTrigger** (complex sequenced moments) + **animate.css** (small one-off utility transitions) | See `02_ThemeGuideline.md` §9. |
| Backend/data | **Supabase** — Postgres, Auth, Row-Level Security (RLS), Storage, Edge Functions | Explicit choice in both source documents, confirmed by the client. |
| Hosting | **Vercel** (frontend) | Simple Vite preview/production delivery; no current deployment to preserve. |
| AI | **Anthropic Claude**, called only from Supabase Edge Functions (never client-side) | Server-owned prompts, structured/schema-constrained outputs. No API key ever reaches the browser bundle — this is a hard architectural rule (Cahier §3), not a preference. |
| PDF generation | Server-side, from the **persisted immutable quote version** — never `window.print()` on live DOM state | Both audit documents flag the prototype's `window.print()` approach and its selector-mismatch defect (see §9 below) as things to fix, not preserve. Use a Supabase-Edge-Function-compatible PDF library (e.g. `@react-pdf/renderer` run server-side, or an equivalent headless-render approach) that reads only from the stored `quote_versions` snapshot. |
| Voice dictation | Web Speech API (browser), with keyboard fallback | Used for chantier reports (module 6.12) and available to Kōv Agent input; transcript always editable before submission, dictation never the sole input method. |
| Geography / tax | France only. VAT rates 5.5%, 10%, 20% (plus 0% for exempt/exonerated cases), French legal mentions | Not a global product in Phase 2 — no other jurisdiction, currency, or VAT regime is in scope. |
| Trade at launch | Plumbing-heating (persona Martin Da Silva) | The codebase architecture must separate the **core** (quote, invoice, client, money — trade-agnostic) from the **trade layer** (vocabulary, catalogue items) so a second trade can be added later without rewriting core logic. No trade-specific term may be hardcoded into a general-purpose function. |

**Package manager:** npm. **Language:** TypeScript from the start — there is no legacy JS to migrate incrementally, unlike a refactor project; every file is authored as `.ts`/`.tsx` from Step 1 onward.

**Non-negotiable architecture principles (Cahier §3 — verbatim, restated in English):**
1. **No API key in the browser.** Every call to Claude goes through an authenticated server function.
2. **Commercial calculations are deterministic.** VAT, totals, and margins are computed by tested code, never delegated to AI. The AI may propose lines; code computes the amounts.
3. **Every issued quote is an immutable version.** The PDF is generated from this frozen snapshot. Editing after issuance creates a new version.
4. **Strict per-owner isolation.** Row-Level Security enabled and tested on every exposed table.
5. **The prototype is the functional source of truth.** When a behavior is in doubt, `kov_V3_accueil_actions.html` is authoritative.

---

## 4. Phase 2 Scope Register — all 16 modules (authoritative, Cahier §6.1–6.16)

Every module below is **in scope**. Unlike a reduced-MVP register, there are no "No" rows here — the client explicitly decided the full prototype scope applies (Cahier §9). The table maps each module to its Cahier section and its primary KOV-FR requirement(s) for cross-reference.

| ID | Module | Cahier § | Primary KOV-FR | Included? |
|---|---|---|---|---|
| KOV-MOD-01 | Onboarding and business settings | 6.1 | FR-002 | **Yes** |
| KOV-MOD-02 | Home — smart action list | 6.2 | FR-019 | **Yes** |
| KOV-MOD-03 | Clients and client record | 6.3 | FR-005 | **Yes** |
| KOV-MOD-04 | Quotes and margin calculation | 6.4 | FR-006, FR-007, FR-008, FR-010, FR-011 | **Yes** |
| KOV-MOD-05 | Kōv Agent — understanding and execution | 6.5 | FR-014 | **Yes** |
| KOV-MOD-06 | Material ordering | 6.6 | FR-017 | **Yes** |
| KOV-MOD-07 | Invoicing | 6.7 | FR-013 (shared) | **Yes** |
| KOV-MOD-08 | Unpaid invoices and dunning (3-level escalation) | 6.8 | FR-013 | **Yes** |
| KOV-MOD-09 | Chantiers and real profitability | 6.9 | FR-012 | **Yes** |
| KOV-MOD-10 | Planning and conflict detection (team mode) | 6.10 | — (implicit in scope decision, §9) | **Yes** |
| KOV-MOD-11 | Main courante and Messages | 6.11 | FR-015 | **Yes** |
| KOV-MOD-12 | Chantier reports (with voice) | 6.12 | — (feeds FR-015) | **Yes** |
| KOV-MOD-13 | Accounting export | 6.13 | FR-018 | **Yes** |
| KOV-MOD-14 | Data migration/import | 6.14 | FR-020 | **Yes** |
| KOV-MOD-15 | Financing simulation | 6.15 | — (flagged for legal caution) | **Yes**, with a mandatory advisory-only disclosure |
| KOV-MOD-16 | Technical sheets and price library | 6.16 | FR-004 | **Yes** |

If the agent (or you) find yourself tempted to defer any of the above "for a later phase because it would simplify the build" — stop. That is exactly the proposal the client already rejected. Treat any such temptation as a scope-change conversation with the client first, never a unilateral decision.

---

## 5. Module detail — what "done" looks like per module

Each subsection restates the Cahier's behavior description as a discrete, testable acceptance checklist, faithful to the original French source and its numbers/wording.

### 5.1 (Module 6.1) Onboarding and business settings

**Role.** Configure the application on first launch, then allow settings to be edited afterward.

**Behavior:**
- On first open, a guided flow asks in sequence: the artisan's trade, team size (solo or with employees), then business information.
- The trade choice determines the pre-loaded price library and adapted vocabulary.
- Choosing "with employees" activates team coordination and multi-person planning features.
- Business settings include: legal company name (raison sociale), SIREN, contact details, default VAT rate, and the legal mentions to appear on quotes.

**Business rules:**
- **Exactly one onboarding flow must exist.** The prototype has two, with different storage keys — this is an explicit defect to fix (see §9 below), never to reproduce.
- Mandatory legal fields must be validated before any quote can be issued.
- Settings persist and are editable at any time from the Business (Entreprise) screen.

### 5.2 (Module 6.2) Home — smart action list

**Role.** From the moment the app opens, present the artisan with the concrete list of things to handle, rather than a passive dashboard.

**Behavior:**
- Home shows a list of concrete actions ("6 things to handle · 2 min"), each with an icon, a title, a contextual subtitle, and an action button.
- **Time-of-day adaptation.** Two distinct lists exist: a morning list and an evening list. The switch is automatic after 16:00 (real time); a demo toggle may force either list in non-production builds only.
- The evening list places the day's report first, opening straight into voice dictation.
- Each action routes to the corresponding screen or modal (dunning, quote, chantier, planning).

**Business rule (production, hard requirement):** every item in the list must derive from real persisted data (an actual quote awaiting response, an actually-overdue invoice) — never demo content. Every displayed count must reconcile with visible records. This directly implements KOV-FR-019.

### 5.3 (Module 6.3) Clients and client record

**Role.** Manage the client directory and centralize all information related to each client.

**Behavior — list:**
- Client list with real-time search by name or city.
- Each client shows an avatar (initials), name, role, and status tags.

**Behavior — detail record:**
- Contact details: name, address, phone, email, SIREN (editable).
- Indicators: cumulative revenue, number of chantiers, next maintenance follow-up reminder.
- Documents: Kōv-generated documents plus artisan-uploaded documents (file, photo, scan).
- Main courante: time-stamped journal of every exchange (see module 6.11).
- Internal notes: free-text notes with tagging and voice dictation.
- Work history: past quotes and chantiers.

**Business rules:**
- A saved client persists after restart and across devices.
- Archiving removes a client from default search without deleting linked quotes.
- Email and phone formats are validated when provided.

### 5.4 (Module 6.4) Quotes and margin calculation

**Role.** Create quotes with real-time margin calculation — the central commercial differentiator.

**Behavior — editor:**
- Four-step creation flow: **Client → Travaux (Work) → Devis (Quote) → Envoyer (Send)**.
- Lines added from the price library or free entry: designation, quantity, unit, unit price.
- **Per-line margin.** Every line has a "purchase price" field (what it costs the artisan). The line's margin is calculated and displayed.
- **Live global margin box.** On every edit, a box recalculates the quote's overall margin and changes color:
  - **green** above 30% margin
  - **steel-blue** above 20% (the brand accent, reused deliberately for the "good but watch it" tier — not the urgency orange)
  - **gold** above 10% (caution tier — see naming note below)
  - **red** if negative
  An advisory sentence accompanies the color. This margin-color-coding rule is a real product mechanism, not decoration — see `02_ThemeGuideline.md` §2.4 for the full color/threshold spec (the single source of truth for the exact hex/token per tier), and implement it identically wherever margin is shown (quote editor, chantier profitability screen).

  > **Naming note**: earlier drafts of this document (and some cross-references elsewhere in this doc set) called the third tier "amber," implying an orange-family hue. The authoritative color, fixed in `02_ThemeGuideline.md` §2.4, is **gold** (`#C8A96E` / `--gold-500`), not orange — this is a deliberate choice to keep the true-urgency-orange token reserved exclusively for time-sensitive/alarm contexts (dunning, overdue invoices, planning conflicts) elsewhere in the app. Always build against `02_ThemeGuideline.md` §2.4's token, never the word "amber" taken literally.
- **VAT selector:** 5.5%, 10%, 20%, 0%, with the corresponding legal mentions.

**Business rules:**
- Totals (quantity × unit price, VAT, subtotal, total, projected gross margin) are computed by deterministic code with explicit rounding rules.
- **Known prototype defect, do not reproduce:** the PDF generator queries a different DOM selector (`#l-list .l-row`) than the one the editor renders (`#li-wrap .li`), which can print sample/placeholder lines instead of real ones. **Fix:** the PDF must be generated from the persisted quote version, never from live DOM state.
- Every issued quote becomes an immutable version; any later edit creates a new version.
- Statuses: **Draft, Issued, Accepted, Declined, Expired/Cancelled.**

**VAT legal mentions table (France):**

| Case | Mention |
|---|---|
| Reverse charge (autoliquidation) | *Art. 283-2 nonies du CGI — TVA due par le preneur* |
| VAT exemption (franchise) | *TVA non applicable — art. 293 B du CGI* |
| Export | *Exonération — prestation hors champ territorial français* |

### 5.5 (Module 6.5) Kōv Agent — understanding and execution

**Role.** Let the artisan trigger chains of actions in natural language. This is Kōv's central differentiator.

**Language understanding:**
- The artisan types or dictates a sentence in job-site language. The system extracts the intent, the client concerned, and the chantier concerned.
- The engine recognizes roughly **fifteen intents**: report finished, payment received, dunning/reminder, unpaid invoices, planning conflict, delivery, order, day summary, week summary, margin, delay, employee absence, deposit (acompte), expense, new client, prospecting.
- Recognition combines three signals: whole-phrase patterns ("il me manque", "m'a viré", "vient d'arriver"), weighted trade vocabulary, and fault tolerance via Levenshtein distance.
- The system identifies the chantier (bathroom, heat pump, roof) and the client via approximate name matching.

**Uncertainty handling:**
- An intent is retained only if its score exceeds a threshold **AND** stands out clearly from the second-best hypothesis.
- When uncertain, the system does not guess: it shows what it understood ("tu parles du chantier Bernard") and proposes three candidate actions.
- If it understands nothing, it proposes the three most likely actions for the current moment (different in the morning vs. the evening).

**Execution and guardrails:**
- The system proposes a detailed, step-by-step action plan.
- Any message destined for a client is visible before sending. A "Read the message" button opens the full, editable text, with channel and recipient shown.
- Every send-step can be individually removed from the plan.
- A banner guarantees nothing is sent before the plan's explicit "YES" confirmation.
- On execution, every send to a client is automatically logged in that client's main courante.

**Business rule (production, hard requirement):** the model call goes through a server function. The model proposes lines or actions according to a strict schema; it never fixes an amount and never triggers a send by itself. Human validation remains mandatory for any action with an external effect. See `06_AIPromptRegistry.md` for the exact contract.

### 5.6 (Module 6.6) Material ordering

**Role.** Order a quote's supplies from the supplier, with stock and lead-time visibility.

**Behavior:**
- From a quote, ordering filters supply lines (excludes labor and flat-fee lines).
- **Per-reference stock.** Each reference shows its state — available, in transit, or out of stock — with depot and lead time.
- Purchase price is estimated and margin on supplies is displayed.
- **Dynamic delivery.** Job-site or agency delivery mode; proposed time slots adapt to the longest lead time among the referenced items.
- **Two-stage confirmation:** "Order transmitted — awaiting confirmation" first, then, after a delay, "Supplier has confirmed — order #...". This staged sequencing is intentionally honest — the app never speaks on the supplier's behalf.

**Example demo data (reference only, must never appear in production):**

| Reference | State | Depot | Lead time |
|---|---|---|---|
| Receveur douche Geberit 90×90 | Available | Rennes | 0 days |
| WC suspendu + bâti | Available | Rennes / Nantes | 0 / 2 days |
| Double vasque Duravit | In transit | — | 5 days |
| Robinetterie douche | Out of stock | — | — |

**Scope note.** The prototype simulates the supplier channel. Production will eventually need a real integration or a real order-sending channel; the interface behavior described above must be preserved regardless of what the backend integration turns out to be.

### 5.7 (Module 6.7) Invoicing

**Role.** Generate invoices from a quote and track them through to payment.

**Behavior:**
- From a quote, choose the invoice type: **deposit (acompte, 30%), progress (situation, 40%), balance (solde), or full amount (totalité)** — each type displayed in euros.
- Choose the payment term: on receipt, 15 days, or 30 days.
- Automatic mention of late-payment penalties and the €40 flat-rate recovery indemnity.
- The created invoice feeds the unpaid-invoices screen and the client's main courante.

### 5.8 (Module 6.8) Unpaid invoices and dunning (three-level escalation)

**Role.** Track overdue invoices and chase clients with progressive escalation. Major differentiator: unpaid invoices are pain point #1.

**Behavior:**
- A screen listing overdue invoices, with total outstanding amount and count of unpaid invoices.
- For each invoice: client, amount, days overdue, and dunning level reached.
- Three escalation levels, each with a pre-written message.
- Send channel choice: SMS, email, or registered mail with acknowledgment of receipt (lettre recommandée avec AR).
- Every dunning action is logged to the client's main courante.

**The three levels:**

| Level | Name | Trigger | Sample subject |
|---|---|---|---|
| 1 | Courteous reminder (Rappel courtois) | From 1 day overdue | *"Petit rappel — facture {ref}"* |
| 2 | Firm reminder (Relance ferme) | After 15 days | *"Facture {ref} — échue depuis {retard} jours"* |
| 3 | Formal notice (Mise en demeure) | After 30 days | *"MISE EN DEMEURE — facture {ref}"* |

The formal notice mentions the €40 flat-rate recovery indemnity (art. L441-10 du Code de commerce) and recommends sending by registered mail with acknowledgment of receipt for legal standing.

### 5.9 (Module 6.9) Chantiers and real profitability

**Role.** Track a chantier's progress and, above all, measure its real profitability. Unique market differentiator.

**Behavior — profitability:**
- The chantier screen shows a **"Ce que ce chantier te rapporte" ("What this chantier is earning you")** block, beneath progress tracking.
- **Three levels of reading:**
  1. A banner shows the real margin in large type, the quote-planned margin alongside it, and the gap in points; a progress bar carries a marker at the planned position. A key phrase: *"Il te reste X € une fois tout payé"* ("You have X€ left once everything's paid").
  2. Detail: billed to client, minus supplies, minus labor (hours logged × hourly rate), minus miscellaneous costs — with the gap shown against the plan.
  3. "What ate the margin" — a named list of overruns, each with its reason and its cost.
- **Change-order (avenant) generation.** A button turns the overruns into complementary quote lines, ready to adjust and send.

**Example demo data (reference only, must never appear in production):**

| Chantier | Planned margin | Real margin | Gap |
|---|---|---|---|
| Salle de bain Bernard | 37% | 29% | −8 points (hours exceeded) |
| Pompe à chaleur Rousseau | 32% | 41% | +9 points (barely started) |
| Toiture Les Pins | 14% | 6% | −8 points (unplanned rafters) |

**Business rule.** Real margin is calculated from persisted real costs (allocated orders, logged hours), never from demo values. The reference hourly rate is **€38/h**.

### 5.10 (Module 6.10) Planning and conflict detection (team mode)

**Role.** Visualize the week, distribute chantiers across employees, and detect conflicts.

**Behavior:**
- Week view with chantiers per day.
- **Conflict detection:** the same employee assigned to two simultaneous chantiers is flagged (alert badge on the Planning tab).
- Conflict-resolution modal: proposes reassignment or rescheduling, with notification to the affected client.

**Scope note.** This module depends on the "solo or team" decision (see §7 below) — the client's decision is **team mode**, so this module is fully in scope and is not optional. It only makes sense in the with-employees version, which is exactly Kōv's target.

### 5.11 (Module 6.11) Main courante and Messages

**Role.** Preserve a time-stamped trace of everything exchanged with each client. Strong legal argument in the event of a dispute.

**Behavior — main courante (inside the client record):**
- Vertical timeline, most recent first.
- Each entry carries: its type (SMS, email, registered mail, call, report, quote, invoice, note), its direction (inbound or outbound), its date and time.
- Tapping opens the full text of the exchange.
- **Automatic feed.** Every dunning message, invoice, report, and agent message logs itself automatically, with real timestamps.

**Behavior — Messages screen:**
- Cross-client view of the main courante: one thread per client, sorted by most recent exchange.
- Three filters: All, Received, Unanswered.
- An "awaiting" badge flags threads where the last message came from the artisan without a client reply.
- Tapping a thread opens the client's record.

**Product argument.** Ten-year retention, aligned with the decennial (ten-year) construction warranty. In the event of a dispute ("you never told me that"), the artisan retrieves the dated exchange. This directly answers competitors' weakness of deleting data after cancellation.

### 5.12 (Module 6.12) Chantier reports (with voice)

**Role.** Let the artisan report on their day, in writing or by voice, and inform the client.

**Behavior:**
- Report entry with voice dictation (browser speech recognition, with keyboard fallback).
- The report records what was done and the chantier's progress.
- A summary SMS is sent to the client, with prior confirmation.
- The report logs itself into the client's main courante.

### 5.13 (Module 6.13) Accounting export

**Role.** Prepare the quarter's records for the accountant and flag what's missing.

**Behavior:**
- Quarter banner: cash collected including tax, VAT collected, count of invoices issued and purchase records.
- **Four export formats:** direct Pennylane connection, direct Tiime connection, standardized FEC file, or PDF + Excel folder.
- Selection of items to include: sales invoices, purchase invoices, VAT summary by rate, uncollected receivables.
- **Missing-document alert.** The system flags absent supporting documents (illegible receipt, invoice never received) and warns that the corresponding VAT is not recoverable.
- Direct send to the accountant or download.

**Scope note.** The prototype simulates the generation. Production must produce a genuinely valid FEC file and, for Pennylane/Tiime, an effective integration.

### 5.14 (Module 6.14) Data migration/import

**Role.** Answer objection #1 in a sales meeting: "how do I handle my data from my old software?"

**Behavior:**
- Choice of origin software: Tolteck, Obat, Batigest, EBP, Excel/paper, Other.
- For each source, the real export procedure is shown.
- Selection of what is imported: clients, price library, quotes and invoices (as archived PDFs), chantiers in progress.
- **Chantiers in progress are unchecked by default**, to be entered manually — a deliberate transparency choice.
- Reassuring message: keep the old software for another year, never cut both over simultaneously.

**Commercial argument.** Honest migration (bring in what matters, don't promise the impossible) defuses fear of change and forms a barrier to exit. For early clients, this may be done manually and free of charge as an onboarding service.

### 5.15 (Module 6.15) Financing simulation

**Role.** Offer the client financing solutions for larger chantiers.

**Behavior:**
- Financing partners (éco-PTZ, Domofinance, Franfinance, Sofinco).
- Monthly-payment simulation based on amount, term, and rate.
- Sending a financing proposal to the client.

**Warning (carried forward from the SRS audit, correctly).** Hardcoded eligibility rules do not constitute reliable advice. In production, this module must either rely on real partner data or clearly display its purely indicative character. **Handle with legal caution** — see the known-defects list in §9.

### 5.16 (Module 6.16) Technical sheets and price library

**Role.** Give the artisan their tariffed catalogue of works and product sheets.

**Behavior:**
- Price library: list of works with label, unit, purchase price, sale price, default VAT.
- Pre-filled according to the trade chosen at onboarding.
- Technical product sheets, browsable and filterable.

**Scope note.** Externally licensed catalogues (supplier sheets) are not included — only the artisan's own library is in scope.

---

## 6. Formal functional requirements (KOV-FR-001 through KOV-FR-020)

These carry forward the KOV-FR numbering from the audit, extended to the full scope per the Cahier. Each is an obligation of result for development — not aspirational language.

| ID | Requirement | Priority | Acceptance criteria |
|---|---|---|---|
| **KOV-FR-001** | Owner authentication | Indispensable | Sign-up, sign-in, sign-out, password reset, secure session recovery, account deletion, for one owner account. Sign-in possible from a second browser with the same data recovered. Data access refused without authentication. |
| **KOV-FR-002** | Business settings | Indispensable | A single onboarding flow creating the business profile: identity, contact details, trade, currency, VAT, quote legal mentions. Exactly one flow presented. Legal fields validated before PDF generation. Settings persistent and editable across devices. |
| **KOV-FR-003** | Persistence and isolation | Support required | Storage in Supabase with Row-Level Security guaranteeing per-owner isolation. A session can never read or modify another owner's data. RLS enabled and tested on every exposed table. No secret in the browser bundle. |
| **KOV-FR-004** | Price library | Indispensable | Artisan-managed list: labels, unit, purchase price, sale price, default VAT, active status. Create, edit, deactivate, search. Quote lines retain the copied values if the tariff later changes. |
| **KOV-FR-005** | Clients | Indispensable | Create, view, edit, search, archive a client (identity and contact details). Client persists after restart and across devices. Archiving without deleting linked quotes. Formats validated. |
| **KOV-FR-006** | Quote lifecycle | Indispensable | Create, edit, duplicate, archive a quote linked to a client, with dated versions and statuses Draft, Issued, Accepted, Declined, Expired/Cancelled. Add/edit/reorder lines. Every issued PDF corresponds to an immutable version. An edit after issuance creates a new version. |
| **KOV-FR-007** | Deterministic totals and margin | Indispensable | Calculation of quantity × price, any discounts, VAT, subtotal, total, and projected gross margin, by code, with explicit rounding. Validated test fixtures for every VAT rate and rounding case. Displayed totals = persisted snapshot = PDF. The AI can never set a total. |
| **KOV-FR-008** | AI-assisted quote drafting | Indispensable | Transform a description into proposed lines and clarification questions, via a secure server call to Claude. No key on the browser side. Output conforms to a strict schema referencing valid articles or flagged "to clarify." The artisan reviews and applies explicitly. If the AI is down, the manual editor remains fully usable. |
| **KOV-FR-009** | Quote PDF | Indispensable | Generate a branded, versioned PDF from persisted data, and store it securely. Lines and totals in the PDF identical to the chosen version. Legal mentions present. Download restricted to the owner. |
| **KOV-FR-010** | Issuance and acceptance | Indispensable | Mark a version as issued, record acceptance or decline with date and note. Time-stamped and attributed changes. An "accepted" status always references an issued version. The finger-drawn acceptance is never presented as a legal electronic signature. |
| **KOV-FR-011** | Quote → chantier conversion | Indispensable | Create a chantier from an accepted quote, carrying over client, version, value, and summary, without duplication on a retry. Conversion unavailable until the quote is accepted. A second attempt returns the existing chantier. The source quote stays linked and read-only. |
| **KOV-FR-012** | Chantier tracking and profitability | Indispensable | Chantier status, dates, chronological notes, and a real-profitability block (planned vs. real, overruns, change order). Status editable, notes persisted and chronological. Real margin calculated on persisted costs. Change order generated from the gaps. |
| **KOV-FR-013** | Invoicing and unpaid invoices | Indispensable | Generate typed invoices from a quote, track them, and chase unpaid invoices through three escalation levels. Invoice feeding unpaid-invoices and the main courante. Pre-written reminders per level, with legal mentions. Every reminder traced. |
| **KOV-FR-014** | Execution agent | Indispensable | Understand a natural-language request, propose an action plan, show every message before sending, execute after validation. Intent and target correctly extracted or clarification requested. Every message visible and editable. Individual step removal possible. No send without validation. Traced in the main courante. |
| **KOV-FR-015** | Main courante and Messages | Indispensable | Time-stamped journal per client, automatically fed, plus a filterable cross-client view. Every reminder, invoice, report, and agent message logs itself automatically. Messages view sorted and filterable. Long-term retention. |
| **KOV-FR-016** | Material ordering | Indispensable | Order a quote's supplies with per-reference stock state and adaptive delivery slot. Supply-line filtering. Stock state shown. Slot adapted to the longest lead time. Two-stage confirmation. |
| **KOV-FR-017** | Accounting export | Desirable | Prepare the quarter's records in several formats and flag missing supporting documents. Exact quarter banner. FEC, Pennylane, Tiime, PDF+Excel formats. Alert on missing documents. |
| **KOV-FR-018** | Data migration | Desirable | Import clients, price library, and documents from the previous software, with per-source instructions. Source choice with procedure. Selective import. Caution message about keeping the old tool. |
| **KOV-FR-019** | Real-time home | Indispensable | Action list derived only from real data, adapted to time of day. Every count reconciled with records. Morning/evening switch. No fictional activity. |
| **KOV-FR-020** | Operations and privacy | Support required | Modular structure, environment separation, redacted logs, monitoring, rate limits, backups, export/deletion, secure document storage. No secret at rest or in the browser. Documented restore test. Export containing approved records and files. |

**Note on requirement count:** the Cahier's own body text enumerates KOV-FR-001 through KOV-FR-014 with clear numbering, then continues with four further numbered requirement blocks (main courante/messages, material ordering, accounting export, data migration) before its final two (real-time home, operations/privacy) — the table above assigns them KOV-FR-015 through KOV-FR-020 in reading order to keep the numbering unambiguous and complete at twenty. All twenty are binding; none may be dropped.

---

## 7. Non-functional requirements (build these in from Step 1, not bolted on later)

| Domain | Requirement |
|---|---|
| Security / Confidentiality | TLS everywhere, secrets server-side only, input validation, authenticated file access, RLS denial paths tested. |
| Commercial accuracy | No Claude key or service identifier ever reaches the browser. |
| Reliability | Data inventory maintained, redacted logs, export and deletion available, documented retention policy. |
| Performance | Arithmetic and PDF generation share the same versioned calculation contract; VAT and rounding test fixtures maintained; legal mentions validated with the client. |
| Maintainability | Transactional operations for versioning/conversion; idempotent AI application, PDF generation, and conversion; backups with a documented and tested restore procedure; a manual path available whenever AI is down. |
| Responsive | Paginated client and quote lists; reactive CRUD while AI or PDF generation is working, with a progress indicator. |
| Accessibility | Modules organized by feature, typed contracts, database migrations, lint/format, automated tests for RLS/quote/PDF/conversion. |
| Browsers | Works at 360px width and on desktop, mobile identity preserved without a permanent narrow-band layout. |
| — | Semantic labels, visible focus, full keyboard operation, sufficient contrast, non-voice input available for every flow. |
| — | Current Chrome, Edge, Firefox, Safari; dictation degrades gracefully where unsupported. |

---

## 8. Product decisions taken (Cahier §9 — "Décisions produit tranchées")

These are the client's explicit, final resolutions of every point the SRS had left open. They are not negotiable defaults — they are decisions.

| Decision | Position taken |
|---|---|
| **Scope: solo or team** | **Complete.** The entirety of the prototype's modules is in scope — every one of these modules has already been validated with real artisans. |
| **Team configuration** | **With team.** The target is the artisan with 1 to 3 employees; planning and coordination are in scope (this makes module 6.10 mandatory, not optional). |
| **Signature** | Manual acceptance is the baseline. A legally valid electronic signature is requested because it has become a competitive standard; the finger-drawn canvas mark will never be presented as one without a dedicated e-signature service. |
| **Quote sending** | A direct send channel (email at minimum) is expected. Generating a PDF that the artisan then sends themselves is not commercially sufficient. |
| **Launch trade** | Plumbing-heating (persona Martin Da Silva), with an architecture separating the core from the trade layer, for later extension. |
| **Geography / VAT** | France, rates 5.5 / 10 / 20%, French legal mentions. |

**Architecture principle to respect (verbatim intent).** Even while developing plumbing-heating first, the code must separate the **core** (quote, invoice, client, money) from the **trade layer** (vocabulary, catalogue items). No trade-specific term may be hardcoded into a general-purpose function. This opens extension to other trades without a rewrite.

---

## 9. Known defects to correct — do not reproduce these bugs

The audit identified real defects in the prototype. They must be **corrected during the rebuild, not reproduced**. Every relevant Master Prompt step in `03_MasterPrompts.md` calls out the applicable defect(s) at the exact point they become relevant during the build; this table is the master list.

| Defect | Expected correction |
|---|---|
| **PDF generated from the wrong selector** | The generator queries `#l-list .l-row` while the editor renders `#li-wrap .li`, which can print sample/placeholder lines instead of the real quote content. **Correction:** generate the PDF from the persisted version of the quote — never from live DOM state, never via `window.print()` on a rendered page. |
| **Duplicate onboarding** | Two onboarding flows coexist, with distinct storage keys. **Correction:** unify into a single state machine — one flow, one persisted progress record, no parallel path. |
| **Signature not legally probative** | The canvas finger-drawing has no signer identity, no opposable timestamp, and no audit trail. **Correction:** never sell it as a legal signature; label the canvas-acceptance UI "Acceptation du devis" ("Quote acceptance"), not "Signature," and build a real e-signature integration as a separate, clearly-labeled capability per the client's decision in §8 above. |
| **Hardcoded financing advice** | The eligibility percentages are hardcoded and do not constitute reliable advice. **Correction:** separate this module clearly, rely on real partner data where possible, and otherwise display its purely indicative character explicitly and prominently — this is a legal-caution item, not a cosmetic one. |
| **Embedded demo data** | Sample clients, addresses, and messages are baked into the prototype. **Correction:** remove all demo/placeholder PII from anything that reaches a production build; seed data for development/testing must be clearly synthetic and never resemble real persons. |
| **Simulated actions** | Some confirmations are timers, not real actions (e.g. a "supplier confirmed" state that is really just a `setTimeout`). **Correction:** in production, every confirmation must reflect real state — a two-stage order confirmation (module 6.6) is fine as a UX pattern, but the second stage must only fire on a real signal, never a fixed delay standing in for one. |
| **Insecure/incomplete AI call** | The prototype's quote-assist code attempts to call Anthropic directly from the browser, without a protected credential — a real security defect in the prototype (SRS §6), not just a missing feature. **Correction:** this is why every AI call in Phase 2 is architecturally required to be server-owned (§2.1 above, KOV-FR-008/014) — treat this row as the specific defect that rule exists to fix. When building Steps 9 and 12 (`03_MasterPrompts.md`), explicitly confirm no code path ever constructs an Anthropic client or references an Anthropic API key anywhere in `src/` (frontend code) — the key must exist only inside Supabase Edge Function environment variables. |

---

## 10. Recommended development sequence (Cahier §11)

The scope is complete, but construction can be staged. Each stage delivers independently verifiable value. `03_MasterPrompts.md`'s step numbering is built directly on this sequence (with additional sub-steps for scaffolding, theme, and hardening that the Cahier's high-level table doesn't itemize).

| Stage | Content | Exit condition |
|---|---|---|
| 1. Foundations | React/TS/Vite, Vercel/Supabase, schema, Auth, RLS | Per-owner isolation tested |
| 2. Data | Business settings, price library, clients | Cross-device persistence |
| 3. Quotes | Lines, versions, statuses, deterministic calculations, margin | Validated calculation test fixtures |
| 4. AI-assisted quotes | Server call to Claude, schema, review, manual fallback | AI failure never blocks entry |
| 5. PDF / issuance | Versioned PDF, issuance, manual acceptance | PDF identical to the chosen version |
| 6. Chantier | Idempotent conversion, status, notes, real profitability | Complete quote→chantier path |
| 7. Invoicing | Invoices, unpaid tracking, three-level dunning | Reminders traced in the main courante |
| 8. Agent | Understanding, plan, visible messages, execution | No send without validation |
| 9. Periphery | Ordering, accounting, migration, planning, financing | Modules validated one by one |
| 10. Acceptance (recette) | Responsive, accessibility, security, monitoring, backups | Full acceptance testing in pre-production |

**Do not reorder these stages.** Building the Kōv Agent (stage 8) before the deterministic calculation engine and RLS (stages 1–3) exist means the agent would have nothing safe to act on. Building chantier profitability (stage 6) before real cost persistence (stage 2's data layer, extended through stage 5) means there is nothing real to compare against the plan.

---

## 11. Explicitly out of scope (even under the full-scope decision)

A small number of items remain genuinely out of scope, either because the Cahier itself scopes them narrowly or because they require a decision or licensing arrangement not yet made:

- Externally licensed supplier catalogues/product sheets (module 6.16 note) — only the artisan's own price library is in scope.
- A second trade's vocabulary/catalogue at launch — the architecture must support it, but only plumbing-heating content ships at launch (§8).
- A real, integrated supplier ordering channel (module 6.6) at launch — the two-stage confirmation UX is in scope; the actual backend integration with a real supplier system is a later, separately-scoped integration project. The interface behavior must be built exactly as specified so the integration can be swapped in without a UI rewrite.
- A real, integrated Pennylane/Tiime connection and a fully certified FEC export (module 6.13) — the UI, format selection, and missing-document detection are in scope now; full third-party certification of the FEC output and live Pennylane/Tiime API integration should be scoped and tested carefully before being represented as production-certified to a real accountant.
- Multi-jurisdiction/multi-currency support — France only, EUR only, 5.5/10/20/0% VAT only.
- Native mobile apps — this is a responsive mobile-first web application, not a native iOS/Android build.

If the agent finds itself wanting to build any of the above "because it's close by" — stop, and treat it as a scope-change conversation with the client first, exactly as with any other addition beyond this document.
