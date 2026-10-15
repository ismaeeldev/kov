import { describe, expect, it } from 'vitest'
import { fuzzyMatchName, levenshteinDistance } from './fuzzyMatchName'

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('Bernard', 'Bernard')).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(levenshteinDistance('Bernard', 'bernard')).toBe(0)
  })

  it('is accent-insensitive', () => {
    expect(levenshteinDistance('Berthélémy', 'Berthelemy')).toBe(0)
  })

  it('counts a single substitution as distance 1', () => {
    expect(levenshteinDistance('Bernard', 'Bernand')).toBe(1)
  })

  it('counts a single insertion/deletion as distance 1', () => {
    expect(levenshteinDistance('Bernard', 'Bernar')).toBe(1)
  })

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'Bernard')).toBe(7)
    expect(levenshteinDistance('Bernard', '')).toBe(7)
    expect(levenshteinDistance('', '')).toBe(0)
  })
})

describe('fuzzyMatchName', () => {
  const candidates = [
    { id: 'client-1', name: 'Bernard Dupont' },
    { id: 'client-2', name: 'Martine Lefevre' },
    { id: 'client-3', name: 'Chantier Bernard' },
  ]

  it('resolves a deliberately misspelled/mis-transcribed name to the correct client', () => {
    // A realistic voice-transcription typo: "Bernar Dupont" (missing the
    // final d) should still resolve to "Bernard Dupont", not fail to match
    // or match the wrong candidate.
    const result = fuzzyMatchName('Bernar Dupont', candidates)
    expect(result.id).toBe('client-1')
    expect(result.match_confidence).toBeGreaterThan(0.9)
  })

  it('picks the closest candidate among several plausible ones', () => {
    const result = fuzzyMatchName('Chantié Bernard', candidates)
    expect(result.id).toBe('client-3')
  })

  it('returns id null with zero confidence for an empty query', () => {
    const result = fuzzyMatchName('', candidates)
    expect(result.id).toBeNull()
    expect(result.match_confidence).toBe(0)
  })

  it('returns id null with zero confidence when there are no candidates', () => {
    const result = fuzzyMatchName('Bernard Dupont', [])
    expect(result.id).toBeNull()
    expect(result.match_confidence).toBe(0)
  })

  it('gives a low confidence score for a name with no real match', () => {
    const result = fuzzyMatchName('Zzzxxqqyy Noreal', candidates)
    expect(result.match_confidence).toBeLessThan(0.4)
  })

  it('gives exact-match confidence of 1', () => {
    const result = fuzzyMatchName('Martine Lefevre', candidates)
    expect(result.id).toBe('client-2')
    expect(result.match_confidence).toBe(1)
  })
})
