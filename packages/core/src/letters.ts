// SPDX-License-Identifier: AGPL-3.0-only
// The A–Z index's letters, which the clients' libraries and the admin's Movies and Shows (HT-57)
// share: # for titles that don't start with a letter (a digit or a symbol), then A to Z.

export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] as const
export type Letter = (typeof LETTERS)[number]

/** The letter a sort title files under: its first character, or # for anything but A to Z. */
export const letterOfSorted = (sorted: string): Letter => {
  const c = sorted.charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? (c as Letter) : '#'
}

/**
 * Each letter's first place in a list already sorted by title: the place a letter jumps to. A
 * letter whose titles come apart (a # title sorted among the last) keeps its first place.
 */
export function letterFirsts<T>(items: readonly T[], sortedOf: (item: T) => string) {
  const out = new Map<Letter, number>()
  items.forEach((item, i) => {
    const l = letterOfSorted(sortedOf(item))
    if (!out.has(l)) out.set(l, i)
  })
  return out
}
