// SPDX-License-Identifier: AGPL-3.0-only
// The page sweep (Phase 2 checkpoint 5): every route × width, in three themes, every data state,
// 200% text and reduced motion. Each page must have no axe violations, no horizontal overflow and
// no page errors. Usage: bun scripts/sweeps/pages.ts [platform] [query], e.g. `web text=200`.
import {
  acknowledge,
  axe,
  escapes,
  heightFor,
  launch,
  overflow,
  type Platform,
  pool,
  prototypeRoutes,
  screenUrl,
  settleAnimations,
  WIDTHS,
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

const browser = await launch()
const problems: string[] = []
await pool(jobs, 6, async ({ r, w, q }) => {
  const page = await browser.newPage({ viewport: { width: w, height: heightFor(w) } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  try {
    await page.addInitScript(() => localStorage.clear())
    await page.goto(screenUrl(r, q))
    await page.waitForTimeout(q === 'data=loading' ? 600 : 1500)
    await acknowledge(page)
    await settleAnimations(page)
    const o = await overflow(page)
    const v = await axe(page)
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
console.log(problems.length ? problems.sort().join('\n') : `clean: ${jobs.length} pages`)
process.exit(problems.length ? 1 : 0)
