// SPDX-License-Identifier: AGPL-3.0-only
// highsea's releases (ADR 0050). One version for highsea, `apps/server`'s, in SemVer 2.0.0
// (https://semver.org/); the changelog in Keep a Changelog 1.1.0's format
// (https://keepachangelog.com/en/1.1.0/). A release is prepared in a commit, so what's published is
// what's in git, and the release workflow checks it before building anything:
//
//   bun scripts/release.ts prepare 0.1.0 [--date 2026-11-02]   Unreleased becomes 0.1.0, and the
//       server's version, the catalog's releases.json, its CHANGES.md and the seed follow
//   bun scripts/release.ts check 0.1.0     everything prepare writes is there and agrees, and the
//       version is newer than every tag
//   bun scripts/release.ts notes 0.1.0     the changelog's section, for the GitHub release
//   bun scripts/release.ts tags 0.1.0      the image's tags, one a line, given the tags already made
//   bun scripts/release.ts trust           production servers will trust what the release signs:
//       the key in HIGHSEA_CATALOG_KEY_ID is a release key, and the image's seed is signed with one
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  compareAppVersions,
  compareCatalogVersions,
  type HighseaRelease,
  RELEASE_KEYS,
  releaseSchema,
} from '@highsea-tv/catalog'

const ROOT = join(import.meta.dir, '..')
export const REPOSITORY = 'https://github.com/highsea-tv/highsea-tv'
export const IMAGE = 'ghcr.io/highsea-tv/highsea'
const FILES = {
  changelog: 'CHANGELOG.md',
  server: 'apps/server/package.json',
  releases: 'catalog/indexers/releases.json',
  catalogChanges: 'catalog/indexers/CHANGES.md',
}
/** The schema's limits on a release's notes (packages/catalog's releaseSchema). */
const NOTES = { lines: 50, length: 300 }
const MAX_RELEASES = 20

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

export function isVersion(v: string): boolean {
  return SEMVER.test(v)
}

/** A pre-release (`0.2.0-beta.1`) goes to Beta; anything else to Stable (SemVer § 9). */
export function channelOf(version: string): 'stable' | 'beta' {
  return SEMVER.exec(version)?.[4] === undefined ? 'stable' : 'beta'
}

/** The versions behind `v*` tags, newest first. */
export function taggedVersions(tags: string[]): string[] {
  return tags
    .filter((t) => t.startsWith('v') && isVersion(t.slice(1)))
    .map((t) => t.slice(1))
    .sort((a, b) => compareAppVersions(b, a))
}

/**
 * The image's tags for a release, given the versions already released: the version itself; for a
 * stable release its `major.minor` while it's the newest of that line, and `latest` while it's the
 * newest stable; and `beta` while it's the newest of either kind (ADR 0050's channels).
 */
export function imageTags(version: string, released: string[]): string[] {
  const newer = (pick: (v: string) => boolean) =>
    released.some((v) => v !== version && pick(v) && compareAppVersions(v, version) > 0)
  const [, major, minor] = SEMVER.exec(version) as RegExpExecArray
  const tags = [version]
  if (channelOf(version) === 'stable') {
    const line = `${major}.${minor}`
    if (!newer((v) => channelOf(v) === 'stable' && v.startsWith(`${line}.`))) tags.push(line)
    if (!newer((v) => channelOf(v) === 'stable')) tags.push('latest')
  }
  if (!newer(() => true)) tags.push('beta')
  return tags
}

type Section = { version: string; date: string; body: string }

/** The changelog's `## [Unreleased]` body and each released section, in file order. */
export function readChangelog(text: string): { unreleased: string; sections: Section[] } {
  const heads = [...text.matchAll(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?[^\n]*$/gm)]
  let unreleased = ''
  const sections: Section[] = []
  heads.forEach((h, i) => {
    const start = (h.index as number) + h[0].length
    const next = heads[i + 1]?.index
    // the last section ends where the link references begin
    const end = next ?? text.search(/^\[[^\]]+\]: /m)
    const body = text.slice(start, end === -1 ? undefined : end).trim()
    if ((h[1] as string).toLowerCase() === 'unreleased') unreleased = body
    else sections.push({ version: h[1] as string, date: h[2] ?? '', body })
  })
  return { unreleased, sections }
}

/** Moves Unreleased under the version and date, and points the link references at the tags. */
export function releaseChangelog(text: string, version: string, date: string): string {
  const { unreleased } = readChangelog(text)
  if (!unreleased) throw new Error('The changelog’s Unreleased section is empty.')
  // a new heading under an empty Unreleased, so the old Unreleased body follows it
  const moved = text.replace(
    /^## \[Unreleased\][^\n]*\n/im,
    `## [Unreleased]\n\n## [${version}] - ${date}\n`,
  )
  const previous = readChangelog(text).sections[0]?.version
  const links = moved.replace(/^\[unreleased\]: .*$/im, '').trimEnd()
  const refs = [
    `[unreleased]: ${REPOSITORY}/compare/v${version}...HEAD`,
    previous
      ? `[${version}]: ${REPOSITORY}/compare/v${previous}...v${version}`
      : `[${version}]: ${REPOSITORY}/releases/tag/v${version}`,
  ]
  // the newest references go first, before the older versions' lines
  const firstRef = links.search(/^\[[^\]]+\]: /m)
  return firstRef === -1
    ? `${links}\n\n${refs.join('\n')}\n`
    : `${links.slice(0, firstRef)}${refs.join('\n')}\n${links.slice(firstRef)}\n`
}

/** Plain text, as System › Updates lists it: links become their words, and code and bold lose their marks. */
function plain(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

/**
 * A section's notes for the catalog: one line per bullet, under the schema's 50 lines of 300
 * characters. A section longer than that ends with a line that points to the release's page.
 */
export function notesOf(body: string): string[] {
  const bullets: string[] = []
  for (const line of body.split('\n')) {
    const item = /^[-*] (.+)$/.exec(line)
    if (item) bullets.push(plain(item[1] as string))
    else if (/^\s{2,}\S/.test(line) && bullets.length)
      bullets[bullets.length - 1] += ` ${plain(line)}`
  }
  const cut = (s: string) =>
    s.length <= NOTES.length ? s : `${s.slice(0, NOTES.length - 1).trimEnd()}…`
  if (bullets.length <= NOTES.lines) return bullets.map(cut)
  const kept = bullets.slice(0, NOTES.lines - 1).map(cut)
  return [...kept, `And ${bullets.length - kept.length} more on the release’s page.`]
}

export function releaseEntry(version: string, date: string, body: string): HighseaRelease {
  return releaseSchema.parse({
    version,
    channel: channelOf(version),
    date,
    notes: notesOf(body),
    url: `${REPOSITORY}/releases/tag/v${version}`,
  })
}

/** The catalog's next version on a date: `2026.11.2`, or `2026.11.2.2` after one that day. */
export function nextCatalogVersion(current: string | null, date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = `${y}.${m}.${d}`
  if (!current || compareCatalogVersions(day, current) > 0) return day
  const n = current.startsWith(`${day}.`) ? Number(current.slice(day.length + 1)) + 1 : 2
  const next = `${day}.${n}`
  if (compareCatalogVersions(next, current) <= 0)
    throw new Error(`The catalog is already at ${current}, after ${date}.`)
  return next
}

/** The catalog's newest version, from the first `## ` heading of its CHANGES.md. */
export function catalogVersionOf(changes: string): string | null {
  return /^## (\S+)/m.exec(changes)?.[1] ?? null
}

/** The note the catalog carries for a release, so servers fetch the manifest that lists it. */
export const catalogNote = (version: string) =>
  `highsea ${version} is out. System › Updates has its notes.`

export function addCatalogChange(changes: string, version: string, date: string): string {
  const next = nextCatalogVersion(catalogVersionOf(changes), date)
  const at = changes.search(/^## /m)
  const entry = `## ${next}\n\n- ${catalogNote(version)}\n\n`
  return at === -1
    ? `${changes.trimEnd()}\n\n${entry}`
    : changes.slice(0, at) + entry + changes.slice(at)
}

type Files = Record<keyof typeof FILES, string>

/**
 * Why production servers wouldn't trust a release's catalog, or its image's seed: they trust only
 * the release keys (packages/catalog/src/keys.ts, ADR 0034), never the development key.
 */
export function trustProblems(
  releaseKeys: readonly string[],
  seedKeyIds: readonly string[],
  signingKeyId: string | undefined,
): string[] {
  const problems: string[] = []
  if (!releaseKeys.length)
    problems.push(
      'No release key is listed in packages/catalog/src/keys.ts (catalog/keys/README.md).',
    )
  if (!signingKeyId)
    problems.push(
      'HIGHSEA_CATALOG_KEY_ID isn’t set, so the catalog would be signed with the development key.',
    )
  else if (!releaseKeys.includes(signingKeyId))
    problems.push(`The catalog would be signed with ${signingKeyId}, which isn’t a release key.`)
  const untrusted = [...new Set(seedKeyIds.filter((id) => !releaseKeys.includes(id)))]
  if (untrusted.length)
    problems.push(
      `The image's seed is signed with ${untrusted.join(', ')}; sign it with the release key.`,
    )
  return problems
}

/** The key ids of the seed's manifests, every kind and channel. */
function seedKeyIds(dir = join(ROOT, 'packages/catalog/seed')): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('manifest.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).keyId as string)
}

/** What `check` finds wrong with a prepared release; empty when it's ready. */
export function problemsOf(version: string, files: Files, tags: string[]): string[] {
  const problems: string[] = []
  if (!isVersion(version)) return [`${version} isn’t a SemVer version like 0.1.0.`]
  const newest = taggedVersions(tags)[0]
  if (newest && compareAppVersions(version, newest) <= 0)
    problems.push(`${version} isn’t newer than v${newest}, the newest tag.`)
  const server = JSON.parse(files.server).version
  if (server !== version) problems.push(`apps/server is at ${server}, not ${version}.`)
  const section = readChangelog(files.changelog).sections.find((s) => s.version === version)
  if (!section) problems.push(`CHANGELOG.md has no ## [${version}] section.`)
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(section.date))
    problems.push(`CHANGELOG.md’s ${version} section has no date.`)
  const releases = files.releases ? releaseSchema.array().parse(JSON.parse(files.releases)) : []
  const entry = releases[0]
  if (entry?.version !== version) problems.push(`releases.json doesn’t start with ${version}.`)
  else if (
    section &&
    JSON.stringify(entry) !== JSON.stringify(releaseEntry(version, section.date, section.body))
  )
    problems.push(`releases.json’s ${version} entry doesn’t match the changelog; prepare again.`)
  if (!files.catalogChanges.includes(catalogNote(version)))
    problems.push(
      `The catalog’s CHANGES.md doesn’t mention ${version}, so servers wouldn’t see it.`,
    )
  return problems
}

/** Writes the release into the files: the changelog, the server's version and the catalog. */
export function prepare(version: string, date: string, files: Files, tags: string[]): Files {
  if (!isVersion(version)) throw new Error(`${version} isn’t a SemVer version like 0.1.0.`)
  const newest = taggedVersions(tags)[0]
  if (newest && compareAppVersions(version, newest) <= 0)
    throw new Error(`${version} isn’t newer than v${newest}, the newest tag.`)
  const changelog = releaseChangelog(files.changelog, version, date)
  const section = readChangelog(changelog).sections[0] as Section
  const server = JSON.parse(files.server)
  server.version = version
  const releases: HighseaRelease[] = files.releases ? JSON.parse(files.releases) : []
  const entry = releaseEntry(version, date, section.body)
  const kept = [entry, ...releases.filter((r) => r.version !== version)].slice(0, MAX_RELEASES)
  return {
    changelog,
    server: `${JSON.stringify(server, null, 2)}\n`,
    releases: `${JSON.stringify(kept, null, 2)}\n`,
    catalogChanges: addCatalogChange(files.catalogChanges, version, date),
  }
}

function readFiles(): Files {
  const read = (path: string) => {
    try {
      return readFileSync(join(ROOT, path), 'utf8')
    } catch {
      return ''
    }
  }
  return {
    changelog: read(FILES.changelog),
    server: read(FILES.server),
    releases: read(FILES.releases),
    catalogChanges: read(FILES.catalogChanges),
  }
}

function gitTags(): string[] {
  return execFileSync('git', ['tag', '--list', 'v*'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

if (import.meta.main) {
  const [command, version = ''] = process.argv.slice(2)
  const dateAt = process.argv.indexOf('--date')
  const date = dateAt > 0 ? (process.argv[dateAt + 1] ?? '') : new Date().toISOString().slice(0, 10)
  try {
    if (command === 'prepare') {
      const written = prepare(version, date, readFiles(), gitTags())
      for (const [key, path] of Object.entries(FILES))
        writeFileSync(join(ROOT, path), written[key as keyof Files])
      // the catalog's version moved, so the committed seed follows it, signed with the development
      // key as it always is in the repository; the release workflow signs the image's with the
      // release key
      const { HIGHSEA_CATALOG_KEY: _, HIGHSEA_CATALOG_KEY_ID: __, ...env } = process.env
      execFileSync('bun', ['scripts/catalog.ts', 'build', '--seed'], {
        cwd: ROOT,
        env,
        stdio: 'inherit',
      })
      // the API's description names the server's version, and a test fails when it's stale
      execFileSync('bun', ['run', 'openapi'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
      console.log(
        `Prepared ${version} (${date}): ${Object.values(FILES).join(', ')}, the seed and apps/server/openapi.json.`,
      )
    } else if (command === 'check') {
      const problems = problemsOf(version, readFiles(), gitTags())
      for (const p of problems) console.error(p)
      if (problems.length) process.exit(1)
      console.log(`${version} is ready to release.`)
    } else if (command === 'notes') {
      const section = readChangelog(readFiles().changelog).sections.find(
        (s) => s.version === version,
      )
      if (!section) throw new Error(`CHANGELOG.md has no ## [${version}] section.`)
      console.log(section.body)
    } else if (command === 'trust') {
      const problems = trustProblems(
        RELEASE_KEYS.map((k) => k.id),
        seedKeyIds(),
        process.env.HIGHSEA_CATALOG_KEY_ID || undefined,
      )
      for (const p of problems) console.error(p)
      if (problems.length) process.exit(1)
      console.log('Production servers will trust the catalog and the seed.')
    } else if (command === 'tags') {
      console.log(imageTags(version, taggedVersions(gitTags())).join('\n'))
    } else {
      console.error(
        'Usage: bun scripts/release.ts prepare <version> [--date YYYY-MM-DD], check|notes|tags <version>, or trust',
      )
      process.exit(2)
    }
  } catch (error) {
    console.error((error as Error).message)
    process.exit(1)
  }
}
