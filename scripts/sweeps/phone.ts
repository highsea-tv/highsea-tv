// SPDX-License-Identifier: AGPL-3.0-only
// The phone end to end (phase-4-checkpoint-5.md › Tests and checks, 4.5a), on the one client's
// iPhone build (ADR 0061): the seeded server from the production build, the client installed fresh
// on an iOS simulator, and Maestro's flow in apps/client/.maestro signing Theo in by address,
// finding Sintel and playing it (https://docs.maestro.dev/getting-started/run-a-sample-flow). Then the server's history says
// whether Theo's iPhone played it: a session from the `ios` client, ended by closing the player.
//
// `bun scripts/sweeps/phone.ts [path/to/highsea.app]`, with a simulator booted and Maestro on the
// PATH. The app is a Release build for the simulator without mock mode (it needs no Metro), by
// default the one native.yml's ios job makes: `bun run --cwd apps/client prebuild`, then in
// apps/client/ios `xcodebuild -workspace highsea.xcworkspace -scheme highsea
// -configuration Release -sdk iphonesimulator -derivedDataPath build CODE_SIGN_IDENTITY=-
// CODE_SIGNING_REQUIRED=NO build`. It's signed ad hoc: unsigned, it has no keychain and can't sign in.
// PHONE_PORT moves the server; PHONE_SIMULATOR picks the simulator by UDID.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lib.ts'
import { boot, seed } from './seeded.ts'

const PORT = Number(process.env.PHONE_PORT ?? 3160)
const OWNER = { username: 'sweep', displayName: 'Sweep', password: 'sweep sweep sweep' }
// a User the seed invites, with the movies library
const THEO = { username: 'theo', password: 'theo theo theo' }
const SINTEL = 45745
const app =
  process.argv[2] ??
  join(ROOT, 'apps/client/ios/build/Build/Products/Release-iphonesimulator/highsea.app')
if (!existsSync(app))
  throw new Error(
    `No app at ${app}: build it for the simulator first (this file's header says how)`,
  )

const udid = process.env.PHONE_SIMULATOR ?? booted()

execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
const server = await boot(PORT, { production: true })
let failed: string | null = null

try {
  const { token } = await seed(server, OWNER, 'Phone script')
  // a fresh install: no servers, no keychain items (the flow's launchApp clears both too)
  execFileSync('xcrun', ['simctl', 'uninstall', udid, 'tv.highsea.client.mobile'])
  execFileSync('xcrun', ['simctl', 'install', udid, app])
  const started = Date.now()
  try {
    execFileSync(
      'maestro',
      [
        '--udid',
        udid,
        'test',
        '-e',
        `SERVER=${server.base}`,
        '-e',
        `USERNAME=${THEO.username}`,
        '-e',
        `PASSWORD=${THEO.password}`,
        join(ROOT, 'apps/client/.maestro/sign-in-and-play.yaml'),
      ],
      { stdio: 'inherit' },
    )
  } catch {
    failed = 'the Maestro flow failed (its output is above)'
  }
  if (!failed) {
    // closing the player ends the session, which goes into the history (ADR 0051's 4.3a section)
    const history = await server.api<
      {
        user: { displayName: string }
        client: string
        item: { tmdbId: number | null }
        watched: number
      }[]
    >('GET', '/sessions/history', undefined, token)
    const played = history.find(
      (r) => r.user.displayName === 'Theo' && r.client === 'ios' && r.item.tmdbId === SINTEL,
    )
    if (!played) failed = 'the server has no session of Theo’s iPhone playing Sintel'
    else if (played.watched < 1) failed = `Sintel’s session shows ${played.watched} s watched`
    else console.log(`Sintel played for ${played.watched} s`)
  }
  console.log(`phone: ${((Date.now() - started) / 1000).toFixed(0)} s`)
} finally {
  await server.stop()
}

if (failed) {
  console.error(`✗ ${failed}`)
  process.exit(1)
}
console.log('Phone: signed in by address, found Sintel, played it and closed the player.')

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
