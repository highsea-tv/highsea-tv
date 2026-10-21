// SPDX-License-Identifier: AGPL-3.0-only
// A worker task for the pool's tests.
export function double(n: number) {
  return n * 2
}

export function fail() {
  throw new Error('nope')
}

/** Waits until it's cancelled, then reports that it stopped. */
export function wait(_input: unknown, { signal }: { signal: AbortSignal }) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('never cancelled')), 10_000)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('stopped'))
    })
  })
}
