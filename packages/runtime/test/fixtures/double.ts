// SPDX-License-Identifier: AGPL-3.0-only
// A worker task for the pool's tests.
export function double(n: number) {
  return n * 2
}

export function fail() {
  throw new Error('nope')
}
