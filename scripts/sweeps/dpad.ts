// SPDX-License-Identifier: AGPL-3.0-only
// D-pad reachability on every TV route: from the screen's initial focus, every visible focusable
// must be reachable with the arrow keys (tv.md#spatial-focus-model). A route apps/client holds is
// walked in the client itself at the TV's 1080p (lib.ts's routeUrl), whose stops are its focus
// engine's `[data-focusable]` (packages/ui/src/native/tv/engine.web.tsx).
// Usage: bun scripts/sweeps/dpad.ts
import { heldByClient } from '../../design/prototypes/src/chrome/client.ts'
import {
  launch,
  pool,
  prototypeRoutes,
  routeUrl,
  servePrototypes,
  settle,
  viewportFor,
  WORKERS,
} from './lib.ts'

const stop = await servePrototypes()
const browser = await launch()
const problems: string[] = []
await pool([...prototypeRoutes().tv, '/tv/nowhere'], WORKERS, async (r) => {
  const page = await browser.newPage({ viewport: viewportFor(r, 1600) })
  const stops = heldByClient(r) ? '[data-focusable]' : '[data-platform="tv"] [data-focusable]'
  await page.addInitScript(() => localStorage.clear())
  await page.goto(routeUrl(r))
  await settle(page)
  if (await page.getByRole('button', { name: 'Got it' }).count()) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
  }
  if (r.startsWith('/tv/play')) await page.keyboard.press('ArrowDown')
  await page.evaluate(
    (stops) =>
      document.querySelectorAll(stops).forEach((e, i) => {
        e.setAttribute('data-k', String(i))
      }),
    stops,
  )
  const start = await page.evaluate(() => document.activeElement?.getAttribute('data-k') ?? null)
  if (start === null) {
    problems.push(`${r}: no initial focus`)
    await page.close()
    return
  }
  const seen = new Set([start])
  const queue = [start]
  while (queue.length) {
    const k = queue.shift() as string
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      await page.evaluate((k) => {
        const el = document.querySelector<HTMLElement>(`[data-k="${k}"]`)
        el?.focus({ preventScroll: true })
        // a region may send focus arriving from outside to its own start (the TV's nav starts on
        // the current page): focus again from where it landed, as a press inside it would
        if (el && document.activeElement !== el) el.focus({ preventScroll: true })
      }, k)
      await page.keyboard.press(key)
      await page.waitForTimeout(30)
      const n = await page.evaluate(() => document.activeElement?.getAttribute('data-k') ?? null)
      if (n !== null && !seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  const missing = await page.evaluate(
    (seen) =>
      [...document.querySelectorAll('[data-k]')]
        .filter(
          (e) =>
            !seen.includes(e.getAttribute('data-k') ?? '') &&
            e.getBoundingClientRect().width > 0 &&
            // behind a modal question, on purpose
            !e.closest('[inert]'),
        )
        .map((e) => (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30)),
    [...seen],
  )
  if (missing.length) problems.push(`${r}: unreachable: ${missing.slice(0, 8).join(' | ')}`)
  await page.close()
})
await browser.close()
stop()
console.log(problems.length ? problems.sort().join('\n') : 'clean: every TV focusable is reachable')
process.exit(problems.length ? 1 : 0)
