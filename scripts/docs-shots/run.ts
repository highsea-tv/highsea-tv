// SPDX-License-Identifier: AGPL-3.0-only
// The guides' screenshots of the admin, taken from a real server: boots the sweep's seeded server
// (scripts/sweeps/seeded.ts: TMDB from the recordings, the fake indexer, the subtitle fakes, the
// engine offline), signs in as its owner and saves each area's shots (areas/<area>.ts) to
// apps/docs/public/images/admin/<area>/, at twice the pixels for sharp text, in the default theme.
// The server's temporary folder is taken out of every path shown, so folders read as they do in the
// Docker image (/data/movies). With pngquant on the PATH (https://pngquant.org), each is quantised
// to a palette, about a third of the size with no visible change. Usage: bun scripts/docs-shots/run.ts [area ...]
// DOCS_SHOTS_PRODUCTION=1 builds and boots the production build instead of Next's dev server, which
// Next allows one of per app folder, so it runs beside `bun run server`.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright-core'
import { launch, pool, ROOT, settleAnimations } from '../sweeps/lib.ts'
import { boot, seed } from '../sweeps/seeded.ts'
import type { Area, Context } from './shot.ts'

const PORT = Number(process.env.DOCS_SHOTS_PORT ?? 3170)
const OUT = join(ROOT, 'apps/docs/public/images/admin')
const OWNER = { username: 'ines', displayName: 'Ines', password: 'harbor harbor harbor' }

const all = readdirSync(join(import.meta.dir, 'areas'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.slice(0, -3))
const wanted = process.argv.slice(2)
for (const a of wanted) if (!all.includes(a)) throw new Error(`No area ${a}: ${all.join(', ')}`)
const areas = wanted.length ? wanted : all

// one run at a time: Next allows one dev server per app folder, so a second run waits its turn; the
// lock sits in that folder's .next, which every run shares whatever its temporary folder
const lock = join(ROOT, 'apps/server/.next/docs-shots.lock')
mkdirSync(join(lock, '..'), { recursive: true })
for (;;) {
  try {
    mkdirSync(lock)
    writeFileSync(join(lock, 'pid'), String(process.pid))
    break
  } catch {
    const pid = readFileSync(join(lock, 'pid'), { encoding: 'utf8', flag: 'a+' })
    const holder = Number(pid)
    // an empty pid is a holder between making the lock and writing it: still alive
    let alive = pid === ''
    try {
      alive ||= holder > 0 && process.kill(holder, 0)
    } catch {}
    if (!alive) rmSync(lock, { recursive: true, force: true })
    else await Bun.sleep(2000)
  }
}
// only this run's own lock: one that waited never removes the holder's
process.on('exit', () => {
  try {
    if (readFileSync(join(lock, 'pid'), 'utf8') === String(process.pid))
      rmSync(lock, { recursive: true, force: true })
  } catch {}
})

const production = process.env.DOCS_SHOTS_PRODUCTION === '1'
if (production)
  execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
// the server serves the web app's build at /web in either mode
execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/web'), stdio: 'inherit' })
const server = await boot(PORT, { production })
const problems: string[] = []
const browser = await launch()
try {
  const seeded = await seed(server, OWNER, 'MacBook Pro')
  const api: Context['api'] = (method, path, body) => server.api(method, path, body, seeded.token)
  const c: Context = { server, seeded, api }
  // the seed's announcement shows as a banner on every admin page; Curation's shots make their own
  await api('DELETE', `/curation/announcements/${seeded.notice.id}`)

  const login = await browser.newContext()
  const signIn = await login.newPage()
  await signIn.goto(`${server.base}/login`)
  await signIn.getByLabel('Username').fill(OWNER.username)
  await signIn.getByLabel('Password').fill(OWNER.password)
  await signIn.getByRole('button', { name: 'Sign in', exact: true }).click()
  await signIn.waitForURL(`${server.base}/`)
  const storageState = await login.storageState()
  await login.close()

  // the temporary folder as the server and the browser may each spell it (macOS's /var is /private/var)
  // longest first, so /private/var/… doesn't leave /private behind; the server's own address reads
  // as the default port's, not the throwaway one, and the fake indexer's as a Prowlarr feed's
  const swaps: [string, string][] = [
    ...[`/private${server.dir}`, server.dir, server.dir.replace(/^\/private/, '')].map(
      (p): [string, string] => [p, ''],
    ),
    [`localhost:${PORT}`, 'localhost:3000'],
    [`localhost:${PORT + 2}`, 'prowlarr:9696'],
  ]

  for (const name of areas) {
    const area = ((await import(`./areas/${name}.ts`)) as { default: Area }).default
    await area.prepare?.(c)
    mkdirSync(join(OUT, name), { recursive: true })
    await pool(area.shots, 3, async (shot) => {
      let ctx: BrowserContext | undefined
      try {
        ctx = await browser.newContext({
          storageState,
          viewport: { width: shot.width ?? 1280, height: shot.height ?? 800 },
          deviceScaleFactor: 2,
          reducedMotion: 'reduce',
        })
        const page = await ctx.newPage()
        await page.goto(`${server.base}${typeof shot.path === 'string' ? shot.path : shot.path(c)}`)
        // hydrated, with nothing still loading (as the sweep waits)
        await page.waitForFunction(
          () =>
            // Next hydrates the whole document; the web app (/web) renders into #root
            (Object.keys(document.documentElement).some((k) => k.startsWith('__reactProps$')) ||
              !!document.querySelector('#root > *')) &&
            !document.querySelector('[aria-busy="true"]'),
        )
        await shot.act?.(page, c)
        await page.mouse.move(0, 0)
        await page.waitForTimeout(400)
        await settleAnimations(page)
        await page.evaluate((swaps) => {
          const strip = (s: string) => swaps.reduce((t, [from, to]) => t.replaceAll(from, to), s)
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
          for (let n = walker.nextNode(); n; n = walker.nextNode())
            if (n.nodeValue && swaps.some(([p]) => n.nodeValue?.includes(p)))
              n.nodeValue = strip(n.nodeValue)
          for (const input of document.querySelectorAll('input, textarea'))
            if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
              input.value = strip(input.value)
        }, swaps)
        const path = join(OUT, name, `${shot.name}.png`)
        if (shot.crop) await shot.crop(page).screenshot({ path, animations: 'disabled' })
        else await page.screenshot({ path, animations: 'disabled' })
        if (Bun.which('pngquant'))
          execFileSync('pngquant', [
            '--quality=80-95',
            '--speed=1',
            '--strip',
            '--force',
            '--ext=.png',
            path,
          ])
      } catch (e) {
        problems.push(`${name}/${shot.name}: ${(e as Error).message.split('\n')[0]?.slice(0, 200)}`)
      } finally {
        await ctx?.close()
      }
    })
    await area.finish?.(c)
  }
} finally {
  await browser.close()
  await server.stop()
}

console.log(problems.length ? problems.join('\n') : `saved: ${areas.join(', ')}`)
process.exit(problems.length ? 1 : 0)
