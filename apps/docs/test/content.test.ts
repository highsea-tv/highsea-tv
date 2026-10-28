// SPDX-License-Identifier: AGPL-3.0-only
// The guides, read as files: each has its frontmatter, its licence comment and the version it was
// written for; every link inside the site goes to a page and heading that exist; the sidebar names
// every page; and the copy keeps the brand brief's rule of no exclamation marks. No build, no network.
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dir, '..', 'content')
const publicDir = join(import.meta.dir, '..', 'public')
const pages = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const raw = readFileSync(join(dir, f), 'utf8')
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw)
    const front = Object.fromEntries(
      (match?.[1] ?? '').split('\n').map((l) => {
        const i = l.indexOf(':')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
    )
    return { slug: f.slice(0, -'.mdx'.length), front, body: match?.[2] ?? '' }
  })

/** The body without fenced code, inline code, images and MDX comments: the words a reader sees. */
function prose(body: string) {
  return body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[/g, '[')
    .replace(/`[^`]*`/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

/** GitHub-style heading ids, as Fumadocs makes them: lower case, punctuation dropped, spaces to dashes. */
function anchors(body: string) {
  return new Set(
    [...body.replace(/```[\s\S]*?```/g, '').matchAll(/^#{2,4} (.+)$/gm)].map((m) =>
      (m[1] ?? '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N} -]/gu, '')
        .replace(/ /g, '-'),
    ),
  )
}

describe('the guides', () => {
  test('are all there', () => {
    expect(pages.map((p) => p.slug).sort()).toEqual([
      'activity/history-and-blocklist',
      'activity/index',
      'activity/manual-import',
      'activity/queue',
      'collections/index',
      'collections/make',
      'collections/rules',
      'curation/announcements',
      'curation/featured-sections',
      'curation/index',
      'dashboard/customize',
      'dashboard/index',
      'downloads/add-a-torrent',
      'downloads/index',
      'downloads/torrent-details',
      'index',
      'indexers/add',
      'indexers/health',
      'indexers/index',
      'indexers/search-results',
      'install/docker',
      'install/index',
      'install/prerequisites',
      'install/synology',
      'install/truenas',
      'install/unraid',
      'migrate-from-radarr-and-qbittorrent',
      'movies/discover',
      'movies/film',
      'movies/index',
      'movies/library',
      'movies/manage-a-film',
      'movies/people-and-collections',
      'now-playing',
      'recommended-setup',
      'settings/appearance/index',
      'settings/appearance/themes',
      'settings/backups/index',
      'settings/backups/restore-and-move',
      'settings/downloads/categories-and-watch-folder',
      'settings/downloads/connections',
      'settings/downloads/index',
      'settings/general/diagnostics',
      'settings/general/index',
      'settings/general/metadata',
      'settings/index',
      'settings/lists/adding',
      'settings/lists/index',
      'settings/media-management/importing',
      'settings/media-management/index',
      'settings/media-management/naming',
      'settings/media-management/root-folders',
      'settings/network/index',
      'settings/network/remote-access',
      'settings/network/reverse-proxy-and-tls',
      'settings/notifications/connections',
      'settings/notifications/events',
      'settings/notifications/index',
      'settings/notifications/services',
      'settings/playback',
      'settings/quality/custom-formats',
      'settings/quality/index',
      'settings/quality/profiles',
      'settings/quality/sizes',
      'settings/users-and-security/devices-and-keys',
      'settings/users-and-security/index',
      'settings/users-and-security/people',
      'settings/users-and-security/security',
      'settings/users-and-security/your-account',
      'settings/vpn/connects',
      'settings/vpn/container',
      'settings/vpn/index',
      'settings/vpn/interface',
      'settings/vpn/port-forwarding',
      'settings/vpn/troubleshooting',
      'subtitles/a-films-subtitles',
      'subtitles/index',
      'subtitles/languages',
      'subtitles/providers',
      'subtitles/sync',
      'subtitles/troubleshooting',
      'system/health',
      'system/index',
      'system/logs-and-events',
      'system/tasks',
      'upgrade',
      'wanted/calendar',
      'wanted/finding-releases',
      'wanted/index',
      'watch/index',
      'watch/playing',
    ])
  })

  for (const page of pages) {
    describe(page.slug, () => {
      test('has a title and a description', () => {
        expect(page.front.title?.length).toBeGreaterThan(0)
        expect(page.front.description?.length).toBeGreaterThan(20)
      })

      test('keeps its frontmatter plain YAML', () => {
        // a bare ': ' in an unquoted value is a nested mapping, which the build's YAML parser rejects
        for (const value of Object.values(page.front)) expect(value).not.toContain(': ')
      })

      test('carries the licence comment', () => {
        expect(page.body).toContain('{/* SPDX-License-Identifier: AGPL-3.0-only */}')
      })

      test('names the highsea version it was written for', () => {
        expect(page.body).toMatch(/written (for|against) highsea \d+\.\d+\.\d+/i)
      })

      test('has no exclamation marks', () => {
        expect(prose(page.body)).not.toContain('!')
      })

      test('shows only images that exist, each described', () => {
        for (const m of page.body.matchAll(/!\[([^\]]*)\]\((\/[^)\s]*)\)/g)) {
          expect(m[1]?.length, m[2]).toBeGreaterThan(10)
          // MDX reads a < or { in the text as JSX or an expression, and the build fails
          expect(m[1], m[2]).not.toMatch(/[<{]/)
          expect(existsSync(join(publicDir, m[2] ?? '')), m[2]).toBe(true)
        }
      })

      test('links only to pages and headings that exist', () => {
        const links = [
          ...page.body.matchAll(/(?<!!\[[^\]]*)\]\((\/[^)\s]*)\)/g),
          ...page.body.matchAll(/href="(\/[^"]*)"/g),
        ].map((m) => m[1] ?? '')
        for (const link of links) {
          const [path = '', hash] = link.split('#')
          const slug = path.replace(/^\/|\/$/g, '') || 'index'
          // a folder's address is its index page
          const target = pages.find((p) => p.slug === slug || p.slug === `${slug}/index`)
          expect(target, `${link} in ${page.slug}`).toBeDefined()
          if (hash && target) expect([...anchors(target.body)], link).toContain(hash)
        }
      })

      test('says what each missing screenshot will show', () => {
        for (const m of page.body.matchAll(/<ScreenshotToCome([^>]*)\/>/g))
          expect(m[1]).toMatch(/shows="[^"]{20,}"/)
      })
    })
  }

  test('the sidebar lists every page once', () => {
    // `...folder` puts a folder's pages in the parent's list (https://fumadocs.dev/docs/page-conventions);
    // a plain folder is a group of its own, led by its index page
    const listed = (folder: string): string[] => {
      const meta = JSON.parse(readFileSync(join(dir, folder, 'meta.json'), 'utf8')) as {
        pages: string[]
      }
      return meta.pages
        .filter((p) => !p.startsWith('---'))
        .flatMap((p) => {
          if (p.startsWith('...')) return listed(join(folder, p.slice(3)))
          if (!existsSync(join(dir, folder, p, 'meta.json'))) return [join(folder, p)]
          const index = existsSync(join(dir, folder, p, 'index.mdx'))
            ? [join(folder, p, 'index')]
            : []
          return [...index, ...listed(join(folder, p))]
        })
    }
    expect(listed('').sort()).toEqual(pages.map((p) => p.slug).sort())
  })
})
