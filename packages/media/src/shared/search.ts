// SPDX-License-Identifier: AGPL-3.0-only
// Ranking names against what someone typed, for every media type's search.
import { fold } from './names.ts'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 2 when a name starts with the query at a word, 1 when it contains it, 0 otherwise. */
export function matchScore(name: string, query: string): number {
  const n = fold(name)
  const q = fold(query)
  if (!q || !n.includes(q)) return 0
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(q)}`, 'u').test(n) ? 2 : 1
}
