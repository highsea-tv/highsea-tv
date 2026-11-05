// SPDX-License-Identifier: AGPL-3.0-only
// Prints the films reads' answers with the system clock set to FAKE_NOW, in whatever zone TZ
// names, so films.test.ts can compare runs under different clocks and zones. The clock is set
// before the mock is imported, so nothing it reads at load can see the real one.
import { setSystemTime } from 'bun:test'

setSystemTime(new Date(process.env.FAKE_NOW ?? '2001-02-03T04:05:06Z'))
const { everything, localized, signedIn } = await import('./films-reads.ts')
const answers = await everything(await signedIn())
process.stdout.write(
  JSON.stringify({
    now: Date.now(),
    answers: localized(Object.fromEntries(Object.entries(answers).map(([k, [, v]]) => [k, v]))),
  }),
)
