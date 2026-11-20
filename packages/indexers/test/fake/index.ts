// SPDX-License-Identifier: AGPL-3.0-only
// The fake indexer (checkpoint 5's plan, "The fake indexer"): one handler that speaks Torznab,
// Newznab, a JSON API, an HTML site with a sign-in form, an RSS feed, and the Internet Archive's
// scrape API, from the fixtures. Tests use it as the `Fetch` seam, so nothing leaves the process;
// the sweeps serve it over HTTP on localhost. It misbehaves on cue.
//
//   /torznab/api       t=caps, t=movie, t=search; apikey required
//   /newznab/api       the same for Usenet
//   /json/api/search   a JSON API with a passkey
//   /html/login        a sign-in form; /html/browse needs its cookie
//   /public/search     a public site's search page: no sign-in, magnets in rows, two pages
//   /rss/feed/{key}    a feed with the key in its address
//   archive.org/services/search/v1/scrape, or /archive/services/search/v1/scrape
//   archive.org/download/{identifier}/{identifier}_archive.torrent, an item's torrent
//   /dl/{id}.torrent, /json/download/{id}?passkey=, /html/download.php?id= (needs the cookie)
//                      a release's .torrent: a small made-up one unless a test serves its own,
//                      or a redirect to a magnet
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  FAKE_CREDENTIALS,
  FAKE_NOW,
  type FakeRelease,
  find,
  RELEASES,
  SHOW_RELEASES,
} from './fixtures.ts'

export * from './definitions.ts'
export * from './fixtures.ts'

export const FAKE_ORIGIN = 'https://fake-indexer.test'

export type Misbehaviour =
  | { kind: 'slow'; ms: number }
  | { kind: 'status'; status: number; retryAfter?: string }
  | { kind: 'malformed' }
  | { kind: 'empty' }
  /** The HTML site's table, or the JSON API's list, moves. */
  | { kind: 'layout' }
  /** A Newznab-style error document with this code. */
  | { kind: 'error-code'; code: number; description: string }
  /**
   * The Archive's scrape API answers as if the query were only the collection: its newest items,
   * whatever the title and year (HT-85), from a saved answer (sites/archive-query-ignored.json).
   */
  | { kind: 'ignores-query' }

export type FakeRequest = { method: string; url: URL; headers: Headers; body: string }

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const rfc2822 = (ms: number) => new Date(ms).toUTCString()

function capsXml(movieParams: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server version="1.3" title="Fake indexer" />
  <limits max="100" default="50" />
  <searching>
    <search available="yes" supportedParams="q" />
    <tv-search available="yes" supportedParams="q,season,ep,tvdbid" />
    <movie-search available="yes" supportedParams="${movieParams}" />
  </searching>
  <categories>
    <category id="2000" name="Movies">
      <subcat id="2030" name="Movies/SD" />
      <subcat id="2040" name="Movies/HD" />
      <subcat id="2045" name="Movies/UHD" />
    </category>
    <category id="5000" name="TV">
      <subcat id="5040" name="TV/HD" />
    </category>
    <category id="100001" name="Movies packs" />
  </categories>
</caps>`
}

function feedXml(
  items: FakeRelease[],
  options: { ns: 'torznab' | 'newznab' | null; origin: string },
): string {
  const { ns, origin } = options
  const nsDecl =
    ns === 'torznab'
      ? ' xmlns:torznab="http://torznab.com/schemas/2015/feed"'
      : ns === 'newznab'
        ? ' xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/"'
        : ''
  const a = (name: string, value: string | number) =>
    ns ? `<${ns}:attr name="${name}" value="${value}" />` : ''
  const body = items
    .map((r) => {
      const link =
        ns === 'newznab' ? `${origin}/newznab/get/${r.id}.nzb` : `${origin}/dl/${r.id}.torrent`
      const type = ns === 'newznab' ? 'application/x-nzb' : 'application/x-bittorrent'
      return `    <item>
      <title>${xmlEscape(r.name)}</title>
      <guid isPermaLink="false">fake-${r.id}</guid>
      <link>${link}</link>
      <comments>${origin}/details/${r.id}</comments>
      <pubDate>${rfc2822(FAKE_NOW - r.ageMinutes * 60_000)}</pubDate>
      <size>${r.size}</size>
      ${ns ? '' : `<category>${r.category >= 5000 ? 'TV' : 'Movies'}</category>`}
      <enclosure url="${link}" length="${r.size}" type="${type}" />
      ${a('category', r.category)}
      ${a('category', Math.floor(r.category / 1000) * 1000)}
      ${ns === 'torznab' ? a('seeders', r.seeders) : ''}
      ${ns === 'torznab' ? a('peers', r.seeders + r.leechers) : ''}
      ${ns === 'torznab' ? a('downloadvolumefactor', r.freeleech ? 0 : 1) : ''}
      ${ns === 'torznab' ? a('uploadvolumefactor', 1) : ''}
      ${a('grabs', r.grabs)}
      ${r.imdbId ? a('imdb', r.imdbId.replace(/^tt/, '')) : ''}
      ${r.tmdbId && ns === 'torznab' ? a('tmdbid', r.tmdbId) : ''}
      ${r.tvdbId && ns === 'torznab' ? a('tvdbid', r.tvdbId) : ''}
    </item>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"${nsDecl}>
  <channel>
    <title>Fake indexer</title>
${body}
  </channel>
</rss>`
}

const errorXml = (code: number, description: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<error code="${code}" description="${xmlEscape(description)}" />`

function relative(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} hours ago`
  return `${Math.round(minutes / (60 * 24))} days ago`
}

/** A public site's page of results, with a link to the next page. */
function publicPage(items: FakeRelease[], page: number, q: string): string {
  const rows = items
    .map(
      (r) => `<tr>
  <td class="title"><a class="name" href="/public/torrent/${r.id}/${encodeURIComponent(r.name)}">${xmlEscape(r.name)}</a>
    <a href="magnet:?xt=urn:btih:${r.id.toString(16).padStart(40, '0')}&amp;dn=${encodeURIComponent(r.name)}">Magnet</a></td>
  <td class="size">${(r.size / 1024 ** 3).toFixed(1)}&nbsp;GiB</td>
  <td class="se">${r.seeders}</td><td class="le">${r.leechers}</td>
  <td class="age">${relative(r.ageMinutes)}</td>
</tr>`,
    )
    .join('\n')
  const next =
    page < 2
      ? `<a class="next" href="/public/search?q=${encodeURIComponent(q)}&amp;page=${page + 1}">Next</a>`
      : ''
  return `<!doctype html><html><body>
<table class="list"><thead><tr><th>Name</th><th>Size</th><th>SE</th><th>LE</th><th>Age</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<nav class="pages">${next}</nav>
</body></html>`
}

const HTML_CATEGORY: Record<number, string> = { 2030: '3', 2040: '4', 2045: '5', 5040: '9' }

function htmlPage(items: FakeRelease[], layout: boolean): string {
  const rows = items
    .map(
      (r) => `<tr>
  <td class="cat"><a href="/html/browse?cat=${HTML_CATEGORY[r.category] ?? '0'}">c</a></td>
  <td class="name"><a href="/html/details.php?id=${r.id}">${xmlEscape(r.name)}</a>${r.freeleech ? ' <span class="freeleech">Freeleech</span>' : ''}</td>
  <td class="dl"><a href="/html/download.php?id=${r.id}">DL</a></td>
  <td class="size">${(r.size / 1024 ** 3).toFixed(2)} GB</td>
  <td class="seeders">${r.seeders.toLocaleString('en-US')}</td>
  <td class="leechers">${r.leechers}</td>
  <td class="added">${relative(r.ageMinutes)}</td>
</tr>`,
    )
    .join('\n')
  return `<!doctype html><html><body>
<nav><a class="logout" href="/html/logout">Sign out</a></nav>
<table class="${layout ? 'results-v2' : 'torrents'}">
<tr><th>Cat</th><th>Name</th><th>DL</th><th>Size</th><th>S</th><th>L</th><th>Added</th></tr>
${rows}
</table>
<script>throw new Error('the engine never runs scripts')</script>
</body></html>`
}

/** Bencode (BEP 3), enough for a made-up `.torrent`. */
function bencode(v: unknown): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const walk = (x: unknown) => {
    if (typeof x === 'number') parts.push(enc.encode(`i${Math.trunc(x)}e`))
    else if (typeof x === 'string' || x instanceof Uint8Array) {
      const b = typeof x === 'string' ? enc.encode(x) : x
      parts.push(enc.encode(`${b.length}:`), b)
    } else if (Array.isArray(x)) {
      parts.push(enc.encode('l'))
      for (const i of x) walk(i)
      parts.push(enc.encode('e'))
    } else {
      parts.push(enc.encode('d'))
      for (const k of Object.keys(x as object).sort()) {
        walk(k)
        walk((x as Record<string, unknown>)[k])
      }
      parts.push(enc.encode('e'))
    }
  }
  walk(v)
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** A small, valid `.torrent` named after the release: one 16 KiB piece of zeros. */
export function madeUpTorrent(name: string): Uint8Array {
  // the SHA-1 of 16384 zero bytes
  const zeros = '897256b6709e1a4da9daba92b6bde39ccfccd8c1'
  const pieces = new Uint8Array(zeros.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? [])
  return bencode({
    announce: 'udp://tracker.invalid:6969',
    info: { length: 16384, name: `${name}.mkv`, 'piece length': 16384, pieces },
  })
}

const LOGIN_PAGE = `<!doctype html><html><body><form method="post" action="/html/login">
<input name="username"><input name="password" type="password"></form></body></html>`

export type FakeIndexer = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  handle: (request: Request) => Promise<Response>
  requests: FakeRequest[]
  /** Misbehaves on every path starting with `prefix` (`/torznab`, `/html`…), or all of them. */
  misbehave(m: Misbehaviour | null, prefix?: string): void
  /** The site forgets every sign-in. */
  expireSessions(): void
  /** How many times someone signed in. */
  logins: number
  /** Serves this `.torrent`, or redirects to this magnet, for a release; null goes back to the default. */
  serve(id: number, answer: Uint8Array | string | null): void
  /** Adds a release to this fake only, at the top of its feeds: a new upload, for RSS. */
  publish(release: FakeRelease): void
}

export function createFakeIndexer(options: { origin?: string } = {}): FakeIndexer {
  const origin = options.origin ?? FAKE_ORIGIN
  const requests: FakeRequest[] = []
  const rules = new Map<string, Misbehaviour>()
  let session = 'sid-1'
  let sessionCount = 1
  const served = new Map<number, Uint8Array | string>()
  const published: FakeRelease[] = []

  const torrentFor = (id: number): Response => {
    const release = [...published, ...RELEASES, ...SHOW_RELEASES].find((r) => r.id === id)
    if (!release) return html('Not found', 404)
    const answer = served.get(id) ?? madeUpTorrent(release.name)
    if (typeof answer === 'string')
      return new Response(null, { status: 302, headers: { location: answer } })
    return new Response(new Uint8Array(answer), {
      headers: { 'content-type': 'application/x-bittorrent' },
    })
  }

  const xml = (body: string, status = 200) =>
    new Response(body, {
      status,
      headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
    })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
    new Response(body, {
      status,
      headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
    })

  async function route(
    url: URL,
    request: Request,
    body: string,
    rule: Misbehaviour | undefined,
  ): Promise<Response> {
    const host = url.hostname
    const path = host === 'archive.org' ? `/archive${url.pathname}` : url.pathname
    const p = url.searchParams
    const empty = rule?.kind === 'empty'

    if (path.endsWith('/torznab/api') || path.endsWith('/newznab/api')) {
      const ns = path.endsWith('/torznab/api') ? 'torznab' : 'newznab'
      const key = ns === 'torznab' ? FAKE_CREDENTIALS.torznabKey : FAKE_CREDENTIALS.newznabKey
      if (rule?.kind === 'error-code') return xml(errorXml(rule.code, rule.description))
      if (p.get('apikey') !== key) return xml(errorXml(100, 'Incorrect user credentials'))
      const t = p.get('t')
      if (t === 'caps') return xml(capsXml(ns === 'torznab' ? 'q,imdbid,tmdbid' : 'q,imdbid'))
      if (t !== 'movie' && t !== 'search' && t !== 'tvsearch')
        return xml(errorXml(202, 'No such function'))
      const categories = (p.get('cat') ?? '').split(',').filter(Boolean).map(Number)
      const found = find(
        {
          q: p.get('q'),
          tmdbId: p.get('tmdbid'),
          imdbId: t === 'tvsearch' ? null : p.get('imdbid'),
          categories,
          tv:
            t === 'tvsearch'
              ? { tvdbId: p.get('tvdbid'), season: p.get('season'), ep: p.get('ep') }
              : undefined,
        },
        published,
      )
      return xml(feedXml(empty ? [] : found, { ns, origin }))
    }

    if (path === '/json/api/search') {
      if (p.get('passkey') !== FAKE_CREDENTIALS.jsonPasskey)
        return json({ error: 'Invalid passkey' }, 200)
      const categories = (p.get('cat') ?? '').split(',').filter(Boolean)
      const map: Record<string, number> = { '11': 2040, '12': 2045, '13': 2030, '20': 5040 }
      const standard = categories.map((c) => map[c]).filter((c): c is number => c !== undefined)
      const found = find(
        { q: p.get('q'), imdbId: p.get('imdb'), categories: standard },
        published,
      ).filter((r) => !categories.length || categories.some((c) => map[c] === r.category))
      const rows = (empty ? [] : found).map((r) => ({
        id: r.id,
        name: r.name,
        size: `${(r.size / 1024 ** 3).toFixed(1)} GB`,
        seeders: String(r.seeders),
        leechers: r.leechers,
        cat: Object.entries(map).find(([, s]) => s === r.category)?.[0] ?? '99',
        added: Math.round((FAKE_NOW - r.ageMinutes * 60_000) / 1000),
        imdb: r.imdbId?.replace(/^tt/, '') ?? null,
        freeleech: r.freeleech,
      }))
      return json(
        rule?.kind === 'layout'
          ? { status: 'ok', results: rows }
          : { status: 'ok', data: { torrents: rows } },
      )
    }

    if (path === '/html/login' && request.method === 'POST') {
      const form = new URLSearchParams(body)
      if (
        form.get('username') !== FAKE_CREDENTIALS.username ||
        form.get('password') !== FAKE_CREDENTIALS.password
      )
        return html('<!doctype html><div class="login-error">Wrong username or password.</div>')
      fake.logins++
      return new Response(null, {
        status: 302,
        headers: [
          ['location', '/html/browse'],
          ['set-cookie', `sid=${session}; Path=/; HttpOnly`],
          ['set-cookie', 'theme=dark; Path=/'],
        ],
      })
    }

    if (path === '/html/browse') {
      const cookie = request.headers.get('cookie') ?? ''
      if (!cookie.split(/;\s*/).includes(`sid=${session}`)) return html(LOGIN_PAGE)
      const q = p.get('search')
      return html(htmlPage(empty ? [] : find({ q }, published), rule?.kind === 'layout'))
    }

    if (path === '/public/search') {
      const page = Number(p.get('page') ?? 1)
      const found = empty ? [] : find({ q: p.get('q') }, published)
      // half the results on each of two pages, as a site that pages its results shows them
      const half = Math.ceil(found.length / 2)
      const items = page === 1 ? found.slice(0, half) : found.slice(half)
      return html(publicPage(items, page, p.get('q') ?? ''))
    }

    const feed = /^\/rss\/feed\/(.+)$/.exec(path)
    if (feed) {
      if (feed[1] !== FAKE_CREDENTIALS.rssPasskey) return html('Not found', 404)
      return xml(feedXml(empty ? [] : [...published, ...RELEASES], { ns: null, origin }))
    }

    if (path === '/archive/services/search/v1/scrape') {
      if (rule?.kind === 'ignores-query')
        return new Response(
          readFileSync(join(import.meta.dir, 'sites/archive-query-ignored.json')),
          {
            headers: { 'content-type': 'application/json' },
          },
        )
      const q = p.get('q') ?? ''
      const title = /title:\(([^)]*)\)/.exec(q)?.[1]
      const year = /year:(\d{4})/.exec(q)?.[1]
      const items = [
        {
          identifier: 'Sintel_2010',
          title: 'Sintel',
          year: '2010',
          item_size: 1_400_000_000,
          publicdate: '2010-10-01T00:00:00Z',
          downloads: 120_000,
        },
        {
          identifier: 'tears-of-steel',
          title: 'Tears of Steel',
          year: 2012,
          item_size: 900_000_000,
          publicdate: '2012-09-26T00:00:00Z',
          downloads: 50_000,
        },
        {
          identifier: 'night_of_the_living_dead',
          title: 'Night of the Living Dead',
          publicdate: '2004-03-01T00:00:00Z',
        },
      ].filter(
        (i) =>
          (!title || i.title.toLowerCase().includes(title.toLowerCase())) &&
          (!year || String(i.year) === year),
      )
      return json({ items: empty ? [] : items, count: items.length, total: items.length })
    }

    // an item's torrent, as the Archive names it: {identifier}_archive.torrent
    const archived = /^\/archive\/download\/([^/]+)\/\1_archive\.torrent$/.exec(path)
    if (archived)
      return new Response(new Uint8Array(madeUpTorrent(archived[1] as string)), {
        headers: { 'content-type': 'application/x-bittorrent' },
      })

    const dl = /^\/dl\/(\d+)\.torrent$/.exec(path)
    if (dl) return torrentFor(Number(dl[1]))

    const jsonDl = /^\/json\/download\/(\d+)$/.exec(path)
    if (jsonDl) {
      if (p.get('passkey') !== FAKE_CREDENTIALS.jsonPasskey)
        return json({ error: 'Invalid passkey' })
      return torrentFor(Number(jsonDl[1]))
    }

    if (path === '/html/download.php') {
      const cookie = request.headers.get('cookie') ?? ''
      if (!cookie.split(/;\s*/).includes(`sid=${session}`)) return html(LOGIN_PAGE)
      return torrentFor(Number(p.get('id')))
    }

    return html('Not found', 404)
  }

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const body = request.method === 'POST' ? await request.text() : ''
    requests.push({ method: request.method, url, headers: request.headers, body })
    const path = url.hostname === 'archive.org' ? `/archive${url.pathname}` : url.pathname
    const rule = [...rules.entries()].find(
      ([prefix]) => prefix === '' || path.startsWith(prefix),
    )?.[1]
    if (rule?.kind === 'slow') {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, rule.ms)
        request.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(request.signal.reason)
        })
      })
    }
    if (rule?.kind === 'status')
      return new Response('error', {
        status: rule.status,
        headers: rule.retryAfter ? { 'retry-after': rule.retryAfter } : {},
      })
    if (rule?.kind === 'malformed')
      return xml('<?xml version="1.0"?><rss><channel><item><title>broken')
    return route(url, request, body, rule)
  }

  const fake: FakeIndexer = {
    requests,
    logins: 0,
    handle,
    fetch: (input, init) =>
      handle(
        input instanceof Request ? new Request(input, init) : new Request(String(input), init),
      ),
    misbehave(m, prefix = '') {
      if (m) rules.set(prefix, m)
      else rules.delete(prefix)
    },
    expireSessions() {
      session = `sid-${++sessionCount}`
    },
    publish(release) {
      published.unshift(release)
    },
    serve(id, answer) {
      if (answer === null) served.delete(id)
      else served.set(id, answer)
    },
  }
  return fake
}

/** Serves the fake over HTTP on localhost, for the sweeps. */
export function serveFakeIndexer(port = 0) {
  let fake: FakeIndexer | undefined
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    fetch: (req) => (fake as FakeIndexer).handle(req),
  })
  const origin = `http://localhost:${server.port}`
  fake = createFakeIndexer({ origin })
  return { origin, fake, stop: () => server.stop(true) }
}
