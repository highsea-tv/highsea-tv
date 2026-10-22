// SPDX-License-Identifier: AGPL-3.0-only
// The email preview (docs/product/emails.md): the server's templates (@highsea/notifications/mail)
// compile as strict MJML in the browser too, the samples read the same as the server's words, and
// the preview at `?emails` renders cleanly.
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import { compileOptions } from '@highsea/notifications/mail'
import { notificationT, render } from '@highsea/notifications/shared'
import { act, cleanup, render as mount, within } from '@testing-library/react'
import mjml2html from 'mjml-browser'
import { EmailPreview } from '../src/email/preview.tsx'
import { HARBOR_URL, notificationSamples, renderSample, sampleIds } from '../src/email/samples.ts'
import { collect, unknownClasses, violations } from './check.ts'

afterEach(() => cleanup())

const harbor = { server: 'Harbor', externalUrl: HARBOR_URL, logo: 'logo.png' }
/** A server left with highsea's name, and no external URL. */
const plain = { server: 'highsea', externalUrl: null, logo: 'logo.png' }
const brands = [harbor, plain]

describe('templates', () => {
  for (const id of sampleIds)
    for (const brand of brands)
      test(`${id} on ${brand.server} compiles as strict MJML`, async () => {
        const email = renderSample(id, brand)
        const out = await mjml2html(email.mjml, compileOptions)
        expect(out.errors).toEqual([])
        // no web font, so no remote stylesheet
        expect(out.html).not.toContain('<link')
        expect(out.html).toContain('<meta name="color-scheme" content="dark">')
        expect(out.html).toContain('<meta name="supported-color-schemes" content="dark">')
        expect(email.text).toContain(
          brand.server === 'highsea' ? 'Sent by highsea.' : 'Sent by Harbor with highsea.',
        )
        expect(out.html).not.toContain('Sent by highsea with highsea')
      })

  test('the invite and reset carry their link in both parts, and name the server', async () => {
    for (const id of ['invite', 'reset'] as const) {
      const email = renderSample(id, harbor)
      const link = `${HARBOR_URL}/${id}/k3V9qTzW7xYb2LmP`
      expect(email.text).toContain(link)
      expect(email.mjml).toContain(link)
      expect(email.subject).toContain('Harbor')
    }
    const invite = renderSample('invite', plain)
    expect(invite.text).not.toContain('a highsea server')
    expect(invite.subject).toBe('You’re invited to highsea')
  })

  test('Open shows only with an external URL', () => {
    expect(renderSample('imported', harbor).mjml).toContain('Open in Harbor')
    expect(renderSample('imported', plain).mjml).not.toContain('Open in')
  })

  test('each notification reads as @highsea/notifications renders it', () => {
    const t = notificationT()
    for (const [id, s] of Object.entries(notificationSamples)) {
      // biome-ignore lint/suspicious/noExplicitAny: each sample's payload is its event's
      const m = render(s.event as any, s.payload as any, { t, now: 0 })
      expect({ id, level: m.level, title: m.title, body: m.body }).toEqual({
        id,
        level: s.level,
        title: s.title,
        body: s.body,
      })
    }
  })
})

describe('preview', () => {
  test('renders each email cleanly', async () => {
    for (const id of ['invite', 'imported', 'health']) {
      window.location.hash = id
      await act(async () => {
        mount(<EmailPreview />)
      })
      const page = within(document.body)
      expect(page.getByRole('navigation', { name: 'Emails' })).toBeTruthy()
      expect(page.getByRole('radiogroup', { name: 'Client' })).toBeTruthy()
      expect(page.getByTitle(/ email$/)).toBeTruthy()
      collect()
      expect(await violations(document.body, { iframes: false })).toEqual([])
      cleanup()
    }
    expect(await unknownClasses()).toEqual([])
  })
})
