# Kōv — Master Prompts (Step-by-Step Build Guide)

> **How to use this document**: Work top to bottom, Step 0 → Step 15, in order, then run the four Verification & QA prompts in the final "STEP FINAL" section near project completion. Never skip a step. Each numbered sub-section (e.g. 1.1, 1.2) has:
> - **Purpose** — why this sub-step exists
> - **Task Type** — **Agent Task**, **Manual Task**, or both (labeled explicitly at the start of every sub-section — this project has substantial manual configuration work alongside coding, and the two must never be confused)
> - **Master Prompt** — copy-paste this exact block into your AI coding agent when it's an agent task; every prompt tells the agent exactly which reference doc(s) to read first, so it never guesses at scope, theme, or architecture
> - **Manual Instructions** — for manual tasks, beginner-friendly, assume-no-prior-knowledge steps (which site to open, what to click, where to find/save each key)
> - **Testing → Bugs Found → Fix → Re-test** — see the standing rule below; this is not a single "does it work" check, it is a loop
> - **References** — which other doc(s) the agent should read for detail; already embedded in the prompt so you don't have to remember to mention it
>
> Run your AI coding agent **from the `D:\WEB DEV\Wapis\kov` project folder**. Unlike a refactor project, **there is no existing `src/` codebase here** — the only pre-existing asset is the reference prototype `kov_V3_accueil_actions (1).html` and the `docs/` folder itself. Step 1 onward is a **greenfield build**: the agent studies the prototype for visual/behavioral reference, then writes fresh, modular React + TypeScript code. Never instruct the agent to "refactor" anything — there is nothing to refactor yet.
>
> **Standing rule — Testing is a loop, not a checkbox: Testing → Bugs/Gaps Found → Fix → Re-test → next step.** Every step's Testing block is not "run these checks once and move on." After running a step's Testing checks, explicitly ask the agent (or check yourself) for two separate things: (1) **bugs** — anything that doesn't work as specified, and (2) **gaps** — anything the step's scope required (per this document, `01_ScopeDocument.md`, `04_ApplicationFlow.md`, `02_ThemeGuideline.md`, and `08_ComponentArchitecture.md`) that was skipped, stubbed without a documented reason, or silently simplified. A useful prompt to paste after any step's Testing block: *"Before I move to the next step: review what you just built against this step's full Master Prompt and against docs/01_ScopeDocument.md's relevant module/FR section. List separately: (a) any bugs — things that don't work as specified, and (b) any implementation gaps — things the spec required that you skipped, stubbed, or simplified without flagging it to me. Fix everything in both lists, then confirm the original Testing checklist still passes after your fixes."* Only once that loop comes back clean do you advance to the next step. This is what actually prevents the small, compounding drift that turns a well-specified project into a messy one by Step 10.
>
> **Standing rule — keep `07_ProjectState.md` current.** At the end of every step (once its Testing → Fix → Re-test loop is clean), update `docs/07_ProjectState.md`: mark the step done, log any new architectural or UI decision that a future agent/session would otherwise have to rediscover, and update the "what to do next" section. If you switch AI coding agents, switch models, or start a new session mid-project, read `07_ProjectState.md` first, before anything else — it is written specifically to get a fresh agent oriented without re-reading this entire document or the whole prior conversation.
>
> **Standing rule — component reuse and folder structure, every step from Step 3 onward**: Step 2 builds the complete themed component library (`Button`, `Card`, `StatTile`, `Input`, `Badge`, `MarginBox`, `BottomTabNav`/`SideNavRail`, `AgentSurface`, `JournalTimeline`) exactly per `02_ThemeGuideline.md` §6. Every later step that builds a screen or modal — even where its own Master Prompt doesn't explicitly say "use the Step 2 components" — must compose the UI from that library, never hand-roll a new inline-styled button, card, input, or badge. If a step's prompt doesn't name a specific component, that is not license to invent a new styling approach; it means "use the existing library for anything it already covers, and only build a genuinely new component (following the same theme tokens) for something the library doesn't yet have." This is what keeps the whole app looking like one coherent, premium product instead of twenty screens each reinventing their own button. For exactly where a new file belongs, naming conventions, and the full folder-structure reference, see `08_ComponentArchitecture.md` — read it once before Step 2, then treat it as the standing answer to "where does this go?" for the rest of the build.
>
> **Standing rule — every screen/modal built from Step 5 onward ships with its full state set, not just the happy path, in the SAME step, not deferred to Step 14.** `04_ApplicationFlow.md` §4 defines eight required states — skeleton loading, inline/action loading, empty, recoverable error, offline, slow network, unauthorized, and (where AI-dependent) AI-unavailable. From Step 6 onward, unless a step's own Master Prompt explicitly narrows scope for that sub-step (e.g. Step 8.3 deliberately defers the "Émettre" button to Step 9 — that is a scoped, intentional exception, not a states shortcut), every screen or modal built in that step must, in that same step, include: (a) a screen-shaped `Skeleton` layout (built from the Step 2 `Skeleton` primitive, never a generic spinner) for its initial data load, (b) the exact per-screen empty-state copy already specified in `04_ApplicationFlow.md` §2.x/§3.x for that screen — if this Master Prompts document's own step doesn't repeat that copy inline, the agent must pull it from `04_ApplicationFlow.md` directly, never invent generic "No data" text, (c) `InlineError` with retry on every data fetch and every mutation, using the Step 3 `apiClient.ts`/`InlineError` primitives, (d) offline handling via `useOnlineStatus` — read-only views degrade gracefully, anything that would send to a client or spend money disables with an explicit explanatory message, (e) a slow-network "toujours en cours..." indicator on any call that can plausibly take longer than ~2-3s (PDF generation, AI calls, multi-invoice exports are the clearest examples, but this applies to any Supabase query on a growing table too). Step 14.3's full states audit exists to catch anything that slipped through across the whole app, not to be the first time states are built — treat any step that ships with zero states as incomplete, not "ready for Step 14 polish."

---

## STEP 0 — Accounts & Environment Setup (Manual, Beginner-Level)

**Purpose of Step 0**: before any code is written, you need real accounts on every service this project uses. This step is 100% manual — do not ask the agent to create accounts for you (it can't, and shouldn't ever be asked to fabricate credentials).

### 0.1 GitHub account (code hosting)
**Manual Task.**
1. Go to https://github.com and sign up (free) using your email `colindavidmccabe@gmail.com` or your business email.
2. Create a new **private** repository named `kov-app`.
3. Install Git on your computer if not already installed: https://git-scm.com/downloads (Windows installer, default options are fine).
4. Open a terminal in `D:\WEB DEV\Wapis\kov` and run:
   ```
   git init
   git remote add origin https://github.com/<your-username>/kov-app.git
   ```
**Testing**: Run `git status` — it should say "On branch main" with no errors.

### 0.2 Vercel account (hosting)
**Manual Task.**
1. Go to https://vercel.com and sign up using your **GitHub account**.
2. Once your project is scaffolded (Step 0.5), run `npx vercel login` and `npx vercel link` to connect this local folder to a new Vercel project.
**Testing**: `npx vercel whoami` shows your account name.

### 0.3 Supabase accounts — production AND staging (database, auth, backend)
**Manual Task.**
1. Go to https://supabase.com, sign up (GitHub sign-in is easiest).
2. Create a new project. Name it `kov-production`. Choose a strong database password, region close to France (e.g. `eu-west-3` Paris or `eu-central-1` Frankfurt), save the password in a password manager.
3. **Create a second project** named `kov-staging` — the NFR in `01_ScopeDocument.md` §7 ("Maintainability" / "separate preview and production environments") requires this separation from the start, not as an afterthought. Use the same region.
4. For **both** projects, go to **Project Settings → API** and copy down:
   - `Project URL`
   - `anon public` key
   - `service_role` key (⚠️ never put this in frontend code or commit it to git — server-only)
**Testing**: You can log into the Supabase dashboard and see both empty projects (`kov-production`, `kov-staging`), each with a "Table Editor" tab showing no tables yet.

### 0.4 Anthropic (Claude API) account
**Manual Task.**
1. Go to https://console.anthropic.com and sign up.
2. Add a payment method (pay-as-you-go). Set a low monthly spend limit under Settings → Limits while testing (e.g. $30 — Kōv's AI features are called less frequently per session than a chat-first product, but budget for iterative testing of the quote-drafting and agent-intent flows).
3. Go to **API Keys** → create two keys, named `kov-production` and `kov-staging`, matching the two Supabase projects. Copy each down — you'll only see them once.
**Testing**: Both keys start with `sk-ant-...` and are saved somewhere safe.

### 0.5 Local development environment
**Manual Task.**
1. Install Node.js LTS (v20+) from https://nodejs.org — Windows installer, default options.
2. Install VS Code (or your preferred editor): https://code.visualstudio.com.
3. Install the Supabase CLI: `npm install -g supabase` (or via Scoop on Windows: `scoop install supabase`).
4. Confirm versions in your terminal:
   ```
   node -v
   npm -v
   supabase --version
   git --version
   ```
**Testing**: All four commands print a version number with no "command not found" errors.

### 0.6 Environment variable files
**Purpose**: centralize every secret in untracked files so the agent never hardcodes them into source, and so staging/production secrets are never mixed.
**Manual Task.**
1. Once the project is scaffolded (Step 0.5), create `kov/.env.local` (used for local development, pointed at `kov-staging`) with:
   ```
   VITE_SUPABASE_URL=<from kov-staging, Step 0.3>
   VITE_SUPABASE_ANON_KEY=<from kov-staging, Step 0.3>
   # server-only — used inside Supabase Edge Functions, never referenced with VITE_ prefix:
   SUPABASE_SERVICE_ROLE_KEY=<from kov-staging, Step 0.3>
   ANTHROPIC_API_KEY=<from kov-staging Anthropic key, Step 0.4>
   ```
2. In Vercel's dashboard, once the project is linked (Step 0.2), set the **Production** environment variables to the `kov-production` values, and the **Preview** environment variables to the `kov-staging` values — this is how the environment separation is enforced end-to-end, not just locally.
3. Confirm `.gitignore` excludes `.env.local` and any `.env*.local` pattern (create/verify this file exists before the first commit).
**Testing**: `git status` never shows `.env.local` as a tracked/staged file. In Vercel's dashboard, Production and Preview environment variable sets show different values for `VITE_SUPABASE_URL`.

---

## STEP 0.5 — Project Scaffold & Package Installation

### 0.5.1 Purpose
Create the Vite + React + TypeScript project from scratch (there is no existing app to build on top of) and install every package the whole build will need, in one pass, so later steps don't stall on missing dependencies.

### 0.5.2 Agent Task — scaffold and install packages
**Master Prompt** (paste to your AI coding agent):
```
You are starting a brand-new project at D:\WEB DEV\Wapis\kov. There is NO existing application code — the only pre-existing files are docs/ (the full specification set) and a reference prototype file "kov_V3_accueil_actions (1).html" (do not copy code from this file directly; it is a study reference for visual language and behavior only, described fully in docs/02_ThemeGuideline.md and docs/04_ApplicationFlow.md).

Read docs/00_README.md and docs/01_ScopeDocument.md section 3 ("Confirmed technology stack") in full before doing anything.

Task:
1. Scaffold a new Vite project with the react-ts template in the current directory (D:\WEB DEV\Wapis\kov) — use `npm create vite@latest . -- --template react-ts` or equivalent, being careful not to overwrite the existing docs/ folder or the reference HTML file.
2. Install and configure Tailwind CSS (latest stable) with a tailwind.config.ts. Do not hardcode colors yet — set up the config to read from a CSS variables file at src/styles/theme.css, which you should create as an empty placeholder with a comment "// populated in Step 1.1 per docs/02_ThemeGuideline.md".
3. Install shadcn/ui and initialize it (npx shadcn@latest init), using the "new-york" style if prompted, with CSS variables enabled.
4. Install Framer Motion (framer-motion), GSAP (gsap) with ScrollTrigger, and animate.css.
5. Install React Router (react-router-dom v6).
6. Install @supabase/supabase-js.
7. Install Zod for schema validation (used heavily from Step 5 onward for RLS/data contracts and from Step 9 onward for AI response schemas).
8. Install a server-side-renderable PDF generation library — @react-pdf/renderer (or, if you determine during setup that it doesn't render cleanly inside a Supabase Edge Function's Deno runtime, research and substitute an equivalent headless PDF-generation approach that CAN run server-side inside a Supabase Edge Function; report which you chose and why). This is required per docs/01_ScopeDocument.md section 3 — quote PDFs must be generated server-side from the persisted immutable quote version, never via window.print() on live DOM state (this is a named defect to avoid, docs/01_ScopeDocument.md section 9).
9. Install lucide-react for icons.
10. Install dev tooling: eslint, prettier, typescript-eslint, vitest + @testing-library/react for testing (required for the automated-tests NFR in docs/01_ScopeDocument.md section 7, and specifically for the calculation test fixtures required by KOV-FR-007).
11. Update package.json scripts to include: dev, build, preview, lint, format, test.
12. Confirm the scaffolded app builds and runs with `npm run dev` showing the default Vite template page (this will be replaced starting Step 1).

Report back: the final package.json dependencies/devDependencies list, confirm the project scaffolded cleanly alongside the existing docs/ folder and reference HTML file (both untouched), and confirm which PDF library you chose and why.
```

### 0.5.3 Testing
- `npm install` completes with no errors.
- `npm run dev` shows a running app.
- `npm run build` succeeds.
- `docs/` folder and `kov_V3_accueil_actions (1).html` are both still present and untouched.
- `package.json` lists every package named above.

### 0.5.4 References
- `01_ScopeDocument.md` §3 (stack)
- `02_ThemeGuideline.md` §11 (how theme tokens will plug into Tailwind — for the agent's awareness of what's coming in Step 1)

---

## STEP 1 — Theme Tokens & Global Styles

### 1.1 Purpose
Translate the full `02_ThemeGuideline.md` into real CSS variables + Tailwind theme extension, so every component built from here on pulls from one source of truth instead of inline hex values. This is the design system's foundation — get it exactly right before building a single component.

### 1.2 Agent Task — Master Prompt
```
Read docs/02_ThemeGuideline.md in full before starting — it is your single source of truth for all colors, typography, spacing, radius, elevation, and component specs. Do not invent colors outside what's specified there. Pay special attention to section 2.1: the CSS variable named "--orange" is a STEEL-BLUE color (#4A7FA5), not orange-hued — preserve this variable name exactly as given even though it looks like a naming mismatch; it is a deliberate carry-over from the client's own source file, and section 2.1 explains why.

Task:
1. Create src/styles/theme.css containing every CSS custom property from sections 2.1, 2.2, 2.5, and 2.6 of docs/02_ThemeGuideline.md — dark mode as the default :root state (per section 2.5, dark is PRIMARY, not a toggle-on state), light mode under :root[data-theme="light"] (per section 2.6).
2. Extend tailwind.config.ts theme.extend to map every token: colors (including the full noir-*, accent-*, agent-*, urgence-*, gold-* ramps from section 2.2, plus the margin-tier tokens from section 2.4), fontFamily (section 3.1 — DM Sans and Playfair Display), spacing (section 4.1), borderRadius (section 4.2 — xs/sm/md/lg/pill/full), boxShadow (section 5 — every named shadow including accent-glow, agent-glow, urgence-glow, margin-glow-green, margin-glow-red), and backgroundImage (section 11's gradient definitions for the agent-gradient and brand accent gradient).
3. Add both font stacks via Tailwind fontFamily config. Use Google Fonts for DM Sans and Playfair Display — load them via a <link> in index.html (self-hosting can come later if the client requests it; for now use the standard Google Fonts CDN links), with system-font fallbacks exactly as specified in section 3.1.
4. Create src/styles/globals.css importing Tailwind layers + theme.css, with a base reset, and prefers-reduced-motion global handling (per section 9.1 rule 3 and section 10 — a CSS media query that disables/shortens all transition/animation durations when reduced motion is requested).
5. Do not build any components yet. This step is tokens and config only.

Report back with a list of every CSS variable and Tailwind token created, so I can visually cross-check it against docs/02_ThemeGuideline.md section 2.
```

### 1.3 Testing
Open `src/styles/theme.css` — every hex value listed in `02_ThemeGuideline.md` §2.1 and §2.2 should appear exactly (character-for-character) as a CSS variable. Cross-check a handful manually — in particular confirm `--orange: #4A7FA5;` (not an actual orange hue), `--urgence: #F97316;`, `--agent-grad-start: #7c3aed;`, `--vert: #059669;`.

### 1.4 References
`02_ThemeGuideline.md` §2, §3, §4, §5, §11.

---

## STEP 2 — Component Library Foundation

### 2.1 Purpose
Build the reusable component primitives (buttons, cards, inputs, badges, nav, the margin-indicator component, the agent-surface components) per the theme spec, before any screen uses them.

### 2.2 Agent Task — Master Prompt
```
Read docs/02_ThemeGuideline.md section 6 (Component specifications) in full.

Using the shadcn/ui primitives installed in Step 0.5 as a base, build the following components in src/components/ui/, styled per the theme doc, using the Tailwind tokens from Step 1 (never hardcoded hex values):

1. Button.tsx — variants: primary (brand steel-blue), agent (purple-gradient), urgent (true-orange), ghost/secondary, icon (per section 6.1 table). Include the press/active scale (0.96) and disabled states, and the section 9.1 easing curve cubic-bezier(0.34, 1.56, 0.64, 1).
2. Card.tsx — base card + a "ContextualActionCard" variant with left accent bar color prop (per section 6.2).
3. StatTile.tsx — per section 6.2's stat tile pattern.
4. Input.tsx — text input with label, helper text, error state (per section 6.3), including a MoneyInput variant using tabular numerals for purchase-price/sale-price fields.
5. Badge.tsx — status pill variants mapped to the semantic colors in section 2.3 and specifically the quote-status set (Draft/Issued/Accepted/Declined/Expired), chantier-status set, dunning-level set (per section 6.4).
6. MarginBox.tsx — the margin-indicator component per section 6.6's full spec: left accent bar, headline figure (figure-lg token), advisory sentence, tinted background per the four-tier system in section 2.4 (green >30%, steel-blue >20%, GOLD >10% — NOT orange/amber, this tier's real color is gold `--gold-500`/`#C8A96E`, see section 2.4's naming note — red <=0%), plus an "extended" prop/variant for the chantier profitability screen's planned-vs-real double-figure + progress-bar-with-marker layout. This is a core differentiator component — build it carefully and exactly to spec, it will be used identically in two different screens later. Name the component's internal tier variants `green`/`steelBlue`/`gold`/`red`, never `amber` or `orange` for the middle two, matching the Tailwind token names from section 11.
7. BottomTabNav.tsx (mobile) and SideNavRail.tsx (desktop, 1024px+) per section 6.5 — five items: Accueil, Planning, Devis, Clients, Profil, plus a center FAB, using lucide-react icons.
8. AgentSurface.tsx — the Kōv Agent conversation surface primitives per section 6.9: the purple-gradient background container, user/agent message bubble variants, the understood-intent confirmation chip, the action-plan-review card shell (with per-step remove affordance and the "Lire le message" expand pattern), and the persistent "Rien n'est envoyé avant validation" banner.
9. JournalTimeline.tsx — the main courante vertical timeline component per section 6.10: inbound/outbound visually distinct row styling (blue-family for inbound, steel-blue-family for outbound), per-entry-type icon chips, expand-to-full-text interaction.

Use Framer Motion for the press/hover micro-interactions described in section 6.1. Write a small dev-only preview page at src/dev/ComponentPreview.tsx rendering every variant of every component so I can visually review them together, including the MarginBox in all four tier states and the AgentSurface components. Do not wire this into the main app nav — it's a temporary dev-only route.

Report back with the list of components built and confirm the preview route path.
```

### 2.3 Testing
Run `npm run dev`, navigate to the preview route, visually compare every component variant against `02_ThemeGuideline.md` §6 — check radius, color, shadow, hover state manually. Specifically confirm the MarginBox renders all four correct tier colors and the AgentSurface uses the purple gradient, not the brand steel-blue.

### 2.4 References
`02_ThemeGuideline.md` §6 (full), §7 (iconography), §9.1 (motion principles), §2.4 (margin tiers).

---

## STEP 3 — App-Wide States System

### 3.1 Purpose
Build the reusable state-handling primitives ONCE, before any real screen is built, so every screen from Step 5 onward (Auth screens are the first real, data-backed screens, built in Step 5.3) can plug into them instead of re-deriving skeleton/offline/error logic per screen. This directly implements `04_ApplicationFlow.md` §4 (Global cross-cutting states).

### 3.2 Agent Task — Master Prompt
```
Read docs/04_ApplicationFlow.md section 4 in full (Global cross-cutting states table) and docs/02_ThemeGuideline.md section 9 (motion — for the shimmer style) before starting.

Task:
1. Build src/components/ui/Skeleton.tsx — a base skeleton block primitive with a steel-blue-tinted shimmer animation, sized/shaped via props.
2. Build src/hooks/useOnlineStatus.ts — wraps navigator.onLine plus 'online'/'offline' listeners.
3. Build src/components/ui/OfflineBanner.tsx — a slim, non-blocking app-wide banner ("Hors ligne — reconnexion en cours...") mounted once at the app root.
4. Build src/lib/apiClient.ts wrapping the Supabase client with a default request timeout (15s) and retry-once-on-timeout for READ requests only (never auto-retry a write/mutation — this matters even more here than in a typical app, because a mis-retried dunning send or agent-plan execution would mean a duplicate message reaching a real client). Every Supabase/Edge Function call in later steps goes through this wrapper.
5. Build src/components/ui/InlineError.tsx — a small, in-context error component with a Retry button.
6. Build src/components/ui/EmptyState.tsx — a reusable shell (icon + heading + description + optional CTA) for every screen's specific empty-state copy per docs/04_ApplicationFlow.md section 2.x.
7. Build src/components/ui/SendGuardBanner.tsx — a specific, reusable component for the "nothing sent without confirmation" pattern that recurs across dunning (mo-relance), invoicing sends, agent plan execution, and financing-proposal sends — a persistent, clearly-labeled confirmation banner + explicit confirm/cancel action pair, so this pattern is built once and reused everywhere a client-facing send is about to happen, rather than reimplemented five different ways.
8. Document (short comment block at the top of each new file) which upcoming step/screen is expected to consume it.

Do not wire these into any real screen yet — Step 4 sets up routing, Step 5 sets up the data layer, and Steps 6 onward build the actual screens using these primitives.

Report back with the file list and confirm: throttling to "Slow 3G" in Chrome DevTools does NOT falsely trigger the OfflineBanner (slow ≠ offline), and toggling DevTools "offline" mode DOES trigger it correctly.
```

### 3.3 Testing
- Toggle Chrome DevTools "Offline" — `OfflineBanner` appears; toggle back — it disappears.
- Throttle to "Slow 3G" — the offline banner does NOT show, and no request hangs forever (apiClient.ts timeout kicks in).
- Render `Skeleton`, `EmptyState`, `InlineError`, and `SendGuardBanner` on the Step 2 preview route — visually confirm they match `02_ThemeGuideline.md`'s tone.

### 3.4 References
`04_ApplicationFlow.md` §4. `02_ThemeGuideline.md` §9 (shimmer), §6 (baseline styling).

---

## STEP 4 — Routing & Modular File Structure

### 4.1 Purpose
Set up real routes and the full modular folder structure matching every screen in `04_ApplicationFlow.md` §1/§2, so every subsequent step has a clear home for its code.

### 4.2 Agent Task — Master Prompt
```
Read docs/04_ApplicationFlow.md section 1 (top-level navigation map) and section 2 (all 23 screens) in full.

Task:
1. Set up React Router with routes matching every screen in docs/04_ApplicationFlow.md: /sign-in, /sign-up, /forgot-password, /onboarding/:step, /home, /planning, /quotes (s-devis), /quotes/new (s-new-devis, supporting a 4-step sub-flow via nested route or step state), /clients (s-clients), /clients/:id (s-fiche-detail), /projects/:id (s-chantier), /agent (s-agent), /unpaid (s-impayes), /invoices (s-factures), /orders (s-commandes), /messages (s-msg), /profile (s-profil) with nested /profile/business (s-entreprise), /profile/price-library (s-tarifs), /profile/technical-sheets (s-fiches), /profile/accounting-export (s-compta), /profile/migration (s-migration), /profile/financing (s-financeurs), /profile/satisfaction (s-sat).
2. Create the folder structure:
   src/
     features/
       auth/
       onboarding/
       home/
       planning/
       quotes/
       clients/
       projects/
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
     components/ui/       (already built in Step 2)
     lib/                  (supabase client, apiClient, utils)
     hooks/
     styles/               (already built in Step 1)
     types/
     supabase/functions/   (Edge Functions live here in source form before deploy)
3. Build a thin router shell in src/App.tsx wiring every route above to a placeholder component in its feature folder (each placeholder just renders the screen's name for now — real content replaces these placeholders starting with Auth in Step 5, then every other screen from Step 6 onward).
4. Build a protected-route wrapper component that will later check Supabase Auth session state (real auth logic comes in Step 5) — for now it can be a pass-through, but structure it so Step 5 only needs to fill in the session check, not restructure routing.
5. Confirm every route is reachable via npm run dev and the browser URL bar, with no console errors.

Report back: the final folder tree and the full route list with file paths.
```

### 4.3 Testing
`npm run dev` — visit every route listed in `04_ApplicationFlow.md` §1 directly via URL; confirm no console errors, no blank screens (placeholder content is fine at this stage).

### 4.4 References
`04_ApplicationFlow.md` §1, §2 (full screen list).

---

## STEP 5 — Supabase Data Layer, Auth & RLS

### 5.1 Purpose
This is the foundation everything else depends on. No AI feature, no quote calculation, no chantier profitability can be built safely until real accounts + row-level security exist.

> **Gate**: do not proceed past this step until every RLS test in 5.5 passes.

### 5.2 Agent Task — schema migrations
**Master Prompt**:
```
Read docs/05_DataModel.md in full — it is your exact schema reference. Do not invent tables or columns not listed there; if you think something is missing, tell me instead of improvising.

Task:
1. Initialize Supabase CLI in this project (supabase init) and link it to the kov-staging project created in Step 0.3 (supabase link --project-ref <staging-ref>) — all development happens against staging first; production is only touched at release (final step of this document).
2. Create one migration file per logical group exactly as listed in docs/05_DataModel.md section 5: 0001_profiles_businesses_employees.sql, 0002_price_items_technical_sheets.sql, 0003_clients.sql, 0004_quotes_lines_versions_events.sql, 0005_projects_costs_updates_change_orders.sql, 0006_invoices_dunning.sql, 0007_orders_order_lines.sql, 0008_journal_documents.sql, 0009_ai_runs_agent_action_plans.sql, 0010_financing_accounting_migration.sql.
3. Every table must match the exact column definitions in docs/05_DataModel.md section 2, including all check constraints (status enums, VAT-rate enums, etc.).
4. Create the auth.users insert trigger that creates the matching profiles row automatically (docs/05_DataModel.md section 2.1 notes this — profiles has no client-side insert policy).
5. Apply RLS to every owner-scoped table per the pattern in docs/05_DataModel.md section 3. Confirm ai_runs, agent_action_plans, and every other table carry the denormalized owner_id column exactly as specified, so the single RLS pattern applies uniformly.
6. Run the migrations against kov-staging (supabase db push) and confirm every table appears in the Supabase dashboard Table Editor.

Report back the full list of migration files created and confirm they applied to kov-staging without errors.
```

### 5.3 Agent Task — Supabase client + Auth screens
**Master Prompt**:
```
Read docs/04_ApplicationFlow.md's onboarding entry note in section 1 and section 2.1, and docs/01_ScopeDocument.md KOV-FR-001.

Task:
1. Create src/lib/supabase.ts exporting a Supabase client using import.meta.env.VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
2. Build src/features/auth/ with SignIn, SignUp, ForgotPassword, and fill in the protected-route wrapper from Step 4 with a real Supabase Auth session check (email/password + email verification enabled).
3. States: idle/submitting (inline spinner on the button, inputs disabled)/error (InlineError for server errors, field-level inline text for validation)/success, verification-required screen, redirect-to-intended-route-after-auth for deep links, and auto-redirect to Onboarding if profiles.onboarding_complete is false, or Home if true.
4. Handle offline/slow-network explicitly on Sign In/Sign Up using the Step 3 primitives (useOnlineStatus, apiClient.ts) — disable submit with an explanatory message when offline, graceful timeout+retry on slow connections.
5. Style every screen using the Step 2 component library and Step 1 theme tokens.
6. Add a src/hooks/useAuth.ts hook exposing current user/session state app-wide.

Report back which files were created and confirm sign-up, email verification, sign-in, and sign-out all work end-to-end against the real kov-staging Supabase project.
```

### 5.4 Agent Task — account deletion Edge Function
**Master Prompt**:
```
Read docs/01_ScopeDocument.md KOV-FR-001 and KOV-FR-020, and docs/04_ApplicationFlow.md section 2.20 (Profil screen's account deletion state description).

Task:
1. Build a supabase/functions/delete-account Edge Function using the service-role key: given the authenticated caller's user id, delete every owner-scoped row across every table listed in docs/05_DataModel.md section 1 (profiles, businesses, employees, price_items, technical_sheets, clients, quotes, quote_lines, quote_versions, quote_events, projects, project_costs, project_updates, change_orders, invoices, dunning_events, orders, order_lines, journal, documents, ai_runs, agent_action_plans, financing_simulations, accounting_exports, migration_imports), all associated Supabase Storage files, then the auth.users row itself — in that order, inside a single logical operation with clear error handling if any step fails partway (report exactly what was and wasn't deleted rather than leaving an ambiguous partial state).
2. This function must only ever act on the calling user's own id (extracted from their verified JWT), never a client-supplied id parameter — this is a hard security requirement, not optional.

Report back confirming a test account's full deletion removes rows from every listed table (verify by querying the database directly, not just trusting the UI).
```

### 5.5 Testing (do not proceed to Step 6 until every item below passes)
1. **Sign-up flow**: create a real test account, confirm the verification email arrives, click it, land on Onboarding.
2. **Cross-device session**: sign in on a second browser/incognito window with the same account — confirm the same (empty) profile state.
3. **RLS cross-owner test** (critical, KOV-FR-003 acceptance criterion): create a second test account. Create data as Owner A (e.g. a client row), sign out, sign in as Owner B, confirm Owner B's queries return zero rows of Owner A's data, across at minimum `clients`, `quotes`, `journal`, and `ai_runs`.
4. **Service role key check**: `npm run build`, then grep `dist/assets/*.js` for the literal `SUPABASE_SERVICE_ROLE_KEY` value and for the raw Anthropic key value — neither must appear anywhere in client-shipped code.
5. **Password reset**: trigger it, confirm the email arrives, confirm the link works and expires appropriately.
6. **Account deletion**: run the delete-account function against a disposable test account, confirm rows are gone from every table by querying directly.

### 5.6 References
`05_DataModel.md` (full). `04_ApplicationFlow.md` §1, §2.1, §2.20. `01_ScopeDocument.md` §3 (architecture principles), KOV-FR-001/003/020. `02_ThemeGuideline.md` §6.3 (Inputs — Sign In/Sign Up forms), §6.1 (Buttons) — auth screens are built from the Step 2 component library per the standing rule above, not a new visual pass.

---

## STEP 6 — Onboarding & Business Settings (Single Unified Flow)

### 6.1 Purpose
Build the ONE onboarding state machine — module 6.1 of the Cahier. This step explicitly targets and avoids the "duplicate onboarding" defect.

> **Defect call-out (do not reproduce)**: the prototype has two onboarding flows with different storage keys. Build exactly one flow, one persisted progress record, no parallel path. See `01_ScopeDocument.md` §9.

### 6.2 Agent Task — Master Prompt
```
Read docs/04_ApplicationFlow.md section 2.1 (Onboarding) in full, docs/01_ScopeDocument.md section 5.1 (module 6.1 detail) and section 9's "duplicate onboarding" defect entry, and docs/05_DataModel.md sections 2.1 and 2.2 (profiles, businesses).

Task:
1. Build the full onboarding flow (src/features/onboarding/) as a SINGLE state machine with exactly the steps described in docs/04_ApplicationFlow.md section 2.1: trade selection, team size (solo/équipe), business information form (raison sociale, SIREN, address, phone, email, default VAT rate, legal mentions).
2. Persist progress to the profiles/businesses tables after EACH step completes (profiles.onboarding_step increments, relevant business fields save) — a refresh mid-flow must resume at the correct step, never restart and never fork into a second parallel flow. There must be exactly one code path that can start onboarding, reachable exactly one way (redirected to automatically when profiles.onboarding_complete is false) — explicitly verify there is no second, forgotten entry point before reporting done.
3. The trade selection determines which price-library seed set gets applied in Step 7 (price library) — for now, just persist the chosen trade value (profiles.trade) correctly; the actual pre-fill logic is built in Step 7.2, which wires itself into this onboarding-completion step (item 6 below) once it exists.
4. Team-size selection sets profiles.team_mode, which later determines whether Planning (Step 13.4) is fully active.
5. Each step's "Continuer" button shows an inline saving spinner (Step 3 pattern) while the per-step persist call runs. If the save fails (offline/timeout via apiClient.ts), show an inline retry and do NOT advance to the next step until the save succeeds — onboarding progress must never be silently lost.
6. On final step completion, set businesses.legal_fields_complete and profiles.onboarding_complete to true and redirect to Home.
7. Build a route at /profile/business (s-entreprise) reusing the exact same field components, allowing post-onboarding edits at any time, with the same inline-save/error handling.

Report back and confirm: profile/business data round-trips correctly (create, refresh mid-onboarding, resume at the correct step, complete, edit later from /profile/business), and confirm there is exactly one onboarding entry point in the code (search the codebase and show me every place that can navigate to /onboarding — there should be exactly one: the post-auth redirect-when-incomplete check).
```

### 6.3 Testing
1. Complete onboarding fully with a test account.
2. Refresh mid-way through — confirm it resumes at the correct step, not step 0 and not a different/duplicate flow.
3. Go offline mid-step — confirm it blocks advancing with a clear message rather than losing data.
4. Search the built codebase for any second onboarding entry point or storage key — confirm none exists.
5. Edit business settings post-onboarding from `/profile/business` — confirm changes persist and `legal_fields_complete` re-validates correctly if a required field is cleared.

### 6.4 References
`04_ApplicationFlow.md` §2.1. `05_DataModel.md` §2.1, §2.2. `01_ScopeDocument.md` §5.1, §9 (duplicate-onboarding defect), KOV-FR-002. `02_ThemeGuideline.md` §6.3 (Inputs), §6.1 (Buttons — the "Continuer" primary CTA), §1 (design philosophy — onboarding is the artisan's first impression of the field-ready premium register).

---

## STEP 7 — Price Library, Clients, and Employees (Manual CRUD, No AI Yet)

### 7.1 Purpose
Build every manual, non-AI data-entry path first — price library, client directory, employee roster — so the app is fully usable and testable before the quote engine (which depends on all three) and AI layer are built on top.

### 7.2 Agent Task — Price library + technical sheets
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.16 (module 6.16 detail) and KOV-FR-004, and docs/05_DataModel.md sections 2.4 and 2.5 (price_items, technical_sheets).

Task:
1. Build src/features/price-library/ (route /profile/price-library, s-tarifs) — list, search, create, edit, deactivate (soft delete via active=false, never a hard delete) for price_items: label, unit, purchase_price, sale_price, default_vat_rate, category, is_supply.
2. Build a seed dataset for the plumbing-heating trade (per docs/01_ScopeDocument.md's persona Martin Da Silva and the module 6.6 example reference data) — at minimum 15-20 realistic price_items rows covering common plumbing/heating works (e.g. receveur douche, WC suspendu, chauffe-eau, radiateurs, tuyauterie, main d'oeuvre per hour) with realistic purchase/sale prices — this seed applies automatically when a new business completes onboarding with trade='plomberie_chauffage' (wire this into the Step 6 onboarding completion step).
3. Build src/features/technical-sheets/ (route /profile/technical-sheets, s-fiches) — browsable, filterable list, each optionally linked to a price_items row, create/edit.
4. States: list-row skeleton on load, empty state ("Ta bibliothèque est vide" for price library, "Aucune fiche technique pour l'instant" for sheets) with add-CTA, inline error+retry on failed loads.

Report back confirming full CRUD works and persists per-owner (test with two accounts, confirm isolation), and confirm the plumbing-heating seed data applies automatically on onboarding completion.
```

### 7.3 Agent Task — Clients
**Master Prompt**:
```
Read docs/04_ApplicationFlow.md sections 2.6 and 2.7 (Clients list + client record) in full, docs/01_ScopeDocument.md section 5.3 (module 6.3 detail) and KOV-FR-005, and docs/05_DataModel.md section 2.6 (clients).

Task:
1. Build src/features/clients/ — the list view (route /clients, s-clients) with real-time search by name/city, and the detail record (route /clients/:id, s-fiche-detail) with all sections from docs/04_ApplicationFlow.md section 2.7: contact details (editable), indicators (cumulative revenue and chantier count — these will show zero/empty until Steps 8-9 populate real quotes/projects, that's expected and correct at this stage), documents (upload affordance, wire actual storage in this step using Supabase Storage per docs/05_DataModel.md section 2.20), internal notes (free text + tagging, dictation wiring deferred to a later step), work history (will populate once quotes exist).
2. The main courante section of the client record and the standalone Messages screen are explicitly NOT built in this step — they depend on the journal table being fed by real events from quotes/invoices/dunning/agent actions, which don't exist yet. Leave a clearly labeled placeholder ("La main courante apparaîtra ici" style empty state) rather than building a fake/disconnected version now.
3. Archive action: confirm-modal, sets clients.status='archived', removes from default list search, and explicitly verify (write a test for this) that archiving never deletes or orphans any linked quote/invoice/project row.
4. Email/phone format validation on save.
5. States per docs/04_ApplicationFlow.md section 2.6/2.7: list-row skeleton, empty state with add-CTA, profile-header + tabbed-section skeleton on record load, per-section empty states as described.

Report back confirming full client CRUD, search, and archive (with the no-cascade-delete verification) work correctly and persist per-owner.
```

### 7.4 Agent Task — Employees (for planning)
**Master Prompt**:
```
Read docs/05_DataModel.md section 2.3 (employees) and docs/01_ScopeDocument.md section 5.10 (module 6.10 detail — team mode).

Task:
1. Build a simple employee roster CRUD, reachable from business settings (/profile/business or a small /profile/team sub-section) — name, role, active toggle. This is intentionally lightweight per docs/05_DataModel.md's design note: employees are named resources for planning assignment, not separate authenticated users.
2. This roster will be consumed by Planning (Step 13.4) for chantier assignment and conflict detection — for now just build the CRUD and confirm it persists per-owner.

Report back confirming employee CRUD works and is scoped correctly per owner.
```

### 7.5 Testing
1. Add/edit/deactivate price-library items; confirm the plumbing-heating seed applied on a fresh test account's onboarding completion.
2. Add/edit/archive clients; confirm archived clients disappear from default search but their (currently nonexistent, until later steps) linked records would not be affected.
3. Add/edit employees; confirm they persist per-owner.
4. Two-account isolation re-check on all three new table groups (repeat the RLS test pattern from 5.5.3).
5. Load each list screen on a fresh account with zero rows — confirm the correct empty state, not a blank screen.

### 7.6 References
`04_ApplicationFlow.md` §2.6, §2.7. `05_DataModel.md` §2.3, §2.4, §2.5, §2.6. `01_ScopeDocument.md` §5.3, §5.16, §5.10, KOV-FR-004/005. `02_ThemeGuideline.md` §6.2 (Cards — client list rows, price-library rows), §6.10 (journal timeline component, for the client record's main courante placeholder built here).

---

## STEP 8 — Quote Editor, Deterministic Calculation Engine & Margin Box

### 8.1 Purpose
This is the commercial core of the product: the four-step quote flow, the deterministic totals/VAT/margin calculation engine (with mandatory test fixtures), and the live margin box. Get this exactly right — chantier profitability (Step 10) and invoicing (Step 11) both depend on it.

> **Gate**: do not start Step 9 until every calculation test fixture in 8.5 passes. A rounding bug here propagates into every quote, invoice, and profitability figure downstream.

### 8.2 Agent Task — Deterministic calculation engine (build and test FIRST, before any UI)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md KOV-FR-007 in full and docs/06_AIPromptRegistry.md section 3.1 (quote-totals-calc) and section 3.2 (margin-tier-calc) before writing any UI code.

Task:
1. Build a pure, framework-independent TypeScript module at src/lib/calc/quoteTotals.ts implementing quote-totals-calc exactly per docs/06_AIPromptRegistry.md section 3.1: given an array of {quantity, unit_price, purchase_price}, compute subtotal_ht (sum of quantity*unit_price per line, no per-line rounding), apply a given vat_rate to compute total_ttc, and compute projected_margin_pct from summed (sale_price - purchase_price) vs subtotal. Use banker's rounding (round-half-to-even) to two decimal places ONLY at the final total — never round intermediate per-line values.
2. Build src/lib/calc/marginTier.ts implementing margin-tier-calc exactly per docs/06_AIPromptRegistry.md section 3.2: given a margin percentage, return the correct tier ('green' >30%, 'steelBlue' >20%, 'gold' >10% AND for the 0-10% band per the note in that section, 'red' <=0%) plus the matching color tokens and advisory copy from docs/02_ThemeGuideline.md section 2.4. IMPORTANT naming note: the third tier's color is GOLD (`--gold-500`, `#C8A96E`), not orange/amber — do not use an orange-hued swatch for this tier; that hue is reserved exclusively for urgency/dunning contexts elsewhere in the app (see docs/02_ThemeGuideline.md section 2.4's naming note).
3. Write vitest unit tests at src/lib/calc/quoteTotals.test.ts covering: (a) one fixture per VAT rate — 0%, 5.5%, 10%, 20% — with hand-verified expected totals, (b) at least two rounding-boundary fixtures (e.g. a subtotal that lands exactly on a .005 boundary, and one with a repeating-decimal per-unit price like 1/3), (c) a zero-line-item quote, (d) a negative-margin fixture (purchase price exceeds sale price on a line), (e) a fixture crossing each margin tier boundary exactly (a quote whose margin is precisely 30.00%, 20.00%, 10.00%, and 0.00%, confirming which side of each boundary lands in which tier per the ">"/"<=" semantics in docs/02_ThemeGuideline.md section 2.4).
4. These two modules must have ZERO dependency on React, Supabase, or Claude — they are pure functions, unit-testable in complete isolation, callable identically from the frontend (for live UI feedback as the artisan types) and from a server-side Edge Function (for the authoritative persisted calculation) — this dual-use is intentional and required, so structure the module with that in mind (no browser-only or Node-only APIs).

Report back with the full test suite output (all passing) before writing any quote editor UI.
```

### 8.3 Agent Task — Quote editor UI (4-step flow) + margin box wiring
**Master Prompt**:
```
Read docs/04_ApplicationFlow.md section 2.5 (Quote editor, 4-step flow) in full, docs/02_ThemeGuideline.md section 6.6 (margin box component spec), and docs/05_DataModel.md sections 2.7, 2.8, 2.9, 2.10 (quotes, quote_lines, quote_versions, quote_events). Also read docs/01_ScopeDocument.md's PDF-selector defect entry in section 9 — you are not building the PDF yet (that's Step 9), but the data model you build here (persisted quote_lines, not transient component state) is what makes that later fix possible, so make sure quote line data is genuinely persisted to Supabase as the artisan edits, not just held in local React state until some later "save."

Task:
1. Build src/features/quotes/ implementing the exact four-step flow from docs/04_ApplicationFlow.md section 2.5: Client (select existing or create inline) -> Travaux (free-text description entry; leave the "Assister avec l'IA" button present but disabled/TODO for now, real wiring is Step 9) -> Devis (line-item editor: add from price library or free entry, quantity/unit/unit_price/purchase_price per line, drag-reorder, delete) -> Envoyer (review screen matching what the eventual PDF will show, VAT selector with correct legal mention per docs/01_ScopeDocument.md section 5.4's mention table).
2. Wire the MarginBox component (built in Step 2) live in the Devis step, recalculating via src/lib/calc/quoteTotals.ts and src/lib/calc/marginTier.ts on every line edit (debounced appropriately for typing, but the persisted quote_lines rows themselves should save on blur/explicit field-commit, not on every keystroke).
3. Quote lines added from the price library must COPY the label/unit/sale_price/purchase_price values into the quote_lines row at add-time (the historical-copy rule, docs/05_DataModel.md section 4) — never a live join to price_items for display. Write a specific test: change a price_items.sale_price after a quote_lines row referencing it already exists, confirm the existing quote_lines row's unit_price is unchanged.
4. Implement quote statuses exactly: Draft (auto-saves on field blur, no explicit save button needed), and the transition to Issued happens only in Step 9 (PDF/issuance) — for THIS step, build the data model and UI up through a fully editable Draft quote with a working live margin box, and stub the "Émettre" button as a disabled/TODO placeholder pointing at Step 9.
5. Build the quotes list screen (docs/04_ApplicationFlow.md section 2.4, s-devis) — paginated, search/filter by client and status, status badges per docs/02_ThemeGuideline.md section 6.7.
6. States per docs/04_ApplicationFlow.md section 2.5 and 4: step-appropriate loading/empty/error states, inline saving indicators on field commit, offline handling (block advancing steps with a clear message if a save fails while offline).

Report back and confirm: creating a full draft quote (client, multiple lines from both price-library and free entry, VAT selection) persists correctly to Supabase (not just local state), the margin box updates live and shows the correct tier color/copy at each of the four boundary cases, and the historical-copy test from item 3 passes.
```

### 8.4 Agent Task — server-side calculation parity Edge Function
**Master Prompt**:
```
Read docs/01_ScopeDocument.md KOV-FR-007's "totaux affichés = instantané persisté = PDF" requirement.

Task:
Build a supabase/functions/quote-recalculate Edge Function that imports (or duplicates in a Deno-compatible way, if the shared module can't be imported directly into the Edge runtime — research and pick whichever approach keeps the two calculation paths from ever drifting apart) the exact same src/lib/calc/quoteTotals.ts logic, callable to authoritatively recompute and persist a quote's subtotal_ht/total_ttc/projected_margin_pct columns on the quotes table whenever its lines change. This is the authoritative server-side figure that Step 9's PDF/issuance step will read from — the frontend's live margin box (built in 8.3) is for instant UI feedback only, but this server-side recalculation is what actually gets persisted and is what the PDF must ultimately match exactly.

Report back confirming a test quote's Edge-Function-computed totals match its frontend-computed totals exactly, for every VAT-rate test fixture from 8.2.
```

### 8.5 Testing
1. Run the full vitest suite from 8.2 — every fixture passes, including all four VAT rates and all rounding/boundary cases.
2. Create a draft quote with several lines, confirm it persists to Supabase (verify directly in the Table Editor, not just trusting the UI).
3. Edit lines and confirm the margin box updates live and shows the correct color/copy at each tier boundary (test a quote landing at exactly 30%, 20%, 10%, and 0% margin).
4. Change a price-library item's sale price after it's already used in an existing quote line — confirm the existing quote line is unaffected (historical-copy rule).
5. Confirm the frontend-computed and server-Edge-Function-computed totals match exactly for the same quote data.
6. Two-account isolation re-check on `quotes`/`quote_lines`.

### 8.6 References
`04_ApplicationFlow.md` §2.4, §2.5. `05_DataModel.md` §2.7, §2.8, §4 (historical-copy rule). `06_AIPromptRegistry.md` §3.1, §3.2. `02_ThemeGuideline.md` §6.6, §2.4. `01_ScopeDocument.md` §5.4, KOV-FR-004/006/007.

---

## STEP 9 — AI-Assisted Quote Drafting, PDF Generation & Issuance/Acceptance

### 9.1 Purpose
Layer AI-assisted line drafting onto the quote editor, then build real server-side PDF generation from the persisted quote snapshot, and the issuance/acceptance flow. This is the step that directly fixes two named defects.

> **Defect call-outs (do not reproduce), both apply directly in this step:**
> - **PDF-selector mismatch**: the PDF must be generated from the persisted `quote_versions.snapshot`, never from live DOM state or `window.print()`. See `01_ScopeDocument.md` §9.
> - **Non-probative signature sold as legal**: the canvas acceptance mark must be labeled **"Acceptation du devis,"** never "Signature." See `01_ScopeDocument.md` §9 and `04_ApplicationFlow.md` §2.23.

### 9.2 Agent Task — Secure server-side Claude pipeline for quote drafting
**Master Prompt**:
```
Read docs/06_AIPromptRegistry.md sections 1 and 2.1 in full, and docs/01_ScopeDocument.md KOV-FR-008.

Task:
1. Create a Supabase Edge Function supabase/functions/quote-draft-assist implementing the exact contract from docs/06_AIPromptRegistry.md section 2.1 — server-owned prompt, structured JSON output via Claude's tool-use/structured-output feature (never free-text parsing), Zod-validated response schema, per-owner rate limiting, minimized/scoped input context (only the owner's ACTIVE price_items, never another owner's catalogue, never inactive items).
2. Implement every guardrail listed in section 2.1: validate every returned catalogue_item_id against the actual set of active_catalogue ids that were sent, stripping/rejecting any hallucinated id server-side before the response ever reaches the client; the response schema must have NO field capable of carrying a price, total, or margin figure at all (verify this by re-reading your own Zod schema before reporting done); if catalogue_item_id is null, needs_clarification must be true.
3. Record every call on the ai_runs table (docs/05_DataModel.md section 2.21) with redacted input/output summaries, cost, duration, prompt_version, idempotency_key.
4. Reject any client-supplied "system prompt" or max_tokens override — hard requirement.

Report back with the Edge Function created, confirm the Zod output schema has no price/total/margin field, and confirm a manual test call with a realistic plumbing-related description returns a structured response referencing only real seeded price_items ids or null.
```

### 9.3 Agent Task — wire AI assist into the quote editor's Travaux step
**Master Prompt**:
```
Read docs/04_ApplicationFlow.md section 2.5's Step 2 (Travaux) description and docs/01_ScopeDocument.md KOV-FR-008's acceptance criteria.

Task:
1. Enable the "Assister avec l'IA" button (stubbed in Step 8) in the quote editor's Travaux step, calling supabase/functions/quote-draft-assist (via apiClient.ts) with the free-text description and the owner's active price-library.
2. Show a "Kōv réfléchit..." inline loading state while the call is in flight (not a frozen screen) — the manual line-entry path in the following Devis step must remain fully usable regardless of this call's state.
3. Render proposed_lines as a reviewable list — each with its matched label, confidence, and an "Ajouter" action; needs_clarification lines show the clarification_questions inline and are visually distinguished (not silently added as priced lines). Nothing is written to quote_lines automatically — the artisan must explicitly apply each line (or an "Ajouter tout" bulk action), matching KOV-FR-008's "l'artisan revoit et applique explicitement."
4. When a proposed line is applied, its resulting quote_lines row gets its unit_price/purchase_price populated from the MATCHED price_items row (never from the AI's text output, which never contained a price field to begin with) — for a null-matched (needs_clarification) line, the artisan fills in the price manually.
5. Simulate an AI outage (temporarily point the Edge Function at an invalid Anthropic key, or otherwise force a failure) and confirm the manual line-entry path in the Devis step works with zero degradation — this is the literal test for KOV-FR-008's "en cas de panne IA, l'éditeur manuel reste pleinement utilisable."

Report back with a test transcript: paste in a realistic plumbing job description, show the resulting proposed_lines, confirm applying them creates correct quote_lines rows with real prices from the matched catalogue, and confirm the AI-outage test passed.
```

### 9.4 Agent Task — Server-side PDF generation from the persisted snapshot
**Master Prompt**:
```
Read docs/01_ScopeDocument.md's PDF-selector defect entry in section 9 (do NOT reproduce it) and KOV-FR-009/KOV-FR-010, and docs/05_DataModel.md section 2.9 (quote_versions).

Task:
1. On "Émettre le devis" (the issuance action, previously stubbed in Step 8), build a supabase/functions/quote-issue Edge Function that: (a) calls the Step 8.4 quote-recalculate logic one final time to get authoritative totals, (b) builds a complete snapshot object (client info, business info, every line, totals, VAT rate and legal mention, issued timestamp) — this snapshot is EVERYTHING the PDF needs, with nothing fetched live at render time, (c) computes a content hash of the snapshot, (d) inserts a new quote_versions row with this snapshot + hash (incrementing version_number if a prior version exists for this quote), (e) sets quotes.status='issued' and quotes.current_version_id to the new version, (f) generates the actual PDF file using the library chosen in Step 0.5, reading EXCLUSIVELY from the persisted snapshot object just inserted — never from live quotes/quote_lines state, never from any DOM rendering — and stores it via Supabase Storage, recording it in the documents table and linking it back to quote_versions.pdf_document_id.
2. This is the direct fix for the known defect where the prototype's PDF generator queried a different selector than the live editor rendered — by construction, this new implementation cannot suffer that defect, because the PDF generator never touches "live" state of any kind, only the frozen snapshot.
3. Write a test that deliberately mutates quote_lines AFTER issuance (simulating what would happen if someone tried to edit an issued quote in place) and confirms the already-generated PDF and the already-stored quote_versions.snapshot are completely unaffected — this proves immutability.
4. Build the read-only issued-quote view (docs/04_ApplicationFlow.md section 2.5's "Issued/Accepted/Declined/Expired" state) showing the quote exactly as the PDF shows it, plus a PDF download action restricted to the owner (KOV-FR-009's "téléchargement réservé au propriétaire" — verify via RLS/signed-URL scoping, not just a UI-hidden button). This view needs its own skeleton (sized to the eventual quote-detail layout) on load and inline-error+retry if the fetch fails.
5. Implement the edit-after-issuance rule: attempting to edit an issued/accepted/declined quote opens a NEW draft copy rather than mutating the frozen one; issuing that copy creates version_number+1 against the same quotes.id (KOV-FR-006/010).
6. Build the "Émettre le devis" loading state exactly per docs/02_ThemeGuideline.md section 9.2's "Quote PDF generation moment": the button enters a disabled/loading state immediately, the 900ms-1.4s document-fold animation is TIED to the real server response (never a fixed timer padded to look impressive, and never shorter than the response actually takes — if the Edge Function is still running past the animation's natural length, hold on a subtle looping variant, per the theme doc's exact instruction), and the checkmark only draws in once the PDF is genuinely confirmed stored. If the Edge Function call fails (network error, timeout, storage failure), show an inline error with a retry action directly on the quote editor's Envoyer step — the quote must remain in Draft status and re-issuable, never left in an ambiguous half-issued state.
7. Handle offline explicitly on the "Émettre le devis" action via useOnlineStatus (Step 3): disable the button with an explanatory message rather than letting the artisan tap it and appear to hang.

Report back confirming: an issued quote's PDF is byte-for-byte consistent with its quote_versions.snapshot content on every re-download, the post-issuance-mutation immunity test passes, creating a second version via the edit-then-reissue path correctly produces version_number=2 while version 1's PDF remains unchanged and separately downloadable, the issuance loading/success/error/offline states all work correctly (test by simulating a failed Edge Function call and confirming the quote stays in Draft, retryable), and the document-fold animation duration genuinely tracks the real server response rather than a fixed timer.
```

### 9.5 Agent Task — Acceptance flow ("Acceptation du devis," never "Signature")
**Master Prompt**:
```
Read docs/04_ApplicationFlow.md section 2.23 (s-sign support screen) and docs/01_ScopeDocument.md's "signature not legally probative" defect entry in section 9, and docs/05_DataModel.md section 2.10 (quote_events).

Task:
1. Build the acceptance UI reachable from an issued quote's view. Every UI label, button, and confirmation copy MUST read "Acceptation du devis" or equivalent ("Accepter ce devis," "Devis accepté") — the word "signature" (and any visual/legal framing implying a legally binding electronic signature) must not appear anywhere in this flow's copy or component names for the canvas-mark path.
2. Build path (a): manual acceptance recording — the artisan marks the quote Accepted (or Declined) themselves after receiving confirmation by phone/in person/email, optionally with a canvas finger-drawn acknowledgment mark. Recording this creates a quote_events row with event_type='accepted' (or 'declined') and acceptance_method='canvas_mark' if a mark was drawn, or null if it's a purely manual status change with a note.
3. Build path (b) as a clearly separate, distinctly labeled capability: a real e-signature integration entry point (acceptance_method='esignature') — for this build pass, implement it as a clearly scoped placeholder/integration point (research and note in your report which real e-signature provider — e.g. Yousign, given it's a French-market-focused e-signature provider — would be the natural fit, but do not fabricate a fake signature flow; if a real integration isn't being wired in this pass, the UI must clearly state "Signature électronique — bientôt disponible" rather than pretending to offer one).
4. A quote_events row with event_type='accepted' must always reference an ISSUED quotes.current_version_id — enforce this in application logic, and write a test confirming a quote still in Draft status cannot be marked Accepted.
5. Update quotes.status to 'accepted'/'declined' accordingly, unlocking the quote-to-chantier conversion action (built in Step 10) only once status='accepted'.

Report back confirming: the acceptance flow's UI copy contains no instance of "signature" being applied to the canvas-mark path, the accepted-must-reference-issued-version test passes, and a Draft quote correctly cannot be marked Accepted.
```

### 9.6 Testing
1. Draft a quote, use AI-assist with a realistic description, confirm proposed lines reference real catalogue ids or null, apply them, confirm resulting quote_lines have correct real prices (never AI-authored prices).
2. Break the Anthropic key temporarily — confirm the manual quote editor path still works with zero degradation.
3. Issue a quote — confirm a `quote_versions` row is created with a complete snapshot and hash, confirm the generated PDF exactly matches that snapshot's content.
4. Attempt to mutate `quote_lines` after issuance — confirm the stored PDF/snapshot are unaffected.
5. Edit-then-reissue an already-issued quote — confirm version_number increments and the original version's PDF is untouched.
6. Run the acceptance flow — confirm no "signature" language appears for the canvas-mark path, confirm a Draft quote cannot be marked Accepted, confirm an Accepted event always references an Issued version.
7. Confirm PDF download is genuinely restricted to the owner (attempt access as a second test account, confirm denial).
8. Force the quote-issue Edge Function to fail (break the endpoint temporarily) and confirm: the quote stays in Draft, an inline error+retry appears on the Envoyer step, and retrying after fixing the endpoint successfully issues the quote with no duplicate/orphan `quote_versions` row.
9. Go offline (DevTools) and tap "Émettre le devis" — confirm it's disabled with an explanatory message rather than appearing to hang or silently failing.

### 9.7 References
`06_AIPromptRegistry.md` §1, §2.1. `04_ApplicationFlow.md` §2.5, §2.23. `05_DataModel.md` §2.9, §2.10, §2.20. `01_ScopeDocument.md` §9 (both defects), KOV-FR-006/008/009/010. `02_ThemeGuideline.md` §9.2 (the PDF-generation "document assembling" signature motion moment) and §6.6 (margin box, live in the Devis step this connects to).

---

## STEP 10 — Quote-to-Chantier Conversion & Real Profitability

### 10.1 Purpose
Build the idempotent quote→chantier conversion, then the real-cost persistence and profitability calculation that makes module 6.9's "Ce que ce chantier te rapporte" block real, not a demo.

### 10.2 Agent Task — Idempotent conversion
**Master Prompt**:
```
Read docs/01_ScopeDocument.md KOV-FR-011 in full and docs/05_DataModel.md section 2.11 (projects).

Task:
1. Build a "Créer le chantier" action on an Accepted quote's view, calling a supabase/functions/quote-to-project Edge Function (or equivalent server-side logic) that: checks quotes.status='accepted' (reject otherwise), checks whether a projects row already exists with source_quote_id equal to this quote's id (the unique constraint from docs/05_DataModel.md section 2.11 enforces this at the DB level too — rely on both the check and the constraint, don't rely on only one), and either creates a new projects row (copying client_id, planned_value_ttc and planned_margin_pct from the accepted quote_version's snapshot, status='planned') or, if one already exists, simply returns the existing row rather than erroring or duplicating.
2. Write a test that calls this conversion twice in a row against the same quote and confirms exactly one projects row exists after both calls, with the second call returning the same row's id as the first.
3. The source quote must remain linked (projects.source_quote_id) and effectively read-only from this point on (its status stays 'accepted', never reverts).

Report back confirming the idempotency test passes and a real chantier record is created with correct carried-over values.
```

### 10.3 Agent Task — Real cost persistence + profitability calculation
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.9 (module 6.9 full detail) and KOV-FR-012, docs/05_DataModel.md section 2.12 (project_costs), and docs/06_AIPromptRegistry.md section 3.3 (project-profitability-calc).

Task:
1. Build src/features/projects/ (route /projects/:id, s-chantier) — status (Planned/In progress/Awaiting payment/Closed, editable), dates, chronological notes list (project_updates will feed this fully in Step 13.2; for now build the display shell reading whatever exists).
2. Build a cost-entry UI allowing the artisan to log project_costs rows: supply costs (amount), labor hours (hours, defaulting hourly_rate to 38 per docs/01_ScopeDocument.md section 5.9, editable per business), and misc costs — each with a description and incurred_at date.
3. Build src/lib/calc/projectProfitability.ts implementing project-profitability-calc exactly per docs/06_AIPromptRegistry.md section 3.3: real margin (billed to client minus supplies minus labor-hours*rate minus misc), the gap in points versus quotes.planned_margin_pct, and the "what ate the margin" breakdown grouped by cost category with each item's reason/description and cost. This must read exclusively from persisted project_costs rows — never a placeholder/demo figure (KOV-FR-012 hard requirement) — write a test confirming a chantier with zero project_costs rows shows real margin equal to planned margin (no phantom overrun), and a chantier with a specific set of cost rows produces the exact hand-calculated gap.
4. Wire the MarginBox component's "extended" variant (built in Step 2) into this screen exactly per docs/02_ThemeGuideline.md section 6.6's chantier variant: real-margin headline, planned-margin secondary figure, gap in points, progress bar with planned-position marker, and the "Il te reste X € une fois tout payé" key phrase computed from planned_value_ttc minus total real costs.
5. Play the chantier-profitability-reveal motion moment (docs/02_ThemeGuideline.md section 9.2) the first time this screen's real data loads in a session — headline figure counts up/down, planned marker slides in, overrun list staggers in.

Report back confirming: cost entries persist and are scoped per-owner, the profitability calculation matches hand-verified fixtures, the MarginBox extended variant renders correctly with real data, and the zero-costs-equals-planned-margin test passes.
```

### 10.4 Agent Task — Change-order (avenant) generation
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.9's "génération d'avenant" description and docs/05_DataModel.md section 2.14 (change_orders).

Task:
1. Build a "Générer un avenant" action on the chantier screen, visible whenever real overruns exist against the plan (i.e. the profitability calculation from 10.3 shows a negative gap with at least one cost-category overrun).
2. On tap, create a change_orders draft row whose `lines` field is pre-filled with quote-line-shaped entries derived directly from the overrun breakdown (e.g. an overrun in labor hours becomes a proposed additional labor line at the business's standard rate; an overrun in supplies becomes a proposed additional supply line at its real cost plus the business's normal markup) — these are editable before send, never auto-sent.
3. Sending a change order creates a real supplementary quotes row (linked via change_orders.resulting_quote_id) using the SAME quote creation/issuance pipeline built in Steps 8-9 — do not build a second, parallel quote-creation code path for avenants; reuse the existing one so avenants get the same deterministic calculation, versioning, and PDF generation guarantees as any other quote.

Report back confirming a test chantier with real overruns produces a sensible pre-filled avenant, and that sending it produces a real, correctly-calculated, versioned quote using the existing quote pipeline.
```

### 10.5 Testing
1. Convert an accepted quote to a chantier twice — confirm exactly one `projects` row exists both times.
2. Log several `project_costs` rows against a test chantier, confirm the profitability calculation matches a hand-verified fixture.
3. Confirm a chantier with zero costs shows real margin = planned margin.
4. Generate an avenant against a chantier with real overruns, confirm the pre-filled lines are sensible, confirm sending it produces a real versioned quote through the existing pipeline (not a separate one).
5. Two-account isolation re-check on `projects`, `project_costs`, `change_orders`.

### 10.6 References
`01_ScopeDocument.md` §5.9, KOV-FR-011/012. `05_DataModel.md` §2.11, §2.12, §2.14. `06_AIPromptRegistry.md` §3.3. `02_ThemeGuideline.md` §6.6, §9.2.

---

## STEP 11 — Invoicing & Unpaid-Invoice Dunning (Three-Level Escalation)

### 11.1 Purpose
Build invoicing from a quote/chantier, then the unpaid-invoices tracking and three-level dunning escalation — a named major differentiator (Cahier: "l'impayé est la douleur numéro un").

### 11.2 Agent Task — Invoicing
**Master Prompt**:
```
Read docs/04_ApplicationFlow.md sections 2.11 and 3.2 (mo-facture) in full, docs/01_ScopeDocument.md section 5.7 (module 6.7 detail), and docs/05_DataModel.md section 2.15 (invoices).

Task:
1. Build the mo-facture modal (invoice creation) reachable from a quote or chantier's "Facturer" action: invoice-type selection (acompte 30% / situation 40% / solde / totalité, each computed and shown in euros from the source quote's total_ttc), payment-term selection (à réception / 15 jours / 30 jours).
2. On create, insert an invoices row with automatic late_penalty_mention=true and recovery_indemnity_eur=40, compute due_date from issued date + payment term.
3. Auto-feed the client's journal (main courante) on invoice creation/status change — insert a journal row with entry_type='facture', direction='outbound', linked via related_invoice_id (this is the FIRST real journal-writing code path built in this project — build it carefully and correctly, since Steps 11-14 all depend on the same automatic-feed pattern working correctly).
4. Build src/features/invoicing/ (route /invoices, s-factures) — list with status filter (draft/sent/paid/overdue/cancelled).
5. Now that real journal rows exist, go back and complete the client record's main courante section (deferred in Step 7.3) and build the JournalTimeline component's real data wiring (component itself was built in Step 2) — inbound/outbound distinction, per-entry-type icons, expand-to-full-text.

Report back confirming invoice creation works, journal auto-feed produces correct rows, and the client record's main courante section now shows real, correctly-ordered entries.
```

### 11.3 Agent Task — Unpaid invoices + three-level dunning
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.8 (module 6.8 detail) in full and docs/06_AIPromptRegistry.md section 3.5 (dunning-level-calc), docs/04_ApplicationFlow.md sections 2.10 and 3.3 (s-impayes, mo-relance), and docs/05_DataModel.md section 2.16 (dunning_events).

Task:
1. Build src/lib/calc/dunningLevel.ts implementing dunning-level-calc exactly per docs/06_AIPromptRegistry.md section 3.5: given an invoice's due_date and today's date, return the correct level (0 = not due, 1 = >=1 day overdue, 2 = >=15 days overdue, 3 = >=30 days overdue) per the exact thresholds in docs/01_ScopeDocument.md section 5.8's table. Write test fixtures for each threshold boundary (exactly 1 day, exactly 15 days, exactly 30 days overdue, and one day before/after each boundary).
2. Build a scheduled or on-load recalculation that updates invoices.dunning_level for all overdue invoices (a Supabase Edge Function callable on a schedule, or recalculated on each load of s-impayes — pick whichever is simpler for this stage and note your choice; a full Postgres cron-based schedule can be added in the operations-hardening step later if not done now).
3. Build src/features/unpaid/ (route /unpaid, s-impayes) — total outstanding amount and count at top, list of overdue invoices with client/amount/days-overdue/current-level badge (using the escalating badge colors from docs/02_ThemeGuideline.md section 6.4), empty state styled as a genuine positive ("Aucun impayé actuellement ✓" in success-tier color per docs/04_ApplicationFlow.md section 2.10).
4. Build the mo-relance modal: shows the PRE-WRITTEN message for the invoice's current level exactly per the subject-line examples in docs/01_ScopeDocument.md section 5.8's table (level 1 courteous, level 2 firm, level 3 formal notice mentioning the €40 recovery indemnity per art. L441-10 and recommending registered mail), fully editable before send, channel choice (SMS/email/lettre recommandée avec AR).
5. On send: create a dunning_events row (channel, full message_text as actually sent, level, sent_at), auto-feed the client's journal (entry_type='sms'|'email'|'recommande' matching the channel, direction='outbound'), using the SendGuardBanner pattern built in Step 3 for the explicit confirm-before-send step.

Report back with test results for the dunningLevel fixtures (all boundary cases correct), and confirm a full dunning send end-to-end produces a correctly recorded dunning_events row and a correctly recorded journal row.
```

### 11.4 Testing
1. Create invoices of each type from a test quote, confirm correct amounts and due dates.
2. Confirm journal auto-feed on invoice creation, and confirm the client record's main courante now displays it correctly, inbound/outbound styling included.
3. Run the `dunningLevel` boundary-fixture tests — all pass, including the exact-boundary cases.
4. Manually backdate a test invoice's due_date to trigger each of the three dunning levels in turn; confirm the correct pre-written message and correct escalating badge color appear at each level.
5. Send a dunning message on a test invoice — confirm the `dunning_events` row and the `journal` row are both created correctly, and confirm the message actually sent matches what was shown/edited in the modal (not a different template).
6. Two-account isolation re-check on `invoices`, `dunning_events`.

### 11.5 References
`04_ApplicationFlow.md` §2.10, §2.11, §3.2, §3.3. `05_DataModel.md` §2.15, §2.16, §2.19. `06_AIPromptRegistry.md` §3.5. `02_ThemeGuideline.md` §6.4, §6.10. `01_ScopeDocument.md` §5.7, §5.8, KOV-FR-013.

---

## STEP 12 — Kōv Agent (Natural-Language Understanding & Action Execution)

### 12.1 Purpose
Build the flagship differentiator: intent extraction from natural job-site language, confidence-gated disambiguation, a reviewable action plan, individually removable/editable steps, and execution that auto-logs to the main courante. This step depends completely on Steps 8-11's real data (quotes, invoices, dunning, journal) already existing — the agent has nothing meaningful to act on otherwise.

> **Gate**: do not proceed to Step 13 until the "no send without validation" test (12.5.4) and the confidence-threshold disambiguation test (12.5.2) both pass. These are the two guarantees the entire module's trust depends on.

### 12.2 Agent Task — Intent extraction Edge Function
**Master Prompt**:
```
Read docs/06_AIPromptRegistry.md section 2.2 (agent-intent-extract) in full and docs/01_ScopeDocument.md section 5.5 (module 6.5 full detail) and KOV-FR-014.

Task:
1. Build supabase/functions/agent-intent-extract implementing the exact contract in docs/06_AIPromptRegistry.md section 2.2: server-owned, structured output, the ~15 intents listed exactly (rapport_termine, paiement_recu, relance, impayes, conflit_planning, livraison, commande, journee, semaine, marge, retard, absence_salarie, acompte, depense, nouveau_client, prospection), bounded recent_context (last ~60 days of clients/projects, never full history), matched_client/matched_project with independent confidence scores, and per-owner rate limiting exactly as required by docs/06_AIPromptRegistry.md section 4 (this applies across BOTH AI endpoints, not just quote-draft-assist from Step 9 — reuse the same rate-limiting utility/pattern built there rather than reimplementing it).
2. Implement the three-signal recognition approach per docs/06_AIPromptRegistry.md section 2.2's "Recognition approach" note (this is a specified mechanism from the Cahier, not left to the model's own discretion): whole-phrase pattern matching, weighted trade vocabulary, AND fuzzy client/project name matching via Levenshtein distance — implement the Levenshtein matching as its own explicit, unit-testable function (e.g. src/lib/agent/fuzzyMatchName.ts) that the Edge Function runs against the model's `name_as_understood` output, rather than relying on the model to do exact-string matching internally.
3. Implement the confidence-and-margin-over-second-place gating rule exactly per section 2.2's guardrails: an intent auto-proceeds to plan generation only when intent_confidence exceeds a server-configured threshold (start at 0.6) AND exceeds second_best_confidence by a server-configured gap (start at 0.2) — otherwise needs_disambiguation=true and three time-of-day-appropriate fallback_suggestions are populated (never an empty response).
4. Record every call on ai_runs with redacted summaries, cost, prompt_version, idempotency_key.
5. Write this call to produce a new agent_action_plans row with status='proposed' and detected_intent/matched_client_id/matched_project_id/match_confidence populated — plan_steps stays empty at this stage, populated only by the next sub-step's function.

Report back confirming the confidence-gating logic works correctly on two hand-crafted test utterances: one clearly unambiguous (should NOT trigger disambiguation) and one deliberately ambiguous (SHOULD trigger disambiguation with three sensible fallback suggestions) — AND confirming the Levenshtein fuzzy-match test: a deliberately misspelled/mis-transcribed client name in a test utterance still resolves to the correct client.
```

### 12.3 Agent Task — Plan generation + reviewable UI
**Master Prompt**:
```
Read docs/06_AIPromptRegistry.md section 2.3 (agent-plan-generate) in full and docs/04_ApplicationFlow.md section 2.9 (s-agent) and section 3.4 (mo-envoi).

Task:
1. Build supabase/functions/agent-plan-generate implementing the exact contract in docs/06_AIPromptRegistry.md section 2.3 — takes a resolved (or user-disambiguated) intent + matched client/project + bounded relevant_records, produces plan_summary + ordered steps, each send_message step carrying the COMPLETE final message_text (never a placeholder/summary), each step flagged removable.
2. Build src/features/agent/ (route /agent, s-agent) using the AgentSurface components from Step 2: the purple-gradient conversation surface, text/voice input (voice dictation wiring can reuse the same pattern that will be built for chantier reports in Step 13 — if that's not built yet, stub voice input as text-only for now and revisit after Step 13, noting this explicitly in your report), the understood-intent confirmation chip (with the "tu parles du chantier Bernard ?" disambiguation pattern when needs_disambiguation is true, showing the three fallback_suggestions as tappable chips), and the action-plan-review card.
3. Build the mo-envoi modal ("Lire le message") — opens any send_message step's full text, editable, with channel/recipient shown; edits are held in local plan-review state until the overall plan is confirmed.
4. Each step in the plan-review card has an individual remove control (per-step, not just an all-or-nothing plan). The persistent SendGuardBanner (from Step 3) reads "Rien n'est envoyé avant validation" and gates the final confirm action.
5. Do NOT build execution yet — this sub-step ends with a fully reviewable, editable, but non-executing plan UI. Execution is the next sub-step.

Report back confirming: a realistic test utterance (e.g. about a supplier delivery delay on a real seeded test chantier) produces a sensible plan with a complete, realistic message_text (not a placeholder), each step is individually removable in the UI, and "Lire le message" opens the full editable text correctly.
```

### 12.4 Agent Task — Execution with main-courante auto-logging
**Master Prompt**:
```
Read docs/06_AIPromptRegistry.md section 2.3's "Execution contract" paragraph in full and docs/01_ScopeDocument.md KOV-FR-014's acceptance criteria.

Task:
1. Implement the execution logic in application code (NOT inside the Claude call) exactly per docs/06_AIPromptRegistry.md section 2.3's execution contract: on explicit "OUI" confirm, iterate agent_action_plans.plan_steps in order, executing only steps that were not individually removed, and for any send_message step, using the ARTISAN-EDITED text if it was changed via mo-envoi, never the original model-proposed text once edited.
2. Each executed step performs its real effect: a send_message step actually sends via the chosen channel (reuse the same send infrastructure built for dunning in Step 11 where applicable — SMS/email sending should be a single shared utility, not reimplemented per feature); a log_note step writes to the relevant project's notes; an update_status step updates the relevant record.
3. Every client-facing executed step automatically inserts a journal row (entry_type='agent_message', direction='outbound', linked to the relevant client) — this is the exact "à l'exécution, chaque envoi vers un client s'inscrit automatiquement dans sa main courante" requirement from docs/01_ScopeDocument.md section 5.5.
4. Play the plan-approval sequential-reveal motion moment (docs/02_ThemeGuideline.md section 9.2) as each non-removed step executes in visible order, so the artisan can watch each action actually happen.
5. Update agent_action_plans.status to 'confirmed' (all steps executed) or 'partially_confirmed' (some steps were removed before confirm) and set executed_at.
6. Build a scheduled or on-load check that transitions any agent_action_plans row left unconfirmed past 24 hours to status='expired', no longer executable.
7. Write an automated test that constructs a plan with 3 steps, removes 1 before confirming, executes, and verifies: exactly 2 real actions occurred, exactly 2 journal rows were created (not 3), and the plan's status is 'partially_confirmed'.

Report back with the automated test's result, plus a full manual test transcript: a realistic utterance -> generated plan -> one step edited via "Lire le message" -> one step removed -> confirm -> show me the resulting journal rows and confirm the edited (not original) message text is what's recorded as sent.
```

### 12.5 Testing
1. Send a clearly unambiguous utterance mapping to a real seeded client/chantier — confirm high-confidence auto-proceed to plan generation with no disambiguation prompt.
2. Send a deliberately ambiguous/vague utterance — confirm disambiguation triggers with three sensible, time-of-day-appropriate fallback suggestions, never a dead end.
3. Generate a plan, edit one message via "Lire le message," remove a different step, confirm — verify: only the non-removed steps executed, the EDITED text (not the original) was what was actually sent/recorded, and exactly the right number of journal rows were created.
4. **Critical — no send without validation**: generate a plan and DO NOT confirm it; wait, refresh the page, navigate away and back — confirm nothing was sent and no journal rows were created; then let it sit past the expiry window (or manually trigger the expiry check) and confirm it correctly transitions to 'expired' and is no longer executable.
5. Simulate the Anthropic API being unreachable — confirm a friendly inline retry appears on the agent surface, and the artisan's typed/dictated input is never lost.
6. Two-account isolation re-check on `agent_action_plans`.

### 12.6 References
`06_AIPromptRegistry.md` §1, §2.2, §2.3. `04_ApplicationFlow.md` §2.9, §3.4. `05_DataModel.md` §2.19, §2.22. `02_ThemeGuideline.md` §6.9, §9.2. `01_ScopeDocument.md` §5.5, KOV-FR-014.

---

## STEP 13 — Remaining Modules: Reports, Journal Cross-View, Planning, Ordering, Accounting Export, Migration, Financing

### 13.1 Purpose
Build every remaining module from the Cahier's full 16-module scope — these are lighter-weight (mostly deterministic or straightforward CRUD/modal flows) but each is a named, required module. Grouped here because they can proceed largely in parallel once Steps 5-12's foundations exist, and because completing them finishes the full route map from `04_ApplicationFlow.md` §1 before the hardening/release pass begins.

### 13.2 Agent Task — Chantier reports with voice dictation (module 6.12)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.12 (module 6.12 detail) and docs/04_ApplicationFlow.md sections 3.6, 3.7, 3.8 (mo-rapport, mo-rapport-vue, mo-confirm-envoi).

Task:
1. Build src/hooks/useDictation.ts wrapping the Web Speech API, with clear permission-denied and unsupported-browser fallback states — text input always remains available regardless.
2. Build the mo-rapport modal at src/features/projects/components/ReportModal.tsx (chantier reports are project-scoped, so they live under the existing `projects/` feature folder from Step 4, not a new top-level feature): text field with dictation (mic button, pulsing rings per docs/02_ThemeGuideline.md section 9.2, steel-blue for report dictation), progress percentage input, what-was-done text. The transcript is always editable before save — never auto-submitted from speech recognition output directly.
3. On save, create a project_updates row. If the artisan opts to notify the client, proceed to mo-confirm-envoi (src/features/projects/components/ConfirmSendReportModal.tsx): preview of the exact summary SMS text, explicit confirm/cancel using the SendGuardBanner pattern.
4. On confirmed send: set project_updates.sent_to_client=true and client_sms_sent_at, auto-feed the client's journal (entry_type='rapport', direction='outbound').
5. Build mo-rapport-vue at src/features/projects/components/ReportViewModal.tsx: read-only view of a past report and, if sent, the exact SMS text that reached the client.
6. Wire this into the Home evening-list "rapport du jour" card (docs/04_ApplicationFlow.md section 2.2) so it opens mo-rapport with dictation auto-starting, per module 6.2's described behavior.
7. Now that project_updates exist, complete the chantier screen's chronological notes list (deferred/shell-only since Step 10) with real data.
8. **Close the loop deferred from Step 7.3**: the client record's internal-notes field (docs/01_ScopeDocument.md section 5.3 — "notes libres avec étiquetage et dictée vocale") was built as text-only in Step 7.3, with dictation wiring explicitly deferred to this step. Now that useDictation.ts exists, go back and wire it into that internal-notes field on the client record (docs/04_ApplicationFlow.md section 2.7) — same mic button pattern, same editable-transcript-before-save rule. Do not leave this deferred a second time.
9. **Close the loop deferred from Step 12.3**: the Kōv Agent screen's text/voice input (docs/04_ApplicationFlow.md section 2.9) may have been stubbed as text-only in Step 12.3 pending this step's useDictation.ts. If it was stubbed, go back now and wire real voice dictation into the agent input — purple/agent-accent pulsing rings while recording (per docs/02_ThemeGuideline.md section 9.2), transcript always editable before submission, dictation never auto-submitted. Confirm explicitly in your report whether Step 12.3 had already wired this (in which case just verify it works end-to-end) or whether you're wiring it now for the first time.

Report back confirming: dictation works in Chrome/Edge with a graceful fallback in unsupported contexts, a full report-then-notify-client flow produces correct project_updates and journal rows, the Home evening card correctly opens mo-rapport with dictation active, the client record's internal-notes field now has working voice dictation (test on an existing seeded client), AND the Kōv Agent screen's voice input is genuinely wired (not still a text-only stub).
```

### 13.3 Agent Task — Messages cross-client view (module 6.11, second half)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.11 (module 6.11's Messages screen behavior) and docs/04_ApplicationFlow.md section 2.13 (s-msg) and section 3.5 (mo-jr).

Task:
1. Build src/features/messages/ (route /messages, s-msg) — one thread per client, sorted by most recent journal entry, using the JournalTimeline component's row styling reused at thread-summary granularity (last entry's snippet + timestamp per client).
2. Implement the three filters exactly: Tout, Reçus (last entry direction='inbound'), Sans réponse (last entry direction='outbound' with no later inbound entry for that client — the "en attente" badge case).
3. Thread tap navigates to the client record (/clients/:id), scrolled to the main courante section.
4. Build mo-jr: opens any journal entry's full text in a read-only modal.

Report back confirming the three filters produce correct results against real seeded journal data spanning multiple clients and directions.
```

### 13.4 Agent Task — Planning and conflict detection (module 6.10, team mode)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.10 (module 6.10 full detail) in full, docs/04_ApplicationFlow.md section 2.3 (s-planning) and section 3.10 (mo-conflit), and docs/05_DataModel.md section 2.3 (employees) and section 2.11 (projects.assigned_employee_ids).

Task:
1. Build src/features/planning/ (route /planning, s-planning) — week view showing chantiers per day, with each chantier chip showing its assigned employee(s) (from projects.assigned_employee_ids, resolved against the employees table built in Step 7.4).
2. Implement conflict detection: for the visible week, compute whether any single employee is assigned to two chantiers with overlapping date ranges on the same day — flag both chantiers' chips with a warning icon, and show an aggregate alert badge on the Planning tab itself (wire this into the BottomTabNav/SideNavRail component from Step 2).
3. Build mo-conflit: shows the conflicting pairing clearly, offers reassignment (change one chantier's assigned employee to a different available one) or reschedule (shift one chantier's date range) options, with a "notifier le client concerné" toggle that, if enabled, sends a real notification and auto-feeds that client's journal.
4. If profiles.team_mode='solo' for a given business, de-emphasize this tab appropriately per docs/04_ApplicationFlow.md section 2.3's note (the target/default is 'equipe' per docs/01_ScopeDocument.md section 8, but the solo case should degrade gracefully, not break).

Report back confirming: creating two chantiers with the same employee on overlapping dates correctly triggers the conflict badge and mo-conflit, and resolving via reassignment or reschedule correctly clears the conflict.
```

### 13.5 Agent Task — Material ordering (module 6.6)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.6 (module 6.6 full detail, INCLUDING the example demo-data table — reproduce the STRUCTURE of that data for your own realistic seed/test data, but never ship the literal example rows or any resembling-real-supplier data as production content) and docs/04_ApplicationFlow.md sections 2.12 and 3.1 (s-commandes, mo-commande), and docs/05_DataModel.md sections 2.17 and 2.18 (orders, order_lines).

Task:
1. Build the mo-commande modal reachable from a chantier's "Commander" action: filters the source quote's lines to supply-type only (price_items.is_supply=true, excluding labor/flat-fee), shows per-reference stock state/depot/lead-time (use realistic seeded/simulated stock data per the scope note in docs/01_ScopeDocument.md section 5.6 — the real supplier integration is explicitly out of scope for this pass, see docs/01_ScopeDocument.md section 11), delivery mode toggle (chantier/agence), delivery slot options that adapt to the LONGEST lead time among selected references (compute this correctly, don't just show a fixed slot list).
2. Two-stage confirmation: on submit, orders.status='transmitted_pending' with UI text "Commande transmise — en attente de confirmation." Build the transition to 'confirmed' as a genuinely separate, explicitly triggered step (for this pass, since there's no real supplier webhook to trigger it, implement it as a manual "Confirmer la commande" action the artisan or a test script can trigger — explicitly document in code comments that this stands in for a future real supplier signal and must never be replaced with a fixed setTimeout/delay standing in for a real confirmation, per the defect-to-avoid in docs/01_ScopeDocument.md section 9).
3. Build src/features/orders/ (route /orders, s-commandes) — list of orders per chantier with status.
4. On order creation and confirmation, log to the relevant chantier's cost tracking as appropriate (a confirmed order's lines can seed project_costs rows via source_order_id, docs/05_DataModel.md section 2.12) so real material costs flow into the chantier profitability calculation built in Step 10.

Report back confirming: the two-stage confirmation flow works without any timer-based fake confirmation, delivery slots correctly adapt to the longest lead time in a multi-reference test order, and a confirmed order's costs correctly appear in the source chantier's profitability breakdown.
```

### 13.6 Agent Task — Accounting export (module 6.13)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.13 (module 6.13 detail) and docs/05_DataModel.md section 2.24 (accounting_exports).

Task:
1. Build src/features/accounting/ (route /profile/accounting-export, s-compta) — quarter banner (encaissé TTC, TVA collectée, invoice/purchase-record counts, computed from real invoices/project_costs data for the selected period), format selection (Pennylane direct / Tiime direct / FEC file / PDF+Excel folder), category checkboxes (sales invoices, purchase invoices, VAT-by-rate summary, uncollected receivables).
2. Build the missing-documents alert: cross-reference project_costs/orders rows against the documents table to flag cost entries with no linked supporting document, warning that the corresponding VAT may not be recoverable.
3. For this pass, implement PDF+Excel export as a real, working generation (reusing the PDF library from Step 0.5); implement the FEC file format as a real, correctly-structured FEC text file per the standard French FEC specification (research the exact required column format before implementing — this is a real government-format requirement, not a free-form export); implement Pennylane/Tiime "direct connection" as a clearly-labeled placeholder for this pass (per the scope note in docs/01_ScopeDocument.md section 11, a full live integration is a separately-scoped follow-on) — the UI must not claim a live connection exists when it doesn't.
4. Show a dedicated inline progress state while a multi-invoice quarter export is prepared (this can take several seconds) — never a frozen button.

Report back confirming: a test quarter with real seeded invoices/costs produces a correct banner and a correctly-structured FEC file (spot-check its format against the official spec), and confirm the Pennylane/Tiime paths are honestly labeled as not-yet-live.
```

### 13.7 Agent Task — Data migration/import (module 6.14)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.14 (module 6.14 detail) and docs/05_DataModel.md section 2.25 (migration_imports).

Task:
1. Build src/features/migration/ (route /profile/migration, s-migration) — source-software selection (Tolteck/Obat/Batigest/EBP/Excel-papier/Autre), per-source instructions text (write realistic, genuinely useful export instructions for each named competitor tool, based on their publicly known export capabilities — if you're not confident about a specific tool's real export steps, write generic-but-accurate CSV/PDF export guidance and flag it to me as needing a real product-support review before shipping), category checkboxes for what to import (clients, price library, quotes/invoices as archived PDFs, chantiers in progress — chantiers in progress UNCHECKED by default, per the Cahier's explicit transparency decision, never default this to checked).
2. Build a CSV-import path for clients and price-library items (the two categories most likely to arrive as a spreadsheet) with column-mapping UI and a preview-before-commit step, and a simple PDF-archival upload path for quotes/invoices (stored as documents rows linked to newly-created or matched-existing client records).
3. Show reassuring messaging: "Garde ton ancien logiciel encore un an, ne coupe jamais les deux en même temps" per the Cahier's exact reassurance framing.
4. Build a per-category import-progress state with a completion summary (counts imported, any skipped/failed rows flagged with reasons).

Report back confirming a test CSV import of clients and price-library items works correctly with the preview-before-commit step, and confirm chantiers-in-progress is unchecked by default in the UI.
```

### 13.8 Agent Task — Financing simulation (module 6.15, legal-caution)
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 5.15 (module 6.15 detail) and section 9's "hardcoded financing advice" defect entry (do NOT reproduce it), docs/06_AIPromptRegistry.md section 3.4 (financing-simulation-calc), and docs/05_DataModel.md section 2.23 (financing_simulations).

Task:
1. Build src/lib/calc/financingSimulation.ts implementing financing-simulation-calc exactly per docs/06_AIPromptRegistry.md section 3.4 — standard loan amortization formula given amount/term_months/rate_pct, producing monthly_payment. Purely deterministic, zero AI involvement.
2. Build src/features/financing/ (route /profile/financing, s-financeurs) and the mo-financement modal — partner selection (éco-PTZ, Domofinance, Franfinance, Sofinco), a PROMINENT, impossible-to-miss "simulation indicative" disclosure (not a small-print footnote — this must be genuinely prominent per the legal-caution instruction), the simulation form, computed monthly payment.
3. Do NOT hardcode any eligibility percentage or rule presented as reliable financial advice — the defect being corrected here is exactly that. If you need placeholder interest rates for the simulation math to function, clearly label them as illustrative/example rates, not real current partner rates, until real partner-rate data is integrated.
4. On send-to-client, create a financing_simulations row (indicative_only always true unless a future real-partner-data integration explicitly overrides it) and auto-feed the client's journal.

Report back confirming the simulation math is correct against a hand-verified amortization fixture, and confirming the indicative-only disclosure is genuinely prominent in the UI (describe exactly where/how it appears).
```

### 13.9 Testing
1. Record a chantier report with voice dictation (or keyboard fallback), notify the client, confirm the journal and project_updates rows are correct.
2. Load Messages, confirm the three filters produce correct results.
3. Create a planning conflict (two chantiers, same employee, overlapping dates) — confirm detection and resolution via mo-conflit.
4. Place and confirm a material order (two-stage, no timer-based fake confirmation), confirm its costs flow into chantier profitability.
5. Generate an accounting export for a test quarter, spot-check the FEC file's structure.
6. Import a test CSV of clients via the migration flow, confirm the preview-before-commit step and correct final counts.
7. Run a financing simulation, confirm the math against a hand-verified fixture, confirm the indicative-only disclosure is prominent.
8. Two-account isolation re-check across every table touched in this step.

### 13.10 References
`01_ScopeDocument.md` §5.6, §5.10, §5.11, §5.12, §5.13, §5.14, §5.15, §9 (financing/simulated-actions defects). `04_ApplicationFlow.md` §2.2, §2.3, §2.12, §2.13, §3.1, §3.5, §3.6, §3.7, §3.8, §3.10. `05_DataModel.md` §2.3, §2.11, §2.12, §2.17, §2.18, §2.23, §2.24, §2.25. `06_AIPromptRegistry.md` §3.4. `02_ThemeGuideline.md` §6.10, §9.2.

---

## STEP 14 — Responsive, Accessibility, Security & Motion Polish Pass

### 14.1 Purpose
Every prior step built functionality; this step makes the app match the "field-ready premium" bar from `02_ThemeGuideline.md`, across every breakpoint, with full accessibility and a final security hardening review. Do this AFTER functionality works.

> **Gate**: do not deploy to production (final step below) until every item in 14.6 passes across all breakpoints, AND the 14.2.5 visual-regression suite passes clean (14.2.6).

### 14.2 Agent Task — Responsive audit & fix
**Master Prompt**:
```
Read docs/02_ThemeGuideline.md section 4.3 (breakpoints) and section 4.1 (spacing scale) and docs/01_ScopeDocument.md's Responsive NFR (section 7) in full.

Task:
Go through every route listed in docs/04_ApplicationFlow.md section 1/2, one at a time, and verify/fix layout at all four breakpoints from docs/02_ThemeGuideline.md section 4.3 (mobile 0-639px, tablet 640-1023px, desktop 1024-1439px, wide 1440px+), plus these known-problematic sub-breakpoints: 320px, 375px, 768px, 1280px. Use:
1. Chrome DevTools Device Toolbar, stepping through real device presets for every route.
2. Chrome DevTools "Rendering" tab -> "Layout Shift Regions" -- confirm near-zero shift between skeleton and loaded content, especially on the chantier profitability screen (its skeleton must be sized to exactly match the eventual profitability-block layout, since the reveal motion moment depends on this).
3. Tailwind's sm:/md:/lg:/xl: utilities configured against the four breakpoints (Step 1), not one-off media queries.
4. axe DevTools (or @axe-core/react in dev mode) on each route at each breakpoint.
5. Computed-styles spot-checks confirming spacing matches the docs/02_ThemeGuideline.md section 4.1 scale exactly -- flag and fix any off-scale arbitrary value.
6. Specifically fix: no clipping/horizontal-scroll at 320-360px (this is a named NFR, "fonctionnement à 360 px"); desktop (1024px+) uses the two-pane side-rail layout, not a stretched mobile column; touch targets at least 44x44px everywhere (field-use context -- verify via axe); the margin box and agent-plan-review card specifically remain fully legible and usable at 320px width, since these are the two components most likely to break under width pressure given their multi-figure/multi-step layouts.

Report back with a per-route checklist, axe results per route, and any off-scale spacing corrected.
```

### 14.2.5 Agent Task — Automated pixel-perfect / visual-regression tooling
**Purpose**: 14.2's manual DevTools pass is real and necessary, but it's a one-time snapshot — nothing catches a future change silently breaking a screen's layout at a breakpoint no one happened to check that day. This sub-step installs and wires up real, repeatable visual-QA tooling so "pixel-perfect" is enforced automatically, not just eyeballed once.

**Master Prompt**:
```
Read docs/02_ThemeGuideline.md section 4.3 (breakpoints), section 4.1-4.2 (spacing/radius scale), and section 6 (component specs) in full — these are the ground truth every visual check below compares against.

Task:
1. Install Playwright (@playwright/test) for automated cross-browser, cross-viewport screenshot testing — this is the primary pixel-perfect tool for this project (free, runs locally and in CI, integrates cleanly with a Vite/React stack; do not substitute a paid SaaS visual-diff tool like Chromatic/Percy unless I explicitly ask for one, since Playwright's built-in screenshot comparison covers this project's needs without a recurring cost).
2. Write a Playwright visual-regression suite at tests/visual/ covering, at minimum, the highest-risk screens named throughout this document: the quote editor's Devis step (MarginBox at each of the four tier colors — construct four seeded test quotes, one landing in each tier, so the diff suite actually exercises green/steel-blue/gold/red, not just whichever tier a random seed happens to produce), the chantier profitability screen (both the loading skeleton and the loaded/revealed state), the Kōv Agent conversation surface and plan-review card, the Home action list (morning and evening variants), and the bottom-tab-nav/side-rail at the mobile/desktop breakpoint boundary. For each, capture screenshots at 320px, 375px, 768px, 1024px, and 1440px widths, in both light and dark mode (docs/02_ThemeGuideline.md section 2.5/2.6).
3. Configure Playwright's `toHaveScreenshot()` with a low pixel-diff threshold (start at `maxDiffPixelRatio: 0.01`) so the suite fails on real regressions but tolerates trivial anti-aliasing noise — tune this value if it proves too strict/loose in practice, and note what you landed on.
4. Add an `npm run test:visual` script and an `npm run test:visual:update` script (regenerates baseline screenshots — to be run deliberately after an intentional design change, never routinely to silence a failing diff without reviewing why it changed).
5. Install and configure the Tailwind CSS IntelliSense and Headwind (class-sorting) VS Code extensions in a project `.vscode/extensions.json` recommendations file — these aren't runtime tools, but they materially reduce the chance of a typo'd or off-scale Tailwind class making it into a commit in the first place, which is the cheapest possible pixel-perfect defense.
6. Run the initial suite now, save the baseline screenshots, and commit them to the repo (Playwright screenshots are small PNGs, fine to version-control at this project's scale) — this baseline becomes the reference every future step's UI work is diffed against, starting immediately, not just from this point in Step 14 onward retroactively.

Report back with: the full list of screens/breakpoints/modes covered by the suite, confirmation `npm run test:visual` passes clean against the freshly-captured baseline, and the exact diff threshold you configured.
```

### 14.2.6 Testing
- `npm run test:visual` passes with zero failing diffs against its own freshly-captured baseline.
- Baseline screenshots exist in the repo for every screen/breakpoint/mode combination named in the prompt above — spot-check a handful visually yourself against `02_ThemeGuideline.md` §6 to confirm the baseline itself is actually correct (a passing diff test only proves consistency with the baseline, not that the baseline is right — you still have to eyeball it once).
- Deliberately introduce a small visual regression (e.g. change the MarginBox's green tier to a slightly different hex) and confirm `npm run test:visual` correctly fails and reports which screenshot changed — this proves the safety net actually works before you rely on it for the rest of the project.

### 14.2.7 References
`02_ThemeGuideline.md` §4 (breakpoints/spacing), §6 (component specs — the ground truth screenshots are compared against), §2.4-2.6 (margin tiers, dark/light mode). `04_ApplicationFlow.md` §1, §2 (screen list, for choosing suite coverage).

---

### 14.3 Agent Task — Full states audit
**Master Prompt**:
```
Read docs/04_ApplicationFlow.md section 4 (Global cross-cutting states table) in full.

Task:
Go through EVERY route and modal listed in docs/04_ApplicationFlow.md sections 1-3 and explicitly verify/fix: skeleton loading (screen-shaped, not generic spinner -- test via Slow 3G reload), inline action loading (every network-triggering button), empty states (exact per-screen copy from docs/04_ApplicationFlow.md section 2.x/3.x, never fabricated content standing in for a genuine empty state), recoverable inline errors (test via a deliberately broken env var), offline behavior (manual CRUD queues/retries gracefully; anything that would SEND to a client -- dunning, agent execution, invoice send, financing send -- clearly disables rather than risk appearing to succeed while actually failing), slow-network "still working" states, and the AI-unavailable graceful-degradation state specifically for quote-draft-assist and the Kōv Agent (test by breaking the Anthropic key and confirming both manual quote editing and manual client/invoice CRUD work with zero degradation).

Produce a table: | Route/Modal | Skeleton | Empty | Error | Offline | Slow-network | AI-unavailable (if applicable) | Fix applied |. Fix every gap before reporting back.
```

### 14.4 Agent Task — Motion pass (signature moments)
**Master Prompt**:
```
Read docs/02_ThemeGuideline.md section 9 in full.

Task:
Implement/verify every signature motion moment from section 9.2: margin-box color-shift + digit-roll, FAB morph into the quote editor, agent plan-approval sequential reveal, quote-PDF-generation moment, chantier-profitability reveal, Home action-list entrance stagger, dictation pulsing rings (both steel-blue and agent-purple variants), dunning-level escalation shake-and-settle, route/screen crossfade transitions. For each: confirm it only animates transform/opacity where possible, has a prefers-reduced-motion fallback (test by enabling OS-level reduced motion and confirming the app still communicates every state change, just without the elaborate version), and genuinely explains a real state change (self-audit against section 9.1 rule 1 -- remove anything that fails this test).

Report back with a list of every animation implemented/verified and confirm the reduced-motion test passed for each.
```

### 14.5 Agent Task — Accessibility pass
**Master Prompt**:
```
Read docs/02_ThemeGuideline.md section 10 in full and docs/01_ScopeDocument.md's Accessibility NFR (section 7).

Task:
Audit and fix every route for: semantic HTML/ARIA labels on interactive elements, visible focus states (the steel-blue focus ring from docs/02_ThemeGuideline.md section 2.3, never browser default), color contrast (WCAG AA minimum, with special attention to text-on-margin-tint-background combinations in the MarginBox component and text on the agent-purple-gradient surfaces -- these are the two highest-risk contrast areas given their colored backgrounds), full keyboard navigation through every core flow (onboarding, quote editor's four steps, Kōv Agent plan review including individual step removal, dunning send), and confirm voice/dictation (chantier reports, agent input) is never the ONLY way to complete an action.

Report back with specific fixes made per route, and explicit contrast-ratio numbers for the MarginBox and AgentSurface text/background combinations.
```

### 14.6 Agent Task — Security & privacy hardening review
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 7 (NFRs, especially Security/Confidentiality) and docs/06_AIPromptRegistry.md section 1 (general rules) and section 4 (cost/rate controls) in full.

Task:
1. Re-verify every table's RLS policy is exactly the owner-isolation pattern from docs/05_DataModel.md section 3, none accidentally loosened during development -- run the two-owner cross-access test (docs/05_DataModel.md section 3) against EVERY table now, not just the subset spot-checked in earlier steps.
2. Confirm no Edge Function accepts a client-supplied system prompt or unbounded max_tokens (grep every supabase/functions/*/index.ts for any pattern that would allow this).
3. Re-run npm run build and grep dist/assets/*.js for the literal SUPABASE_SERVICE_ROLE_KEY value and the literal Anthropic key value from both staging and production .env files -- confirm neither appears.
4. Confirm per-owner AI rate limits (built in Step 9/12) are still enforced and haven't regressed.
5. Confirm redacted logging is genuinely in place across every Edge Function -- no full client PII, financial detail, or full Claude prompt/response text is logged in routine (non-debug) logs.
6. Re-test the core AI guardrails from `06_AIPromptRegistry.md` §1: (a) quote-draft-assist never returns a price/total/margin field (re-read the Zod schema), (b) agent-plan-generate never auto-sends without explicit confirm, (c) a hallucinated catalogue_item_id is correctly rejected server-side (construct a test forcing this case).
7. Confirm the acceptance flow (Step 9.5) never uses "signature" language for the canvas-mark path, re-checked now across the FULL built app, not just the component where it was originally built (search every screen/modal that might reference an accepted quote for stray copy).

Report back with pass/fail on each of the seven checks above, with evidence (file/line references, test output) for each.
```

### 14.7 Testing
1. Resize through all four breakpoints plus the four sub-checks on every route/modal — no clipping, no dead space, no horizontal scroll.
2. Run axe DevTools on every route — zero critical/serious violations remain.
3. Run `npm run test:visual` (14.2.5) — passes clean against the committed baseline.
4. Review the 14.3 states-audit table personally — spot-check at least 8 routes yourself with real throttling/offline toggles (more than a typical app, given how many client-facing send actions Kōv has).
5. Enable OS-level reduced motion, click through the whole app — nothing feels broken, every state change is still communicated.
6. Tab through onboarding, the full quote-editor four-step flow, and the Kōv Agent plan-review-with-step-removal using only the keyboard.
7. Run Lighthouse accessibility audits on 5-6 key screens including the MarginBox-heavy chantier screen and the agent surface — fix flagged failures.
8. Review the 14.6 security report personally — do not skip this because the agent said "all good."

### 14.8 References
`02_ThemeGuideline.md` full document (this step re-validates the entire theme spec). `04_ApplicationFlow.md` §4 (states audit), full document for route coverage. `01_ScopeDocument.md` §7 (NFRs), §9 (defects — final re-check). `06_AIPromptRegistry.md` §1, §4.

---

## STEP 15 — Production Operations, Monitoring & Release

### 15.1 Purpose
Final hardening before real client handoff: confirm environment separation actually holds end-to-end, set up monitoring/backups, and switch from staging to production.

> **Gate**: this is the release step — there is no "next step" to catch what slips through here. Do not deploy to `kov-production` or hand off to the client until 15.4's testing fully passes AND you have personally spot-checked the final audit prompts in the section below.

### 15.2 Agent Task — Production operations hardening
**Master Prompt**:
```
Read docs/01_ScopeDocument.md section 7 (NFRs, especially Operations/Maintainability) in full.

Task:
1. Re-confirm kov-production and kov-staging Supabase projects and their Vercel environment variable sets remain cleanly separated (re-verify the Step 0.6 setup hasn't drifted -- check that no production secret ever appears in a Preview/staging build's environment).
2. Apply every migration from Step 5 onward to kov-production for the first time now (supabase link --project-ref <production-ref>, supabase db push) -- this is the first time production sees any schema; do this only after everything has been fully validated against staging.
3. Add structured, redacted logging across all Edge Functions if any gaps remain from Step 14.6's review.
4. Set up basic error/health monitoring -- Vercel's built-in analytics/logs plus Supabase's dashboard are sufficient for this stage; do not add a third-party APM unless asked.
5. Confirm Supabase automatic backups are enabled on kov-production, and DOCUMENT the restore procedure in a new docs/07_OperationsRunbook.md file -- write out the exact steps to restore from backup.
6. Set up a scheduled job (Supabase Cron, if not already done in Step 11.3) for the dunning-level recalculation and the agent-plan-expiry check (Step 12.4) so both run reliably in production without depending on a user happening to load the relevant screen.

Report back with the new docs/07_OperationsRunbook.md content and confirm production/staging environments are cleanly separated end-to-end, including a screenshot-equivalent description of the Vercel environment variable dashboard showing distinct values per environment.
```

### 15.3 Agent Task — Deployment
**Master Prompt**:
```
Task:
1. Deploy the app to Vercel's Preview environment (pointed at kov-staging) first. Click through the entire docs/04_ApplicationFlow.md route map there before touching production.
2. Once the staging deploy is fully verified, deploy to Vercel's Production environment (pointed at kov-production, with production Anthropic/Supabase keys as configured in Step 0.6).
3. Confirm the production deploy's build output, when grepped, contains no service-role key or raw Anthropic key (repeat the Step 5.5.4 / 14.6.3 check one final time against the actual production build artifact).

Report back confirming both deploys succeeded and the final production-build secret-leak check passed.
```

### 15.4 Testing
1. Click through the entire `04_ApplicationFlow.md` route map on the staging deployment before ever touching production.
2. Review the generated `07_OperationsRunbook.md` — confirm it describes real, followable steps (you don't need to perform a live restore test right now, but the steps must be genuinely executable).
3. Confirm the production build's secret-leak check passes on the actual deployed artifact, not just a local build.
4. Only after this step's testing is clean — proceed to the final verification prompts below before considering the project client-ready.

### 15.5 References
`01_ScopeDocument.md` full document (final re-check). `04_ApplicationFlow.md` full document. `05_DataModel.md` §5 (migration approach).

---

## STEP FINAL — Verification & QA Prompts

> These four prompts are meant to be run **near the end of the project, in this order**, as a final quality gate before considering Kōv ready for real client use. Each is a ready-to-paste Master Prompt. Run them after Step 15, or any time later in the project's life when you want a comprehensive health check (they are safe to re-run repeatedly).

### F.1 — Quote calculation + AI draft + PDF pipeline correctness
**Purpose**: focused audit of the single most commercially sensitive pipeline in the app — a bug here means an artisan sends a client the wrong price.
**Master Prompt**:
```
Act as a senior code reviewer focused specifically on commercial-calculation correctness. Read docs/01_ScopeDocument.md KOV-FR-007/008/009/010 and docs/06_AIPromptRegistry.md sections 2.1 and 3.1-3.2 in full, then review the current codebase for:
1. Every place a quote total, VAT amount, or margin figure is computed -- confirm ALL of them route through src/lib/calc/quoteTotals.ts (or its Edge Function counterpart) and never through ad-hoc inline arithmetic anywhere else in the codebase (search for stray multiplication/addition on price-shaped variables outside that module).
2. Re-run the full vitest calculation test suite from Step 8.2 and confirm every fixture still passes, including all four VAT rates and every rounding-boundary case.
3. Confirm the quote-draft-assist Edge Function's Zod output schema genuinely has no field capable of carrying a price, total, or margin figure -- quote the exact schema in your report.
4. Confirm every issued quote's PDF is generated exclusively from its quote_versions.snapshot -- trace the actual code path for PDF generation and confirm it never reads live quotes/quote_lines state.
5. Confirm the historical-copy rule (docs/05_DataModel.md section 4) holds: re-run or re-verify the test that changes a price_items value after a quote_lines row already references it, confirming the existing line is unaffected.
6. Confirm the edit-after-issuance path correctly creates a new version rather than mutating an issued/accepted/declined quote in place.

Produce a prioritized list of any issues found (Critical/High/Medium/Low) with file/line references, fix the Critical and High items now, and leave Medium/Low as a TODO list for me to review before you touch them.
```

### F.2 — Kōv Agent correctness (intent recognition, confirmation guarantee, journal logging)
**Purpose**: focused audit of the flagship differentiator's safety guarantees.
**Master Prompt**:
```
Act as a senior code reviewer focused specifically on the Kōv Agent's safety guarantees. Read docs/01_ScopeDocument.md section 5.5 and KOV-FR-014, and docs/06_AIPromptRegistry.md sections 2.2-2.3 in full, then review the current codebase for:
1. Confirm the confidence-threshold-and-margin-over-second-place gating logic in agent-intent-extract is genuinely enforced server-side (not just suggested in a comment) -- quote the actual gating code.
2. Construct and run a test case where the model's output would (if ungated) auto-select a wrong intent due to a small confidence gap -- confirm the system correctly falls back to disambiguation instead.
3. Trace the full execution path from an agent_action_plans row's "OUI" confirm through to the actual send -- confirm there is NO code path anywhere that can execute a plan step without this explicit confirm having been recorded first (search for any direct write to invoices/dunning_events/journal from agent code that bypasses the plan-review-and-confirm flow).
4. Confirm that editing a message via "Lire le message" and then confirming genuinely sends the EDITED text, not the original -- re-run or re-verify the Step 12.4 automated test.
5. Confirm every client-facing executed step correctly and automatically creates a journal row -- construct a test plan with a mix of client-facing and internal steps and confirm the journal row count exactly matches the client-facing step count, no more, no less.
6. Confirm the 24-hour plan-expiry check actually runs reliably in production (not just as a manual/on-load check that could be skipped if no one opens the relevant screen).

Produce a prioritized list of any issues found (Critical/High/Medium/Low) with file/line references, fix the Critical and High items now, and leave Medium/Low as a TODO list for me to review before you touch them.
```

### F.3 — Responsive/accessibility/cross-device polish and premium animation quality bar
**Purpose**: re-audit the full app against the theme doc's exacting standard, now that every screen exists.
**Master Prompt**:
```
Re-read docs/02_ThemeGuideline.md in full, especially section 1 (design philosophy), section 9 (motion system), and section 10 (accessibility). Then, treating every screen and modal in docs/04_ApplicationFlow.md as your checklist, audit the CURRENT deployed app (not just the code) against this standard:

1. For every one of the nine signature motion moments in docs/02_ThemeGuideline.md section 9.2, confirm it is implemented, uses the specified easing curve, and genuinely communicates the state change it's meant to communicate -- if any moment feels generic, missing, or decorative-without-purpose, fix it now.
2. Confirm the MarginBox and AgentSurface components in particular meet the "field-ready premium, not fragile" register described in section 1 -- these are the two components most central to the product's differentiation and must not read as generic UI.
3. Re-run the full breakpoint sweep (320/375/430/768/1024/1280/1440px) across every route, using real device presets, not just freehand resizing.
4. Re-run `npm run test:visual` (the Playwright visual-regression suite from Step 14.2.5) -- if any real screens/flows were added or changed since the baseline was captured, extend the suite to cover them and refresh the baseline deliberately (`npm run test:visual:update`, reviewed by eye before committing), rather than letting suite coverage silently fall behind the actual app.
5. Re-run axe DevTools and Lighthouse accessibility audits across every route -- zero critical/serious violations.
6. Re-test prefers-reduced-motion across the whole app.
7. Confirm dark mode (the default) and light mode (the "office" secondary mode) both render every screen correctly with no stray hardcoded hex values (grep the codebase for any hex-color literal outside src/styles/theme.css as a final check).

Produce a per-screen scorecard (Route | Motion ✓/partial/✗ | Responsive ✓/✗ | Visual-regression ✓/✗ | Accessibility ✓/✗ | Dark+Light ✓/✗ | Notes) and fix every non-✓ item before reporting back complete.
```

### F.4 — Full scope audit: does the app implement everything the docs define?
**Purpose**: the comprehensive final check — walks the entire scope and flow definition and reports gaps. This is the one that "checks the whole app flow works exactly as the scope defines, and surfaces anything missed."
**Master Prompt**:
```
This is a full self-audit against the complete specification. Do not skip any part of it, and be honest about gaps -- I would rather know now than have the client find them.

Part A -- Scope audit against every KOV-FR requirement:
Read docs/01_ScopeDocument.md section 6 (all twenty KOV-FR-001 through KOV-FR-020 requirements) in full. Go through each one individually and confirm, with a specific file/route/function reference, that its acceptance criteria are actually implemented and working in the current codebase. Produce a table: | ID | Requirement | Implemented? (Yes/Partial/No) | Evidence (file/route) | Gap if any |.

Part B -- Module audit against every one of the 16 modules:
Read docs/01_ScopeDocument.md section 5 (module details 5.1 through 5.16, corresponding to Cahier modules 6.1-6.16) in full. For each module, confirm every behavior/business-rule bullet listed is genuinely implemented, not just partially stubbed. Produce a second table: | Module | Behaviors verified | Business rules verified | Gap if any |.

Part C -- Application flow audit:
Read docs/04_ApplicationFlow.md in full, top to bottom -- all 23 screens, all 11 modals, and the full cross-cutting states table. For every screen/modal and every state (loading/empty/error/success/offline/slow-network/AI-unavailable where applicable), click through it in the running app (or describe exactly how you verified it if some require multi-step data setup) and confirm it matches the documented behavior. Produce a third table: | Screen/Modal | State | Verified? | Notes |.

Part D -- Defects-avoided re-check:
Read docs/01_ScopeDocument.md section 9 (known defects to correct) one more time. For EACH of the six listed defects, confirm explicitly and separately that the correction was actually implemented and the original defect was NOT reproduced anywhere in the current codebase (search broadly, not just in the step where each was originally addressed -- e.g. re-search the whole codebase for the word "signature" being applied to the canvas-acceptance path, re-search for any setTimeout-based fake confirmation anywhere, not just in the material-ordering module where it was first addressed).

Report back with all four tables in full, plus a short summary list of any remaining gaps, ranked by severity, so I can decide what must be fixed before client delivery versus what can be a documented known-issue. This audit should be re-run any time significant new work is added to the app, not treated as a one-time check.
```
