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
import {
  Icon,
  PageFrame,
  type PageFrameHandle,
  SegmentedControl,
  Select,
  Text,
  tokens,
  useTheme,
} from '@highsea-tv/ui/native'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { FRAME_READY, type FrameMessage, type PreviewPlatform } from './curation-frame.tsx'
import { useCurationT, useKept, usePeople, useSettled } from './curation-shared.tsx'
import { useHref } from './navigation.tsx'

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
  const href = useHref()
  const session = useQuery('session', (c) => c.auth.session(), ['users.updated'])
  const people = usePeople()
  const [platform, setPlatform] = useState<PreviewPlatform>('tv')
  const [chosen, setChosen] = useState<string | null>(null)
  const me = session.data?.user
  const viewer = chosen ?? me?.id ?? null
  const theme = useTheme()
  const frame = useRef<PageFrameHandle | null>(null)
  // the column's width, measured as it's laid out; 560 until then, as the web's useWidth started
  const [width, setWidth] = useState(560)

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
    <PageFrame
      key={platform}
      ref={frame}
      title={t('previewTitle', { platform: label, name })}
      src={href(FRAME_PATH)}
      width={screen.w}
      height={screen.h}
      // the phone's bezel scales as a whole, frame included
      scale={platform === 'mobile' ? 1 : scale}
    />
  )
  const bezel = 12

  return (
    <View
      role="region"
      aria-label={t('clientPreview')}
      style={{ minWidth: 0, gap: tokens.space['3'] }}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: tokens.space['2'],
        }}
      >
        <Text
          role="heading"
          aria-level={2}
          size={tokens.adminText.ui.size}
          leading={tokens.adminText.ui.leading}
          weight={500}
          style={{ marginEnd: 'auto' }}
        >
          {t('preview')}
        </Text>
        <SegmentedControl
          aria-label={t('previewOn')}
          value={platform}
          onValueChange={(v) => setPlatform(v as PreviewPlatform)}
          options={(Object.keys(screens) as PreviewPlatform[]).map((p) => ({
            value: p,
            label: t(`platform.${p}`),
          }))}
        />
        <View style={{ width: 160 }}>
          <Select
            aria-label={t('previewAs')}
            value={viewer ?? ''}
            onValueChange={setChosen}
            options={accepted.map((u) => ({
              value: u.id,
              label: u.id === me?.id ? t('you', { name: u.displayName }) : u.displayName,
            }))}
          />
        </View>
      </View>
      <View
        style={{ minWidth: 0 }}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {platform === 'mobile' ? (
          <View
            style={{
              width: (screen.w + bezel * 2) * scale,
              height: (screen.h + bezel * 2) * scale,
              alignSelf: 'center',
            }}
          >
            <View
              style={{
                width: screen.w + bezel * 2,
                height: screen.h + bezel * 2,
                padding: bezel,
                borderRadius: 56,
                backgroundColor: theme.colors.s3,
                boxShadow: `0 0 0 1px ${theme.colors['line-strong']}`,
                transformOrigin: 'top left',
                transform: [{ scale }],
              }}
            >
              <View style={{ flex: 1, overflow: 'hidden', borderRadius: 44 }}>{iframe}</View>
            </View>
          </View>
        ) : (
          <View
            style={{
              height: screen.h * scale,
              overflow: 'hidden',
              borderRadius: tokens.radius.md,
              boxShadow: `0 0 0 1px ${theme.colors.line}`,
            }}
          >
            {iframe}
          </View>
        )}
      </View>
      <View
        aria-live="polite"
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space['1'] + 2 }}
      >
        <View style={{ marginTop: 1 }}>
          <Icon name={reaches ? 'info' : 'warning'} size={14} color="text-3" />
        </View>
        <Text variant="caption" color="text-3" style={{ flex: 1, minWidth: 0 }}>
          {preview.status === 'loading'
            ? t('preview.loading')
            : preview.status === 'error'
              ? preview.error.message
              : reaches
                ? t('preview.seen', { name, place, what, note })
                : t('preview.unseen', { name, place, what })}
        </Text>
      </View>
    </View>
  )
}
