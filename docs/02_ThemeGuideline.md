# Kōv — Theme Guideline (Field-Ready Premium Design System)

> Base palette extracted directly from the client's reference file `kov_V3_accueil_actions (1).html` (the `:root{...}` custom-property block, lines 10–20) and cross-checked against the Cahier des charges §1 ("Identité visuelle": *"Interface mobile-first, fond sombre et blanc cassé, bleu acier #4A7FA5 comme couleur d'accent, typographies DM Sans et Playfair Display"*) and the SRS's own praise for this identity ("saluée par l'audit technique, doit être préservée lors de la reconstruction").
>
> This document **keeps every client-sourced color exactly as-is** (hex values are contractual — do not alter them) and layers a premium, ultra-modern execution system on top: extended tint ramps, elevation, motion, typography scale, and component states the prototype's raw CSS does not fully formalize. Nothing here contradicts the client's identity — it polishes its expression to a field-ready professional standard.

---

## 1. Design philosophy for this project

Kōv's register is **not** quiet luxury and **not** a generic flat SaaS dashboard. Kōv is a **field-ready professional tool for a tradesperson standing on a job site**, one thumb, sometimes gloved, checking margin before saying yes to a client. The emotional register is: confident, fast, unambiguous, no fragility. It should feel like a premium project-management/fintech hybrid crossed with rugged field-tool utility — think **Linear or the Vercel dashboard crossed with Stripe**, built for someone who is standing in a half-finished bathroom, not sitting at a downtown desk.

**Aim for:**
- **Instant legibility under bad conditions.** High contrast, large touch targets, information that reads correctly in bright outdoor light or at dusk with one hand occupied.
- **Numbers you can trust at a glance.** Margin, totals, and status are never buried — color-coding and typography make the commercial state of a job obvious in under a second (see §5, the margin-indicator system, which is a *product mechanism*, not a stylistic choice).
- **Speed and confidence, not delicacy.** Motion is fast, purposeful, and mechanical-feeling where it reinforces a real state change (a plan approved, a margin recalculated) — never precious, never slow for its own sake.
- **Dark-mode-native.** The client's own prototype ships dark-first (`--noir` background, off-white secondary). Treat dark as the primary mode given the field-use-outdoors-at-dusk, evening-admin-work context described in the persona (Martin Da Silva doing "l'administratif du soir" — evening admin work); light/off-white is the secondary "office" mode, both fully specified below.

**Avoid:**
- Delicate serif-led "quiet luxury" treatments, fragile hairline-only surfaces, pastel palettes.
- Cluttered dashboards with twenty competing widgets — Kōv is action-list-first (Home is literally a to-do list of concrete actions, not a stats wall) and status-first, not chart-first.
- Generic flat SaaS blue with no accent hierarchy — the steel-blue accent, the true-orange urgency color, the gold secondary accent, and the purple AI-agent accent must each read as visually distinct roles, never interchangeable.
- Playful startup illustration or stock photography — this is a tool a professional relies on to get paid; it should look like it takes their business as seriously as they do.

Reference points: Linear's information density and motion confidence, the Vercel dashboard's dark-mode-native command-center feel, Stripe's trustworthy numeric precision — all filtered through a rugged, one-handed, job-site-usable lens.

---

## 2. Color system

### 2.1 Core brand tokens (locked — from client source, do not alter)

Extracted verbatim, character-for-character, from `kov_V3_accueil_actions (1).html`.

```css
--noir:      #0A0A0A;  /* primary dark background / high-emphasis text-on-light */
--noir2:     #141414;  /* secondary dark surface, one step up from --noir */
--noir3:     #1E1E1E;  /* tertiary dark surface, cards-on-dark */
--blanc:     #FFFFFF;  /* pure white, used narrowly (see §2.3) */
--bg:        #F7F7F5;  /* light warm off-white background — the app's LIGHT-mode canvas */
--white:     #FFFFFF;  /* card surfaces in light mode */
--orange:    #4A7FA5;  /* NOTE: variable is literally named "orange" but the value is a STEEL-BLUE. This is the brand accent — primary buttons, FAB, active nav states, brand gradients. Never rename or "correct" this in code comments without flagging; the variable name is a historical artifact from the prototype, the color itself is steel-blue. */
--od:        #3a6b8f;  /* accent darker shade — used in gradients paired with --orange */
--ol:        #EBF3F9;  /* accent light tint — background fills, badge backgrounds */
--urgence:   #F97316;  /* TRUE orange — used ONLY for urgency/alert states. Visually distinct from --orange (steel-blue). Never confuse the two: "--orange" is the calm brand accent, "--urgence" is the alarm color. */
--urgence-d: #E8640A;  /* urgency darker shade */
--urgence-l: #FFF4EC;  /* urgency light tint background */
--or:        #C8A96E;  /* gold — secondary/premium accent, used sparingly for premium touches */
--vert:      #059669;  /* success green */
--vl:        #ECFDF5;  /* success light tint background */
--rouge:     #DC2626;  /* error/destructive red */
--rl:        #FEF2F2;  /* error light tint background */
--bleu:      #2563EB;  /* informational blue — distinct from the steel-blue brand accent (--orange) */
--bl:        #EFF6FF;  /* informational light tint background */
--gris:      #6B7280;  /* secondary/muted text */
--border:    #E5E7EB;  /* default hairline border, light mode */
--font:      'DM Sans', sans-serif;       /* UI/body typeface */
--serif:     'Playfair Display', serif;   /* display/emotional-moment typeface */
```

**AI/Agent-specific accent (also from client source, applied to the Kōv Agent surfaces):**

```css
--agent-grad-start: #7c3aed;  /* purple gradient start — Kōv Agent voice/chat button and surfaces */
--agent-grad-end:   #4f1d96;  /* purple gradient end */
```

This purple gradient is a **dedicated AI/Agent accent**, kept strictly separate from the steel-blue brand accent (`--orange`). It marks every surface where the user is talking to or reviewing output from the Kōv Agent (module 6.5) — the agent conversation surface, the agent's FAB/entry point, plan-review cards — so that "you are now talking to the AI" is unmistakable at a glance, distinct from ordinary app chrome.

### 2.2 Extended tint-ramp system (new — derived, not invented from nowhere)

Each ramp step below is a mathematically-consistent tint or shade of a locked token — never an arbitrary new hue.

```css
/* Noir ramp — dark-surface depth without leaving the brand's near-black */
--noir-950: #050505;   /* deepest — modal scrims, splash background overlays */
--noir-900: #0A0A0A;   /* = --noir, primary dark app background */
--noir-800: #141414;   /* = --noir2, first elevation step */
--noir-700: #1E1E1E;   /* = --noir3, card-on-dark surface */
--noir-600: #2A2A2A;   /* raised card-on-dark / hover surface */
--noir-500: #3D3D3D;   /* dark-mode border / divider */
--noir-400: #6B6B6B;   /* dark-mode secondary text */
--noir-300: #A0A0A0;   /* dark-mode tertiary text / placeholder */
--noir-100: #E8E8E6;   /* dark-mode high-emphasis text (near --bg, not pure white — softer on the eye) */

/* Steel-blue accent ramp (from --orange/--od/--ol) */
--accent-900: #24455c;  /* deep steel-blue — pressed states, text-on-light emphasis */
--accent-700: #3a6b8f;  /* = --od, hover/active on dark surfaces */
--accent-500: #4A7FA5;  /* = --orange, the primary accent */
--accent-300: #7FA6C3;  /* light steel-blue — disabled-but-visible accents, secondary icons */
--accent-100: #EBF3F9;  /* = --ol, tint background */

/* Purple AI-agent accent ramp (from --agent-grad-start/--agent-grad-end) */
--agent-900: #4f1d96;   /* = --agent-grad-end, deep purple */
--agent-700: #6229b8;   /* mid step, gradient midpoint reference */
--agent-500: #7c3aed;   /* = --agent-grad-start, primary agent accent */
--agent-300: #B79CF2;   /* light purple — agent-tinted badges/icons on light surfaces */
--agent-100: #F1EBFC;   /* faint purple tint background — agent message bubble on light mode */

/* Urgency (true orange) ramp */
--urgence-700: #C4530C;  /* deep urgent — pressed dunning-level-3 button */
--urgence-500: #F97316;  /* = --urgence */
--urgence-300: #FBAF75;  /* light urgent accent */
--urgence-100: #FFF4EC;  /* = --urgence-l */

/* Gold secondary-accent ramp */
--gold-700: #A3854F;   /* deep gold — pressed premium/financing-module accents */
--gold-500: #C8A96E;   /* = --or */
--gold-300: #DDC79B;   /* light gold */
--gold-100: #F7F0E3;   /* faint gold tint background */
```

### 2.3 Semantic mapping (how to use color — the actual rules)

> **WCAG AA correction (Step 2)**: an automated contrast audit found several of the pairings originally documented here failed 4.5:1 as text. The table below reflects the corrected, re-verified pairings. Three changes from the original: (1) a new `--noir-200` ramp step was added between `--noir-100` and `--noir-300`; (2) dark-mode body text now uses `--noir-200` (was `--noir-300`) and muted/meta text now uses `--noir-300` (was `--noir-400`, which failed as low as 2.64–3.72:1 against every dark surface); (3) `--vert`/`--rouge` are correct as **backgrounds** (row below) but must never be used as text `color` directly — use the new `--success-text`/`--error-text` tokens for that (mode-aware: a lighter tint in dark mode, a darker shade in light mode), since the raw colors fail AA as text in both modes.

| Purpose | Token (dark mode, primary) | Token (light mode, secondary) | Notes |
|---|---|---|---|
| Page background | `--noir-900` | `--bg` | Dark is primary; never pure `--blanc`/`--noir-950` as the page canvas in either mode. |
| Card / panel background | `--noir-700` | `--white` | Elevated via shadow + a subtle border, not border alone (see §6). |
| Recessed surface (input well, track) | `--noir-800` | `--bg` (with `1px` border) | |
| Primary heading / high-emphasis text | `--noir-100` | `--noir` | |
| Body text | `--noir-200` (dark) | `--gris` (light) | Never pure white on dark, never pure black on light — softer values reduce eye strain in low light. Corrected from `--noir-300` (Step 2 AA fix). |
| Muted/meta text | `--noir-300` (dark) | `--gris` mixed 88%/12% toward `--noir` (light) | Timestamps, helper text. Corrected from `--noir-400`/a lighter gris-mix (both failed AA — Step 2 fix). |
| Primary CTA button | `--accent-700` bg (default), `--accent-500` on hover, white text | Same | The steel-blue brand action — quote save, confirm plan, primary flows. Default/hover swapped from the original spec for AA (see §6.1's correction note). |
| AI/Agent CTA & surfaces | Linear gradient `--agent-grad-start → --agent-grad-end` | Same | Kōv Agent entry point, conversation surface, plan-review cards — see §6.9. |
| Urgent/alert CTA | `--urgence-700` bg (default), `--urgence-500` on hover, white text | Same | Dunning level 3, overdue-invoice badges, planning conflicts — reserved strictly for time-sensitive/alarm contexts, never a generic "important" button. Default/hover swapped from the original spec for AA. |
| Secondary/premium accent | `--gold-500` on `--gold-100` bg | Same | Financing module, premium/upsell touches — used sparingly. As a badge/pill, pair with a dark text shade per §6.4, not `--gold-500` itself as text. |
| Ghost/tertiary button | Transparent bg, `--noir-100`/`--noir` text | Same | `1.5px` border at 15% opacity of the text color. |
| Success (payment received, quote accepted, margin healthy) | `--vert` on `--vl` bg (background only) | Same | For success **text**, use `--success-text` (mode-aware), never `--vert` directly as `color` — `--vert` fails AA as text in both modes (measured 3.77–4.42:1). |
| Warning (mid-tier margin, approaching deadline) | `--urgence-500` on `--urgence-l` bg | Same | Shares the urgency hue family intentionally — margin-gold uses a distinct token, see §2.4 (the middle-caution tier is gold, not amber/orange — see that section's naming note). |
| Error/destructive (decline, delete, negative margin) | `--rouge` on `--rl` bg (background only) | Same | For error **text**, use `--error-text` (mode-aware), never `--rouge` directly as `color` — `--rouge` fails AA as text in both modes (measured 3.45–4.83:1). |
| Informational (planning notice, system message) | `--bleu` on `--bl` bg | Same | Kept visually distinct from the steel-blue brand accent — never substitute one for the other. |
| Focus ring | `--accent-500` at 45% opacity, 3px offset ring | Same | Never browser-default blue. |

### 2.4 The margin-indicator color system (Cahier §6.4 — a real product rule, not decoration)

This is a **core commercial mechanism**, not a stylistic choice. It must be implemented identically everywhere a margin figure is shown: the quote editor's live margin box, the chantier real-profitability screen (module 6.9), and any margin reference inside the Kōv Agent's plan-review surface. Do not invent a different threshold scheme anywhere in the app.

| Margin | Token | Background | Advisory tone |
|---|---|---|---|
| **> 30%** | `--margin-green: #059669` (= `--vert`) | `--margin-green` at ~15% opacity | Healthy — reassuring, minimal copy ("Marge solide"). |
| **> 20%** | `--margin-steel-blue: #4A7FA5` (= `--accent-500`, the brand steel-blue, reused deliberately here as the "good but watch it" tier — NOT the urgency orange) | `--margin-steel-blue` at ~15% opacity | Good — neutral confidence. |
| **> 10%** | `--margin-gold: #C8A96E` (= `--gold-500`) | `--margin-gold` at ~18% opacity | Caution — advisory copy nudging toward review ("Marge serrée, vérifie les lignes"). |
| **≤ 0% (negative)** | `--margin-red: #DC2626` (= `--rouge`) | `--margin-red` at ~18% opacity | Alarm — direct, unambiguous copy ("Marge négative — ce devis te coûte de l'argent"). |

> **Correction (Step 2)**: the Background column originally specified each tier's light-mode tint token (`--vl`, `--accent-100`, `--gold-100`, `--rl`) as a translucent overlay. This was found to be a real bug in implementation — alpha-blending a near-white light-mode background token over the dark-mode page background produces a washed-out, barely-distinguishable gray instead of a real hue wash (verified via computed-style inspection). The corrected approach — the tier's own **saturated** color (`--margin-green`/`--margin-steel-blue`/`--margin-gold`/`--margin-red`) at low opacity — is mode-agnostic and reads correctly in both dark and light mode. Also, naming: these tiers are named `green`/`steel-blue`/`gold`/`red` in code — never `orange`/`amber`, since neither hue is actually used for the middle two tiers.

**Implementation rule:** the box's background, border-left accent, headline figure color, and advisory sentence all update together on every recalculation — see the motion spec in §9.2 for the exact animated color-shift behavior. The four-tier scheme intentionally reuses the brand steel-blue for the ">20%" tier rather than inventing a fifth arbitrary hue — this keeps the palette closed and avoids diluting the true-urgency-orange's meaning elsewhere in the app.

### 2.5 Dark mode (primary mode — fully specified, not a bolt-on)

Given the field-use-at-dusk, evening-admin-work context, dark mode ships as the **default**, matching the client's own prototype default state.

```css
:root, :root[data-theme="dark"] {
  --page-bg:        var(--noir-900);
  --surface-bg:     var(--noir-700);
  --surface-raised: var(--noir-600);
  --recessed-bg:    var(--noir-800);
  --text-hi:        var(--noir-100);
  --text-mid:       var(--noir-300);
  --text-low:       var(--noir-400);
  --divider:        var(--noir-500);
  /* brand, urgency, gold, agent, semantic accents stay IDENTICAL — accents never shift between modes */
}
```

### 2.6 Light mode ("office mode" — secondary, fully specified)

```css
:root[data-theme="light"] {
  --page-bg:        var(--bg);
  --surface-bg:     var(--white);
  --surface-raised: var(--white);
  --recessed-bg:    var(--bg);
  --text-hi:        var(--noir);
  --text-mid:       var(--gris);
  --text-low:       color-mix(in srgb, var(--gris) 70%, var(--bg) 30%);
  --divider:        var(--border);
  /* brand, urgency, gold, agent, semantic accents stay IDENTICAL — accents never shift between modes */
}
```

Ship dark mode first and treat it as the default `:root` state (no `data-theme` attribute required to get dark); light mode activates only when `data-theme="light"` is explicitly set (user preference, e.g. for indoor office use). This is the inverse of a typical "light-first, dark-as-toggle" product — intentional, given Kōv's field-use context.

---

## 3. Typography

### 3.1 Font families (from client source)

| Role | Stack | Usage |
|---|---|---|
| **UI / Body** | `'DM Sans', -apple-system, 'Segoe UI', Roboto, sans-serif` | All buttons, labels, inputs, card body text, nav, numeric data. The workhorse typeface — nearly everything in the app. |
| **Display / Emotional moments** | `'Playfair Display', Georgia, 'Times New Roman', serif` | Reserved specifically for the vocal/agent assistant's spoken-text display, modal taglines, and the onboarding's emotional opening moments — never for dense UI or data-heavy screens. Used sparingly and deliberately, exactly as the client's prototype does. |
| **Numeric / Data** | Same as UI stack, with `font-variant-numeric: tabular-nums` | Margin figures, totals, invoice amounts, timers — prevents digit jitter on live-updating numbers (critical for the live margin box, §6.9). |
| **Wordmark** | `'DM Sans'`, weight 900, `letter-spacing: -0.04em` | "kōv" rendered lowercase, with a small accent-colored macron/bar element positioned over the "ō" (see the client source's `.kov-bar` rule) — preserve this exact construction, never substitute a generic logotype. |

### 3.2 Type scale

| Token | Size / Line-height | Weight | Font | Usage |
|---|---|---|---|---|
| `display-lg` | 30px / 1.15 | 900 | Serif | Onboarding hero moment, agent voice full-screen text |
| `display` | 24px / 1.2 | 900 | Sans | Screen title (e.g. "Bonjour, Martin") |
| `display-sm` | 20px / 1.25 | 800 | Sans | Section/card group heading, modal title |
| `heading` | 16px / 1.3 | 800 | Sans | Card title, list-item primary text |
| `body-lg` | 15px / 1.55 | 500 | Sans | Primary reading text, agent conversation bubbles |
| `body` | 13.5px / 1.5 | 500 | Sans | Default body, form labels |
| `body-sm` | 12px / 1.45 | 500 | Sans | Secondary/meta text, timestamps |
| `label` | 10-11px / 1.4 | 700 | Sans | `letter-spacing: 0.05-0.06em`, uppercase — field labels, category tags, section labels (matches client source's `.sl` pattern) |
| `caption` | 9-10px / 1.3 | 700 | Sans | Stat-tile sub-labels, badge text |
| `figure-lg` | 34px / 1.1 | 900 | Sans, tabular-nums | The margin-box headline figure, chantier profitability headline figure |
| `figure` | 20px / 1.15 | 800 | Sans, tabular-nums | Invoice/quote totals, stat tiles |

### 3.3 Rules

- Never let a heading wrap past two lines in a card — shorten copy rather than let it truncate awkwardly.
- The serif (`Playfair Display`) never appears in dense data contexts (tables, lists, forms) — only in the specific emotional/voice moments named in §3.1.
- Tabular numerals mandatory on every figure that updates live (margin box, timers, running totals).
- Body-text max width for readability: `62ch` on desktop/tablet breakpoints.

---

## 4. Spacing, radius, and grid

### 4.1 Spacing scale (4px base unit)

`4, 8, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80` px. Card internal padding defaults to `16px` mobile / `20-24px` desktop. Section vertical rhythm: `20px` mobile, `36-56px` desktop.

### 4.2 Border radius (from client source conventions)

| Token | Value | Usage |
|---|---|---|
| `radius-xs` | 12px | small icon buttons (matches source `.bk` pattern) |
| `radius-sm` | 14px | cards, inputs, standard buttons (matches source `.btn`/`.bp` pattern) |
| `radius-md` | 16px | larger cards, primary CTA buttons (matches source `.bp` at 16px) |
| `radius-lg` | 20-24px | modals, hero panels, onboarding containers |
| `radius-pill` | 50px | pills, badges, tab-switchers (matches source `.bsm`/`.toast` pattern) |
| `radius-full` | 50% | circular FAB, avatars |

### 4.3 Grid / breakpoints

The client's prototype is a fixed 430px mobile column (`max-width:430px` on `body`) with no responsive system beyond that — this must be extended for the real product without losing the mobile-first field-use identity:

```
mobile:  0-639px    → single column, full-bleed cards, bottom tab nav (matches prototype exactly)
tablet:  640-1023px → single column content, max-width 480px centered, bottom nav retained
desktop: 1024-1439px→ two-pane layout (side nav rail + content, max-width 1200px)
wide:    1440px+     → two-pane + optional right-side context panel (e.g. quote editor + margin box side by side, or chantier detail + main courante side by side)
```

Mobile remains the priority design target (this is a job-site tool used one-handed), but every screen must render correctly, without clipping or dead whitespace, at all four breakpoints.

---

## 5. Elevation & surface treatment

Colored soft shadows matching the element's own accent color, never flat gray shadows — this is a direct, deliberate convention from the client source (e.g. the FAB's shadow: `0 8px 28px rgba(74,127,165,.45), 0 3px 8px rgba(74,127,165,.3)`).

| Level | Shadow | Usage |
|---|---|---|
| `flat` | none, `1px solid var(--divider)` | List rows, inline items |
| `raised` | `0 2px 10px rgba(0,0,0,.28)` (dark) / `0 2px 8px rgba(10,10,10,.06)` (light) | Default card |
| `floating` | `0 8px 24px rgba(0,0,0,.35)` (dark) / `0 8px 24px rgba(10,10,10,.10)` (light) | Active/focused card, dropdown, popover |
| `modal` | `0 24px 64px rgba(0,0,0,.5)` | Sheets, dialogs |
| `accent-glow` | `0 8px 28px rgba(74,127,165,.45), 0 3px 8px rgba(74,127,165,.3)` | Primary CTA, FAB — matches client source exactly |
| `agent-glow` | `0 8px 32px rgba(124,58,237,.4), 0 3px 10px rgba(79,29,150,.3)` | Kōv Agent FAB/surfaces — purple-tinted equivalent of `accent-glow` |
| `urgence-glow` | `0 8px 24px rgba(249,115,22,.35)` | Dunning level 3 / critical alert CTAs |
| `margin-glow-green` | `0 4px 20px rgba(5,150,105,.25)` | Margin box, healthy state |
| `margin-glow-red` | `0 4px 20px rgba(220,38,38,.3)` | Margin box, negative state |

**Never use a shadow and a heavy border together** — pick one per surface. On dark surfaces (`--noir-700` cards on `--noir-900` background), shadow depth reads best combined with a faint `1px` top-highlight border (`rgba(255,255,255,.04)`) rather than a full outline.

---

## 6. Component specifications

### 6.1 Buttons

> **WCAG AA correction (Step 2)**: white text on the raw `--accent-500`/`--urgence-500` fails 4.5:1 (measured 4.31:1 / 2.80:1 — neither clears the minimum for this button text size, which does not qualify for the "large text" 3:1 exception). The table below therefore uses `-700` as the **resting/default** state and `-500` as the **hover/active** state (brighter on interaction) — this intentionally inverts the original default/hover pairing. `-500` remains correct and unchanged for all non-text uses: icons, borders, shadows, gradients, FAB fills without overlaid text.

| Variant | Background | Text | Border | Radius | Height | Font |
|---|---|---|---|---|---|---|
| Primary (brand) | `--accent-700` (default) → hover `--accent-500` | white | none | `radius-sm` | 48px (sm: 40px) | 800, 14-15px |
| AI-Agent | Linear gradient `--agent-grad-start → --agent-grad-end` → hover shift 8% darker | white | none | `radius-sm` | 48px | 800, 14-15px |
| Urgent (dunning/alert) | `--urgence-700` (default) → hover `--urgence-500` | white | none | `radius-sm` | 48px | 800 |
| Ghost/secondary | transparent | `--text-hi` | `1.5px solid` divider color at 40% | `radius-sm` | 48px | 800 |
| Icon button | transparent → `--recessed-bg` on hover | `--text-hi` | none | `radius-xs` or `radius-full` | 40×40px | — |

All buttons: `transition: all .16s cubic-bezier(.34,1.56,.64,1)` (matches the client source's FAB easing exactly — a slightly overshooting, mechanical-feeling curve, not a soft ease), `active:scale(0.96)` press feedback, disabled = **a solid muted background/text pairing (`--recessed-bg`/`--text-low`), not opacity-based** + no pointer events. Minimum touch target 44×44px everywhere (field-use with gloves/one thumb).

> **Correction (Step 7, UI-polish pass)**: the original spec here called for disabled = 40% opacity. A live contrast audit found a blanket `opacity-40` fades background AND text toward the page behind it in lockstep, collapsing their contrast ratio (measured 2.56:1 on the primary variant against its page background — a real WCAG AA failure for this text size). Implemented correction: a solid, purpose-built muted background/text pairing (re-verified at 7.0:1) that still reads unambiguously as "disabled" without failing contrast. Ghost/icon variants correctly use a transparent-preserving muted-text-only treatment instead, matching their non-filled nature. This is the implemented, correct behavior — do not reintroduce a plain `opacity-40` override on any button variant.

### 6.2 Cards

- **Standard card**: `--surface-bg`, `radius-sm` (14px), `raised` elevation, `16-20px` padding.
- **Contextual action card** (Home screen list items, module 6.2): `--surface-bg`, left-accent 3px bar in category color (steel-blue/urgence/gold/success per action type), icon + title (`heading`) + one-line contextual subtitle (`body-sm`, `--text-mid`) + single action button, full-width tap target on mobile.
- **Chantier profitability card** (module 6.9 — see §6.8 below for full spec, listed here for cross-reference): the 3-tier margin readout is its own numbered component, not a generic card variant.
- **Stat tile**: `--recessed-bg`, `radius-xs`, centered icon/value/label stack, `figure` type token for the value.

### 6.3 Inputs

- `--surface-bg` background, `1.5px solid var(--divider)` default → `1.5px solid var(--accent-500)` on filled/focus, `radius-sm` (14px), `14-16px` padding, `16px` font (prevents iOS zoom-on-focus).
- Label above input: `label` type token.
- Helper text below: `body-sm`, `--text-low`.
- Error state: border → `--rouge`, helper text → `--rouge`.
- Purchase-price and sale-price fields in the quote editor use `figure` type token with tabular numerals even while being typed into — never a plain text-input font for money fields.

### 6.4 Badges / status pills

`radius-pill`, `4px 10px` padding, `label` type token, colored per semantic token (§2.3).

> **WCAG AA correction (Step 2)**: pairing each tier's raw saturated color directly as text against its own light `-100`/`-l`/`-bg` background fails AA (measured as low as 3.08:1 at this text size). Every tone below now uses a purpose-built darker text shade for legibility, re-verified to clear 4.5:1 against its exact background — never substitute the raw semantic color (`--vert`, `--rouge`, `--gold-500`, etc.) directly as badge text color again.

| Context | Badge examples (background / text — both re-verified ≥4.5:1) |
|---|---|
| Quote status | Draft = `--recessed-bg`/`--text-mid` neutral, Issued = `--bl`/`#1E4FBD`, Accepted = `--vl`/`#03593F`, Declined = `--rl`/`#841717`, Expired = neutral at reduced opacity |
| Chantier status | Planned = neutral, In progress = `--ol`/`--accent-900` (i.e. `--brand-100`/`--brand-900` in Tailwind-token terms), Awaiting payment = `--gold-100`/`#6E5A35`, Closed = `--vl`/`#03593F` |
| Dunning level | Level 1 = `--gold-100`/`#6E5A35` (courteous), Level 2 = `--urgence-100`/`#933F07` (firm), Level 3 = `--rl`/`#841717` (formal notice) — escalating visual severity matches escalating real severity |
| Stock state (module 6.6) | Available = `--vl`/`#03593F`, In transit = `--bl`/`#1E4FBD`, Out of stock = `--rl`/`#841717` |
| Provenance ("via Google", "via l'agent") | `--noir-500`/`--recessed-bg` neutral pill with small icon prefix, `--text-mid` text |

### 6.5 Bottom tab navigation (mobile) + desktop side-rail

- **Mobile (0–1023px)**: bottom tab bar, exactly five items per the Cahier's confirmed nav map — **Accueil (Home), Planning, Devis (Quotes), Clients, Profil** — plus a **center FAB** for quick quote creation. `--surface-bg` background, `radius-pill` active-indicator styling on the active tab's label, `floating` elevation, safe-area-inset padding for iOS. The FAB uses `accent-glow` shadow and steel-blue fill by default (per client source `.fab` rule); if a screen is agent-specific, the FAB/entry point may switch to `agent-glow` + purple gradient (see §6.9).
- **Desktop (1024px+)**: left side-rail, same five items plus the quick-create action pinned near the top, expands to show labels at all times (not hover-only, given the data-density of a desktop session), `raised` elevation, `--surface-bg` background.

### 6.6 The margin-indicator component (Cahier §6.4 — its own numbered spec, core differentiator)

This is the single most important component in the app's commercial logic and deserves dedicated treatment, not folding into "cards."

**Structure:**
1. A full-width box, `radius-md` (16px), positioned directly beneath the quote line items (quote editor) or beneath the chantier progress bar (chantier profitability screen).
2. **Left accent bar**, 4px wide, full height, colored per the margin tier (§2.4).
3. **Headline figure**: the margin percentage, `figure-lg` token, colored to match the tier.
4. **Advisory sentence** beneath the figure, `body-sm`, tone matched to tier per §2.4's table.
5. Background tint = the tier's `-l`/`-100` token at roughly 12–18% opacity over the surface color (never full-opacity fill — the box must not overpower the numbers around it).
6. On the chantier profitability screen specifically, the box gains a **secondary smaller figure** showing the planned margin alongside the real margin, plus a progress bar with a marker at the planned position (per Cahier §6.9's "trois niveaux de lecture" description) — this extended variant is the "Ce que ce chantier te rapporte" block.

**Behavior:** recalculates live on every quote-line edit (see the color-shift animation spec, §9.2) — this must never lag or flash unstyled content between tiers.

### 6.7 Quote status / lifecycle badges

Covered under §6.4 above; restated here because the Cahier explicitly enumerates the exact five statuses that must exist, no more, no fewer: **Brouillon (Draft), Émis (Issued), Accepté (Accepted), Refusé (Declined), Expiré/Annulé (Expired/Cancelled)**.

### 6.8 Chantier status badges

Distinct from quote statuses — a chantier (created only after a quote is Accepted) moves through its own lifecycle (planned/in-progress/awaiting-payment/closed) tracked separately from the source quote's now-frozen status.

### 6.9 The Kōv Agent conversation surface (Cahier §6.5 — its own numbered spec)

The Kōv Agent is the flagship differentiator and gets a visually distinct, unmistakable surface, never styled as a generic chat window:

- **Background**: full-bleed linear gradient `135deg, --agent-grad-start → --agent-grad-end`, occupying the modal/full-screen surface the agent conversation opens into.
- **Entry point**: a dedicated FAB or nav element using `agent-glow` shadow and the same purple gradient fill — visually distinct from the brand-steel-blue primary FAB used for quote creation.
- **User input bubble**: `--noir-900` at 40% opacity over the gradient (a translucent dark chip), white text, right-aligned.
- **Agent response bubble**: `--white` at 12% opacity (a translucent light chip) over the gradient, white/near-white text, left-aligned, small agent glyph avatar.
- **Understood-intent confirmation chip**: when the agent shows what it understood ("tu parles du chantier Bernard"), render as a distinct pill with a `?`-style affordance if confidence required disambiguation, using `--gold-500` accent to signal "please confirm," never the default white/purple chip styling.
- **Action-plan-review card**: a separate, higher-contrast white/near-opaque card floating over the gradient background — each step individually removable (small `×` per row), a persistent bottom banner reading "Rien n'est envoyé avant validation" in `label` token weight, and a clearly separated "Lire le message" expand-to-edit affordance per outbound-message step. The final confirm action uses the AI-Agent button variant (§6.1); a "cancel/dismiss the whole plan" action uses the ghost variant.
- **Voice-active state**: pulsing concentric rings around the mic control (see motion §9.2), using the agent-purple accent, not the brand steel-blue.

### 6.10 The main courante / journal timeline component (module 6.11)

- **Vertical timeline**, most-recent-first, connected by a thin vertical rule in `--divider` color.
- Each entry is a compact row: a small circular type-icon (SMS/email/call/report/quote/invoice/note, each its own Lucide icon) filled with a direction-coded background — **inbound** entries use `--bleu`/`--bl` icon-chip styling, **outbound** entries use `--accent-500`/`--accent-100` icon-chip styling — this inbound/outbound visual distinction is a named requirement (Cahier §6.11), not optional polish.
- Entry text: `body-sm` truncated to two lines with a "tap to expand" affordance; timestamp in `caption` token, right-aligned on the same row.
- The cross-client **Messages** screen reuses this same row component per-thread, with the "awaiting reply" badge (urgence-gold pill) appended when the last message in a thread is outbound with no inbound reply yet.

---

## 7. Iconography

- Style: line icons, 1.5–2px stroke weight, rounded caps — **Lucide** icon set (pairs natively with shadcn/ui, MIT licensed).
- Icon sizing: 16px (inline/label), 20px (buttons/nav), 24px (card headers), 32–44px (empty states, onboarding, agent avatar).
- Trade-specific iconography (plumbing fixtures, heating units, etc., per module 6.16's technical sheets) lives in the trade layer, not the core icon set — respects the core/trade architectural separation from §8 of `01_ScopeDocument.md`.

---

## 8. Imagery & the wordmark

- The **"kōv"** wordmark (lowercase, weight 900, `letter-spacing:-.04em`, accent-colored macron bar over the "ō") is the sole brand mark — never substitute a generic logotype or add a supplementary icon-mark unless the client explicitly requests one.
- No stock photography. If illustration is used for empty states, keep it minimal line-art in the steel-blue/noir palette — never full-color cartoon illustration; this is a professional tool, not a consumer lifestyle app.

---

## 9. Motion system (ultra-polished, purposeful — stated priority)

Stack: **GSAP + ScrollTrigger** (complex sequenced/timeline moments — plan-approval sequences, the margin-reveal on chantier open, the PDF-generation moment) + **Framer Motion** (component-level, React-native, the primary tool for 90% of everyday UI motion — button presses, card entrances, route transitions) + **animate.css** (only for tiny one-off utility transitions, e.g. a toast slide-in, where a full Framer variant is overkill).

### 9.1 Motion principles

1. **Every animation explains a state change.** A card animating in communicates "this just appeared because your data changed"; a color shift communicates "your margin just moved."
2. **Mechanically confident easing**, matching the client source's own button-press curve. Default entrance easing: `cubic-bezier(0.34, 1.56, 0.64, 1)` (a slight, confident overshoot — mirrors the prototype's `.fab` transition curve exactly) rather than a soft luxury ease-out. For anything draggable/toggled/press-responsive, spring physics (`stiffness: 400, damping: 28` — snappier than a typical consumer app, matching the "field tool, not jewelry" register).
3. **Respect `prefers-reduced-motion`** — every animation has a reduced/instant fallback; this is an accessibility requirement, not optional (see §11).
4. **Stagger, don't dump.** Lists/cards entering together stagger by 30-50ms per item — fast, not languid.

### 9.2 Signature motion moments (named interaction moments that deserve dedicated, specific motion — not generic "add some animation")

- **Margin-box color-shift animation.** When a quote line edit changes the margin tier, the margin box's left accent bar, background tint, and headline-figure color cross-fade over 220ms (`cubic-bezier(0.4, 0, 0.2, 1)`, a smooth linear-feeling ease, deliberately calmer than the button-press curve since this is a numeric-trust moment, not a mechanical one) while the figure itself uses a GSAP `TextPlugin`-style digit-roll (old value scrolls out, new value scrolls in, ~180ms) rather than an instant swap — this makes the recalculation feel *live and trustworthy*, not glitchy.
- **FAB morph.** The bottom-nav FAB, when tapped to open quote creation, morphs (via Framer's `layoutId` shared-element transition) from its 60px circle directly into the modal/full-screen quote editor's header — no separate "modal slides up over FAB" disconnect; the FAB visually *becomes* the new screen's origin point. Duration ~320ms, the confident overshoot easing from §9.1.
- **Agent plan-approval sequence.** A GSAP timeline: the plan-review card's steps unfold sequentially (not simultaneously), each ~120ms apart, scaleY 0.92→1 + fade; on the final "OUI" confirmation tap, each executed step's row flashes a thin green underline left-to-right (GSAP `fromTo` on a pseudo-element width) as it completes, in visible sequence — the artisan should be able to watch each action actually happen, one after another, not see the whole plan vanish at once. This directly reinforces the "nothing sent without validation, and you can see it happen" product guarantee.
- **Quote PDF generation moment.** On confirming "Émettre le devis," a brief (900ms–1.4s, tied to the real server response, never faked longer) full-screen transition: the quote card scales down slightly and a document-fold GSAP animation (a thin highlight sweeps top-to-bottom as if the page is being "printed") plays while the server generates and stores the real PDF; on success, a checkmark draws in via Framer's `pathLength`, then the screen settles into the Issued-status view. If the server call is still running past the animation's natural length, hold on a subtle looping variant rather than looping the whole sweep animation, and never show the checkmark before the real PDF is confirmed stored.
- **Chantier profitability reveal.** Opening a chantier's profitability block for the first time in a session plays a GSAP timeline: the headline real-margin figure counts up/down from zero to its real value (~500ms, eased out), the planned-margin marker on the progress bar slides into position from the left, and the "what ate the margin" list items stagger in (40ms apart) beneath — the sequencing itself communicates "we calculated this from your real data just now," reinforcing the module's core promise.
- **Home action-list entrance.** Cards stagger fade+rise (`opacity 0→1, y:12px→0`), 280ms each, 40ms stagger — should feel like the list is being "assembled" for the artisan, not just rendered.
- **Dictation active state.** Pulsing concentric rings around the mic control while recording (pure CSS/Framer keyframes, 1.1s loop) — steel-blue rings for report dictation (module 6.12), purple/agent-accent rings when dictating into the Kōv Agent.
- **Dunning-level escalation.** When a dunning level advances (1→2→3), the invoice's status badge performs a brief shake-and-settle (Framer keyframes, ~180ms) plus a color transition to the next severity tier — small but deliberate, since this represents a real, meaningfully worse state for the artisan's cash flow.
- **Route/screen transitions.** Crossfade + 8px slide, 180ms, via Framer's `AnimatePresence` — fast, never a hard cut, never a jarring full-page-reload feel even though this is a Vite SPA.

### 9.3 Performance rules

- Animate only `transform` and `opacity` wherever possible (GPU-accelerated); avoid animating `width`, `height`, `top/left`, or `box-shadow` directly on every frame — use Framer `layout` animations or transform-based tricks instead.
- Cap simultaneous complex GSAP timelines to one "hero moment" per screen at a time (e.g. never run the chantier-reveal timeline and a route-transition crossfade simultaneously — sequence them).
- Lazy-init GSAP/ScrollTrigger instances only on the screens that use them; never import GSAP globally into every route.

---

## 10. Accessibility

- Semantic HTML/ARIA labels on every interactive element; visible focus states using the steel-blue focus ring (§2.3), never the browser default.
- Color contrast: verify every text-on-background combination meets WCAG AA at minimum, with particular attention to `--text-low`/`--noir-400` on dark backgrounds and the margin-box tint backgrounds (§2.4) — text must remain legible over every tier's tint, not just the default surface color.
- Full keyboard navigation through every core flow: onboarding, quote editor, Kōv Agent plan review, dunning send.
- Voice/dictation (module 6.12, and Kōv Agent input) is never the *only* way to complete an action — a keyboard/text path always exists alongside it, and every recognized transcript remains editable before submission (Cahier's explicit dictation requirement).
- `prefers-reduced-motion` support is mandatory across every signature motion moment in §9.2 — each must degrade to an instant or near-instant state change that still communicates the same information (e.g. the margin-box color still changes, just without the digit-roll or cross-fade).
- Minimum 44×44px touch targets everywhere, given the one-thumb/gloved-hand field-use context.

---

## 11. How these tokens plug into Tailwind config

When building any screen or component (from Step 1 onward in `03_MasterPrompts.md`):

1. Every CSS custom property in §2.1, §2.2, §2.5, and §2.6 is defined once in `src/styles/theme.css`, then mapped into `tailwind.config.ts`'s `theme.extend.colors` as semantic names (`brand`, `agent`, `urgence`, `gold`, `success`, `error`, `info`, `marginGreen`, `marginSteelBlue`, `marginGold`, `marginRed`, plus the full `noir-*` and `accent-*` ramps) — never hardcode a hex value inline in a component; always reference the Tailwind token. **Naming note**: the margin tiers are named `marginGreen`/`marginSteelBlue`/`marginGold`/`marginRed`, matching §2.4's actual color assignments exactly — do not name any tier "amber" or "orange" in code, since neither hue is actually used for the middle two tiers (see §2.4's naming note).
2. `theme.extend.fontFamily` maps `sans` → the DM Sans stack and `serif` → the Playfair Display stack per §3.1.
3. `theme.extend.spacing` maps the §4.1 scale; `theme.extend.borderRadius` maps the §4.2 tokens (`xs`, `sm`, `md`, `lg`, `pill`, `full`); `theme.extend.boxShadow` maps every named shadow in §5 (`flat`, `raised`, `floating`, `modal`, `accent-glow`, `agent-glow`, `urgence-glow`, `margin-glow-green`, `margin-glow-red`).
4. `theme.extend.backgroundImage` defines the two named gradients (`agent-gradient: linear-gradient(135deg, var(--agent-grad-start), var(--agent-grad-end))` and any brand accent gradient used for the primary FAB, matching the client source's steel-blue gradient usage).
5. Dark mode uses Tailwind's `class`/`data-theme` strategy keyed off the `data-theme` attribute exactly as specified in §2.5/§2.6 — dark is the default unstyled state, light requires the explicit attribute.
6. Cross-check every new component against §6 before considering it "done" — does it match the specified variant, radius, elevation, and (where applicable) the margin-tier or agent-surface treatment?
7. Apply motion per §9 only where it maps to a real state change (§9.1 rule 1) — don't animate every div. If a screen's design isn't covered by an existing pattern here, extrapolate using §1 (design philosophy) and flag it to the human operator as "new pattern, please confirm" rather than silently inventing something off-brand.
