// SPDX-License-Identifier: AGPL-3.0-only
// The keyboard walk: Tab through every admin, web and mobile route. Every stop must be visible
// and show a focus indicator (WCAG 2.4.7). A stop whose indicator is drawn by a descendant is
// checked by comparing the element focused and blurred. A route apps/client holds is walked in the
// client itself (lib.ts's routeUrl).
// Usage: bun scripts/sweeps/keyboard.ts [platform], e.g. `web`.
import {
  acknowledge,
  launch,
  type Platform,
  pool,
  prototypeRoutes,
  routeUrl,
  servePrototypes,
  settle,
  viewportFor,
  WORKERS,
  walk,
} from './lib.ts'

const only = process.argv[2] as Platform | undefined
const routes = prototypeRoutes()
const jobs = [
  ...routes.admin.flatMap((r) => [1440, 390].map((w) => ({ p: 'admin', r, w }))),
  ...routes.web.flatMap((r) => [1440, 390].map((w) => ({ p: 'web', r, w }))),
  ...routes.mobile.map((r) => ({ p: 'mobile', r, w: 390 })),
]
  .filter((j) => !only || j.p === only)
  .filter(
    (j, i, all) =>
      all.findIndex(
        (k) => k.r === j.r && viewportFor(k.r, k.w).width === viewportFor(j.r, j.w).width,
      ) === i,
  )

const stop = await servePrototypes()
const browser = await launch()
const problems: string[] = []
await pool(jobs, WORKERS, async ({ r, w }) => {
  const page = await browser.newPage({ viewport: viewportFor(r, w) })
  try {
    await page.addInitScript(() => localStorage.clear())
    await page.goto(routeUrl(r))
    await settle(page)
    await acknowledge(page)
    const { stops, bad } = await walk(page)
    if (bad.length) problems.push(`${r} ${w} (${stops} stops): ${bad.slice(0, 6).join(' ; ')}`)
  } catch (e) {
    // one page's failure is a problem to report, not a reason to stop the sweep (as server.ts)
    problems.push(`${r} ${w}: crashed: ${(e as Error).message.split('\n')[0]?.slice(0, 160)}`)
  } finally {
    await page.close()
  }
})
await browser.close()
stop()
console.log(problems.length ? problems.sort().join('\n') : `clean: ${jobs.length} pages walked`)
process.exit(problems.length ? 1 : 0)
