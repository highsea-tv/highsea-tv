// SPDX-License-Identifier: AGPL-3.0-only
// How well a command matches what's typed, for the command palette: the ranking the web renderer's
// palette had from cmdk (https://github.com/pacocoursey/cmdk, its `defaultFilter`, which is
// command-score, https://github.com/superhuman/command-score), written here so the native one keeps
// the same results in the same order. What's typed must appear in the command's words in order, not
// necessarily together; a letter next to the last scores best, then one starting a word after a
// space or a dash, then one after punctuation, and a letter in the middle of a word worst. Each
// letter skipped on the way costs a little, a case that differs a very little, and a match that
// leaves the words unfinished a little. Two letters typed the wrong way round still match, poorly.
// 0 is no match; 1 is the words exactly.
//
// Ported from cmdk 1.1.1 (its score chunk), which is MIT-licensed; its notice comes with the port:
//
// MIT License
//
// Copyright (c) 2022 Paco Coursey
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/** The next letter follows the last. */
const NEXT = 1
/** The next letter starts a word after a space or a dash. */
const AFTER_SPACE = 0.9
/** The next letter starts a word after punctuation (a slash, a dot, a bracket…). */
const AFTER_PUNCTUATION = 0.8
/** The next letter is in the middle of a word. */
const IN_A_WORD = 0.17
/** Two letters typed the wrong way round. */
const SWAPPED = 0.1
/** Each letter skipped to reach the next. */
const SKIPPED = 0.999
/** The letter's case differs from what was typed. */
const OTHER_CASE = 0.9999
/** Everything typed matched, with words left over. */
const UNFINISHED = 0.99

const PUNCTUATION = /[\\/_+.#"@[({&]/
const PUNCTUATIONS = /[\\/_+.#"@[({&]/g
const SPACE = /[\s-]/
const SPACES = /[\s-]/g

/** Lower case, with every space and dash a space, for matching. */
const folded = (s: string) => s.toLowerCase().replace(SPACES, ' ')

/** How many of a pattern's characters a stretch has. */
const count = (s: string, pattern: RegExp) => s.match(pattern)?.length ?? 0

/**
 * The best score for matching `typed` from its `at` letter on, in `words` from its `from` letter on
 * (`low` and `lowTyped` are the folded forms). Memoized by position, since the same tail is reached
 * by many paths.
 */
function best(
  words: string,
  typed: string,
  low: string,
  lowTyped: string,
  from: number,
  at: number,
  memo: Map<number, number>,
): number {
  if (at === typed.length) return from === words.length ? NEXT : UNFINISHED
  const key = from * (typed.length + 1) + at
  const known = memo.get(key)
  if (known !== undefined) return known
  const letter = lowTyped.charAt(at)
  let top = 0
  for (let i = low.indexOf(letter, from); i >= 0; i = low.indexOf(letter, i + 1)) {
    let score = best(words, typed, low, lowTyped, i + 1, at + 1, memo)
    if (score > top) {
      if (i === from) score *= NEXT
      else if (PUNCTUATION.test(words.charAt(i - 1))) {
        score *= AFTER_PUNCTUATION
        const skipped = count(words.slice(from, i - 1), PUNCTUATIONS)
        if (skipped > 0 && from > 0) score *= SKIPPED ** skipped
      } else if (SPACE.test(words.charAt(i - 1))) {
        score *= AFTER_SPACE
        const skipped = count(words.slice(from, i - 1), SPACES)
        if (skipped > 0 && from > 0) score *= SKIPPED ** skipped
      } else {
        score *= IN_A_WORD
        if (from > 0) score *= SKIPPED ** (i - from)
      }
      if (words.charAt(i) !== typed.charAt(at)) score *= OTHER_CASE
    }
    // two letters the wrong way round ("teh"): try the one after next here instead
    const swapped =
      (score < SWAPPED && low.charAt(i - 1) === lowTyped.charAt(at + 1)) ||
      (lowTyped.charAt(at + 1) === lowTyped.charAt(at) && low.charAt(i - 1) !== lowTyped.charAt(at))
    if (swapped) {
      const other = best(words, typed, low, lowTyped, i + 1, at + 2, memo)
      if (other * SWAPPED > score) score = other * SWAPPED
    }
    if (score > top) top = score
  }
  memo.set(key, top)
  return top
}

/** How well `typed` matches a command's words and its keywords: 0 (no match) to 1. */
export function commandScore(words: string, typed: string, keywords: readonly string[] = []) {
  const all = keywords.length > 0 ? `${words} ${keywords.join(' ')}` : words
  return best(all, typed, folded(all), folded(typed), 0, 0, new Map())
}
