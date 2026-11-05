// SPDX-License-Identifier: AGPL-3.0-only
// Node's timers, typed so they hold in a program that also has React Native's types.
//
// The server's program has both since the admin draws with the library's native renderer
// (one-client-platform-d.md, D1): React Native's `src/types/globals.d.ts` declares global
// `setTimeout`, `setInterval` and `setImmediate` returning a number, beside @types/node's returning
// a Timeout or an Immediate. For a call such as `setTimeout(() => …, ms)`, TypeScript picks React
// Native's non-generic overload, the closer match (https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads),
// so the handle types as a number there, though Node always returns an object
// (https://nodejs.org/api/timers.html#class-timeout). This takes the handle as it's typed anywhere.

/**
 * Lets a timer's handle stop keeping Node's event loop open (https://nodejs.org/api/timers.html#timeoutunref).
 * Does nothing for a handle without `unref`, or none.
 */
export function unref(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}
