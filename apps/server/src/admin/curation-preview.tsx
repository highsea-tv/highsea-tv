'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The live client preview (A11; checkpoint 8c), ported from the prototype's curation/preview.tsx.
// The server resolves the draft as one person would get it on one kind of app
// (`POST /curation/preview`, which saves nothing), and a frame draws that home screen at the app's
// own size, scaled to fit (curation-frame.tsx). The frame is inert: a picture of the client, not a
// second app to tab into. "Preview as" offers everyone on the server, not the prototype's two
// sample people.
import type { ClientType, CurationPreviewInput } from '@highsea-tv/api-contract'
import { useQuery } from '@highsea-tv/sdk/react'
import { Icon, SegmentedControl, Select, useWidth } from '@highsea-tv/ui-web'
import { useEffect, useRef, useState } from 'react'
import { FRAME_READY, type FrameMessage, type PreviewPlatform } from './curation-frame.tsx'
import { useCurationT, useKept, usePeople, useSettled } from './curation-shared.tsx'

const screens: Record<PreviewPlatform, { w: number; h: number; client: ClientType }> = {
  tv: { w: 1600, h: 900, client: 'tvos' },
  web: { w: 1280, h: 800, client: 'web' },
  mobile: { w: 390, h: 844, client: 'ios' },
}

/** The frame's address: a page of its own, outside the admin's shell. */
export const FRAME_PATH = '/curation-frame'

export function ClientPreview({
  draft,
  what,
  note,
  reveal,
}: {
  /** The draft, as the preview takes it. */
  draft: CurationPreviewInput['draft']
  /** "this announcement", "this section": for the not-in-audience note. */
  what: string
  /** What the preview leaves out. */
  note: string
  /** A featured section to scroll to. */
  reveal?: string
}) {
  const t = useCurationT()
  const session = useQuery('session', (c) => c.auth.session(), ['users.updated'])
  const people = usePeople()
  const [platform, setPlatform] = useState<PreviewPlatform>('tv')
  const [chosen, setChosen] = useState<string | null>(null)
  const me = session.data?.user
  const viewer = chosen ?? me?.id ?? null
  const frame = useRef<HTMLIFrameElement>(null)
  const { ref, width } = useWidth<HTMLDivElement>(560)

  // the web and TV fill the container: wider than their base size, the window itself grows
  // (TV keeps 16:9, the web 16:10); the phone stays a phone and only scales down
  const base = screens[platform]
  const grow = platform !== 'mobile' && width > base.w
  const screen = grow ? { ...base, w: width, h: Math.round((width * base.h) / base.w) } : base
  const scale = Math.min(1, width / (screen.w + (platform === 'mobile' ? 24 : 0)))

  const settled = useSettled(draft)
  const input = viewer ? { client: base.client, userId: viewer, draft: settled } : null
  const preview = useKept(
    useQuery(`curation:preview:${JSON.stringify(input)}`, (c) =>
      input ? c.curation.preview({ body: input }) : Promise.resolve(null),
    ),
  )

  const send = useRef(() => {})
  send.current = () => {
    if (preview.status !== 'success' || !preview.data) return
    const message: FrameMessage = {
      hs: 'curation-preview',
      preview: preview.data,
      platform,
      reveal,
    }
    frame.current?.contentWindow?.postMessage(message, window.location.origin)
  }
  // the frame says it's ready once it loads; every new preview after that goes straight over
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        e.origin === window.location.origin &&
        e.source === frame.current?.contentWindow &&
        (e.data as { hs?: string } | null)?.hs === FRAME_READY
      )
        send.current()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: resend whenever the preview changes
  useEffect(() => send.current(), [preview.data, platform, reveal])

  const accepted = (people.data ?? []).filter((u) => !u.invited)
  const who = accepted.find((u) => u.id === viewer)
  const name = who?.displayName ?? me?.displayName ?? ''
  const reaches = preview.data?.reaches ?? true
  const label = t(`platform.${platform}`)
  const place = t(`place.${platform}`)

  const iframe = (
    <iframe
      key={platform}
      ref={frame}
      title={t('previewTitle', { platform: label, name })}
      src={FRAME_PATH}
      inert
      tabIndex={-1}
      style={{
        width: screen.w,
        height: screen.h,
        // the phone's bezel scales as a whole, frame included
        transform: platform === 'mobile' ? undefined : `scale(${scale})`,
      }}
      className="block origin-top-left border-0 bg-bg"
    />
  )

  return (
    <section
      aria-label={t('clientPreview')}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto font-medium text-text text-ui">{t('preview')}</h2>
        <SegmentedControl
          aria-label={t('previewOn')}
          size="sm"
          value={platform}
          onValueChange={(v) => setPlatform(v as PreviewPlatform)}
          options={(Object.keys(screens) as PreviewPlatform[]).map((p) => ({
            value: p,
            label: t(`platform.${p}`),
          }))}
        />
        <Select
          aria-label={t('previewAs')}
          value={viewer ?? ''}
          onValueChange={setChosen}
          options={accepted.map((u) => ({
            value: u.id,
            label: u.id === me?.id ? t('you', { name: u.displayName }) : u.displayName,
          }))}
          className="w-40"
        />
      </div>
      <div ref={ref} className="min-w-0">
        {platform === 'mobile' ? (
          <div
            style={{ width: (screen.w + 24) * scale, height: (screen.h + 24) * scale }}
            className="mx-auto"
          >
            <div
              style={{ width: screen.w + 24, height: screen.h + 24, transform: `scale(${scale})` }}
              className="origin-top-left rounded-[56px] bg-s3 p-3 ring-1 ring-line-strong"
            >
              <div className="size-full overflow-hidden rounded-[44px]">{iframe}</div>
            </div>
          </div>
        ) : (
          <div
            style={{ height: screen.h * scale }}
            className="overflow-hidden rounded-md ring-1 ring-line"
          >
            {iframe}
          </div>
        )}
      </div>
      <p aria-live="polite" className="flex items-start gap-1.5 text-caption text-text-3">
        <Icon name={reaches ? 'info' : 'warning'} size={14} className="mt-px shrink-0" />
        {preview.status === 'loading'
          ? t('preview.loading')
          : preview.status === 'error'
            ? preview.error.message
            : reaches
              ? t('preview.seen', { name, place, what, note })
              : t('preview.unseen', { name, place, what })}
      </p>
    </section>
  )
}
