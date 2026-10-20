// SPDX-License-Identifier: AGPL-3.0-only
// Shared pieces of the browser sweeps: the routes to visit, the browser, and page helpers.
// The routes come from the prototypes' routes test list (design/prototypes/src/routes.tsx), the
// same list happy-dom renders; Phase 3 adds the server's admin routes the same way.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Browser, chromium, type Page } from 'playwright-core'

export const ROOT = join(import.meta.dir, '..', '..')

export type Platform = 'admin' | 'web' | 'mobile' | 'tv'

/** `screenRoutes` from the prototypes, by platform. */
export function prototypeRoutes(): Record<Platform, string[]> {
  const src = readFileSync(join(ROOT, 'design/prototypes/src/routes.tsx'), 'utf8')
  const start = src.indexOf('screenRoutes')
  const block = src.slice(start, src.indexOf('\n}', start))
  const out = {} as Record<Platform, string[]>
  for (const p of ['admin', 'web', 'mobile', 'tv'] as const) {
    const m = block.match(new RegExp(`${p}: \\[([\\s\\S]*?)\\]`))
    out[p] = m ? [...(m[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1] as string) : []
  }
  return out
}

/** The widths each platform is checked at (accessibility.md, platform guides). */
export const WIDTHS: Record<Platform, number[]> = {
  admin: [1440, 390],
  web: [1440, 768, 390],
  mobile: [390],
  tv: [1600],
}

export const heightFor = (width: number) => (width === 390 ? 844 : 900)

/** The prototypes' dev server (`bun run prototypes`); override with SWEEP_BASE. */
export const BASE = process.env.SWEEP_BASE ?? 'http://localhost:4500'

/** A screen URL with toolbar state from the query (design/prototypes/README.md#url-parameters). */
export const screenUrl = (route: string, query = '') =>
  `${BASE}/index.html?screen&time=pause&sound=off${query ? `&${query}` : ''}#${route}`

/**
 * Chromium from Playwright's own download (`bunx playwright-core install chromium`), or the one at
 * CHROMIUM_PATH.
 */
export const launch = (): Promise<Browser> =>
  chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

/** Dismisses the client announcement modal, if it's up, and waits out its exit animation. */
export async function acknowledge(page: Page) {
  const got = page.getByRole('button', { name: 'Got it' })
  if (await got.count()) {
    await got.first().click()
    await page.waitForTimeout(1200)
  }
}

/** Waits for running animations, so axe doesn't measure contrast on something mid-fade. */
export const settleAnimations = (page: Page) =>
  page.evaluate(() =>
    Promise.race([
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
      new Promise((r) => setTimeout(r, 3000)),
    ]),
  )

const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8')

/** WCAG 2.x A/AA violations on the page, as `rule: selector` strings. */
export async function axe(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE })
  return page.evaluate(async () => {
    const w = window as unknown as {
      axe: {
        run: (
          ctx: Document,
          opts: object,
        ) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>
      }
    }
    const r = await w.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    })
    return r.violations.flatMap((v) =>
      v.nodes.slice(0, 2).map((n) => `${v.id}: ${n.target.join(' ')}`),
    )
  })
}

/** How far the page is wider than the viewport, in px (0 is good). */
export const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Runs `jobs` with `n` at a time. */
export async function pool<T>(jobs: T[], n: number, run: (job: T) => Promise<void>) {
  const queue = [...jobs]
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (queue.length) await run(queue.shift() as T)
    }),
  )
}

/**
 * Tabs through the page from the top. Every stop must be visible and show a focus indicator
 * (WCAG 2.4.7); a stop whose indicator is drawn by a descendant is checked by comparing
 * screenshots of it focused and blurred.
 */
export async function walk(page: Page): Promise<{ stops: number; bad: string[] }> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const seen = new Set<string>()
  const bad: string[] = []
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      if (!a || a === document.body) return null
      const cs = getComputedStyle(a)
      const box = a.getBoundingClientRect()
      a.setAttribute('data-kbk', '')
      const desc = `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 30)}"`
      return {
        key: `${desc}${Math.round(box.x)},${Math.round(box.y + scrollY)}`,
        desc,
        visible:
          box.width > 0 && box.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0',
        ring:
          (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
          cs.boxShadow !== 'none',
      }
    })
    if (!info || seen.has(info.key)) break
    seen.add(info.key)
    if (!info.visible) bad.push(`hidden: ${info.desc}`)
    else if (!info.ring) {
      const el = page.locator('[data-kbk]')
      const box = await el.boundingBox()
      if (box) {
        const clip = {
          x: Math.max(0, box.x - 4),
          y: Math.max(0, box.y - 4),
          width: box.width + 8,
          height: box.height + 8,
        }
        await page.waitForTimeout(250)
        const on = await page.screenshot({ clip })
        await el.evaluate((e) => (e as HTMLElement).blur())
        await page.waitForTimeout(250)
        const off = await page.screenshot({ clip })
        await el.evaluate((e) => (e as HTMLElement).focus({ preventScroll: true }))
        if (on.equals(off)) bad.push(`no focus indicator: ${info.desc}`)
      }
    }
    await page.evaluate(() => document.querySelector('[data-kbk]')?.removeAttribute('data-kbk'))
  }
  return { stops: seen.size, bad: [...new Set(bad)] }
}
