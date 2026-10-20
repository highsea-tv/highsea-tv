// SPDX-License-Identifier: AGPL-3.0-only
// The keyboard walk: Tab through every admin, web and mobile route. Every stop must be visible
// and show a focus indicator (WCAG 2.4.7). A stop whose indicator is drawn by a descendant is
// checked by comparing the element focused and blurred. Usage: bun scripts/sweeps/keyboard.ts
import { acknowledge, heightFor, launch, pool, prototypeRoutes, screenUrl, walk } from './lib.ts'

const routes = prototypeRoutes()
const jobs = [
  ...routes.admin.flatMap((r) => [1440, 390].map((w) => ({ r, w }))),
  ...routes.web.flatMap((r) => [1440, 390].map((w) => ({ r, w }))),
  ...routes.mobile.map((r) => ({ r, w: 390 })),
]

const browser = await launch()
const problems: string[] = []
await pool(jobs, 5, async ({ r, w }) => {
  const page = await browser.newPage({ viewport: { width: w, height: heightFor(w) } })
  await page.addInitScript(() => localStorage.clear())
  await page.goto(screenUrl(r))
  await page.waitForTimeout(1400)
  await acknowledge(page)
  const { stops, bad } = await walk(page)
  if (bad.length) problems.push(`${r} ${w} (${stops} stops): ${bad.slice(0, 6).join(' ; ')}`)
  await page.close()
})
await browser.close()
console.log(problems.length ? problems.sort().join('\n') : `clean: ${jobs.length} pages walked`)
process.exit(problems.length ? 1 : 0)
