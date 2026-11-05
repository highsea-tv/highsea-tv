// SPDX-License-Identifier: AGPL-3.0-only
// Shared pieces of the browser sweeps: the routes to visit, the browser, and page helpers.
// The routes come from the prototypes' routes test list (design/prototypes/src/routes.tsx), the
// same list happy-dom renders; Phase 3 adds the server's admin routes the same way.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Browser, chromium, type Page } from 'playwright-core'
import {
  type ClientPlatform,
  clientPathOf,
  FRAME_INPUTS,
  heldByClient,
  PHONE_SCREEN,
  TV_SCREEN,
} from '../../design/prototypes/src/chrome/client.ts'

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

/** Where `screenUrl` points: BASE, or the build `servePrototypes` serves. */
let base = BASE

/**
 * Builds the prototypes into a temporary folder and serves the build with `vite preview`
 * (https://vite.dev/guide/cli#vite-preview), which loads each page about three times faster than
 * the dev server's unbundled modules. SWEEP_BASE sweeps what's already there instead (the dev
 * server, say). Returns what stops it.
 */
export async function servePrototypes(): Promise<() => void> {
  if (process.env.SWEEP_BASE) return () => {}
  const cwd = join(ROOT, 'design/prototypes')
  const out = mkdtempSync(join(tmpdir(), 'highsea-prototypes-'))
  execFileSync('bunx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd,
    stdio: 'inherit',
  })
  const port = process.env.SWEEP_PROTOTYPES_PORT ?? '4510'
  // Vite's own binary, not bunx: bunx starts it in a process group of its own, which the stop
  // below can't reach, and the server outlives the sweep
  const preview = spawn(
    join(cwd, 'node_modules/.bin/vite'),
    ['preview', '--outDir', out, '--port', port, '--strictPort'],
    { cwd, stdio: 'ignore', detached: true },
  )
  base = `http://localhost:${port}`
  for (let i = 0; ; i++) {
    const ok = await fetch(`${base}/index.html`).then(
      (r) => r.ok,
      () => false,
    )
    if (ok) break
    if (i > 60) throw new Error(`The prototypes' build didn't start on ${base}`)
    await Bun.sleep(250)
  }
  return () => {
    if (preview.pid) process.kill(-preview.pid, 'SIGTERM')
    rmSync(out, { recursive: true, force: true })
  }
}

/**
 * Pages open at once: the machine's cores less two, for the server and the browser's own
 * processes (https://nodejs.org/api/os.html#osavailableparallelism), between 2 and 12.
 */
export const WORKERS = Math.max(2, Math.min(12, availableParallelism() - 2))

/** A screen URL with toolbar state from the query (design/prototypes/README.md#url-parameters). */
/** A route may carry the toolbar's state after `?` (`/web/downloads?app=desktop`): it joins the query. */
export const screenUrl = (route: string, query = '') => {
  const [path, own = ''] = route.split('?')
  const q = [own, query].filter(Boolean).join('&')
  return `${base}/index.html?screen&time=pause&sound=off${q ? `&${q}` : ''}#${path}`
}

/** Each client frame's size: the phone's 390 × 844, and the TV's 1080p screen. */
export const CLIENT_FRAMES: Record<
  Exclude<ClientPlatform, 'web'>,
  { width: number; height: number }
> = {
  mobile: { width: PHONE_SCREEN.w, height: PHONE_SCREEN.h },
  tv: { width: TV_SCREEN.w, height: TV_SCREEN.h },
}

/** A route's platform, read before its query: `/tv?launch=done` is the TV's. */
const platformOfRoute = (route: string) => route.split(/[/?]/)[1]

/** The viewport a job opens at: a client frame's own size, or the width swept. */
export const viewportFor = (route: string, width: number) => {
  const platform = platformOfRoute(route)
  if (heldByClient(route) && (platform === 'mobile' || platform === 'tv'))
    return CLIENT_FRAMES[platform]
  return { width, height: heightFor(width) }
}

/**
 * apps/client's address for a chrome route, opened on its own as the frame opens it
 * (`/web<path>?ff=<input>`) on the server servePrototypes starts, with the toolbar's states as
 * the prototypes' URL parameters, which the client reads in mock mode when it isn't framed
 * (@highsea-tv/mock/frame's queryState).
 */
export const clientUrl = (route: string, platform: ClientPlatform, query = '') => {
  const [path = '/', own = ''] = route.split('?')
  // an alias may carry its own query (the TV's `/start` is `/who?launch=1`)
  const [clientPath = '/', aliased = ''] = (clientPathOf(path) ?? '/').split('?')
  const q = [`ff=${FRAME_INPUTS[platform]}`, 'time=pause', 'sound=off', aliased, own, query]
    .filter(Boolean)
    .join('&')
  return `${base}/web${clientPath === '/' ? '/' : clientPath}?${q}`
}

/**
 * A route's address: apps/client's where it holds the route (design/prototypes/src/chrome/client.ts),
 * and otherwise the prototype's screen.
 */
export const routeUrl = (route: string, query = '') => {
  const platform = platformOfRoute(route)
  return heldByClient(route) && (platform === 'web' || platform === 'mobile' || platform === 'tv')
    ? clientUrl(route, platform, query)
    : screenUrl(route, query)
}

/**
 * Chromium from Playwright's own download (`bunx playwright-core install chromium`), or the one at
 * CHROMIUM_PATH.
 */
export const launch = (): Promise<Browser> =>
  chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

/**
 * Waits until the page stops changing: no DOM mutation for `quiet` ms, or `max` ms at most. The quiet
 * spell is longer than the mock's latency (180 ms a call, `mock/client.ts`), so a chain of calls
 * counts as one; a page that never stops (a ticking clock) waits `max`, as a fixed wait did.
 * MutationObserver: https://developer.mozilla.org/docs/Web/API/MutationObserver
 */
export const settle = (page: Page, { quiet = 400, max = 1500 } = {}) =>
  page.evaluate(
    ([quiet, max]) =>
      new Promise<void>((resolve) => {
        const done = () => {
          observer.disconnect()
          clearTimeout(timer)
          clearTimeout(cap)
          resolve()
        }
        let timer = setTimeout(done, quiet)
        const cap = setTimeout(done, max)
        const observer = new MutationObserver(() => {
          clearTimeout(timer)
          timer = setTimeout(done, quiet)
        })
        observer.observe(document, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        })
      }),
    [quiet, max],
  )

/** Dismisses the client announcement modal, if it's up, and waits until it has left the page. */
export async function acknowledge(page: Page) {
  const got = page.getByRole('button', { name: 'Got it' })
  if (await got.count()) {
    await got.first().click()
    // Radix keeps the dialog mounted (data-state="closed") through its exit animation, with its
    // focus guards and aria-hidden still in place, so wait for the dialog itself to go, not the button
    await page
      .waitForFunction(() => !document.querySelector('[role=dialog],[role=alertdialog]'), null, {
        timeout: 5000,
      })
      .catch(() => {})
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

/**
 * How far the page is wider than the viewport, in px (0 is good). A screen that scrolls in its own
 * frame (the phone's, the admin's main) counts too: `overflow-y: auto` makes `overflow-x` auto as
 * well (CSS Overflow 3, § 3), so a too-wide screen scrolls sideways there and never reaches the
 * document. Scrollers that declare their own `overflow-x` scroll sideways on purpose.
 */
export const overflow = (page: Page) =>
  page.evaluate(() =>
    Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ...[...document.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"]')]
        .filter((e) => !/\boverflow-x-/.test(e.className))
        .map((e) => e.scrollWidth - e.clientWidth),
    ),
  )

/**
 * Where an overflow starts: the elements that run past their scroller's edge while their parent
 * doesn't, as `tag.classes "text"` (at most three), so a finding says what to fix. Fixed elements
 * and anything inside a box that clips or scrolls sideways itself are left out.
 */
export const escapes = (page: Page) =>
  page.evaluate(() => {
    const clips = (e: Element) => getComputedStyle(e).overflowX !== 'visible'
    const scrollers = [
      document.documentElement,
      ...document.querySelectorAll<HTMLElement>('[class*="overflow-y-auto"]'),
    ].filter(
      (e) =>
        (e === document.documentElement || !/\boverflow-x-/.test(e.className)) &&
        e.scrollWidth > e.clientWidth + 1,
    )
    const found: string[] = []
    for (const sc of scrollers) {
      const edge =
        (sc === document.documentElement ? 0 : sc.getBoundingClientRect().left) + sc.clientWidth + 1
      const visit = (e: Element) => {
        for (const c of e.children) {
          if (getComputedStyle(c).position === 'fixed') continue
          const box = c.getBoundingClientRect()
          // text too long for its box spills out without widening it: count where the text ends
          const right = clips(c) ? box.right : Math.max(box.right, box.left + c.scrollWidth)
          if (right > edge && (e === sc || e.getBoundingClientRect().right <= edge)) {
            const cls = (c.getAttribute('class') ?? '').slice(0, 70)
            const text = (c.textContent ?? '').trim().slice(0, 30)
            found.push(`${c.tagName.toLowerCase()}.${cls} "${text}" (+${Math.round(right - edge)})`)
          }
          if (!clips(c)) visit(c)
        }
      }
      visit(sc)
    }
    return [...new Set(found)].slice(0, 3)
  })

/**
 * Rows of controls that mix sizes (design system 1.1, controls.md: controls in one row share one
 * height, one corner and one text size). A row is the boxed controls whose centres line up within
 * 4px and that sit within 32px of each other. Chips are pills by design, so their corner isn't
 * compared, and the media players' own controls (`data-player-controls`) are left out. Returns each
 * mixed row as `name:height/corner/text | …`, at most five.
 */
export const mixedRows = (page: Page) =>
  page.evaluate(() => {
    type C = {
      name: string
      kind: string
      h: number
      r: string
      t: string
      x: number
      w: number
      y: number
      layer: Element | null
    }
    // a bar fixed or stuck over the page (a save bar, a toolbar) isn't a row with what's behind it
    const layerOf = (e: Element) => {
      for (let a: Element | null = e; a; a = a.parentElement) {
        const p = getComputedStyle(a).position
        if (p === 'fixed' || p === 'sticky') return a
      }
      return null
    }
    const sel =
      '[data-control], button, a[class*="rounded"], input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea, [role=radiogroup], [role=tablist], [role=switch]'
    const out: C[] = []
    for (const e of document.querySelectorAll<HTMLElement>(sel)) {
      // the players' own controls, and a list's items, tiles and keys (`data-item`), aren't controls
      // in a row (controls.md), so they're left out
      if (e.closest('[aria-hidden=true],[inert],[data-player-controls],[data-item]')) continue
      // a control inside a control (a segment, a tab, a field's clear button) is the outer one's
      const outer = e.parentElement?.closest('[data-control],[role=radiogroup],[role=tablist]')
      if (outer) continue
      const cs = getComputedStyle(e)
      const b = e.getBoundingClientRect()
      if (!b.width || !b.height || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
      const boxed =
        e.hasAttribute('data-control') ||
        (Number.parseFloat(cs.borderTopWidth) > 0 && !cs.borderTopColor.endsWith(', 0)')) ||
        cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
        e.matches('input,select,textarea,[role=radiogroup],[role=tablist],[role=switch]')
      if (!boxed || e.offsetHeight < 18 || e.offsetHeight > 96) continue
      const kind = e.dataset.control ?? e.getAttribute('role') ?? e.tagName.toLowerCase()
      // a switch keeps its own track (controls.md › Looks), so it's measured against nothing
      if (kind === 'switch') continue
      const rr = Number.parseFloat(cs.borderTopLeftRadius)
      const r =
        rr >= Math.min(e.offsetHeight, e.offsetWidth) / 2 - 0.5 && rr > 0
          ? 'pill'
          : String(Math.round(rr))
      const name =
        (e.getAttribute('aria-label') || e.innerText || (e as HTMLInputElement).placeholder || kind)
          .trim()
          .split('\n')[0]
          ?.slice(0, 24) ?? kind
      out.push({
        name,
        kind,
        h: e.offsetHeight,
        r,
        // an icon-only control shows no text, so its text size can't differ
        t: e.innerText.trim() || e.matches('input,select,textarea') ? cs.fontSize : '',
        x: b.left,
        w: b.width,
        y: b.top + b.height / 2,
        layer: layerOf(e),
      })
    }
    out.sort((a, b) => a.y - b.y || a.x - b.x)
    const used = new Set<number>()
    const mixed: string[] = []
    out.forEach((c, i) => {
      if (used.has(i)) return
      const row = [c]
      used.add(i)
      out.forEach((d, j) => {
        if (used.has(j) || d.layer !== c.layer || Math.abs(d.y - c.y) > 4) return
        if (
          row.some((e) => Math.abs(d.x - (e.x + e.w)) <= 32 || Math.abs(e.x - (d.x + d.w)) <= 32)
        ) {
          row.push(d)
          used.add(j)
        }
      })
      if (row.length < 2) return
      // chips are pills and an avatar is round, by the spec; an avatar's initials aren't a label
      const corners = new Set(
        row.filter((e) => e.kind !== 'chip' && e.kind !== 'avatar').map((e) => e.r),
      )
      const texts = new Set(
        row
          .filter((e) => e.t && e.kind !== 'avatar')
          .filter((e) => e.kind !== 'chip' || row.every((f) => f.kind === 'chip'))
          .map((e) => e.t),
      )
      if (new Set(row.map((e) => e.h)).size > 1 || corners.size > 1 || texts.size > 1)
        mixed.push(row.map((e) => `${e.name}:${e.h}/${e.r}/${e.t}`).join(' | '))
    })
    return mixed.slice(0, 5)
  })

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
    const info = await page.evaluate(async () => {
      const a = document.activeElement as HTMLElement | null
      if (!a || a === document.body) return null
      // judge the stop once it has settled: an action that fades in on focus starts its own
      // transition at opacity 0 (getAnimations flushes style, so the transition exists by now)
      await Promise.all(a.getAnimations().map((x) => x.finished.catch(() => undefined)))
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
