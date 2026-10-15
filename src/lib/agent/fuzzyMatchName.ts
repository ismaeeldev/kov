/**
 * fuzzyMatchName — docs/06_AIPromptRegistry.md §2.2's "three-signal
 * recognition approach": the third signal, fault tolerance via Levenshtein
 * (edit) distance, implemented as its own explicit, deterministic,
 * unit-testable function rather than left to the model's own discretion.
 *
 * Given the model's `name_as_understood` output and a list of real
 * candidates (recent clients or projects), finds the closest match by edit
 * distance and converts that distance into a 0-1 confidence score. Pure,
 * framework-independent — same dual-use posture as src/lib/calc/, callable
 * from both the Edge Function (Deno) and any future client-side use.
 */

export interface FuzzyMatchCandidate {
  id: string
  name: string
}

export interface FuzzyMatchResult {
  id: string | null
  name_as_understood: string
  match_confidence: number
}

/** Classic Levenshtein edit distance (insertions/deletions/substitutions),
 * case-insensitive, accent-insensitive (job-site dictation/typos commonly
 * drop accents — "Bernard" vs "bernard" or "Berthelémy" vs "Berthelemy"
 * should not be penalized for that alone). */
export function levenshteinDistance(a: string, b: string): number {
  const s = normalize(a)
  const t = normalize(b)
  const m = s.length
  const n = t.length
  if (m === 0) return n
  if (n === 0) return m

  let prevRow = Array.from({ length: n + 1 }, (_, j) => j)
  let currRow = new Array(n + 1).fill(0)

  for (let i = 1; i <= m; i++) {
    currRow[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost, // substitution
      )
    }
    ;[prevRow, currRow] = [currRow, prevRow]
  }
  return prevRow[n]
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .trim()
}

/** Converts an edit distance into a 0-1 confidence score, normalized against
 * the longer of the two strings' length — a 1-character edit on a
 * 4-character name is a much bigger relative change than the same edit on a
 * 20-character name. */
function distanceToConfidence(distance: number, aLen: number, bLen: number): number {
  const maxLen = Math.max(aLen, bLen)
  if (maxLen === 0) return 1
  return Math.max(0, 1 - distance / maxLen)
}

/**
 * Finds the best match for `nameAsUnderstood` among `candidates` by edit
 * distance. Returns `id: null` (with `match_confidence: 0`) when there are
 * no candidates or `nameAsUnderstood` is empty — never a guessed id.
 */
export function fuzzyMatchName(
  nameAsUnderstood: string | null | undefined,
  candidates: FuzzyMatchCandidate[],
): FuzzyMatchResult {
  const query = (nameAsUnderstood ?? '').trim()
  if (!query || candidates.length === 0) {
    return { id: null, name_as_understood: query, match_confidence: 0 }
  }

  let best: { id: string; confidence: number } | null = null
  for (const candidate of candidates) {
    const distance = levenshteinDistance(query, candidate.name)
    const confidence = distanceToConfidence(distance, query.length, candidate.name.length)
    if (!best || confidence > best.confidence) {
      best = { id: candidate.id, confidence }
    }
  }

  return {
    id: best!.id,
    name_as_understood: query,
    match_confidence: Math.round(best!.confidence * 1000) / 1000,
  }
}
