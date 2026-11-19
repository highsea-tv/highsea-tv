// SPDX-License-Identifier: AGPL-3.0-only
// An episode's intro and credits as the mock marks them (Phase 5 C2, ADR 0067), one place for the
// player's and the admin's: a cold open, then the titles; a pilot and the specials open on the
// story itself; the credits start 75 s before the end.
export function mockMarks(season: number, number: number, runtimeMinutes: number) {
  const opens = season > 0 && !(season === 1 && number === 1)
  const start = 40 + ((season * 31 + number * 17) % 80)
  return {
    intro: opens ? { start, end: start + 52 } : null,
    credits: runtimeMinutes * 60 - 75,
  }
}

/**
 * The same marks fitted to the clip the mock plays (52 s of Sintel), so the prototype's player
 * shows Skip intro from the clip's start and Skip credits near its end, where a real episode's
 * would be minutes away: the clip opens on its titles.
 */
export function clipMarks(season: number, number: number, duration: number) {
  const { intro } = mockMarks(season, number, 0)
  return {
    intro: intro ? { start: 0, end: 20 } : null,
    credits: Math.max(0, duration - 14),
  }
}
