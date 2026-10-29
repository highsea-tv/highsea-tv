// SPDX-License-Identifier: AGPL-3.0-only
// highsea's Synology package source, at packages.highsea.tv (install-simplicity.md, part D; ADR
// 0050's 2026-10-29 section). An owner adds it in Package Center › Settings › Package Sources, and
// Package Center then lists highsea under Community and offers its updates.
//
// Synology doesn't document what a package source answers. This answers as SynoCommunity's spkrepo
// does (https://github.com/SynoCommunity/spkrepo, views/nas.py and domain/catalog.py): Package
// Center sends its DSM build, architecture and language (DSM 7.4 as a GET query; spkrepo also takes
// a form) and gets {"packages": [...]} back, one entry per package that runs on that build.
// highsea's package is noarch, so only the build matters. DSM keeps the answer in a cache and
// follows the link's redirect to GitHub's file, adding its own query, which GitHub ignores.
//
// The package comes from the latest stable GitHub release, which carries the .spk and its
// manifest, highsea-spk.json (scripts/spk.ts). Only stable releases have a package, and GitHub's
// latest is the latest stable one (ADR 0050).
//
// A Vercel Function with the Web signature (https://vercel.com/docs/functions/runtimes/node-js).

export const RELEASES = 'https://github.com/highsea-tv/highsea-tv/releases'
const GUIDE = 'https://docs.highsea.tv/install/synology/#install-the-package'

/** highsea-spk.json, as scripts/spk.ts writes it. */
export type Manifest = {
  release: string
  version: string
  file: string
  size: number
  md5: string
  sha256: string
  os_min_ver: string
  deppkgs: string
  desc: string
}

export type SourceOptions = {
  /** Where the latest release's manifest is. */
  manifest: string
  /** Where a release's files are, given its version. */
  downloads: (release: string) => string
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  now: () => number
}

/** How long a manifest is used before it's read again. */
const FRESH_MS = 5 * 60 * 1000

/** DSM's build from os_min_ver ("7.2.1-69057"), which Package Center sends as `build`. */
export function minBuild(osMinVer: string): number {
  const build = Number(osMinVer.split('-')[1])
  if (!Number.isInteger(build)) throw new Error(`os_min_ver ${osMinVer} has no build.`)
  return build
}

/** The package's entry, in the shape spkrepo's build_entry_data gives Package Center. */
export function entryOf(m: Manifest, link: string, origin: string) {
  return {
    package: 'highsea',
    version: m.version,
    dname: 'highsea',
    desc: m.desc,
    link,
    md5: m.md5,
    size: m.size,
    thumbnail: [`${origin}/icon_72.png`, `${origin}/icon_120.png`],
    thumbnail_retina: [`${origin}/icon_256.png`, `${origin}/icon_256.png`],
    snapshot: [],
    // spkrepo's quick flags: an install wizard means no quiet install or start; there's no
    // upgrade wizard, so upgrades are quiet
    qinst: false,
    qupgrade: true,
    qstart: false,
    startable: 'yes',
    deppkgs: m.deppkgs,
    conflictpkgs: null,
    maintainer: 'highsea',
    maintainer_url: 'https://highsea.tv',
    distributor: 'highsea',
    distributor_url: 'https://highsea.tv',
    changelog: `Release notes: ${RELEASES}/tag/v${m.release}`,
  }
}

export function createSource(options: SourceOptions) {
  let cached: { manifest: Manifest; at: number } | undefined

  async function manifest(): Promise<Manifest | undefined> {
    if (cached && options.now() - cached.at < FRESH_MS) return cached.manifest
    try {
      const response = await options.fetch(options.manifest, { redirect: 'follow' })
      if (!response.ok) throw new Error(`${options.manifest} answered ${response.status}`)
      const read = (await response.json()) as Manifest
      minBuild(read.os_min_ver)
      cached = { manifest: read, at: options.now() }
    } catch (error) {
      // a stale manifest is better than none while GitHub is away
      console.error(`highsea's manifest couldn't be read: ${String(error)}`)
    }
    return cached?.manifest
  }

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const params = new URLSearchParams(url.search)
    if (request.method === 'POST') {
      for (const [key, value] of new URLSearchParams(await request.text())) params.set(key, value)
    } else if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, POST' } })
    }

    const build = Number(params.get('build'))
    if (!params.has('build') || !Number.isInteger(build)) {
      // a person opening the address gets the guide, as spkrepo sends browsers to its pages
      if (request.headers.get('accept')?.includes('text/html')) return Response.redirect(GUIDE, 302)
      return Response.json(
        { error: 'Package Center sends build, arch and language.' },
        { status: 400 },
      )
    }

    const m = await manifest()
    if (!m) return Response.json({ error: "highsea's package couldn't be found." }, { status: 503 })
    const packages =
      build >= minBuild(m.os_min_ver)
        ? [entryOf(m, `${options.downloads(m.release)}/${m.file}`, url.origin)]
        : []
    return Response.json(
      { packages },
      { headers: { 'cache-control': 'public, max-age=0, s-maxage=300' } },
    )
  }
}

const handle = createSource({
  manifest: process.env.HIGHSEA_PACKAGES_MANIFEST ?? `${RELEASES}/latest/download/highsea-spk.json`,
  downloads: (release) =>
    process.env.HIGHSEA_PACKAGES_DOWNLOADS ?? `${RELEASES}/download/v${release}`,
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
})

export default { fetch: handle }
