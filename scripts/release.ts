// SPDX-License-Identifier: AGPL-3.0-only
// highsea's releases (ADR 0050). One version for highsea, `apps/server`'s, in SemVer 2.0.0
// (https://semver.org/); the changelog in Keep a Changelog 1.1.0's format
// (https://keepachangelog.com/en/1.1.0/). A release is prepared in a commit, so what's published is
// what's in git, and the release workflow checks it before building anything:
//
//   bun scripts/release.ts prepare 0.1.0 [--date 2026-11-02]   Unreleased becomes 0.1.0, and the
//       server's version, the catalog's releases.json, its CHANGES.md, bun.lock and the seed follow
//   bun scripts/release.ts version [patch|minor|major|0.1.0]   the version to release: blank or
//       `patch` is the next patch after the newest tag (or a newer version already prepared), and
//       an explicit one must be newer than every tag
//   bun scripts/release.ts merged          the pull requests merged since the newest tag, as JSON,
//       from git and, where it answers, GitHub's API (titles, labels)
//   bun scripts/release.ts changelog <merged.json>   fills an empty Unreleased from them; entries
//       written by hand win
//   bun scripts/release.ts check 0.1.0     everything prepare writes is there and agrees, and the
//       version is newer than every tag
//   bun scripts/release.ts notes 0.1.0     the changelog's section, for the GitHub release
//   bun scripts/release.ts tags 0.1.0      the image's tags, one a line, given the tags already made
//   bun scripts/release.ts trust           production servers will trust what the release signs:
//       the key in HIGHSEA_CATALOG_KEY_ID is a release key, and the image's seed is signed with one
//   bun scripts/release.ts desktop-key     the desktop app's updater trusts the release key, not the
//       development one (apps/desktop/keys/README.md)
//   bun scripts/release.ts feed 0.1.0 <dir>   the updater's latest.json, from the signed installers
//       in <dir> (ADR 0058)
//
// The desktop app carries the same version (ADR 0050's 4.4 section): prepare sets it in
// tauri.conf.json, its Cargo.toml and Cargo.lock, and its package.json, and check reads them.
// The one client (apps/client: the phone, the TV and the web; one-client-platform.md) does too, from
// its package.json, which its app.config.ts reads; it took over from the phone's and the TV's apps.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
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
  desktopConfig: 'apps/desktop/src-tauri/tauri.conf.json',
  desktopCargo: 'apps/desktop/src-tauri/Cargo.toml',
  desktopLock: 'apps/desktop/src-tauri/Cargo.lock',
  desktopPackage: 'apps/desktop/package.json',
  clientPackage: 'apps/client/package.json',
  lock: 'bun.lock',
}

/** The workspaces in bun.lock that carry the release's version, by the package.json prepare sets. */
const LOCK_WORKSPACES = ['apps/server', 'apps/desktop', 'apps/client'] as const

/** A workspace's entry in bun.lock: its key, its name line, then its version line. */
const lockVersion = (workspace: string) =>
  new RegExp(`("${workspace}": \\{\\n\\s*"name": "[^"]+",\\n\\s*"version": ")([^"]+)(")`)

/** bun.lock with each released workspace at the version, so `bun install --frozen-lockfile` agrees. */
export function withLockVersions(lock: string, version: string): string {
  return LOCK_WORKSPACES.reduce((text, w) => text.replace(lockVersion(w), `$1${version}$3`), lock)
}

/** The desktop app's crate in Cargo.toml and Cargo.lock: its name line, then its version line. */
const CRATE_VERSION = /(name = "highsea-desktop"\nversion = ")([^"]+)(")/

/** The desktop app's version in each file that carries it, `null` where it can't be read. */
function desktopVersions(files: Files): [string, string | null][] {
  const json = (text: string) => {
    try {
      return (JSON.parse(text) as { version?: string }).version ?? null
    } catch {
      return null
    }
  }
  return [
    [FILES.desktopConfig, json(files.desktopConfig)],
    [FILES.desktopCargo, files.desktopCargo.match(CRATE_VERSION)?.[2] ?? null],
    [FILES.desktopLock, files.desktopLock.match(CRATE_VERSION)?.[2] ?? null],
    [FILES.desktopPackage, json(files.desktopPackage)],
    [FILES.clientPackage, json(files.clientPackage)],
    ...LOCK_WORKSPACES.map((w): [string, string | null] => [
      `${FILES.lock} (${w})`,
      files.lock.match(lockVersion(w))?.[2] ?? null,
    ]),
  ]
}

/** Sets a JSON file's top-level `version`, keeping the rest of its text as it was. */
const withJsonVersion = (text: string, version: string) =>
  text.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`)
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
  for (const [path, v] of desktopVersions(files))
    if (v !== version) problems.push(`${path} is at ${v ?? 'no version'}, not ${version}.`)
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
    desktopConfig: withJsonVersion(files.desktopConfig, version),
    desktopCargo: files.desktopCargo.replace(CRATE_VERSION, `$1${version}$3`),
    desktopLock: files.desktopLock.replace(CRATE_VERSION, `$1${version}$3`),
    desktopPackage: withJsonVersion(files.desktopPackage, version),
    clientPackage: withJsonVersion(files.clientPackage, version),
    lock: withLockVersions(files.lock, version),
  }
}

/**
 * The version to release (2026-11-17, ADR 0050's section of that date). Blank or `patch` is the
 * next patch after the newest `v*` tag, unless a newer version is already prepared (`prepared`,
 * apps/server's), which a hand-prepared release keeps; `minor` and `major` step those parts;
 * anything else must be a SemVer version newer than every tag. A step from a pre-release finishes
 * it first, as SemVer orders them (§ 11): after `0.5.0-beta.1`, a patch or minor is `0.5.0`.
 */
export function pickVersion(input: string, tags: string[], prepared?: string): string {
  const wanted = input.trim()
  const newest = taggedVersions(tags)[0]
  if (wanted && !['patch', 'minor', 'major'].includes(wanted)) {
    if (!isVersion(wanted))
      throw new Error(`${wanted} isn’t patch, minor, major or a SemVer version like 0.1.0.`)
    if (newest && compareAppVersions(wanted, newest) <= 0)
      throw new Error(`${wanted} isn’t newer than v${newest}, the newest tag.`)
    return wanted
  }
  const step = (wanted || 'patch') as 'patch' | 'minor' | 'major'
  if (
    step === 'patch' &&
    prepared &&
    isVersion(prepared) &&
    (!newest || compareAppVersions(prepared, newest) > 0)
  )
    return prepared
  const [, ma, mi, pa, pre] = SEMVER.exec(newest ?? '0.0.0') as RegExpExecArray
  const [major, minor, patch] = [Number(ma), Number(mi), Number(pa)]
  if (step === 'major')
    return pre && minor === 0 && patch === 0 ? `${major}.0.0` : `${major + 1}.0.0`
  if (step === 'minor')
    return pre && patch === 0 ? `${major}.${minor}.0` : `${major}.${minor + 1}.0`
  return pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`
}

/** A pull request merged into next, as `merged` lists it and `changelog` reads it. */
export type Merged = {
  number?: number
  title: string
  labels: string[]
  files: string[]
}

/**
 * Paths that never reach an owner: the internal docs, notes for Claude (`.claude/`, CLAUDE.md and
 * AGENTS.md), CI and the repository's scripts (2026-11-17). A pull request that touches only these is left out of the changelog.
 */
const INTERNAL = [/^docs\//, /^\.claude\//, /^\.github\//, /^scripts\//, /^(CLAUDE|AGENTS)\.md$/]

export const isInternal = (files: string[]) =>
  files.length > 0 && files.every((f) => INTERNAL.some((p) => p.test(f)))

/** A release's own commits, which the changelog doesn't list. */
const RELEASE_TITLE = /^(Prepare|Release) v?\d+\.\d+\.\d+/

type Group = 'Added' | 'Changed' | 'Fixed'

/**
 * Where an entry goes: a label first (`bug` or `fix` to Fixed; `feature`, `enhancement` or `added`
 * to Added; `changed` to Changed), then the title's first word, and Changed otherwise.
 */
export function groupOf(pr: Merged): Group {
  const labels = pr.labels.map((l) => l.toLowerCase())
  if (labels.some((l) => ['bug', 'fix', 'fixed'].includes(l))) return 'Fixed'
  if (labels.some((l) => ['feature', 'enhancement', 'added'].includes(l))) return 'Added'
  if (labels.includes('changed')) return 'Changed'
  if (/^(fix|fixes|fixed)\b/i.test(pr.title) || /\bbug\b/i.test(pr.title)) return 'Fixed'
  if (/^(add|adds|let|lets|allow|allows|support|supports|show|shows|introduce)\b/i.test(pr.title))
    return 'Added'
  return 'Changed'
}

/** The Unreleased body for these pull requests, grouped as Keep a Changelog groups them. */
export function changelogEntries(merged: Merged[]): string {
  const groups: Record<Group, string[]> = { Added: [], Changed: [], Fixed: [] }
  for (const pr of merged) {
    if (RELEASE_TITLE.test(pr.title) || isInternal(pr.files)) continue
    const title = pr.title.replace(/\s*\(#\d+\)$/, '').trim()
    const link = pr.number ? ` ([#${pr.number}](${REPOSITORY}/pull/${pr.number}))` : ''
    groups[groupOf(pr)].push(`- ${title}${link}`)
  }
  return (Object.keys(groups) as Group[])
    .filter((g) => groups[g].length)
    .map((g) => `### ${g}\n\n${groups[g].join('\n')}`)
    .join('\n\n')
}

/**
 * The changelog with an empty Unreleased filled from the pull requests merged since the last tag.
 * An Unreleased someone has written already wins, unchanged.
 */
export function fillUnreleased(
  text: string,
  merged: Merged[],
): { text: string; from: 'hand' | 'pull requests' } {
  if (readChangelog(text).unreleased) return { text, from: 'hand' }
  const body = changelogEntries(merged)
  if (!body)
    throw new Error(
      'Nothing to release: the changelog’s Unreleased is empty and no pull request since the last tag changed anything outside docs/, .claude/, .github/ and scripts/.',
    )
  if (!/^## \[Unreleased\][^\n]*$/im.test(text))
    throw new Error('The changelog has no ## [Unreleased] heading.')
  return {
    text: text.replace(/^## \[Unreleased\][^\n]*\n+/im, `## [Unreleased]\n\n${body}\n\n`),
    from: 'pull requests',
  }
}

/** The pull request number in a squash merge's subject (`… (#48)`) or a merge commit's. */
export function prNumberOf(subject: string): number | undefined {
  const n = /\(#(\d+)\)$/.exec(subject)?.[1] ?? /^Merge pull request #(\d+) /.exec(subject)?.[1]
  return n ? Number(n) : undefined
}

/**
 * The pull requests merged into this branch since the newest tag: its first-parent commits, each
 * with the files it changed from git and its subject, which a squash merge takes from the pull
 * request's title as the owner left it (GitHub's own title may still carry a task's id), and the
 * pull request's labels from GitHub's API where it answers
 * (https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request). A merge commit's subject
 * names only the branch, so it takes the pull request's title.
 */
function mergedSinceTag(): Merged[] {
  const newest = taggedVersions(gitTags())[0]
  const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  const range = newest ? [`v${newest}..HEAD`] : ['HEAD']
  const commits = git('log', '--first-parent', '--format=%H%x09%s', ...range)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t') as [string, string])
  const repo = process.env.GITHUB_REPOSITORY ?? REPOSITORY.replace('https://github.com/', '')
  return commits.reverse().map(([sha, subject]) => {
    const number = prNumberOf(subject)
    const files = git('diff', '--name-only', '--no-renames', `${sha}^1`, sha)
      .split('\n')
      .filter(Boolean)
    let title = subject
    let labels: string[] = []
    if (number)
      try {
        const pr = JSON.parse(
          execFileSync(
            'gh',
            ['api', `repos/${repo}/pulls/${number}`, '--jq', '{title, labels: [.labels[].name]}'],
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
          ),
        ) as { title: string; labels: string[] }
        labels = pr.labels
        if (subject.startsWith('Merge pull request #')) title = pr.title
      } catch {
        // no gh, or no answer: the subject alone, and no labels
      }
    return { number, title, labels, files }
  })
}

/** The development key's public half (apps/desktop/keys/development.key.pub). */
const DESKTOP_DEV_PUBKEY = () =>
  readFileSync(join(ROOT, 'apps/desktop/keys/development.key.pub'), 'utf8').trim()

/** Why installed apps wouldn't take this release's updates as the owner's. */
export function desktopKeyProblems(config: string, developmentKey: string): string[] {
  const pubkey = (JSON.parse(config) as { plugins?: { updater?: { pubkey?: string } } }).plugins
    ?.updater?.pubkey
  if (!pubkey) return ['tauri.conf.json has no updater pubkey.']
  if (pubkey.trim() === developmentKey)
    return [
      'The desktop app’s updater trusts the development key; put the release key’s public half in tauri.conf.json (apps/desktop/keys/README.md).',
    ]
  return []
}

/** Which updater platform an installer is for, by its name as Tauri's bundler writes it. */
const FEED_TARGETS: [RegExp, string[]][] = [
  // the universal app serves both Macs (https://v2.tauri.app/plugin/updater/#static-json-file)
  [/\.app\.tar\.gz$/, ['darwin-aarch64', 'darwin-x86_64']],
  [/_x64-setup\.exe$/, ['windows-x86_64']],
  [/_amd64\.AppImage$/, ['linux-x86_64']],
  [/_aarch64\.AppImage$/, ['linux-aarch64']],
]

export type Feed = {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, { signature: string; url: string }>
}

/**
 * The updater's static `latest.json` (https://v2.tauri.app/plugin/updater/#static-json-file): for
 * each installer with its `.sig` beside it, the platforms it serves, its signature and where the
 * release has it.
 */
export function desktopFeed(
  version: string,
  notes: string,
  date: string,
  signed: Record<string, string>,
): Feed {
  const platforms: Feed['platforms'] = {}
  for (const [file, signature] of Object.entries(signed)) {
    const name = basename(file)
    const targets = FEED_TARGETS.find(([pattern]) => pattern.test(name))?.[1] ?? []
    for (const t of targets)
      platforms[t] = {
        signature: signature.trim(),
        url: `${REPOSITORY}/releases/download/v${version}/${encodeURIComponent(name)}`,
      }
  }
  if (!Object.keys(platforms).length) throw new Error('No signed installer for the updater.')
  return { version, notes, pub_date: `${date}T00:00:00Z`, platforms }
}

function readFiles(): Files {
  const read = (path: string) => {
    try {
      return readFileSync(join(ROOT, path), 'utf8')
    } catch {
      return ''
    }
  }
  return Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, read(path)])) as Files
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
    } else if (command === 'version') {
      const server = JSON.parse(readFiles().server) as { version?: string }
      console.log(pickVersion(version, gitTags(), server.version))
    } else if (command === 'merged') {
      console.log(JSON.stringify(mergedSinceTag(), null, 2))
    } else if (command === 'changelog') {
      if (!version) throw new Error('Usage: bun scripts/release.ts changelog <merged.json>')
      const merged = JSON.parse(readFileSync(version, 'utf8')) as Merged[]
      const { text, from } = fillUnreleased(readFiles().changelog, merged)
      writeFileSync(join(ROOT, FILES.changelog), text)
      console.log(
        from === 'hand'
          ? 'The changelog’s Unreleased has entries written by hand; they stand.'
          : 'The changelog’s Unreleased is written from the pull requests merged since the last tag.',
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
    } else if (command === 'desktop-key') {
      const problems = desktopKeyProblems(readFiles().desktopConfig, DESKTOP_DEV_PUBKEY())
      for (const p of problems) console.error(p)
      if (problems.length) process.exit(1)
      console.log('Installed apps will take this release’s updates.')
    } else if (command === 'feed') {
      const dir = process.argv[4]
      if (!dir) throw new Error('Usage: bun scripts/release.ts feed <version> <dir>')
      const section = readChangelog(readFiles().changelog).sections.find(
        (s) => s.version === version,
      )
      if (!section) throw new Error(`CHANGELOG.md has no ## [${version}] section.`)
      const signed: Record<string, string> = {}
      for (const f of readdirSync(dir, { recursive: true, encoding: 'utf8' }))
        if (f.endsWith('.sig')) signed[f.slice(0, -4)] = readFileSync(join(dir, f), 'utf8')
      const feed = desktopFeed(version, section.body, section.date, signed)
      console.log(JSON.stringify(feed, null, 2))
    } else if (command === 'tags') {
      console.log(imageTags(version, taggedVersions(gitTags())).join('\n'))
    } else {
      console.error(
        'Usage: bun scripts/release.ts prepare <version> [--date YYYY-MM-DD], version [patch|minor|major|<version>], merged, changelog <merged.json>, check|notes|tags <version>, feed <version> <dir>, trust, or desktop-key',
      )
      process.exit(2)
    }
  } catch (error) {
    console.error((error as Error).message)
    process.exit(1)
  }
}
