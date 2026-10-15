/**
 * financingSimulation — docs/06_AIPromptRegistry.md §3.4
 * (financing-simulation-calc). Standard loan amortization formula,
 * purely deterministic, ZERO AI involvement — never AI-estimated per the
 * explicit spec wording. Every simulation this feeds defaults
 * `indicative_only = true` and the UI must display that prominently — see
 * docs/01_ScopeDocument.md §5.15's legal-caution warning: hardcoded
 * eligibility rules must never be presented as reliable financial advice.
 */

export interface AmortizationInput {
  amount: number
  termMonths: number
  ratePctAnnual: number
}

/** Standard fixed-rate loan amortization formula:
 *   M = P * r / (1 - (1 + r)^-n)
 * where P = principal, r = monthly rate (annual rate / 12 / 100), n = term
 * in months. A 0% rate divides by zero in this formula, so it's handled as
 * the genuinely correct simpler case: principal spread evenly over the term. */
export function calculateMonthlyPayment(input: AmortizationInput): number {
  const { amount, termMonths, ratePctAnnual } = input
  if (termMonths <= 0) return 0
  if (ratePctAnnual === 0) {
    return roundCents(amount / termMonths)
  }
  const monthlyRate = ratePctAnnual / 100 / 12
  const payment = (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
  return roundCents(payment)
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}
