// SPDX-License-Identifier: AGPL-3.0-only
// The TV's D-pad walk (phase-4-checkpoint-5.md › Tests and checks, 4.5b), on the one client's Apple
// TV build: on Home, a film's page, Search, the library, Settings and the player, every focus stop
// is reached from the first with the remote's arrows, as dpad.ts checks the prototype's. A
// preflight first checks that every screen's entry lands, so a broken one fails in a minute rather
// than an hour into the walk. It's an XCUITest (apps/client/dpad-walk/DpadWalk.swift) on
// XCUIRemote, so it drives tvOS's own focus engine; tv-uitest.ts runs it.
//
// `bun scripts/sweeps/tv.ts [screen ...]`, with an Apple TV simulator booted and the client's
// Release build installed on it (tv.highsea.tv: `bun run --cwd apps/client prebuild:tv`,
// then xcodebuild as native.yml's tvos job does, without mock mode) and signed in to a server with
// films (the seeded server, as phone.ts uses, with a film to resume on Home). XcodeGen is
// `brew install xcodegen`. TV_SIMULATOR picks the simulator by UDID.
import { bootedTV, runUITest } from './tv-uitest.ts'

const screens = process.argv.slice(2)
const started = Date.now()
const env: Record<string, string> = screens.length ? { WALK_SCREENS: screens.join(',') } : {}
const tv = bootedTV()
// the preflight: every screen's entry lands, in about a minute, before a walk that takes an hour
const entries = await runUITest(tv, 'testEntries', env)
if (!entries.passed) {
  console.error('✗ a screen’s entry didn’t land: fix it before walking')
  process.exit(1)
}
const { passed } = await runUITest(tv, 'testEveryStopIsReachable', env)
console.log(`tv: ${((Date.now() - started) / 1000).toFixed(0)} s`)
if (!passed) {
  console.error('✗ the D-pad walk failed')
  process.exit(1)
}
console.log('TV: every focus stop reached with the remote.')
