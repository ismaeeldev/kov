/**
 * confidenceGate — docs/06_AIPromptRegistry.md §2.2's exact guardrail: "score
 * dépasse un seuil ET se détache nettement de la deuxième hypothèse" (Cahier
 * §6.5). An intent only auto-proceeds to plan generation when BOTH:
 *   1. intent_confidence exceeds INTENT_CONFIDENCE_THRESHOLD (0.6), AND
 *   2. the margin over second_best_confidence exceeds INTENT_CONFIDENCE_GAP (0.2)
 * Otherwise disambiguation is required. Enforced server-side — never trust
 * the model's own needs_disambiguation flag alone (§2.2's implementation
 * note: re-derive this decision deterministically after the model call).
 */

export const INTENT_CONFIDENCE_THRESHOLD = 0.6
export const INTENT_CONFIDENCE_GAP = 0.2

/** Confidences are 0-1 floats (from the model's own output or the fuzzy
 * matcher), so a raw subtraction can land a hair on either side of the gap
 * threshold purely from IEEE 754 imprecision (e.g. 0.9 - 0.7 = 0.20000000000000007
 * in JS) — rounding to 3 decimal places before comparing keeps the gate's
 * behavior at a boundary value deterministic and matching what a human
 * reading "0.8 vs 0.6, gap exactly 0.2" would expect. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function shouldAutoProceed(intentConfidence: number, secondBestConfidence: number): boolean {
  const gap = round3(intentConfidence - secondBestConfidence)
  return intentConfidence > INTENT_CONFIDENCE_THRESHOLD && gap > INTENT_CONFIDENCE_GAP
}
