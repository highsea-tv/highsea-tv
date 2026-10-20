// SPDX-License-Identifier: AGPL-3.0-only
// The live client preview (A11): the clients' real home screens (C2) in a frame, fed the draft over
// postMessage. The frame runs its own copy of the server, so nothing reaches the real one until the
// owner saves. It's inert: a picture of the client, not a second app to tab into.
import { Icon, SegmentedControl, Select, useWidth } from '@highsea/ui-web'
import { useEffect, useRef, useState } from 'react'
import type { Audience, ClientType, CurationPreview, User } from '../../mock/types.ts'
import { isMessage, post } from '../../proto/bridge.ts'
import { useProto } from '../../screen/screen.tsx'
import { reaches, useUsers } from './shared.tsx'

type PreviewPlatform = 'tv' | 'web' | 'mobile'

const screens: Record<
  PreviewPlatform,
  { w: number; h: number; label: string; place: string; client: ClientType }
> = {
  tv: { w: 1600, h: 900, label: 'TV', place: 'a TV', client: 'tvos' },
  web: { w: 1280, h: 800, label: 'Web', place: 'the web', client: 'web' },
  mobile: { w: 390, h: 844, label: 'Mobile', place: 'a phone', client: 'ios' },
}

/** People to preview as: the owner, and a user (mock/client.ts). */
const viewers = [
  { value: 'owner', label: 'Ines (owner)', userId: 'u-ines' },
  { value: 'user', label: 'Ruth (user)', userId: 'u-ruth' },
]

export function ClientPreview({
  preview,
  draftId,
  audience,
  what,
  note,
  reveal,
}: {
  preview: CurationPreview
  draftId: string
  audience: Audience
  /** "this announcement", "this section": for the not-in-audience note. */
  what: string
  /** What the preview leaves out. */
  note: string
  /** A featured section to scroll to. */
  reveal?: string
}) {
  const proto = useProto()
  const users = useUsers()
  const [platform, setPlatform] = useState<PreviewPlatform>('tv')
  const [viewer, setViewer] = useState('owner')
  const frame = useRef<HTMLIFrameElement>(null)
  const { ref, width } = useWidth<HTMLDivElement>(560)
  // the web and TV fill the container: wider than their base size, the window itself grows
  // (TV keeps 16:9, the web 16:10); the phone stays a phone and only scales down
  const base = screens[platform]
  const grow = platform !== 'mobile' && width > base.w
  const screen = grow ? { ...base, w: width, h: Math.round((width * base.h) / base.w) } : base
  const scale = Math.min(1, width / (screen.w + (platform === 'mobile' ? 24 : 0)))
  const send = useRef(() => {})
  send.current = () =>
    post(frame.current?.contentWindow, { hs: 'preview', preview, draftId, reveal })

  // the frame says it's ready once it loads; every draft change after that goes straight over
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && isMessage(e.data) && e.data.hs === 'ready')
        send.current()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: resend whenever the draft changes
  useEffect(() => {
    const t = setTimeout(() => send.current(), 120)
    return () => clearTimeout(t)
  }, [preview, draftId])

  const who: User | undefined = users.data?.find(
    (u) => u.id === viewers.find((v) => v.value === viewer)?.userId,
  )
  const seen = reaches(audience, who, screen.client)
  const params = new URLSearchParams({
    data: 'populated',
    role: viewer,
    theme: proto.theme,
    time: 'pause',
    sound: 'off',
    ...(proto.reducedMotion ? { motion: 'reduced' } : {}),
  })
  const src = `./index.html?screen&preview&${params}#/${platform}`

  const name = who?.displayName ?? 'Ines'
  const iframe = (
    <iframe
      key={`${platform}:${viewer}:${proto.theme}`}
      ref={frame}
      title={`${screen.label} home, previewed as ${name}`}
      src={src}
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
    <section aria-label="Client preview" className="grid content-start gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="me-auto font-medium text-text text-ui">Preview</h2>
        <SegmentedControl
          aria-label="Preview on"
          size="sm"
          value={platform}
          onValueChange={(v) => setPlatform(v as PreviewPlatform)}
          options={(Object.keys(screens) as PreviewPlatform[]).map((p) => ({
            value: p,
            label: screens[p].label,
          }))}
        />
        <Select
          aria-label="Preview as"
          value={viewer}
          onValueChange={setViewer}
          options={viewers}
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
      <p className="flex items-start gap-1.5 text-caption text-text-3">
        <Icon name={seen ? 'info' : 'warning'} size={14} className="mt-px shrink-0" />
        {seen
          ? `What ${name} sees on ${screen.place}, with ${what} as it stands. ${note} Nothing changes for anyone until you save.`
          : `${name} isn’t in the audience on ${screen.place}, so ${what} doesn’t show there.`}
      </p>
    </section>
  )
}
