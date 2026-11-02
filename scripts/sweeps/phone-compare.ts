// SPDX-License-Identifier: AGPL-3.0-only
// The phone's screens beside their prototypes (phase-4-checkpoint-5.md › Tests and checks), as
// compare.ts does for the admin: the seeded server from the production build, the iPhone app
// installed fresh on the booted simulator, and Maestro's apps/mobile/.maestro/compare.yaml signing
// Theo in and taking a screenshot of each main screen. The prototype's same screens come from
// Playwright at the simulator's size in points and scale, so the pairs line up. The prototype's
// films are its mock's and the app's are the seed's, so a pair is compared for layout, not data;
// the seed has the shelves' films, a featured hero and Theo's Continue watching, so Home's rows
// are all there to compare.
// Writes the pairs, index.html and checklist.md to a folder outside the repository; index.html
// carries its images inline, so it opens anywhere on its own (a viewer showing only that file).
//
// `bun scripts/sweeps/phone-compare.ts [folder] [path/to/highsea.app]`, with a simulator booted,
// Maestro on the PATH and the app built as phone.ts's header says. The prototypes come from
// `bun run prototypes`, started here if nothing answers on :4500. PHONE_PORT moves the server
// (3170 by default, so phone.ts can run beside it); PHONE_SIMULATOR picks the simulator by UDID.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { acknowledge, BASE, launch, ROOT, screenUrl, settle, settleAnimations } from './lib.ts'
import { boot, seed } from './seeded.ts'

const PORT = Number(process.env.PHONE_PORT ?? 3170)
const OWNER = { username: 'sweep', displayName: 'Sweep', password: 'sweep sweep sweep' }
const THEO = { username: 'theo', password: 'theo theo theo' }
// iPhone 17 Pro, the simulator the checks use: 402 × 874 points at 3×
const VIEWPORT = { width: 402, height: 874 }
const SCALE = 3
const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'highsea-phone-compare-'))
const app =
  process.argv[3] ??
  join(ROOT, 'apps/mobile/ios/build/Build/Products/Release-iphonesimulator/highsea.app')
if (!existsSync(app))
  throw new Error(`No app at ${app}: build it for the simulator first (phone.ts's header says how)`)
mkdirSync(out, { recursive: true })

/** One screen: its shot's name in compare.yaml, and the prototype's route (null: none drawn). */
type Pair = { name: string; screen: string; prototype: string | null; note?: string }
const PAIRS: Pair[] = [
  { name: 'connect', screen: 'C1 Choose a server', prototype: '/mobile/connect' },
  {
    name: 'sign-in',
    screen: 'C1 Sign in',
    prototype: null,
    note: 'The prototype’s sign-in is a step of its connect flow, reached by choosing a server',
  },
  { name: 'home', screen: 'C2 Home', prototype: '/mobile' },
  { name: 'search', screen: 'C6 Search', prototype: '/mobile/search' },
  { name: 'search-results', screen: 'C6 Search, with results', prototype: null },
  { name: 'library', screen: 'C3 Library', prototype: '/mobile/library' },
  {
    name: 'library-collections',
    screen: 'C3 Library, Collections',
    prototype: '/mobile/library/collections',
  },
  { name: 'movie', screen: 'C4 A movie', prototype: '/mobile/movies/4' },
  { name: 'person', screen: 'A person', prototype: '/mobile/people/colin-levy' },
  {
    name: 'player',
    screen: 'C5 The player',
    prototype: '/mobile/play/4',
    note: 'The app’s shot is taken as the controls show, with the film starting under them',
  },
  { name: 'offline', screen: 'Offline', prototype: '/mobile/offline' },
  { name: 'you', screen: 'C8 You', prototype: '/mobile/you' },
  { name: 'you-appearance', screen: 'C8 Theme', prototype: '/mobile/you/appearance' },
  { name: 'you-home', screen: 'C8 Home screen', prototype: '/mobile/you/home' },
  { name: 'you-servers', screen: 'C8 Servers', prototype: '/mobile/you/servers' },
  { name: 'you-playback', screen: 'C8 Playback', prototype: '/mobile/you/playback' },
]

const udid = process.env.PHONE_SIMULATOR ?? booted()

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

const problems: string[] = []
const browser = await launch()
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE })
  const page = await context.newPage()
  for (const pair of PAIRS) {
    if (!pair.prototype) continue
    await page.goto(screenUrl(pair.prototype))
    await settle(page)
    await acknowledge(page)
    await settleAnimations(page)
    await page.screenshot({ path: join(out, `${pair.name}.prototype.png`) })
  }
} finally {
  await browser.close()
  if (prototypes?.pid) process.kill(-prototypes.pid, 'SIGTERM')
}

execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
const server = await boot(PORT, { production: true })
try {
  const { token } = await seed(server, OWNER, 'Phone compare script', { shelves: true })
  await homeAsPrototyped(server, token)
  // each run's shots only: Maestro adds a folder per run, and an older one would win the copy
  rmSync(join(out, 'maestro'), { recursive: true, force: true })
  execFileSync('xcrun', ['simctl', 'uninstall', udid, 'tv.highsea.mobile'])
  execFileSync('xcrun', ['simctl', 'install', udid, app])
  try {
    // Maestro 2 keeps screenshots in its test output, under the flow's name and takeScreenshot/
    execFileSync(
      'maestro',
      [
        '--udid',
        udid,
        'test',
        '--test-output-dir',
        join(out, 'maestro'),
        '-e',
        `SERVER=${server.base}`,
        '-e',
        `USERNAME=${THEO.username}`,
        '-e',
        `PASSWORD=${THEO.password}`,
        join(ROOT, 'apps/mobile/.maestro/compare.yaml'),
      ],
      { stdio: 'inherit' },
    )
  } catch {
    problems.push(
      'the Maestro flow stopped early (its output is above); the shots after it are missing',
    )
  }
  for (const file of new Bun.Glob('**/takeScreenshot/*.png').scanSync(join(out, 'maestro')))
    copyFileSync(join(out, 'maestro', file), join(out, basename(file)))
} finally {
  await server.stop()
}

// the review's pages, the prototype on the left as in compare.ts
const html = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const shot = (file: string) => (existsSync(join(out, file)) ? file : null)
const rows = PAIRS.map((pair, i) => ({
  ...pair,
  n: String(i + 1).padStart(2, '0'),
  proto: pair.prototype ? shot(`${pair.name}.prototype.png`) : null,
  phone: shot(`${pair.name}.png`),
}))

writeFileSync(
  join(out, 'checklist.md'),
  [
    '# The phone beside its prototypes',
    '',
    `Captured ${new Date().toISOString().slice(0, 10)} by \`scripts/sweeps/phone-compare.ts\`: the prototype on the left at ${VIEWPORT.width} × ${VIEWPORT.height} points, the iPhone app on the simulator on the right, as Theo on the seeded server. The films differ (the prototype's mock, the seed's library), so compare layout, type and spacing.`,
    '',
    ...rows.map(
      (r) =>
        `- [ ] **${r.n} ${r.screen}**: prototype ${r.prototype ? `\`${r.prototype}\`` : 'none'}${r.note ? `. ${r.note}` : ''}${r.phone ? '' : '. The app’s shot is missing'}`,
    ),
    '',
  ].join('\n'),
)

writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Prototype and phone</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; background: #111; color: #ddd }
  section { margin: 0 0 48px } h2 { margin: 32px 0 4px; font-size: 18px } p { margin: 4px 0; color: #aaa }
  .row { display: grid; grid-template-columns: repeat(2, minmax(0, ${VIEWPORT.width}px)); gap: 12px; margin: 12px 0; align-items: start }
  figure { margin: 0 } figcaption { color: #888; font-size: 12px; margin-bottom: 4px }
  img { width: 100%; border: 1px solid #333 } .none { padding: 24px; border: 1px dashed #444; color: #777 }
</style></head><body>
<h1>Prototype and phone</h1>
${rows
  .map(
    (r) => `<section id="p${r.n}">
<h2>${r.n} · ${html(r.screen)}</h2>
${r.note ? `<p>${html(r.note)}</p>` : ''}
<div class="row">${fig('Prototype', r.proto, r.prototype ?? 'none')}${fig('Phone', r.phone, 'iPhone 17 Pro simulator')}</div>
</section>`,
  )
  .join('\n')}
</body></html>
`,
)

function fig(label: string, file: string | null, where: string) {
  return `<figure><figcaption>${label} · ${html(where)}</figcaption>${file ? `<img src="${inline(file)}" alt="${label}">` : '<div class="none">Nothing to show</div>'}</figure>`
}

/** A shot as a data URL, so the sheet needs nothing beside it. */
function inline(file: string) {
  return `data:image/png;base64,${readFileSync(join(out, file)).toString('base64')}`
}

const missing = rows.filter((r) => !r.phone || (r.prototype && !r.proto))
console.log(`${rows.length} pairs in ${out} (index.html, checklist.md)`)
for (const r of missing) console.log(`not captured: ${r.n} ${r.screen}`)
for (const p of problems) console.error(`✗ ${p}`)
if (problems.length) process.exit(1)

/**
 * What the prototype's Home has that the seed doesn't: a featured hero (the first `hero` section
 * leads Home, ADR 0048), and films Theo has started, about 40% in, so Continue watching shows.
 */
async function homeAsPrototyped(server: Awaited<ReturnType<typeof boot>>, owner: string) {
  await server.api(
    'POST',
    '/curation/sections',
    {
      audience: { kind: 'everyone' },
      schedule: { start: new Date().toISOString(), end: null },
      title: 'Featured',
      tagline: null,
      layout: 'hero',
      source: { kind: 'manual', itemIds: [45745, 10378, 253777, 669] },
      overrides: [],
    },
    owner,
  )
  const { token } = await server.api<{ token: string }>('POST', '/auth/sign-in', {
    ...THEO,
    device: { name: 'Phone compare script', client: 'ios', appVersion: '0.0.0' },
  })
  for (const id of [45745, 653, 669]) {
    const movie = await server.api<{ item: { runtimeMinutes: number | null } }>(
      'GET',
      `/items/movie/${id}`,
      undefined,
      token,
    )
    const session = await server.api<{ id: string }>(
      'POST',
      `/items/movie/${id}/play`,
      { profile: 'ios' },
      token,
    )
    await server.api(
      'POST',
      `/playback/sessions/${session.id}/progress`,
      { position: Math.round((movie.item.runtimeMinutes ?? 10) * 60 * 0.4), paused: true },
      token,
    )
    await server.api('DELETE', `/playback/sessions/${session.id}`, undefined, token)
  }
}

/** The booted simulator's UDID: exactly one should be booted. */
function booted(): string {
  const list = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], { encoding: 'utf8' }),
  ) as { devices: Record<string, { udid: string; name: string }[]> }
  const all = Object.values(list.devices).flat()
  const [one] = all
  if (!one || all.length > 1)
    throw new Error(
      `${all.length} simulators are booted: boot one, or name one in PHONE_SIMULATOR (${all.map((d) => `${d.name} ${d.udid}`).join(', ')})`,
    )
  return one.udid
}
