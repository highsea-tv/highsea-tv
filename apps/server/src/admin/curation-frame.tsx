'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The inside of the client preview's frame (A11; checkpoint 8c). The prototype frames the clients'
// real home screens (C2); the apps come in Phase 4, so the server draws a plain home of its own
// from what `POST /curation/preview` returned: the hero, Continue watching, the rows and
// spotlights, and the draft announcement where that kind of app shows it. A frame of its own
// gives it the app's width, so the design system's breakpoints apply as on the device. The admin
// sends the preview over postMessage, from its own origin only
// (https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#security_concerns); the
// frame fetches nothing.
import type { ClientAnnouncement, CurationPreview, HomeSection } from '@highsea-tv/api-contract'
import {
  BackdropHero,
  Banner,
  type BannerTone,
  Button,
  CarouselRow,
  Lockup,
  Poster,
} from '@highsea-tv/ui-web'
import { useEffect, useState } from 'react'
import { useCurationT } from './curation-shared.tsx'
import { Cta, Inline } from './inline.tsx'

export type PreviewPlatform = 'tv' | 'web' | 'mobile'

/** What the admin posts to the frame. */
export type FrameMessage = {
  hs: 'curation-preview'
  preview: CurationPreview
  platform: PreviewPlatform
  /** A featured section to scroll to. */
  reveal?: string
}

export const FRAME_READY = 'curation-frame-ready'

const tone = (a: ClientAnnouncement): BannerTone =>
  a.severity === 'critical' ? 'danger' : a.severity === 'warning' ? 'warning' : 'announcement'

export const sectionAnchor = (id: string) => `home-${id.replace(/[^\w-]/g, '-')}`

export function PreviewFrame() {
  const [state, setState] = useState<FrameMessage | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return
      const data = e.data as Partial<FrameMessage> | null
      if (data?.hs === 'curation-preview' && data.preview) setState(data as FrameMessage)
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ hs: FRAME_READY }, window.location.origin)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    if (state?.reveal)
      document.getElementById(sectionAnchor(state.reveal))?.scrollIntoView({ block: 'center' })
  }, [state])

  if (!state) return null
  return <Home {...state} />
}

function Home({ preview, platform }: FrameMessage) {
  const t = useCurationT()
  const shows = (a: ClientAnnouncement, p: ClientAnnouncement['placements'][number]) =>
    !a.seen && a.placements.includes(p)
  const announcements = preview.announcements
  const top =
    platform === 'web'
      ? announcements.filter((a) => shows(a, 'banner'))
      : platform === 'mobile'
        ? announcements.filter((a) => shows(a, 'card'))
        : []
  const pill = platform === 'tv' ? announcements.find((a) => !a.seen) : undefined
  const modal = announcements.find((a) => shows(a, 'modal'))
  const toastOne = platform === 'web' ? announcements.find((a) => shows(a, 'toast')) : undefined

  return (
    <div className="relative min-h-svh bg-bg pb-10 text-text">
      <header className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4 py-4 medium:px-8 wide:px-16">
        <Lockup size={platform === 'tv' ? 22 : 17} />
        {pill && (
          <span className="ms-auto flex min-w-0 items-center gap-2 rounded-full bg-s2/80 px-3 py-1.5 text-caption text-text">
            <span className="truncate font-semibold">{pill.title}</span>
          </span>
        )}
      </header>
      {top.length > 0 && (
        <div className="relative z-10 grid gap-2 px-4 pt-16 medium:px-8 wide:px-16">
          {top.map((a) => (
            <Banner
              key={a.id}
              title={a.title}
              tone={tone(a)}
              variant={platform === 'mobile' ? 'card' : 'bar'}
              onDismiss={a.acknowledgement === 'dismiss' ? () => {} : undefined}
              onAcknowledge={a.acknowledgement === 'require' ? () => {} : undefined}
              acknowledgeLabel={t('gotIt')}
              action={a.cta ? <Cta cta={a.cta} /> : undefined}
            >
              <Inline text={a.body} />
            </Banner>
          ))}
        </div>
      )}
      {preview.sections.length === 0 ? (
        <p className="px-4 pt-24 text-text-3 text-ui medium:px-8">{t('preview.empty')}</p>
      ) : (
        <div className="grid gap-8">
          {preview.sections.map((s, i) => (
            <Section key={s.id} section={s} platform={platform} first={i === 0} />
          ))}
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-bg/70 p-6">
          <div className="grid w-full max-w-md gap-3 rounded-lg border border-line bg-s1 p-6">
            {modal.image && (
              // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
              <img
                src={modal.image}
                alt=""
                className="aspect-still w-full rounded-md object-cover"
              />
            )}
            <p className="font-semibold text-text text-title">{modal.title}</p>
            <p className="text-body text-text-2">
              <Inline text={modal.body} />
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Cta cta={modal.cta} />
              <Button variant="primary">{t('gotIt')}</Button>
            </div>
          </div>
        </div>
      )}
      {toastOne && (
        <div className="fixed end-6 bottom-6 z-20 w-80 rounded-md border border-line bg-s2 p-4 shadow-lg">
          <p className="font-semibold text-text text-ui">{toastOne.title}</p>
          <p className="mt-1 line-clamp-2 text-caption text-text-2">
            <Inline text={toastOne.body} />
          </p>
        </div>
      )}
    </div>
  )
}

function Section({
  section: s,
  platform,
  first,
}: {
  section: HomeSection
  platform: PreviewPlatform
  first: boolean
}) {
  const t = useCurationT()
  const title =
    s.title ?? (s.id === 'continue' ? t('row.continue') : s.id === 'recent' ? t('row.recent') : '')
  const id = sectionAnchor(s.id)
  if (s.layout === 'hero' && s.items[0]) {
    const m = s.items[0]
    return (
      <div id={id}>
        <BackdropHero
          item={{
            id: String(m.id),
            title: m.title,
            backdrop: m.art.backdrop ?? undefined,
            eyebrow: s.title ?? undefined,
            meta: m.year ? <span>{m.year}</span> : undefined,
            synopsis: m.tagline ?? m.synopsis,
          }}
          actions={
            <Button variant="primary" icon="play">
              {t('play')}
            </Button>
          }
        />
      </div>
    )
  }
  const spotlight = s.layout === 'spotlight' && platform !== 'mobile'
  return (
    <div id={id} className={first ? 'pt-20' : undefined}>
      <CarouselRow
        title={title}
        suffix={s.suffix ?? undefined}
        roving={false}
        itemClassName={spotlight ? 'w-[clamp(14rem,24vw,20rem)]' : undefined}
      >
        {s.items.map((m) =>
          spotlight ? (
            <div key={m.id} className="grid gap-2">
              <Poster title={m.title} src={m.art.backdrop ?? undefined} aspect="still" />
              <p className="font-semibold text-text text-ui">{m.title}</p>
              <p className="line-clamp-2 text-caption text-text-2">{m.tagline ?? m.synopsis}</p>
            </div>
          ) : (
            <Poster
              key={m.id}
              title={m.title}
              src={m.art.poster ?? undefined}
              showTitle
              progress={m.progress === null ? undefined : m.progress * 100}
            />
          ),
        )}
      </CarouselRow>
    </div>
  )
}
