# Kōv — Master Prompt: Premium UI Redesign Pass (Step 16)

> **Purpose**: Steps 1-15 built and hardened every real feature (see `07_ProjectState.md`); this pass makes every screen and shared component actually LOOK like the "field-ready premium" bar `02_ThemeGuideline.md` describes — Linear/Vercel/Stripe crossed with rugged field-tool utility — not just be spec-compliant on paper. A live UI survey (2026-09-26, screenshots in `.scratch-a11y/ui-survey/`) confirmed the app is functionally solid but visually thin in many places: flat monochrome cards with no hierarchy, a broken skeleton-loses-nav bug, a desktop-unaware Agent screen, inconsistent focus/hover states, and several screens that read as a generic SaaS template rather than a distinctive Kōv surface.
>
> **This is a redesign of PRESENTATION, not behavior.** Every data flow, every mutation, every error path already audited and fixed in the 2026-09-26 production-readiness pass (`.scratch-a11y/audit-findings.md`, 21 findings, all fixed and live-verified) must keep working exactly as it does today. If a visual change would require changing what a button does, what data loads, or what route something navigates to, STOP and flag it — do not silently change behavior while "just doing UI."

> **The standing rule for this entire pass, non-negotiable**: work through the sub-steps below ONE AT A TIME, in order. For each sub-step: (1) implement the redesign for that scope only, (2) run the full verification gate in §16.X's own Testing block, (3) do NOT move to the next sub-step until every item in that gate passes — static checks clean AND a real Playwright screenshot pass against the live dev server confirming the visual change actually rendered as intended with zero console errors. Report back per sub-step before continuing. Never batch multiple sub-steps' changes together before verifying — if something breaks, you need to know which sub-step broke it.

---

## 16.0 Ground rules (apply to every sub-step below)

Read `02_ThemeGuideline.md` in full (all 11 sections) before touching any code — every color, shadow, spacing, and motion token used below must come from that document's locked tokens, never an invented new color/shadow/radius. Read `.scratch-a11y/ui-survey/*.png` (the BEFORE screenshots) and `.scratch-a11y/audit-findings.md` first, so you're improving forward from a known baseline, not guessing.

**Never touch the sibling `Clare` project directory or its running process under any circumstances.**

For every sub-step:
- **Никогда fabricate data** to fill a visually sparse screen (KOV-FR-019 is still in force) — a genuinely empty state should look calm and deliberate, not be padded with fake numbers. Visual weight comes from typography, spacing, and real computed data (stat tiles, real counts) — never placeholder content.
- **Never regress an already-fixed behavior.** Before editing a file, note what it currently does (read the code, don't assume). After editing, re-run that file's existing behavior mentally against the 21 findings in `.scratch-a11y/audit-findings.md` — if any of your changes could plausibly reintroduce one of those, re-verify it explicitly.
- **Every interactive element gets all 5 states, explicitly, not by accident**: default, hover, focus-visible (the app's standard `ring-2 ring-brand-500/45 ring-offset-2`, never a browser default outline), active/pressed, disabled. A component redesign that only renders correctly in its default state is not done.
- **Every list/data screen gets a skeleton shaped like its OWN real content** (not a generic set of gray bars) — see §16.1 for the shared mechanism, then apply it per-screen.
- **Test at 375px (mobile, primary target) AND 1440px (desktop) for every single change** — this app is one-thumb/job-site-first per its own design philosophy, but the current desktop experience is the weaker of the two per the UI survey and needs equal care this pass.
- **Full static gate before any sub-step is considered done**: `npx tsc --noEmit`, `npm run build`, `npm run lint` (must stay at 0 errors — 5 pre-existing warnings are the known baseline, do not introduce new ones), `npm test -- --run` (must stay 115/115 passing, or increase if you add new tests — never decrease).
- **Full live gate before any sub-step is considered done**: seed real test data via direct Supabase REST calls (service_role key, following the exact pattern already used throughout this project's prior verification passes — see `07_ProjectState.md`'s Step 14 entries for the established seed/cleanup convention), drive the actual dev server with Playwright, screenshot the real result at both breakpoints, confirm zero console errors, then delete all seeded data and the auth user afterward. A sub-step is not "done" on code review alone — you must see the real pixels.

---

## 16.1 Sub-step — Shared component & design-token layer (do this FIRST, everything else depends on it)

### Purpose
Fix the systemic bugs found in the UI survey before touching individual screens, and give every subsequent sub-step better primitives to build with — redesigning 25 screens on top of a broken `Input` component or a chrome-losing `ProtectedRoute` would mean redoing work later.

### Master Prompt
```
Read docs/02_ThemeGuideline.md in full. Read the UI survey findings: a screenshot-based
audit (2026-09-26) found these specific, confirmed bugs — treat them as ground truth,
not hypotheses to re-investigate:

1. ProtectedRoute.tsx renders its own loading skeleton BEFORE AppShell (the persistent
   nav wrapper) mounts — the bottom-tab-nav/side-nav-rail genuinely disappear during
   any loading state long enough to see, on every navigation. (This was already fixed
   once in this project's history via a `chrome` prop on ProtectedRoute — verify that
   fix is still in place and extend the same pattern anywhere else a loading branch
   might bypass AppShell.)
2. Input.tsx's `className` prop is applied to the inner <input> element, not the outer
   wrapper div — any parent passing a layout class (flex-1, margins) via `className`
   silently fails. (Also already fixed once via a new `wrapperClassName` prop — verify
   it's still correct and grep for any remaining `<Input ... className="` call sites
   using a LAYOUT class, not a visual/input-styling class, that should be
   `wrapperClassName` instead.)
3. EmptyState.tsx doesn't fill/center in the remaining page height by default — on a
   sparse screen at 1440px, the empty-state message reads as a tiny forgotten corner
   under the page title instead of a deliberately centered, calm state. (Already fixed
   once via `flex-1 ... justify-center` — verify still correct.)
4. Skeleton.tsx only ever renders generic uniform gray bars — no screen has ever had a
   skeleton shaped like its own real content (avatar+text rows for a list, a form's
   actual field count/shape, a card grid's actual card shapes). Build a small set of
   reusable skeleton PRIMITIVES (e.g. SkeletonRow with an optional leading circle for
   avatars, SkeletonCard, SkeletonStatTile) on top of the existing Skeleton base
   component, so every screen in 16.2+ can compose an accurate loading shape instead of
   reaching for generic `<Skeleton className="h-16 w-full" count={5} />` bars.

Task:
1. Confirm/fix all 4 items above.
2. Audit every shared component in src/components/ui/*.tsx for missing interactive
   states: Button, Input, Badge, Card (ContextualActionCard, StatTile), Modal,
   SendGuardBanner, BottomTabNav, SideNavRail — for each, confirm hover, focus-visible,
   active/pressed, and disabled are all explicitly styled (not just "whatever the
   browser does by default" for any of them). Fix any gap using the app's existing
   token conventions (docs/02_ThemeGuideline.md §6.1's `active:scale(0.96)` press
   feedback + cubic-bezier easing is the established button-press convention — reuse
   it, don't invent a new one).
3. Give AppShell.tsx's nav items (BottomTabNav/SideNavRail) a clearer, more premium
   active-tab treatment if the current one is weak — re-screenshot and judge against
   the Linear/Vercel reference point named in docs/02_ThemeGuideline.md §1.
4. Do NOT touch business logic, data fetching, or navigation targets in any of these
   files — this is presentation-layer only.

Report back: which of the 4 known bugs were already fixed vs. needed a fresh fix, the
full list of shared components audited with their state-coverage status, and screenshots
(375px + 1440px) of BottomTabNav/SideNavRail default vs active-tab states.
```

### Testing (must 100% pass before 16.2 starts)
- `npx tsc --noEmit`, `npm run build`, `npm run lint` (0 errors), `npm test -- --run` (115/115 or more) — all clean.
- Seed a real test account, throttle a REST call 3s, screenshot mid-load at 375px and 1440px — nav chrome (bottom tabs / side rail) MUST be visible in both screenshots.
- Screenshot every shared component's 5 states (default/hover/focus/active/disabled) for Button and Input at minimum — visually confirm each is distinct.
- Zero console errors across the whole verification pass.
- Clean up all seeded data + auth user.

---

## 16.2 Sub-step — Auth screens (Sign In, Sign Up, Forgot Password) + Onboarding

### Purpose
These are the FIRST thing every user ever sees — currently plain, unstyled-feeling form pages per the UI survey's "generic form" complaint. First impression matters most here.

### Master Prompt
```
Read docs/02_ThemeGuideline.md §1 (design philosophy), §2 (color), §6.3 (inputs), §9
(motion) in full.

Task:
Redesign SignInPage.tsx, SignUpPage.tsx, ForgotPasswordPage.tsx, and every step of
OnboardingPage.tsx (trade selection, team mode, BusinessInfoForm) for real visual
craft — these currently read as "generic SaaS auth form," per a live UI survey. Do NOT
change any validation logic, submit handlers, redirect targets, or error-handling
behavior already in place (all of it was recently audited and is correct) — this is a
presentation-only pass. Specifically:
1. Give the auth screens actual visual presence — the wordmark treatment
   (docs/02_ThemeGuideline.md §8), generous whitespace, a clear single-column focal
   point, real depth via the app's `raised`/`floating` elevation tokens (§5) rather
   than flat unstyled fields on a bare background.
   2. Fix the reported input-width bugs (see 16.1) so every field genuinely fills its
   intended width at all breakpoints.
3. Onboarding's 3 steps should feel like a considered, premium sequence (progress
   indication if not already present, confident large touch targets per §6.1) — check
   the existing step-transition focus-management fix (Step 14.5) is undisturbed.
4. All 5 interactive states (default/hover/focus/active/disabled) on every button and
   input on these screens, explicitly.
5. Confirm reduced-motion and offline states on these screens still work exactly as
   before (both were previously verified — re-check after your changes).

Report back with 375px + 1440px screenshots of every one of these 6 screens (before/after
if feasible), and explicit confirmation that sign-in, sign-up, forgot-password, and full
onboarding still function end-to-end against the real Supabase project.
```

### Testing
- Full static gate (same 4 commands as 16.1) clean.
- Live: seed a fresh unconfirmed test account, run a full real sign-up → email-confirm-link → onboarding (all 3 steps) → landing-on-Home flow via Playwright against the real dev server + real Supabase project. Also test sign-in with a wrong password (error message renders correctly) and forgot-password (real email flow).
- Screenshot all 6 screens at 375px + 1440px, zero console errors.
- Clean up test account.

---

## 16.3 Sub-step — Home, Clients (list + detail), Price Library, Technical Sheets

### Purpose
The app's most-trafficked screens. Client Detail's two-column desktop layout and Home's empty-state centering were already fixed in a prior pass — this sub-step extends the same quality bar to the remaining screens in this cluster and re-confirms the earlier fixes still hold.

### Master Prompt
```
Read docs/02_ThemeGuideline.md §4.3 (breakpoints — note the desktop
"two-pane, max-width 1200px" and wide "optional right-side context panel" rules), §6.2
(cards), §6.4 (badges) in full.

Task:
1. Re-verify HomePage.tsx's empty-state centering and greeting-line fix, and
   ClientDetailPage.tsx's two-column desktop layout (form left, activity sections
   right) are both still correct after any 16.1 shared-component changes.
2. Redesign ClientsListPage.tsx, PriceLibraryPage.tsx, TechnicalSheetsPage.tsx for the
   same visual-hierarchy bar as the now-fixed ClientDetailPage — currently these read
   as flat, near-identical gray list rows with almost no differentiation between
   primary and secondary information (per the UI survey). Use font-weight, the
   app's real color accents (steel-blue for primary actions, gold sparingly for
   premium touches per §2.2), and spacing more deliberately — never invent a new
   accent color not in the locked palette.
3. Give each of these list screens a properly-shaped skeleton (using 16.1's new
   skeleton primitives) matching its real row shape.
4. Do not change what data loads, what any button does, or any navigation target.

Report back with 375px + 1440px screenshots of all 5 screens (Home, Clients list,
Client detail, Price Library, Technical Sheets), confirming each against the
Linear/Vercel/Stripe reference bar from docs/02_ThemeGuideline.md §1.
```

### Testing
- Full static gate clean.
- Live: seed a test account with 3+ clients, 3+ price items, 2+ technical sheets. Screenshot all 5 screens at both breakpoints, both populated and empty-list states. Confirm the Client Detail page's real stat tiles/historique (from the 2026-09-26 audit fix) still compute and render correctly — this is a real behavior check, not just visual.
- Zero console errors. Clean up test data.

---

## 16.4 Sub-step — Quotes (list + 4-step editor) + Projects (chantier detail) + Change Orders

### Purpose
The commercial core of the app — the MarginBox and the quote line-editor are named in the theme doc as the single most important components in the app's business logic. These must feel flawless, not just functional.

### Master Prompt
```
Read docs/02_ThemeGuideline.md §6.6 (margin-indicator component — read this closely,
it is a named product mechanism, not decoration), §6.3 (inputs, money-figure
formatting), §9.2 (margin-box color-shift/digit-roll motion) in full.

Task:
1. Redesign QuotesListPage.tsx, the 4-step QuoteEditorPage.tsx flow (QuoteStepClient,
   QuoteStepTravaux, QuoteStepDevis, QuoteStepEnvoyer), IssuedQuoteView.tsx, and
   ProjectDetailPage.tsx / ChangeOrderReviewPage.tsx for real visual craft. Per the UI
   survey: ProjectDetailPage currently has ONE strong visual moment (the margin
   progress bar) surrounded by flat generic-SaaS card sections below it (COÛTS RÉELS,
   notes) — bring those sections up to the same quality bar as the margin box itself,
   not the other way around.
2. Confirm the MarginBox's 4 tier colors, digit-roll, and count-up-from-zero reveal
   (all built in a prior motion pass) are undisturbed and still visually correct at
   every tier.
3. The quote editor wizard bypasses AppShell by design (its own focused flow, no
   persistent nav) — make sure its own header/back-navigation/step-indicator still
   reads as premium and consistent with the rest of the app's visual language, not an
   orphaned, differently-styled sub-app.
4. All 5 interactive states on every line-item control (delete button, inline
   qty/price fields, VAT selector, drag-handle).
5. Do not change the deterministic calculation engine, the AI-draft-assist behavior,
   or any persisted totals logic — this is presentation only.

Report back with 375px + 1440px screenshots of the quote list, each of the 4 editor
steps, the issued-quote view, the project detail page, and the change-order review
page, plus explicit confirmation the live margin recalculation (typing a new quantity/
price and watching the MarginBox update) still works via a real Playwright interaction
test, not just a static screenshot.
```

### Testing
- Full static gate clean.
- Live: seed a real draft quote, walk all 4 editor steps via Playwright, edit a line's price and confirm MarginBox recalculates live with zero console errors, issue the quote and confirm PDF generation still works, convert to a project and confirm the project detail page renders real profitability data. Screenshot every step at both breakpoints.
- Clean up test data.

---

## 16.5 Sub-step — Invoicing, Unpaid/Dunning, Orders, Planning

### Purpose
These screens were flagged as visually the sparsest in the survey — competent empty-state copy but "look like a bug ticket screenshot" at 1440px once the shared EmptyState fix (16.1) is layered in. Confirm that fix resolved it, then add real visual presence to the populated-list case too.

### Master Prompt
```
Read docs/02_ThemeGuideline.md §6.4 (badges — dunning-level escalation colors are a
named severity-communication requirement, not decoration), §6.10 (main courante/
journal timeline) in full.

Task:
1. Confirm 16.1's EmptyState centering fix resolved the "tiny message in a huge void"
   problem on InvoicingPage.tsx, UnpaidPage.tsx (+ DunningModal), OrdersPage.tsx
   (+ OrderModal), PlanningPage.tsx at 1440px. Screenshot to verify.
2. Redesign the POPULATED list-row case on all 4 screens for better visual hierarchy
   — status badges, amounts, and dates currently compete for attention with no clear
   priority order per the UI survey. The dunning-level badge's escalating color
   severity (§6.4) should be the most visually prominent element on an overdue-
   invoice row, not competing equally with the amount.
3. Give each screen a properly-shaped skeleton (16.1 primitives).
4. Do not change filter logic, status-transition logic, or any navigation target
   (including the recent fix routing non-overdue invoices to /clients/:id and overdue
   ones to /unpaid — verify this still works correctly after your changes).

Report back with 375px + 1440px screenshots of all 4 screens (empty AND populated
states), confirming the invoice-row navigation split (overdue -> /unpaid, else ->
client record) still works via a real click-through test.
```

### Testing
- Full static gate clean.
- Live: seed 2 invoices (one overdue, one not), confirm click-through routing is unchanged, seed a planning conflict and confirm the warning still renders, seed an order and confirm stock-state badges render. Screenshot all states at both breakpoints. Zero console errors. Clean up.

---

## 16.6 Sub-step — Kōv Agent (the flagship screen — highest priority, most scrutiny)

### Purpose
This is explicitly the product's flagship differentiator per `02_ThemeGuideline.md` §6.9, and was rated the least art-directed screen in the whole survey, with a genuinely broken desktop layout (already partially fixed — verify and go further). This sub-step gets the most design attention of the whole pass.

### Master Prompt
```
Read docs/02_ThemeGuideline.md §6.9 (the Kōv Agent conversation surface's full spec)
and §9.2's agent-specific motion moments in full — treat every requirement in §6.9 as
a hard constraint, not a suggestion (purple/agent-accented throughout, never styled as
a generic chat window, distinct bubble/chip/card treatments per the spec).

Task:
1. Verify the prior desktop-layout fix (centered max-w conversation column, pill-
   shaped glowing input bar) is still in place and looks intentional, not just
   "less broken" — this screen should be the most visually distinctive in the app,
   not merely functional at desktop width.
2. Give the AgentSurface real depth and texture — currently just a flat gradient per
   the survey. Consider (within the locked agent-purple palette only): a subtle
   layered gradient mesh, a faint particle/dot texture, or a soft glow radiating from
   the input area — something that reads as "premium AI surface," referencing genuine
   best-in-class AI chat product surfaces (still steel-blue/purple-locked, never a
   generic ChatGPT-clone look).
3. The user/response bubbles, IntentConfirmationChip, and PlanReviewCard each need a
   visually DISTINCT identity per §6.9 — audit whether they currently feel
   differentiated enough from each other, and sharpen the distinction if not.
4. The infinite "Kōv réfléchit..." loading state found stuck in the survey (an
   Edge-Function-not-resolving dev-environment issue, not necessarily an app bug) —
   regardless of root cause, add a visible timeout/retry affordance if a request
   genuinely hangs past a reasonable threshold, matching the app's existing
   ApiTimeoutError pattern used everywhere else (check src/lib/apiClient.ts's
   established timeout convention and apply the same posture here if it's missing).
5. Voice-dictation pulsing rings, plan-step execution-flash, and the
   "Rien n'est envoyé avant validation" banner (all built in prior steps) — confirm
   all three are visually prominent and undisturbed.
6. Do not change intent-extraction logic, plan-generation logic, or the execution
   confirm-gate behavior — presentation only.

Report back with 375px + 1440px screenshots of: idle state, mid-conversation with a
response bubble, the disambiguation/IntentConfirmationChip state, and a full
PlanReviewCard with at least 2 steps (one removed). Confirm real interaction (typing a
message, seeing a real or realistically-mocked plan card, removing a step, confirming)
works end-to-end with zero console errors.
```

### Testing
- Full static gate clean.
- Live: seed a real client + a plausible utterance, drive a real (or, if the Edge Function is genuinely unreachable in this environment, an honestly-labeled best-effort) conversation through Playwright, screenshot every state named above at both breakpoints. If the intent-extract function is unreachable, explicitly note that as an environment limitation in the report — do not fabricate a working screenshot.
- Zero console errors (excluding a clearly-logged, expected Edge-Function-unreachable warning if that's a genuine environment constraint, which must be reported honestly either way).
- Clean up test data.

---

## 16.7 Sub-step — Messages, Financing, Satisfaction, Accounting Export, Migration, Team, Settings/Profile

### Purpose
The remaining secondary screens — lower individual traffic than 16.2-16.6, but "every single page" per your own instruction means these don't get skipped. Profile's width/identity-header fix from a prior pass should be confirmed and extended to the rest of this cluster.

### Master Prompt
```
Read docs/02_ThemeGuideline.md §6.10 (journal timeline, reused by Messages), §1
(design philosophy — apply this bar uniformly, including to screens that feel "lower
priority") in full.

Task:
Redesign MessagesPage.tsx, FinancingPage.tsx + FinancingModal.tsx,
SatisfactionPage.tsx, AccountingExportPage.tsx, MigrationPage.tsx, TeamPage.tsx,
ProfilePage.tsx, and BusinessSettingsPage.tsx for the same premium bar as every
higher-traffic screen fixed in 16.2-16.6 — per the UI survey, Profile currently reads
as "generic settings-app template," and the same complaint likely applies here too.
Confirm the prior Profile width/business-name-header fix is intact. Give the
Financing page's prominent indicative-only disclosure banner (a named legal
requirement, docs/03_MasterPrompts.md §13.8 item 3) real visual weight matching its
importance — it must be impossible to miss, not just present. Do not change any
mutation/toggle logic, especially the discarded-error fixes already made to
PriceLibraryPage/TeamPage/SatisfactionPage in the 2026-09-26 audit — re-verify those
specific error-surfacing paths still work after your visual changes.

Report back with 375px + 1440px screenshots of all 8 screens, and explicit
confirmation that the team-member toggle, satisfaction "Marquer envoyé", and
financing-simulation-send actions all still work end-to-end with visible error
handling intact.
```

### Testing
- Full static gate clean.
- Live: exercise the team-toggle, satisfaction mark-sent, and financing-send flows via Playwright, confirming both success and (where feasible) error-path rendering. Screenshot all 8 screens at both breakpoints. Zero console errors. Clean up.

---

## 16.8 Sub-step — Final cross-cutting pass: consistency audit + performance

### Purpose
After 16.1-16.7 redesign every screen individually, this final pass catches drift between screens (inconsistent spacing/color choices made independently across sub-steps) and confirms the redesign didn't regress load performance.

### Master Prompt
```
Read docs/02_ThemeGuideline.md in full one more time, end to end.

Task:
1. Screenshot every route in the app at 375px and 1440px in a single pass (reuse
   .scratch-a11y/ui-survey/'s seeding pattern). Compare all screenshots side-by-side
   against each other — flag and fix any screen whose spacing scale, card treatment,
   button styling, or color usage drifted from the others during 16.2-16.7's
   individually-scoped work.
2. Re-run the FULL states checklist from docs/04_ApplicationFlow.md §4 (skeleton/
   empty/error/offline/slow-network/AI-unavailable) across every route one final time
   — confirm no sub-step's visual changes accidentally broke a previously-working
   state.
3. Run `npm run build` and check the production bundle size against the pre-redesign
   baseline (currently ~1.35MB JS / ~448KB gzipped, ~50KB CSS) — flag if it grew
   significantly (more than ~15%) and investigate why (e.g. an accidentally-duplicated
   icon set, an unintentionally-bundled font) before accepting the growth.
4. Confirm every animation added/touched across 16.1-16.7 still respects
   prefers-reduced-motion (test by enabling OS-level reduced motion and clicking
   through the whole app one more time).
5. Run the full existing automated test suite (115 vitest tests) and the existing
   Playwright visual-regression suite (tests/visual/, if still present) — update
   baseline screenshots deliberately (npm run test:visual:update) only after visually
   confirming each diff is an intended improvement, never to silence a failing diff
   without review.

Report back with: a cross-screen consistency checklist (pass/fail per screen against
a shared "does this look like it belongs in the same app as every other screen"
judgment call), final bundle-size comparison, and confirmation of 115/115 tests +
zero critical/serious axe violations across every route.
```

### Testing
- Full static gate clean.
- A single full-app screenshot pass (every route, both breakpoints) reviewed for cross-screen consistency.
- `npm run test:visual` (if present) passes clean against a deliberately-reviewed, updated baseline.
- Bundle size within ~15% of pre-redesign baseline, or an explicit justified reason if not.
- 115/115 vitest tests passing. Zero critical/serious axe violations on any route.
- This is the final gate — only once §16.8's Testing block is 100% clean is the entire premium-UI redesign pass considered DONE. Update `docs/07_ProjectState.md` with a dated Step 16 entry summarizing what changed, screenshots referenced, and the final verification results, following this project's existing per-step logging convention.

---

## How to invoke this master prompt

Hand each sub-step's "Master Prompt" block to the agent ONE AT A TIME, in order (16.1 → 16.2 → ... → 16.8). Do not skip ahead. After each sub-step's agent reports back, personally look at the screenshots referenced in the report before approving the move to the next sub-step — the report says what the agent believes it did, the screenshots are what actually happened.
