// SPDX-License-Identifier: AGPL-3.0-only
/** A value a test has just made sure of: fails the test, rather than asserting, when it's absent. */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected a ${what}`)
  return value
}
