// SPDX-License-Identifier: AGPL-3.0-only
// The monthly watch over other projects' lists (docs/plans/indexer-catalog-upkeep.md, part B, the
// owner's answer 8): which sites they carry, by file name only, beside highsea's own catalog.
//
//   bun run catalog:watch          print the report and keep the names in catalog/indexers/watch.json
//     --dry                        print it, leave watch.json as it was
//     --all                        also list every name highsea lacks
//
// It reads only the names of the files in each folder, through GitHub's Git trees API
// (https://docs.github.com/en/rest/git/trees#get-a-tree), walking the path one folder at a time.
// It downloads no definition and reads no file's contents: a site's name is a fact, how another
// project searches it is their work, and highsea copies none of it (phase-3-checkpoint-5.md, Where
// definitions come from). It needs no token: a run is about ten requests, inside the 60 an hour
// GitHub allows without one (https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
// It runs by hand, monthly, and never in tests (no network in tests).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Fetch } from '@highsea-tv/core'
import { CATALOG_DIR, catalogDefinitions } from './catalog-verify.ts'

export const WATCH_FILE = join(CATALOG_DIR, 'watch.json')

export type WatchedList = {
  key: string
  label: string
  owner: string
  repo: string
  /** Folders from the repository's root; a last `v*` is the busiest of the three newest version folders. */
  path: string[]
  /** The file extension a name is read from. */
  ext: string
}

/** The lists the plan names. */
export const LISTS: WatchedList[] = [
  {
    key: 'prowlarr',
    label: 'Prowlarr',
    owner: 'Prowlarr',
    repo: 'Indexers',
    path: ['definitions', 'v*'],
    ext: '.yml',
  },
  {
    key: 'jackett',
    label: 'Jackett',
    owner: 'Jackett',
    repo: 'Jackett',
    path: ['src', 'Jackett.Common', 'Definitions'],
    ext: '.yml',
  },
  {
    key: 'qbittorrent',
    label: 'qBittorrent’s search plugins',
    owner: 'qbittorrent',
    repo: 'search-plugins',
    path: ['nova3', 'engines'],
    ext: '.py',
  },
]

export type WatchFile = {
  about: string
  lists: Record<string, { label: string; folder: string; checked: string; names: string[] }>
}

const ABOUT =
  'Written by bun run catalog:watch: the file names in other projects’ indexer folders, names only, to compare month to month. Nothing else of theirs is read or kept.'

type TreeEntry = { path: string; type: string; sha: string }

const API = 'https://api.github.com'

async function getJson(fetch: Fetch, url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'highsea-catalog-watch',
    },
  })
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`)
  return response.json()
}

/** The names in one list's folder: its files' names without the extension, sorted. */
export async function namesOf(
  fetch: Fetch,
  list: WatchedList,
): Promise<{ folder: string; names: string[] }> {
  const base = `${API}/repos/${list.owner}/${list.repo}`
  const treeOf = async (sha: string) =>
    (
      (await getJson(fetch, `${base}/git/trees/${encodeURIComponent(sha)}`)) as {
        tree: TreeEntry[]
      }
    ).tree
  const namesIn = (entries: TreeEntry[]) =>
    entries
      .filter((e) => e.type === 'blob' && e.path.endsWith(list.ext) && !e.path.startsWith('_'))
      .map((e) => e.path.slice(0, -list.ext.length))
      .sort()
  const repo = (await getJson(fetch, base)) as { default_branch: string }
  let entries = await treeOf(repo.default_branch)
  const walked: string[] = []
  for (const segment of list.path) {
    const folders = entries.filter((e) => e.type === 'tree')
    if (segment === 'v*') {
      // a list kept per format version: a new version's folder starts nearly empty, so the busiest
      // of the three newest is the one in use
      const versions = folders
        .filter((e) => /^v\d+$/.test(e.path))
        .sort((a, b) => Number(b.path.slice(1)) - Number(a.path.slice(1)))
        .slice(0, 3)
      let best: { folder: string; names: string[] } | null = null
      for (const v of versions) {
        const names = namesIn(await treeOf(v.sha))
        if (!best || names.length > best.names.length) best = { folder: v.path, names }
      }
      if (!best) throw new Error(`${list.label}: no version folder in ${walked.join('/')}.`)
      return { folder: [...walked, best.folder].join('/'), names: best.names }
    }
    const found = folders.find((e) => e.path === segment)
    if (!found) throw new Error(`${list.label}: no folder ${[...walked, segment].join('/')}.`)
    walked.push(found.path)
    entries = await treeOf(found.sha)
  }
  return { folder: walked.join('/'), names: namesIn(entries) }
}

/** Names compared loosely: `torrents-csv`, `TorrentsCSV` and `torrentscsv` are one site. */
export const normal = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')

export type Comparison = {
  lists: {
    key: string
    label: string
    folder: string
    count: number
    since: string | null
    added: string[]
    dropped: string[]
  }[]
  /** highsea's own site definitions and the lists that carry each. */
  ours: { id: string; carriedBy: string[]; droppedBy: string[] }[]
  /** Names highsea lacks, with the lists carrying each, most carried first. */
  lacks: { name: string; carriedBy: string[] }[]
}

export function compare(
  previous: WatchFile | null,
  current: Record<string, { label: string; folder: string; names: string[] }>,
  ourIds: readonly string[],
): Comparison {
  const lists = Object.entries(current).map(([key, now]) => {
    const before = previous?.lists[key]
    const had = new Set(before?.names ?? [])
    const has = new Set(now.names)
    return {
      key,
      label: now.label,
      folder: now.folder,
      count: now.names.length,
      since: before?.checked ?? null,
      added: before ? now.names.filter((n) => !had.has(n)) : [],
      dropped: before ? [...had].filter((n) => !has.has(n)).sort() : [],
    }
  })
  const carriers = new Map<string, { name: string; lists: Set<string> }>()
  for (const [key, now] of Object.entries(current))
    for (const name of now.names) {
      const n = normal(name)
      const entry = carriers.get(n) ?? { name, lists: new Set<string>() }
      entry.lists.add(current[key]?.label ?? key)
      carriers.set(n, entry)
    }
  const ours = new Set(ourIds.map(normal))
  const droppedBy = (id: string) =>
    lists.filter((l) => l.dropped.some((d) => normal(d) === normal(id))).map((l) => l.label)
  return {
    lists,
    ours: ourIds.map((id) => ({
      id,
      carriedBy: [...(carriers.get(normal(id))?.lists ?? [])],
      droppedBy: droppedBy(id),
    })),
    lacks: [...carriers.entries()]
      .filter(([n]) => !ours.has(n))
      .map(([, e]) => ({ name: e.name, carriedBy: [...e.lists] }))
      .sort((a, b) => b.carriedBy.length - a.carriedBy.length || a.name.localeCompare(b.name)),
  }
}

/** The report, for a person. */
export function watchReport(today: string, c: Comparison, all = false): string {
  const lines = [`Other projects’ lists, ${today} (file names only)`, '']
  for (const l of c.lists)
    lines.push(
      `${l.label} (${l.folder}): ${l.count} names${l.since ? `, ${l.added.length} new and ${l.dropped.length} gone since ${l.since}` : ', first run'}`,
    )
  const listed = (title: string, items: string[]) => {
    lines.push('', `${title}:`, ...(items.length ? items.map((i) => `- ${i}`) : ['- none']))
  }
  listed(
    'New since the last run (a candidate only once the site’s own documentation or pages are found)',
    c.lists.flatMap((l) => l.added.map((n) => `${n} (${l.label})`)),
  )
  listed(
    'Gone since the last run (a hint to check the site, nothing more)',
    c.lists.flatMap((l) => l.dropped.map((n) => `${n} (${l.label})`)),
  )
  listed(
    'highsea’s definitions',
    c.ours.map(
      (o) =>
        `${o.id}: ${o.carriedBy.length ? `carried by ${o.carriedBy.join(', ')}` : 'no list carries it'}${o.droppedBy.length ? `; dropped by ${o.droppedBy.join(', ')} since the last run, so check the site` : ''}`,
    ),
  )
  const everywhere = c.lacks.filter((l) => l.carriedBy.length === c.lists.length)
  listed(
    `highsea lacks, carried by every list (${everywhere.length})`,
    everywhere.map((l) => l.name),
  )
  lines.push(
    '',
    `highsea lacks ${c.lacks.length} names in all, many of them private trackers.${all ? '' : ' --all lists them.'}`,
  )
  if (all) for (const l of c.lacks) lines.push(`- ${l.name} (${l.carriedBy.join(', ')})`)
  return lines.join('\n')
}

export function readWatch(file = WATCH_FILE): WatchFile | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as WatchFile) : null
}

/** highsea's own site definitions: the generic ones name no site. */
export function ourSiteIds(): string[] {
  return [...new Set(catalogDefinitions().map((d) => d.definition.id))]
    .filter((id) => !id.startsWith('generic-'))
    .sort()
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const today = new Date().toISOString().slice(0, 10)
  const current: Record<string, { label: string; folder: string; names: string[] }> = {}
  for (const list of LISTS) {
    const { folder, names } = await namesOf(globalThis.fetch, list)
    current[list.key] = { label: list.label, folder, names }
  }
  const previous = readWatch()
  console.log(watchReport(today, compare(previous, current, ourSiteIds()), args.includes('--all')))
  if (!args.includes('--dry')) {
    const file: WatchFile = {
      about: ABOUT,
      lists: Object.fromEntries(
        Object.entries(current).map(([k, v]) => [k, { ...v, checked: today }]),
      ),
    }
    writeFileSync(WATCH_FILE, `${JSON.stringify(file, null, 2)}\n`)
    console.log(`\nWrote ${WATCH_FILE}. Nothing is committed.`)
  }
}
