/**
 * margin-tier-calc — docs/06_AIPromptRegistry.md §3.2.
 *
 * Pure, framework-independent TypeScript, same dual-use contract as
 * quoteTotals.ts (frontend live feedback + server-side authoritative calc).
 *
 * Exact boundaries (load-bearing, do not change without updating every
 * consumer): green >30%, steelBlue >20%, gold >10% (this also covers the
 * 0–10% "caution" band per docs/06_AIPromptRegistry.md §3.2's explicit note —
 * there is no separate/undefined fifth state for that band), red <=0%.
 *
 * NAMING: tier variants are green/steelBlue/gold/red — NEVER "amber" or
 * "orange" for the middle two tiers (neither hue is actually used; see
 * docs/02_ThemeGuideline.md §2.4's naming note). `src/components/ui/MarginBox.tsx`
 * consumes this module directly — it must never re-implement these boundaries
 * separately (docs/06_AIPromptRegistry.md §3.2: "never re-implemented
 * separately in two places").
 */

export type MarginTier = 'green' | 'steelBlue' | 'gold' | 'red'

export interface MarginTierResult {
  tier: MarginTier
  /** Tailwind class tokens for this tier — docs/02_ThemeGuideline.md §2.4/§6.6. */
  colorTokens: {
    accentBar: string
    figureText: string
    tintBg: string
  }
  /** Short advisory copy shown alongside the figure (French, per the app's locale). */
  advisory: string
}

// Tint opacities and advisory copy mirror src/components/ui/MarginBox.tsx's
// existing tuned values exactly (built in Step 2, ahead of this module) —
// this module is now the single source of truth going forward, but must not
// regress the already-tuned copy/opacities that shipped first.
const TIER_CONFIG: Record<MarginTier, Omit<MarginTierResult, 'tier'>> = {
  green: {
    colorTokens: {
      accentBar: 'bg-margin-green',
      figureText: 'text-margin-green',
      tintBg: 'bg-margin-green/[0.15]',
    },
    advisory: 'Marge solide',
  },
  steelBlue: {
    colorTokens: {
      accentBar: 'bg-margin-steel-blue',
      figureText: 'text-margin-steel-blue',
      tintBg: 'bg-margin-steel-blue/[0.15]',
    },
    advisory: 'Marge correcte',
  },
  gold: {
    colorTokens: {
      accentBar: 'bg-margin-gold',
      figureText: 'text-margin-gold',
      tintBg: 'bg-margin-gold/[0.18]',
    },
    advisory: 'Marge serrée, vérifie les lignes',
  },
  red: {
    colorTokens: {
      accentBar: 'bg-margin-red',
      figureText: 'text-margin-red',
      tintBg: 'bg-margin-red/[0.18]',
    },
    advisory: 'Marge négative — ce devis te coûte de l’argent',
  },
}

/**
 * Maps a margin percentage to its tier, color tokens, and advisory copy.
 * `marginPct` is null-safe at the call site's discretion — this function
 * itself requires a number; callers with a possibly-null margin (e.g. a
 * zero-line quote, see quoteTotals.ts's `projected_margin_pct: number | null`)
 * must decide their own "no margin yet" rendering before calling this.
 */
export function getMarginTier(marginPct: number): MarginTierResult {
  let tier: MarginTier
  if (marginPct > 30) tier = 'green'
  else if (marginPct > 20) tier = 'steelBlue'
  else if (marginPct > 0)
    tier = 'gold' // covers the full (0, 20] range down to the 0-10% "caution" band
  else tier = 'red' // <= 0%

  return { tier, ...TIER_CONFIG[tier] }
}
