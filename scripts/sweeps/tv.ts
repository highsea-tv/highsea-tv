// SPDX-License-Identifier: AGPL-3.0-only
// The TV app's D-pad walk (phase-4-checkpoint-5.md › Tests and checks, 4.5b): on Home, a film's
// page, Search, the library, Settings and the player, every focus stop is reached from the first
// with the remote's arrows, as dpad.ts checks the prototype's. It's an XCUITest
// (apps/tv/uitest/DpadWalk.swift) on XCUIRemote, so it drives tvOS's own focus engine; tv-uitest.ts
// runs it.
//
// `bun scripts/sweeps/tv.ts [screen ...]`, with an Apple TV simulator booted and highsea installed
// on it and signed in to a server with films (the seeded server, as phone.ts uses, with a film to
// resume on Home). XcodeGen is `brew install xcodegen`. TV_SIMULATOR picks the simulator by UDID.
import { bootedTV, runUITest } from './tv-uitest.ts'

const screens = process.argv.slice(2)
const started = Date.now()
const { passed, lines } = runUITest(
  bootedTV(),
  'testEveryStopIsReachable',
  screens.length ? { WALK_SCREENS: screens.join(',') } : {},
)
for (const line of lines) if (line.includes('WALK ')) console.log(line.slice(line.indexOf('WALK ')))
console.log(`tv: ${((Date.now() - started) / 1000).toFixed(0)} s`)
if (!passed) {
  console.error('✗ the D-pad walk failed')
  process.exit(1)
}
console.log('TV: every focus stop reached with the remote.')
