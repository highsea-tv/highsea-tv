// SPDX-License-Identifier: AGPL-3.0-only
// Strings in typed message catalogs (ADR 0021). A catalog is an object of ICU messages, English
// first; `createT` formats them, and an unknown id or a missing value doesn't compile.
import { IntlMessageFormat } from 'intl-messageformat'

export type Messages = Record<string, string>

/** Declares a catalog, keeping each message's literal type so its arguments can be checked. */
export const defineMessages = <const M extends Messages>(messages: M): M => messages

export type Value = string | number | Date

type Trim<S extends string> = S extends ` ${infer R}`
  ? Trim<R>
  : S extends `${infer R} `
    ? Trim<R>
    : S
/**
 * A plain argument name, not a branch's text (`# jobs`), anything with spaces, or a branch that
 * starts with an argument (`{{name} is first}`: the argument is found on the next brace).
 */
type Name<S extends string> =
  Trim<S> extends `${string} ${string}` | `#${string}` | `{${string}` | '' ? never : Trim<S>
type NameOf<S extends string> = S extends `${infer N}}${string}`
  ? N extends `${infer M},${string}`
    ? Name<M>
    : Name<N>
  : S extends `${infer M},${string}`
    ? Name<M>
    : never
/** The argument names in an ICU message: `{name}`, `{count, plural, …}`. */
export type Args<S extends string> = S extends `${string}{${infer Rest}`
  ? NameOf<Rest> | Args<Rest>
  : never

export type ValuesFor<S extends string> = [Args<S>] extends [never] ? [] : [Record<Args<S>, Value>]

export type T<M extends Messages> = <K extends keyof M & string>(
  id: K,
  ...values: ValuesFor<M[K]>
) => string

/**
 * A formatter for `source` in `locale`. `translations` (the locale's JSON, by the same ids)
 * replaces what it has; anything missing falls back to the English source.
 */
export function createT<M extends Messages>(
  source: M,
  locale = 'en',
  translations: Partial<Record<keyof M, string>> = {},
): T<M> {
  const cache = new Map<string, IntlMessageFormat>()
  return (id, ...values) => {
    let format = cache.get(id)
    if (!format) {
      const message = translations[id] ?? source[id]
      if (message === undefined) return id
      format = new IntlMessageFormat(message, locale)
      cache.set(id, format)
    }
    return String(format.format(values[0] as Record<string, Value> | undefined))
  }
}

/** Ids a translation has that the source doesn't: they'd never be shown, so they're mistakes. */
export const unknownIds = (source: Messages, translation: Record<string, string>) =>
  Object.keys(translation).filter((id) => !(id in source))
