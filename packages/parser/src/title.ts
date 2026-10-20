// SPDX-License-Identifier: AGPL-3.0-only
// Turning the text before the first tag into a title: separators made spaces, leftover brackets
// and punctuation trimmed, and, for names that carry a title in two scripts ("Голубая волна / Blue
// Crush", "抓娃娃 Successor"), the Latin-script title kept, since that's the one metadata matches.

/** A letter that isn't Latin script: Cyrillic, Han, kana, Hangul, Arabic… */
const NON_LATIN = /(?=\p{L})(?!\p{Script=Common}|\p{Script=Inherited})\P{Script=Latin}/u
const LATIN = /\p{Script=Latin}/u
const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
// Brackets the CJK names use to open a subtitle or tag block.
const CJK_BRACKETS = /[『「【〔《]/u

export function cleanTitle(raw: string): string {
  let t = raw
  const cjk = CJK_BRACKETS.exec(t)
  if (cjk && cjk.index > 0) t = t.slice(0, cjk.index)
  t = cutUnclosed(t)
  // A title keeps the full stop it ends on when a space follows it ("Samrat & Co. (2014)",
  // "Princess Principal. [Batch"), and an ellipsis always ("What.If...2010").
  const stop =
    /\p{L}\.{3}$/u.test(t) || /\p{L}\.{3}[\s([]+$/u.test(t)
      ? '...'
      : /\p{L}\.\s[\s([]*$/u.test(t)
        ? '.'
        : ''
  t = trimEdges(t)

  if (/\s/.test(t)) {
    // Spaces separate the words, so dots are the title's own ("Mr. Robot", "S.H.I.E.L.D."), except
    // between whole words written dot-separated inside a spaced name ("… Last.Call.for.Istanbul").
    // Two or more such dots are a dotted run; one ("takt op.Destiny") is the title's own.
    t = t.replace(/_/g, ' ')
    const joins = t.match(/(?<=\p{L}{2})\.(?=\p{L}{2})/gu) ?? []
    if (joins.length >= 2) t = t.replace(/(?<=\p{L}{2})\.(?=\p{L}{2})/gu, ' ')
  } else {
    // Dots or underscores separate the words. An ellipsis stays one ("What.If...", "tick...BOOM").
    // Initialisms keep their dots ("L.A.Confidential", "Magnum.P.I.2018", "S.H.I.E.L.D").
    t = t
      .replace(/\.{4,}/g, '… ')
      .replace(/\.{3}/g, '…')
      .replace(
        /(?<![\p{L}\p{N}])(?:\p{Lu}\.){1,}\p{Lu}(?:\.|(?![\p{L}\p{N}]))/gu,
        (m) => `${m.replace(/\./g, '\uE000')}${m.endsWith('.') ? '' : '\uE000'} `,
      )
      .replace(/[._]/g, ' ')
      .replace(/…/g, '...')
      .replace(/\uE000/g, '.')
  }
  t = t.replace(/\s+/g, ' ').trim()

  t = latinTitle(t)
  const initialism = /(?<![\p{L}\p{N}])(?:\p{Lu}\.){2,}\s*$/u.test(t)
  t = trimEdges(t).replace(/\s+/g, ' ').trim()
  if (initialism && !t.endsWith('.')) t += '.'
  if (stop && /\p{L}$/u.test(t)) t += stop
  return t
}

/** Cuts at the first bracket that never closes: "Easy Rider (Drama 1969)" ends at "(". */
function cutUnclosed(t: string): string {
  const stack: number[] = []
  const closers = new Set(Object.values(OPENERS))
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string
    if (OPENERS[c]) stack.push(i)
    else if (closers.has(c)) {
      const open = stack[stack.length - 1]
      if (open !== undefined && OPENERS[t[open] as string] === c) stack.pop()
    }
  }
  const cut = stack[0]
  return cut === undefined ? t : t.slice(0, cut)
}

function trimEdges(t: string): string {
  let out = t.replace(/[\s._\-–—([{/|,:;+*★~=]+$/u, '').replace(/^[\s._\-–—/|,:;+*★~=]+/u, '')
  // A leading closer, or an opener that never closes.
  out = out.replace(/^[)\]}]+\s*/u, '')
  if (/^[([{]/.test(out) && cutUnclosed(out) === '') out = out.slice(1)
  return out.trim()
}

/** Drops a bracketed group at the end, nested ones included: "(Зиги Ротемунд / Sigi (as Siggi))". */
function dropTrailingGroup(t: string): string {
  const s = t.trimEnd()
  if (!s.endsWith(')')) return t
  let depth = 0
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++
    else if (s[i] === '(' && --depth === 0) return s.slice(0, i).trimEnd()
  }
  return t
}

/** For titles in two scripts, the Latin one. */
function latinTitle(t: string): string {
  // Where scripts meet without a space ("MAO摩绪"), they're two words.
  // Cyrillic glued to a Latin word ("АBullet.Train") splits too, but not a stray Latin letter
  // inside a Cyrillic word ("Кнiганошы").
  t = t
    .replace(
      /(?<=\p{Script=Latin})(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/gu,
      ' ',
    )
    .replace(/(?<=\p{Script=Cyrillic})(?=\p{Script=Latin}{3})/gu, ' ')
    .replace(/(?<=\p{Script=Latin}{3})(?=\p{Script=Cyrillic})/gu, ' ')
  if (!NON_LATIN.test(t) || !LATIN.test(t)) {
    if (!NON_LATIN.test(t)) return t
    // Russian trackers write "Название (Режиссёр) [year, genre, source]": the director goes.
    const bare = dropTrailingGroup(t)
    // "Русское название / Original title"; with only Cyrillic, the last.
    if (/ \/ /.test(bare)) return bare.split(/\s+\/\s+/).pop() ?? bare
    return bare || t
  }
  if (/ \/ /.test(t)) {
    // "Американские животные / American Animals (Барт Лэйтон / Bart Layton)": the director in
    // brackets goes, then the titles up to the last non-Latin one.
    const parts = dropTrailingGroup(t).split(/\s+\/\s+/)
    let last = -1
    parts.forEach((p, i) => {
      if (NON_LATIN.test(p)) last = i
    })
    const rest = parts.slice(last + 1)
    if (rest.length > 0) return rest.join(' / ')
    return parts[parts.length - 1] ?? t
  }
  // "抓娃娃 Successor", "О мышах и людях (Of Mice and Men)": the longest run of Latin words.
  const words = t.split(' ')
  let best: string[] = []
  let run: string[] = []
  const flush = () => {
    if (run.filter((w) => LATIN.test(w)).length >= best.filter((w) => LATIN.test(w)).length) {
      best = run
    }
    run = []
  }
  for (const w of words) {
    if (NON_LATIN.test(w)) flush()
    else run.push(w)
  }
  flush()
  const picked = best.join(' ').trim()
  if (!LATIN.test(picked)) return t
  return picked.replace(/^\((.*)\)$/u, '$1')
}
