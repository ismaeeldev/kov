# Kōv Phase 2 — AI Coding Agent Documentation Set

This `docs/` folder (`D:\WEB DEV\Wapis\kov\docs\`) is the complete reference package for building **Kōv** (French field-management app for artisans du bâtiment with employees — quote, chantier, invoicing, collections, planning, AI agent) from a static reference prototype into the approved Phase 2 product, using an AI coding agent (Claude Code / Cursor / similar) as your builder, guided step-by-step by you (non-technical founder/developer).

## Why these documents exist

You are not writing code yourself. You are the **project conductor**: you paste "Master Prompts" from `03_MasterPrompts.md` into your AI coding agent, one step at a time, in order, and you run the "Testing" instructions after each step before moving to the next. The other documents (`01`, `02`) are **reference material** — you rarely paste them whole; instead, each Master Prompt tells the agent exactly which reference doc/section to read for details, so the agent stays grounded in the real, approved scope instead of guessing or inventing features.

## CRITICAL — which source document governs (read this before anything else)

Two documents describe Kōv, and they disagree on scope:

1. **`Kov_SRS_Phase_2.pdf`** (`KOV-SRS-P2-001`) — the developer's initial technical audit of the HTML prototype. It proposed a **reduced MVP**: quote → chantier core loop only, explicitly excluding planning/team mode, invoicing, dunning, messaging, suppliers, signature, and financing.
2. **`Refrence\Kov_Cahier_des_charges (7).pdf`** (`KOV-CDC-F-001`) — the **client's formal response** after reviewing that proposal. Its section 9 ("Décisions produit tranchées") explicitly **rejects** the reduced-MVP proposal:

   > *"Périmètre — Solo ou équipe : **Complet. L'intégralité des modules du prototype est au périmètre**, ces modules ayant été validés auprès d'artisans... Avec équipe. La cible est l'artisan de 1 à 3 salariés ; le planning et la coordination sont au périmètre."*

   It also confirms: electronic signature is wanted (canvas-only "acceptance" is not to be sold as a legal signature, but a real e-signature capability is requested as a competitive standard), direct quote sending by email (at minimum) is expected commercially — a downloadable PDF alone is not enough, the launch trade is plumbing/heating (persona Martin Da Silva) with an architecture that separates the core (quote/invoice/client/money) from the trade vocabulary layer, and geography is France with 5.5/10/20% VAT.

**Therefore: `Kov_Cahier_des_charges` is the authoritative, final scope for every document in this set. `Kov_SRS_Phase_2` is NOT the scope** — it is retained and cited only for three things that remain true and useful:
- **(a) the known defects to fix** — PDF-selector mismatch, duplicate onboarding, non-probative signature, hardcoded financing percentages, embedded demo PII, timer-simulated actions (Cahier §10, cross-referenced against SRS's own defect list) — these must be corrected during the rebuild, never reproduced;
- **(b) the confirmed technology stack** — both documents independently agree: React + TypeScript + Vite frontend, Vercel hosting, Supabase (Auth, Postgres + RLS, Storage, Edge Functions), Claude called only from a secure server-side function, never a client-side API key;
- **(c) the non-negotiable architecture principles** (Cahier §3) — no API key in the browser, deterministic server-side commercial calculations (VAT, totals, margin) never delegated to AI, every issued quote is an immutable version, strict Row-Level-Security ownership isolation on every exposed table, and the HTML prototype `kov_V3_accueil_actions.html` is the functional source of truth for any behavior not fully detailed in writing.

Every Master Prompt in `03_MasterPrompts.md` and every requirement in `01_ScopeDocument.md` is built on the **Cahier's full scope**, not the SRS's reduced one.

## There is no existing Kōv codebase — this is a greenfield build

Unlike some sibling projects in this documentation series, there is **no working `src/` application to refactor**. The only asset in `D:\WEB DEV\Wapis\kov\` besides these source documents is `kov_V3_accueil_actions (1).html` — a single ~450KB, 6,503-line static HTML/CSS/inline-JS file (23 screens, 11 modals, ~180 functions, all data in-memory and lost on reload). This prototype is **not a buildable app skeleton** and is **never shipped as-is**. It is:
- The definitive **visual identity and interaction-pattern reference** (colors, type, component shapes, screen flows, copy tone) — study it, don't paste it.
- The **functional source of truth** for any behavior the Cahier des charges describes only in prose (Cahier §3: "le prototype est la source de vérité fonctionnelle").
- A source of **known defects that must not be reproduced** (see `01_ScopeDocument.md` §9 and every relevant step in `03_MasterPrompts.md`).

Because of this, **Step 1 onward in `03_MasterPrompts.md` is greenfield scaffolding** — the agent studies the HTML prototype for reference, then builds a fresh, modular React + TypeScript + Vite application. This is a materially different starting instruction than a "refactor this existing `App.jsx`" prompt would be; every Master Prompt in this set is written accordingly.

## Reading order (for you, once, before starting)

1. **`01_ScopeDocument.md`** — What Kōv is, the full 16-module scope (Cahier §6.1–6.16), all 20 formal KOV-FR requirements, the non-functional requirements, the product decisions, the known defects to avoid, and the recommended build sequence. This is the legal/contractual boundary of the project — the agent must never build beyond or short of it without your explicit go-ahead.
2. **`02_ThemeGuideline.md`** — The complete visual design system: colors (extracted verbatim from the client's HTML), type, spacing, components (including the margin-color-coding box and the AI-agent purple-gradient surface, both real product mechanisms, not decoration), and motion.
3. **`04_ApplicationFlow.md`** — Every one of the 23 screens and 11 modals, every navigation path, every state (loading/empty/error/success), from onboarding to daily use. Read this before Step 1 so you know what "done" looks like end-to-end.
4. **`08_ComponentArchitecture.md`** — Folder structure, component-reuse rules, naming conventions, and coding standards. Read this once before Step 2, then treat it as the standing answer to "where does this file go?" and "should I build a new component or reuse one?" for the rest of the build.
5. **`03_MasterPrompts.md`** — **This is the one you actually execute.** Step 0 → Step 15, plus a final "STEP FINAL — Verification & QA Prompts" section, in order. Each step has numbered sub-sections (e.g. 1.1, 1.2), each with a Purpose, a Task Type (Agent/Manual/both), a Master Prompt block (copy-paste to your agent) or Manual Instructions, a Testing → Bugs Found → Fix → Re-test loop, and References (which other doc/section to point the agent at if it needs more detail). Do not stop early — Steps 14 (responsive/accessibility/security/motion polish) and 15 (production operations, monitoring, release) are not optional cleanup, they are where the app actually becomes safe to hand to a real client.
6. **`05_DataModel.md`** — Full Supabase/Postgres schema reference (tables, columns, RLS policies, the historical-copy rule for quote lines) — the agent's single source of truth for the database, referenced constantly from Step 5 onward.
7. **`06_AIPromptRegistry.md`** — Every server-owned Claude prompt used in the app (AI-assisted quote drafting, the Kōv Agent's natural-language intent extraction) with their exact contract (input, output schema, guardrails). Referenced from Step 9 onward.
8. **`07_ProjectState.md`** — The living "where are we right now" document. Not something you read once — you and your agent update it after every step, and you (or a brand-new agent/session) read it first any time you're picking the project back up after a break or a model/tool switch.

## Folder contents

| File | Purpose |
|---|---|
| `00_README.md` | This file — how to use the doc set, and the scope-resolution note above |
| `01_ScopeDocument.md` | Contractual scope (full, per the Cahier), all 20 KOV-FR requirements, NFRs, architecture, defects-to-avoid, decisions taken |
| `02_ThemeGuideline.md` | Full visual design system, extracted from the client's own HTML |
| `03_MasterPrompts.md` | **The step-by-step build guide you execute** |
| `04_ApplicationFlow.md` | Every screen + modal + flow + state, mapped end-to-end |
| `05_DataModel.md` | Supabase schema reference |
| `06_AIPromptRegistry.md` | Claude prompt contracts reference |
| `07_ProjectState.md` | **Living document** — current progress, decisions made, blockers, what's next. Update every step; read first after any session/agent/model switch. |
| `08_ComponentArchitecture.md` | Folder structure, component-reuse rules, naming conventions, coding/testing standards |

## Non-negotiable ground rules for every step

1. **The Cahier des charges governs scope, not the SRS.** If any instruction anywhere seems to suggest a reduced/MVP scope (excluding planning, invoicing, dunning, messaging, suppliers, signature, or financing), that instruction is wrong and should be corrected against `01_ScopeDocument.md` before proceeding.
2. **Sequence matters.** Do not skip a step or jump ahead. Step 5 (Supabase schema + RLS) cannot succeed if Steps 1–4 (scaffolding, theme, components, routing shell) are wrong; Step 12 (Kōv Agent) cannot be safe without Step 5's RLS and Step 8's deterministic calculation engine already in place. This is called out again inside `03_MasterPrompts.md`.
3. **Greenfield, not refactor.** There is no existing `src/` to preserve. The HTML prototype is reference-only — study its logic and visual language, then build fresh modular React/TypeScript. Never copy-paste raw HTML/inline-JS from the prototype into the new codebase.
4. **Testing is a loop, not a checkbox: Testing → Bugs/Gaps Found → Fix → Re-test → next step.** Do not proceed to the next numbered step until the current step's Testing checklist passes AND you've explicitly asked for (and fixed) both bugs (things that don't work as specified) and gaps (things the spec required that got skipped or stubbed without a documented reason). See the standing rule at the top of `03_MasterPrompts.md` for the exact prompt to use for this.
5. **Never let the agent invent secrets/keys.** Step 0 covers account setup; you create accounts and paste real keys into `.env.local` yourself — never ask the agent to "just make up" an API key or bypass auth for convenience.
6. **Do not reproduce the known defects.** Every defect listed in `01_ScopeDocument.md` §9 (PDF-selector mismatch, duplicate onboarding, non-probative signature sold as legal, hardcoded financing eligibility percentages, embedded demo PII, timer-simulated "sent" confirmations, insecure client-side AI calls) has an explicit call-out at the exact step in `03_MasterPrompts.md` where it becomes relevant — read that call-out when you reach it, not just once at the start.
7. **AI never sets a final commercial figure.** No Claude call — quote-line drafting or the Kōv Agent — may ever emit a final total, a margin figure, or send anything to a client without an explicit human confirmation step. This is architectural, not a style preference (Cahier §3, §6.4, §6.5).
8. **Reuse components and follow the folder structure, always.** Every screen composes from the Step 2 component library; every new file has a defined home. See `08_ComponentArchitecture.md` — this is what keeps 23 screens feeling like one coherent product instead of twenty-three different ones.
9. **Update `07_ProjectState.md` after every step.** This is what makes it possible to switch AI agents, models, or sessions mid-project without losing context or re-deciding things that were already decided.
