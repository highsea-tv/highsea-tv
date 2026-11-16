// SPDX-License-Identifier: AGPL-3.0-only
// The curation preview's home (curation-frame.tsx) shows a draft announcement where each kind of
// app shows it: the web and the TV list it in Alerts, with the bell's dot while it's new, and draw
// no banner or pill (the owner's 2026-10-30 call, kept on 2026-11-15); a phone draws its card.
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import type { ClientAnnouncement, CurationPreview } from '@highsea-tv/api-contract'

const { cleanup, render } = await import('@testing-library/react')
const { ThemeProvider } = await import('@highsea-tv/ui/native')
const { PreviewHome } = await import('../src/curation-frame.tsx')

afterEach(cleanup)

const draft = (over: Partial<ClientAnnouncement> = {}): ClientAnnouncement => ({
  id: 'draft',
  title: 'Movie night',
  body: 'Friday at **8**.',
  image: null,
  cta: null,
  severity: 'notice',
  placements: ['banner', 'card'],
  audience: { kind: 'everyone' },
  schedule: { start: '2026-11-15T00:00:00.000Z', end: null },
  acknowledgement: 'dismiss',
  seen: false,
  ...over,
})

const preview = (announcements: ClientAnnouncement[]): CurationPreview => ({
  sections: [],
  announcements,
  reaches: true,
})

const draw = (platform: 'web' | 'tv' | 'mobile', announcements = [draft()]) =>
  render(
    <ThemeProvider>
      <PreviewHome hs="curation-preview" platform={platform} preview={preview(announcements)} />
    </ThemeProvider>,
  )

describe('the preview’s announcements', () => {
  for (const platform of ['web', 'tv'] as const)
    test(`${platform}: Alerts' bell with its dot, and no banner or pill`, () => {
      const r = draw(platform)
      expect(r.getByRole('button', { name: 'Alerts, 1 new' })).toBeTruthy()
      // the title shows nowhere on the page: no banner, no pill
      expect(r.queryByText('Movie night')).toBeNull()
    })

  test('web: a seen one leaves the bell without its dot', () => {
    const r = draw('web', [draft({ seen: true })])
    expect(r.getByRole('button', { name: 'Alerts' })).toBeTruthy()
  })

  test('mobile: the card under the header, and no bell', () => {
    const r = draw('mobile')
    expect(r.getByText('Movie night')).toBeTruthy()
    expect(r.queryByRole('button', { name: /^Alerts/ })).toBeNull()
  })
})
