// SPDX-License-Identifier: AGPL-3.0-only
// The engine's version. A definition names the oldest engine it needs (`minEngineVersion`); the
// engine skips one whose major is higher than its own, and stays backward compatible within a
// major (ADR 0007). Raise the minor when the format gains something a definition may use; raise
// the major only when an old definition would no longer mean the same thing.
export const ENGINE_VERSION = '1.0.0'

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

export function isSemver(value: string): boolean {
  return SEMVER.test(value)
}

function parts(version: string): [number, number, number] {
  const m = SEMVER.exec(version)
  if (!m) throw new Error(`"${version}" isn’t a version like 1.2.3.`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Negative when `a` is older than `b`, positive when newer, 0 when the same. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) {
    const d = (x[i] as number) - (y[i] as number)
    if (d) return d
  }
  return 0
}

/**
 * Whether an engine at `engine` can run a definition that needs `required`: the same major, and
 * no newer than the engine. A different major means the format changed meaning, either way.
 */
export function engineSupports(required: string, engine: string = ENGINE_VERSION): boolean {
  if (parts(required)[0] !== parts(engine)[0]) return false
  return compareVersions(required, engine) <= 0
}
