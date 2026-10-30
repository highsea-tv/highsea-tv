// SPDX-License-Identifier: AGPL-3.0-only
// The TV's screens beside their prototypes (phase-4-checkpoint-5.md › Tests and checks), as
// phone-compare.ts does for the phone: apps/tv/uitest's testScreenshots opens each screen with the
// remote and saves the simulator's screen, since Maestro can't press a tvOS remote, and Playwright
// takes the prototype's same screens at 1920 × 1080 points at 2×, the Apple TV 4K's. The films
// differ (the prototype's mock, the server's library), so a pair is compared for layout, not data.
// Writes the pairs, index.html and checklist.md to a folder outside the repository.
//
// `bun scripts/sweeps/tv-compare.ts [folder]`, with the app installed and signed in as tv.ts's
// header says. The prototypes come from `bun run prototypes`, started here if nothing answers on
// :4500. TV_SIMULATOR picks the simulator by UDID.
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acknowledge, BASE, launch, ROOT, screenUrl, settle, settleAnimations } from './lib.ts'
import { bootedTV, runUITest } from './tv-uitest.ts'

const VIEWPORT = { width: 1920, height: 1080 }
const SCALE = 2
const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'highsea-tv-compare-'))
mkdirSync(out, { recursive: true })

/** One screen: its shot's name in DpadWalk.swift's screens, and the prototype's route. */
type Pair = { name: string; screen: string; prototype: string; note?: string }
const PAIRS: Pair[] = [
  { name: 'home', screen: 'C2 Home', prototype: '/tv' },
  { name: 'details', screen: 'C4 A movie', prototype: '/tv/movies/4' },
  { name: 'search', screen: 'C6 Search', prototype: '/tv/search' },
  { name: 'library', screen: 'C3 Library', prototype: '/tv/library' },
  { name: 'settings', screen: 'C7 Settings', prototype: '/tv/profile' },
  {
    name: 'player',
    screen: 'C5 The player',
    prototype: '/tv/play/4',
    note: 'Paused with the controls showing; the prototype’s are woken with Down',
  },
]

// the prototypes, unless they're already up
let prototypes: ChildProcess | null = null
const up = () =>
  fetch(`${BASE}/index.html`).then(
    (r) => r.ok,
    () => false,
  )
if (!(await up())) {
  prototypes = spawn('bun', ['run', 'prototypes'], { cwd: ROOT, stdio: 'ignore', detached: true })
  for (let i = 0; !(await up()); i++) {
    if (i > 60) throw new Error(`The prototypes didn’t start on ${BASE}`)
    await Bun.sleep(500)
  }
}

const browser = await launch()
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  const page = await context.newPage()
  for (const pair of PAIRS) {
    await page.goto(screenUrl(pair.prototype))
    await settle(page)
    await acknowledge(page)
    // the TV's announcement is a takeover of Home, not a dialog, and can arrive after the settle
    if (pair.name === 'home') {
      const got = page.getByText('Got it', { exact: true })
      await got.click({ timeout: 3000 }).catch(() => {})
      await settle(page)
    }
    // the player's controls hide until a key wakes them, as dpad.ts does
    if (pair.name === 'player') await page.keyboard.press('ArrowDown')
    await settleAnimations(page)
    await page.screenshot({ path: join(out, `${pair.name}.prototype.png`) })
  }
} finally {
  await browser.close()
  if (prototypes?.pid) process.kill(-prototypes.pid, 'SIGTERM')
}

const { passed } = runUITest(bootedTV(), 'testScreenshots', { SHOTS: out })
const problems = passed ? [] : ['the screenshots stopped early (the output is above)']

// the review's pages, the prototype on the left as in compare.ts
const html = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const shot = (file: string) => (existsSync(join(out, file)) ? file : null)
const rows = PAIRS.map((pair, i) => ({
  ...pair,
  n: String(i + 1).padStart(2, '0'),
  proto: shot(`${pair.name}.prototype.png`),
  tv: shot(`${pair.name}.png`),
}))

writeFileSync(
  join(out, 'checklist.md'),
  [
    '# The TV beside its prototypes',
    '',
    `Captured ${new Date().toISOString().slice(0, 10)} by \`scripts/sweeps/tv-compare.ts\`: the prototype on the left at ${VIEWPORT.width} × ${VIEWPORT.height} points, the Apple TV app on the simulator on the right. The films differ (the prototype's mock, the server's library), so compare layout, type and spacing.`,
    '',
    ...rows.map(
      (r) =>
        `- [ ] **${r.n} ${r.screen}**: prototype \`${r.prototype}\`${r.note ? `. ${r.note}` : ''}${r.tv ? '' : '. The app’s shot is missing'}`,
    ),
    '',
  ].join('\n'),
)

writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Prototype and TV</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; background: #111; color: #ddd }
  section { margin: 0 0 48px } h2 { margin: 32px 0 4px; font-size: 18px } p { margin: 4px 0; color: #aaa }
  .row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 12px 0; align-items: start }
  figure { margin: 0 } figcaption { color: #888; font-size: 12px; margin-bottom: 4px }
  img { width: 100%; border: 1px solid #333 } .none { padding: 24px; border: 1px dashed #444; color: #777 }
</style></head><body>
<h1>Prototype and TV</h1>
${rows
  .map(
    (r) => `<section id="p${r.n}">
<h2>${r.n} · ${html(r.screen)}</h2>
${r.note ? `<p>${html(r.note)}</p>` : ''}
<div class="row">${fig('Prototype', r.proto, r.prototype)}${fig('TV', r.tv, 'Apple TV 4K simulator')}</div>
</section>`,
  )
  .join('\n')}
</body></html>
`,
)

function fig(label: string, file: string | null, where: string) {
  return `<figure><figcaption>${label} · ${html(where)}</figcaption>${file ? `<img src="${file}" loading="lazy" alt="${label}">` : '<div class="none">Nothing to show</div>'}</figure>`
}

const missing = rows.filter((r) => !r.tv || !r.proto)
console.log(`${rows.length} pairs in ${out} (index.html, checklist.md)`)
for (const r of missing) console.log(`not captured: ${r.n} ${r.screen}`)
for (const p of problems) console.error(`✗ ${p}`)
if (problems.length) process.exit(1)
