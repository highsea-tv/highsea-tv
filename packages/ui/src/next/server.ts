// SPDX-License-Identifier: AGPL-3.0-only
// What the library needs on a Next.js host's server (one-client-platform-d.md › D1). Reanimated
// schedules frames with `requestAnimationFrame` as its modules load and its hooks run, which Node
// lacks, and its guide for Next.js asks for that to be polyfilled on the server
// (https://docs.swmansion.com/react-native-reanimated/docs/guides/web-support#nextjs-polyfill). The
// server draws one frame and never animates, so a frame here is a timer that runs once.

/** Gives Node `requestAnimationFrame` and `cancelAnimationFrame`, unless it has them. */
export function polyfillAnimationFrame(): void {
  const scope = globalThis as {
    requestAnimationFrame?: (run: (at: number) => void) => unknown
    cancelAnimationFrame?: (id: unknown) => void
  }
  if (scope.requestAnimationFrame) return
  scope.requestAnimationFrame = (run) => setTimeout(() => run(performance.now()), 0)
  scope.cancelAnimationFrame = (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
}
