# Kōv — Component Architecture & Coding Standards

> **Purpose**: this is the single reference for *how code is organized and reused* in Kōv — folder structure, component reuse rules, naming conventions, and coding standards — separate from `02_ThemeGuideline.md` (which defines *what things look like*) and `05_DataModel.md` (which defines *what's stored*). Reference this file whenever a Master Prompt in `03_MasterPrompts.md` touches file organization, component creation, or code structure, and whenever you're unsure "where should this new file go?" or "should I build a new component or reuse an existing one?"

---

## 1. Core principle: build once, compose everywhere

Kōv has 23 screens and 11 modals. Building each one's buttons, cards, inputs, and states from scratch would produce a visually inconsistent app and a maintenance nightmare. The rule, stated once here and enforced by the standing rule in `03_MasterPrompts.md`'s preamble:

**Step 2 builds the complete themed component library once. Every later step composes screens from that library. No screen ever hand-rolls a new inline-styled button, card, input, or badge when an existing component already covers that need.** A new component is only justified when the library genuinely doesn't have anything for that use case yet — and when that happens, the new component is still built using the theme tokens from `02_ThemeGuideline.md`, never a one-off hardcoded style.

Same principle applies to layout chrome: the navigation (`BottomTabNav`/`SideNavRail`), page wrappers, section containers, and loading/empty/error states are built once (Steps 2-3) and reused everywhere — never recreated per screen.

---

## 2. Folder structure (canonical, matches Step 4 of `03_MasterPrompts.md`)

```
kov/
  docs/                          # this documentation set — never modified by the coding agent without explicit instruction
  kov_V3_accueil_actions (1).html  # reference prototype — study only, never shipped, never copy-pasted from directly
  src/
    features/                    # one folder per business domain — screens, their local components, local hooks
      auth/
      onboarding/
      home/
      planning/
      quotes/
      clients/
      projects/                  # "projects" = chantiers in code; includes chantier reports (ReportModal, etc.)
      agent/
      invoicing/
      unpaid/
      orders/
      messages/
      accounting/
      migration/
      financing/
      technical-sheets/
      price-library/
      satisfaction/
      settings/
    components/
      ui/                        # the SHARED component library — Button, Card, Input, Badge, MarginBox,
                                  # BottomTabNav, SideNavRail, AgentSurface, JournalTimeline, Skeleton,
                                  # OfflineBanner, InlineError, EmptyState, SendGuardBanner — built in Steps 2-3
    lib/
      calc/                      # pure, framework-independent calculation modules (quoteTotals.ts, marginTier.ts,
                                  # projectProfitability.ts, dunningLevel.ts, financingSimulation.ts) — see §4 below
      agent/                     # agent-support pure functions (e.g. fuzzyMatchName.ts)
      supabase.ts                # Supabase client
      apiClient.ts                # request wrapper: timeout, retry-once-on-READ-only, used by every network call
      utils.ts
    hooks/
      useOnlineStatus.ts
      useAuth.ts
      useDictation.ts
    styles/
      theme.css                  # every CSS custom property from 02_ThemeGuideline.md — single source of truth
      globals.css
    types/                       # shared TypeScript types/interfaces
    dev/
      ComponentPreview.tsx        # dev-only component gallery route, built in Step 2, never wired into production nav
  supabase/
    functions/                    # Edge Functions, one folder per function (quote-draft-assist, agent-intent-extract,
                                  # agent-plan-generate, quote-issue, quote-to-project, quote-recalculate,
                                  # delete-account, etc.) — source lives here before deploy
    migrations/                   # one file per logical table group, per 05_DataModel.md §5's numbering
  tests/
    visual/                       # Playwright visual-regression suite, built in Step 14.2.5
```

**Rule for where a new file goes**: if it's a screen or a piece of UI specific to one business domain, it goes in that domain's `src/features/<domain>/` folder (create a `components/` subfolder inside it for screen-local pieces, e.g. `src/features/projects/components/ReportModal.tsx`). If it's used by two or more domains, or it's a foundational primitive (button, card, skeleton), it belongs in `src/components/ui/`. If it's pure business logic with no UI, it belongs in `src/lib/`. Never place a domain-specific component directly in `src/components/ui/`, and never duplicate a shared component inside a feature folder because it was "easier than importing."

---

## 3. Naming conventions

- **Components**: `PascalCase.tsx` — `MarginBox.tsx`, `ReportModal.tsx`, `SendGuardBanner.tsx`.
- **Hooks**: `camelCase.ts`, always prefixed `use` — `useDictation.ts`, `useOnlineStatus.ts`.
- **Pure calculation modules**: `camelCase.ts`, verb-free, noun-based — `quoteTotals.ts`, `marginTier.ts` (not `calculateQuoteTotals.ts` — the function inside can be named that; the file describes its subject).
- **Edge Functions**: `kebab-case`, matching their `06_AIPromptRegistry.md` §2/§3 slug exactly — `quote-draft-assist`, `agent-intent-extract`.
- **Routes**: `kebab-case` paths matching `04_ApplicationFlow.md`'s screen IDs conceptually (not literally — e.g. `s-devis` → `/quotes`), consistent with the route list built in Step 4.2.
- **Database tables/columns**: `snake_case`, exactly as specified in `05_DataModel.md` — never rename a table or column from what that document specifies without updating the document first.
- **Tailwind semantic tokens**: `camelCase` matching `02_ThemeGuideline.md` §11 exactly — `marginGreen`, `marginSteelBlue`, `marginGold`, `marginRed` (never `marginAmber`/`marginOrange` — see that section's naming note).

---

## 4. The `src/lib/calc/` pattern — pure, dual-use, tested modules

This is Kōv's most important architectural pattern, first established in Step 8 and repeated for every deterministic calculation in the app (margin, profitability, dunning levels, financing simulation):

1. **Zero framework dependency.** No React, no Supabase client, no browser-only or Node-only API. A calculation module must be callable identically from a React component (for live UI feedback) and from a Deno-based Supabase Edge Function (for the authoritative, persisted calculation) — this dual-use requirement is architectural, not optional, because Kōv's core promise is that displayed totals, persisted totals, and PDF totals are always exactly the same number, computed by the same code path.
2. **Unit-tested in isolation**, with vitest fixtures covering real boundary cases (VAT rates, rounding edges, tier thresholds) — never tested only indirectly through a UI interaction.
3. **Never delegate the actual arithmetic to AI.** Every `src/lib/calc/` module exists specifically so a commercial figure is never computed by a Claude call — see `06_AIPromptRegistry.md` §3 for the full list of what's deterministic vs. AI-assisted, and never blur that line.

When building a new calculation anywhere in the app, follow this exact pattern rather than inventing a new one — check `05_DataModel.md` §3.1-3.5 (via `06_AIPromptRegistry.md`'s references) for whether a similar calculation already has a documented contract before writing a new one from scratch.

---

## 5. State-handling pattern (see `03_MasterPrompts.md`'s standing rule for the full requirement)

Every screen/modal composes its states from the Step 3 primitives — `Skeleton`, `EmptyState`, `InlineError`, `OfflineBanner`, `SendGuardBanner` — rather than reimplementing loading/empty/error/offline handling per screen. If a screen's data-fetching pattern doesn't fit an existing primitive, extend the primitive (add a prop/variant) rather than building a parallel one-off implementation.

The `apiClient.ts` wrapper (Step 3.2) is the single place request timeout and retry-on-read logic lives — every Supabase/Edge Function call in every feature goes through it. Never call `supabase.from(...)` or `fetch()` directly inside a feature component; always go through the shared client wrapper, so a future change to timeout/retry behavior only has to happen in one place.

---

## 6. Code quality standards

- **TypeScript strict mode** from the start (Step 0.5) — no `any` without a specific, documented reason in a comment.
- **ESLint + Prettier** configured in Step 0.5, run as part of every step's own verification, not just a pre-release pass.
- **No dead code left "just in case."** A stubbed feature (e.g. Step 8.3's disabled "Émettre" button, pending Step 9) must be clearly marked as an intentional, temporary stub referencing the step that completes it — never silently abandoned code with no explanation.
- **Comments explain *why*, not *what*.** The code should be readable enough that a comment restating "this fetches the quote" is unnecessary; a comment is warranted when a non-obvious business rule is being encoded (e.g. "banker's rounding here, not standard rounding — see KOV-FR-007").
- **No secrets in source, ever.** Every step that touches an Edge Function or environment variable re-confirms this per the security checks already built into Steps 5.5, 14.6, and 15.3.

---

## 7. Testing standards (see `03_MasterPrompts.md`'s "Testing → Bugs Found → Fix → Re-test" standing rule for the process)

- **Pure calculation modules** (`src/lib/calc/`): vitest unit tests, one file per module, covering hand-verified fixtures — this is the highest-priority test coverage in the project since it protects real money calculations.
- **RLS policies**: a two-account cross-access test against every table, re-run at Steps 5, 7, 8, 9, 10, 11, 12, 13 as new tables come online, and once more comprehensively at Step 14.6.
- **Critical flows** (agent plan confirm/execute, quote issuance/versioning, dunning escalation): explicit scripted test scenarios described in each step's Master Prompt — not left to "click around and see."
- **Visual regression**: Playwright suite from Step 14.2.5, covering the highest-risk components (MarginBox at all four tiers, AgentSurface, chantier profitability) across breakpoints and both themes.
- **Accessibility**: axe DevTools per-route from Step 14.2 onward, Lighthouse audits at Step 14.5 and again in the final F.3 prompt.

---

## 8. When a step's Master Prompt doesn't specify a component or file path

This happens occasionally in `03_MasterPrompts.md` for smaller sub-steps. When it does: check this document's §2 folder structure and §3 naming conventions first, then check whether an existing `src/components/ui/` component already covers the need (§1's core principle). Never guess a new pattern when this document already answers the question — and if it genuinely doesn't, flag it to the human operator rather than inventing a structural convention that the rest of the codebase doesn't follow.
