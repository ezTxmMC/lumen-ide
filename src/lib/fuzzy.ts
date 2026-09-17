/** A small fuzzy search: subsequence matches with a bonus for word starts. */

export interface FuzzyResult {
  score: number
  /** Indices of the matched characters — for highlighting. */
  matches: number[]
}

export function fuzzyMatch(text: string, query: string): FuzzyResult | null {
  if (!query) return { score: 0, matches: [] }

  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  const matches: number[] = []

  let score = 0
  let position = 0
  let previous = -2

  for (const char of needle) {
    if (char === ' ') continue
    const index = haystack.indexOf(char, position)
    if (index === -1) return null

    matches.push(index)
    if (index === previous + 1) score += 6            // zusammenhängend
    if (index === 0) score += 10                      // Wortanfang
    if (index > 0 && /[\s/\\._-]/.test(haystack[index - 1])) score += 8  // nach Trennzeichen
    score -= Math.min(index - position, 4)            // Sprünge kosten

    previous = index
    position = index + 1
  }

  // Shorter matches are usually the ones meant.
  score += Math.max(0, 24 - text.length / 3)
  return { score, matches }
}

export function highlightParts(text: string, matches: number[]) {
  if (matches.length === 0) return [{ text, hit: false }]
  const set = new Set(matches)
  const parts: { text: string; hit: boolean }[] = []
  let buffer = ''
  let currentHit = set.has(0)

  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i)
    if (hit !== currentHit) {
      if (buffer) parts.push({ text: buffer, hit: currentHit })
      buffer = ''
      currentHit = hit
    }
    buffer += text[i]
  }
  if (buffer) parts.push({ text: buffer, hit: currentHit })
  return parts
}
