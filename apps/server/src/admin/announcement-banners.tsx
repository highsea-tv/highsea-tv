'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The admin's own announcements (admin.md, curation.md; checkpoint 8c), as the prototype's shell
// shows them: a banner above the page for each live one the person hasn't dismissed. One that
// must be acknowledged has Got it in place of dismiss. Each is for this person on the admin
// (`GET /announcements?client=admin`), and the stream says when that changes.
import type { ClientAnnouncement } from '@highsea/api-contract'
import { CURATION_TOPICS } from '@highsea/api-contract'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Banner, type BannerTone, toast } from '@highsea/ui-web'
import { useCurationT } from './curation-shared.tsx'
import { Cta, Inline } from './inline.tsx'

const tone = (a: ClientAnnouncement): BannerTone =>
  a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'announcement'

export const useAdminAnnouncements = () =>
  useQuery('announcements', (c) => c.announcements.active({ query: { client: 'admin' } }), [
    CURATION_TOPICS.announcements,
  ])

export function AnnouncementBanners() {
  const t = useCurationT()
  const active = useAdminAnnouncements()
  const seen = useAction((c, id: string) => c.announcements.seen({ params: { id } }))
  const banners = (active.data ?? []).filter((a) => !a.seen && a.placements.includes('banner'))
  if (!banners.length) return null
  return (
    <div className="grid gap-2">
      {banners.map((a) => {
        const done = () =>
          seen.run(a.id).catch((e: Error) => toast.error(t('failed'), { description: e.message }))
        return (
          <Banner
            key={a.id}
            title={a.title}
            tone={tone(a)}
            onDismiss={a.acknowledgement === 'dismiss' ? done : undefined}
            onAcknowledge={a.acknowledgement === 'require' ? done : undefined}
            acknowledgeLabel={t('gotIt')}
            action={a.cta ? <Cta cta={a.cta} /> : undefined}
          >
            <Inline text={a.body} />
          </Banner>
        )
      })}
    </div>
  )
}
