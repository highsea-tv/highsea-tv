// SPDX-License-Identifier: AGPL-3.0-only
// The email templates compiled as the server compiles them (`mjml`, strict): every event's
// notification and both of the server's emails, with and without a poster, an external URL and a
// name of the server's own; the details each event's payload gives.
import { describe, expect, test } from 'bun:test'
import { compileEmail } from '../../src/mail/compile.ts'
import {
  type Brand,
  emailDetails,
  renderLinkEmail,
  renderNotificationEmail,
} from '../../src/mail/index.ts'
import {
  type EventPayloads,
  type MessageEvent,
  notificationT,
  render,
} from '../../src/shared/index.ts'

const SINTEL = { title: 'Sintel', year: 2010, tmdbId: 45745 }

const PAYLOADS: { [E in MessageEvent]: EventPayloads[E] } = {
  grabbed: {
    movie: SINTEL,
    release: 'Sintel.2010.1080p.BluRay.x264-GRP',
    indexer: 'Nyaa',
    size: 3_100_000_000,
  },
  imported: { movie: SINTEL, quality: 'Bluray-1080p', size: 1_200_000_000, upgradedFrom: null },
  upgraded: {
    movie: SINTEL,
    quality: 'Bluray-2160p',
    size: 14_800_000_000,
    upgradedFrom: 'WEB 1080p',
  },
  'download-failed': {
    movie: SINTEL,
    release: 'Sintel.2010.1080p.BluRay.x264-GRP',
    reason: 'it stalled for 6 hours with no peers.',
    replaced: true,
  },
  'subtitle-added': { movie: SINTEL, language: 'French', synced: true },
  health: { level: 'warning', source: 'Disk space', message: '18 GB free.', cleared: false },
  update: { version: '0.2.0' },
  'movie-added': { count: 1, source: 'Blender Open Movies', movies: [SINTEL], by: 'list' },
  'playback-started': {
    movie: SINTEL,
    person: 'Sam',
    device: 'Living room TV',
    method: 'transcode',
    sent: '1080p · H.264 · AAC stereo',
    away: true,
  },
  test: {},
}

const harbor: Brand = {
  server: 'Harbor',
  externalUrl: 'https://harbor.example.net',
  logo: 'cid:logo@highsea',
  timeZone: 'Europe/London',
}
const plain: Brand = { server: 'highsea', externalUrl: null, logo: 'cid:logo@highsea' }

const t = notificationT()

describe('every template compiles as strict MJML', () => {
  for (const event of Object.keys(PAYLOADS) as MessageEvent[])
    for (const brand of [harbor, plain])
      test(`${event} on ${brand.server}`, async () => {
        const m = render(event, PAYLOADS[event], { t, now: 0 })
        const email = renderNotificationEmail(brand, {
          event,
          level: m.level,
          title: m.title,
          body: m.body,
          connection: event === 'test' ? null : 'Mail',
          url: brand.externalUrl ? `${brand.externalUrl}/movies/45745` : null,
          image: brand.externalUrl ? 'cid:poster@highsea' : null,
          details: emailDetails(event, PAYLOADS[event]),
        })
        const html = await compileEmail(email)
        expect(html).toContain('<meta name="color-scheme" content="dark">')
        // no web font, so nothing remote
        expect(html).not.toContain('<link')
        expect(html).not.toMatch(/src="https?:/)
        expect(email.text).toContain(
          brand === plain ? 'Sent by highsea.' : 'Sent by Harbor with highsea.',
        )
        expect(html).not.toContain('Sent by highsea with highsea')
      })

  for (const kind of ['invite', 'reset'] as const)
    test(kind, async () => {
      const email = renderLinkEmail(plain, {
        kind,
        name: 'Mara',
        inviter: 'Ines',
        link: `http://192.168.1.20:3000/${kind}/k3V9qTzW7xYb2LmP`,
        expiresAt: Date.UTC(2026, 9, 28, 18, 30),
      })
      const html = await compileEmail(email)
      expect(html).toContain('src="cid:logo@highsea"')
      expect(email.text).toContain('Sent by highsea.')
    })

  test('a template mistake throws rather than sending', async () => {
    const email = renderLinkEmail(plain, {
      kind: 'reset',
      name: 'Theo',
      link: 'http://192.168.1.20:3000/reset/k3V9',
      expiresAt: 0,
    })
    await expect(
      compileEmail({ ...email, mjml: email.mjml.replace('<mj-divider', '<mj-divder') }),
    ).rejects.toThrow()
  })
})

describe('details', () => {
  test('come from what each payload carries', () => {
    expect(emailDetails('grabbed', PAYLOADS.grabbed)).toEqual([
      { label: 'release', value: 'Sintel.2010.1080p.BluRay.x264-GRP' },
      { label: 'indexer', value: 'Nyaa' },
      { label: 'size', value: '3.1 GB' },
    ])
    expect(emailDetails('imported', PAYLOADS.imported)).toEqual([
      { label: 'quality', value: 'Bluray-1080p' },
      { label: 'size', value: '1.2 GB' },
    ])
    expect(
      emailDetails('imported', { ...PAYLOADS.imported, upgradedFrom: 'WEB 1080p' }),
    ).toContainEqual({ label: 'replaced', value: 'WEB 1080p' })
    expect(emailDetails('upgraded', PAYLOADS.upgraded)).toEqual([
      { label: 'quality', value: 'Bluray-2160p' },
      { label: 'size', value: '14.8 GB' },
      { label: 'replaced', value: 'WEB 1080p' },
    ])
    // the rest keep their sentence
    for (const event of ['download-failed', 'subtitle-added', 'health', 'update', 'test'] as const)
      expect(emailDetails(event, PAYLOADS[event])).toEqual([])
  })
})
