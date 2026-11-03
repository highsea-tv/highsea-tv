// SPDX-License-Identifier: AGPL-3.0-only
// The page sweep (Phase 2 checkpoint 5): every route × width, in three themes, every data state,
// 200% text and reduced motion. Each page must have no axe violations, no horizontal overflow and
// no page errors. Usage: bun scripts/sweeps/pages.ts [platform] [query], e.g. `web text=200`.
// A route apps/client holds is swept in the client itself (lib.ts's routeUrl), at its frame's size
// on the phone and the TV; reduced motion is the browser's too (Playwright's `reducedMotion`), which
// Reanimated reads as the OS's.
import {
  acknowledge,
  axe,
  escapes,
  launch,
  mixedRows,
  overflow,
  type Platform,
  pool,
  prototypeRoutes,
  routeUrl,
  servePrototypes,
  settle,
  settleAnimations,
  viewportFor,
  WIDTHS,
  WORKERS,
} from './lib.ts'

const [only, onlyQuery] = process.argv.slice(2) as [Platform | undefined, string | undefined]
const VARIANTS = onlyQuery
  ? [onlyQuery]
  : [
      'theme=default',
      'theme=oled',
      'theme=high-contrast',
      'data=empty',
      'data=loading',
      'data=error',
      'text=200',
      'motion=reduced',
    ]

const jobs = Object.entries(prototypeRoutes())
  .filter(([p]) => !only || p === only)
  .flatMap(([p, routes]) =>
    routes.flatMap((r) => WIDTHS[p as Platform].flatMap((w) => VARIANTS.map((q) => ({ r, w, q })))),
  )
  // a client frame has one size, so its widths are one job
  .filter(
    (j, i, all) =>
      all.findIndex(
        (k) =>
          k.r === j.r && k.q === j.q && viewportFor(k.r, k.w).width === viewportFor(j.r, j.w).width,
      ) === i,
  )

const stop = await servePrototypes()
const browser = await launch()
const problems: string[] = []
await pool(jobs, WORKERS, async ({ r, w: width, q }) => {
  let w = width
  const viewport = viewportFor(r, w)
  const page = await browser.newPage({
    viewport,
    reducedMotion: q === 'motion=reduced' ? 'reduce' : 'no-preference',
  })
  w = viewport.width
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  try {
    await page.addInitScript(() => localStorage.clear())
    await page.goto(routeUrl(r, q))
    // the loading state is the skeleton, which never settles into data: give it the time it needs
    if (q === 'data=loading') await page.waitForTimeout(600)
    else await settle(page)
    await acknowledge(page)
    await settleAnimations(page)
    const o = await overflow(page)
    const v = await axe(page)
    // controls in one row share one size (controls.md); the default theme is enough to measure
    if (q === VARIANTS[0]) for (const row of await mixedRows(page)) v.push(`mixed row: ${row}`)
    // a route the list names must draw its page; only the ones meant to miss may say not found
    if (!r.includes('nowhere') && (await page.locator('[data-not-found]').count()))
      errors.push('draws the not-found page')
    if (o > 0 || v.length || errors.length)
      problems.push(
        `${r} ${w} ${q}: ${o > 0 ? `overflow=${o} ${(await escapes(page)).join(' | ')} ` : ''}${[...v, ...errors].join(' ; ')}`,
      )
  } catch (e) {
    problems.push(`${r} ${w} ${q}: crashed: ${(e as Error).message.slice(0, 100)}`)
  }
  await page.close()
})
await browser.close()
stop()
console.log(problems.length ? problems.sort().join('\n') : `clean: ${jobs.length} pages`)
process.exit(problems.length ? 1 : 0)
