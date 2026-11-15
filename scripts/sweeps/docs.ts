// SPDX-License-Identifier: AGPL-3.0-only
// The guides' sweep (one-client-platform-e.md › E2): builds the guides (apps/docs), serves their
// static export as a host would, and loads every page at 1440 and 390 in the site's one theme. Each
// page must have no axe violations (Fumadocs' frame's included: none is let through), no horizontal
// overflow, no page or console errors, and every keyboard stop visible with a focus indicator
// (lib.ts's walk). Without scripts too, each page must
// already show its figures: as many pictures as its guide has images, each with its alt text, as
// the export is drawn before any script runs (the root layout writes the library's sheet).
// Usage: bun scripts/sweeps/docs.ts [--no-build] [path...], e.g. `--no-build settings/backups/`.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { axe, escapes, launch, overflow, pool, ROOT, settle, WORKERS, walk } from './lib.ts'

const DOCS = join(ROOT, 'apps/docs')
const OUT = process.env.SWEEP_DOCS_OUT ?? join(DOCS, 'out')
const CONTENT = join(DOCS, 'content')
const PORT = Number(process.env.SWEEP_DOCS_PORT ?? 3170)
const WIDTHS = [1440, 390]

const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith('--'))
if (!args.includes('--no-build')) {
  console.log('building the guides…')
  execFileSync('bun', ['run', 'build'], { cwd: DOCS, stdio: ['ignore', 'ignore', 'inherit'] })
}
if (!existsSync(OUT)) throw new Error('no export in apps/docs/out: build the guides first')

/** Every page of the export, as its path: `/`, `/install/docker/`. */
const pages = readdirSync(OUT, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('index.html') && !f.startsWith('_next'))
  .map((f) => `/${f.slice(0, -'index.html'.length)}`)
  .filter((p) => !only.length || only.some((o) => p.startsWith(`/${o.replace(/^\//, '')}`)))
  .sort()

/** How many images a page's guide has (`![…](…)`), from its MDX. */
function images(path: string): number {
  const slug = path.replace(/^\/|\/$/g, '')
  const file = [join(CONTENT, `${slug}.mdx`), join(CONTENT, slug, 'index.mdx')].find(existsSync)
  return file ? (readFileSync(file, 'utf8').match(/!\[[^\]]*\]\([^)]+\)/g) ?? []).length : 0
}

// the export as a static host serves it: a folder's index.html, and 404.html for anything else
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    let file = join(OUT, decodeURIComponent(new URL(req.url).pathname))
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html')
    } catch {
      file = `${file}.html`
    }
    const f = Bun.file(file)
    return f.size
      ? new Response(f)
      : new Response(Bun.file(join(OUT, '404.html')), {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
  },
})
const url = (path: string) => `http://localhost:${PORT}${path}`

const browser = await launch()
const problems: string[] = []
const jobs = pages.flatMap((path) => WIDTHS.map((width) => ({ path, width })))
let done = 0
console.log(`${pages.length} pages × ${WIDTHS.length} widths, ${WORKERS} at a time`)
await pool(jobs, WORKERS, async ({ path, width }) => {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 120)}`)
  })
  try {
    await page.goto(url(path), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await settle(page)
    const o = await overflow(page)
    const v = await axe(page)
    const { bad } = await walk(page)
    if (o > 0 || v.length || bad.length || errors.length)
      problems.push(
        `${path} ${width}: ${o > 0 ? `overflow=${o} ${(await escapes(page)).join(' | ')} ` : ''}${[...v, ...bad, ...errors].join(' ; ')}`,
      )
  } catch (e) {
    problems.push(`${path} ${width}: crashed: ${(e as Error).message.slice(0, 100)}`)
  }
  await page.close()
  if (++done % 20 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length}`)
})

// without scripts: the figures are in the page as exported
const still = await browser.newContext({ javaScriptEnabled: false })
await pool(pages, WORKERS, async (path) => {
  const want = images(path)
  if (!want) return
  const page = await still.newPage()
  try {
    await page.goto(url(path), { waitUntil: 'domcontentloaded' })
    const drawn = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLImageElement>('article img')].filter(
          (i) => i.getAttribute('src') && i.alt.trim(),
        ).length,
    )
    if (drawn !== want)
      problems.push(
        `${path} without scripts: ${drawn} pictures with alt text, the guide has ${want}`,
      )
  } catch (e) {
    problems.push(`${path} without scripts: crashed: ${(e as Error).message.slice(0, 100)}`)
  }
  await page.close()
})

await browser.close()
server.stop()
console.log(
  problems.length
    ? problems.sort().join('\n')
    : `clean: ${pages.length} pages at ${WIDTHS.join(' and ')}`,
)
process.exit(problems.length ? 1 : 0)
