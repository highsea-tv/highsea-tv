'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The inside of the client preview's frame (A11; checkpoint 8c). The prototype frames the clients'
// real home screens (C2); the apps come in Phase 4, so the server draws a plain home of its own
// from what `POST /curation/preview` returned: the hero, Continue watching, the rows and
// spotlights, and the draft announcement where that kind of app shows it. A frame of its own
// gives it the app's width, so the design system's breakpoints apply as on the device. The admin
// draws it with the clients' own parts (FeaturedCard, Row, Poster, Banner) on the native
// renderer. The admin sends the preview over postMessage, from its own origin only
// (https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage#security_concerns); the
// frame fetches nothing.
import type { ClientAnnouncement, CurationPreview, HomeSection } from '@highsea-tv/api-contract'
import { admin, line, lockup } from '@highsea-tv/tokens'
import {
  Banner,
  type BannerTone,
  Button,
  FeaturedCard,
  Image,
  Lockup,
  Poster,
  pointerItemWidth,
  Row,
  Text,
  tokens,
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { useEffect, useState } from 'react'
import { useWindowDimensions, View, type ViewStyle } from 'react-native'
import { useCurationT } from './curation-shared.tsx'
import { Cta, Inline } from './inline.tsx'

const sp = tokens.space

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

/** Fixed to the frame's window (react-native-web passes `fixed` on; React Native's types don't name it). */
const FIXED = 'fixed' as ViewStyle['position']

const noop = () => {}

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

/** The page's gutter: 16 in a compact window, 64 in a regular one (the web's px-4 and px-16). */
function useGutter() {
  const regular = useRegularWindow()
  return regular ? sp['16'] : sp['4']
}

function Home({ preview, platform }: FrameMessage) {
  const t = useCurationT()
  const theme = useTheme()
  const gutter = useGutter()
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
  const ui = tokens.adminText.ui

  return (
    <View
      style={{
        minHeight: '100vh' as never,
        backgroundColor: theme.colors.bg,
        paddingBottom: sp['10'],
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          start: 0,
          end: 0,
          zIndex: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: sp['3'],
          paddingHorizontal: gutter,
          paddingVertical: sp['4'],
        }}
      >
        <Lockup size={platform === 'tv' ? lockup.tv : lockup.size} />
        {pill && (
          <View
            style={{
              marginStart: 'auto',
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: sp['3'],
              paddingVertical: sp['1'] + sp['0.5'],
              borderRadius: tokens.radius.pill,
              backgroundColor: `color-mix(in srgb, ${theme.colors.s2} 80%, transparent)`,
            }}
          >
            <Text variant="caption" weight={600} numberOfLines={1}>
              {pill.title}
            </Text>
          </View>
        )}
      </View>
      {top.length > 0 && (
        <View style={{ zIndex: 10, gap: sp['2'], paddingHorizontal: gutter, paddingTop: sp['16'] }}>
          {top.map((a) => (
            <Banner
              key={a.id}
              title={a.title}
              tone={tone(a)}
              variant={platform === 'mobile' ? 'card' : 'bar'}
              onDismiss={a.acknowledgement === 'dismiss' ? noop : undefined}
              onAcknowledge={a.acknowledgement === 'require' ? noop : undefined}
              acknowledgeLabel={t('gotIt')}
              action={a.cta ? <Cta cta={a.cta} /> : undefined}
            >
              <Inline text={a.body} size={ui.size} />
            </Banner>
          ))}
        </View>
      )}
      {preview.sections.length === 0 ? (
        <View style={{ paddingHorizontal: gutter, paddingTop: sp['16'] + sp['8'] }}>
          <Text size={ui.size} leading={ui.leading} color="text-3">
            {t('preview.empty')}
          </Text>
        </View>
      ) : (
        <View style={{ gap: sp['8'] }}>
          {preview.sections.map((s, i) => (
            <Section key={s.id} section={s} platform={platform} first={i === 0} />
          ))}
        </View>
      )}
      {modal && (
        <View
          style={{
            position: FIXED,
            top: 0,
            bottom: 0,
            start: 0,
            end: 0,
            zIndex: 20,
            alignItems: 'center',
            justifyContent: 'center',
            padding: sp['6'],
            backgroundColor: `color-mix(in srgb, ${theme.colors.bg} 70%, transparent)`,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: admin.curationFrame.maxWidth,
              gap: sp['3'],
              padding: sp['6'],
              borderRadius: tokens.radius.lg,
              borderWidth: line.thin,
              borderColor: theme.colors.line,
              backgroundColor: theme.colors.s1,
            }}
          >
            {modal.image && (
              <Image
                source={{ uri: modal.image }}
                accessible={false}
                contentFit="cover"
                style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: tokens.radius.md }}
              />
            )}
            <Text variant="title" weight={600}>
              {modal.title}
            </Text>
            <Inline text={modal.body} variant="body" />
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                gap: sp['2'],
              }}
            >
              <Cta cta={modal.cta} />
              <Button variant="primary">{t('gotIt')}</Button>
            </View>
          </View>
        </View>
      )}
      {toastOne && (
        <View
          style={{
            position: FIXED,
            end: sp['6'],
            bottom: sp['6'],
            zIndex: 20,
            width: admin.curationFrame.panel,
            padding: sp['4'],
            gap: sp['1'],
            borderRadius: tokens.radius.md,
            borderWidth: line.thin,
            borderColor: theme.colors.line,
            backgroundColor: theme.colors.s2,
            boxShadow: tokens.elevation[3].boxShadow,
          }}
        >
          <Text size={ui.size} leading={ui.leading} weight={600}>
            {toastOne.title}
          </Text>
          <Inline text={toastOne.body} variant="caption" numberOfLines={2} />
        </View>
      )}
    </View>
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
  const window = useWindowDimensions().width
  const title =
    s.title ?? (s.id === 'continue' ? t('row.continue') : s.id === 'recent' ? t('row.recent') : '')
  const id = sectionAnchor(s.id)
  if (s.layout === 'hero' && s.items[0]) {
    const m = s.items[0]
    return (
      <View nativeID={id}>
        <FeaturedCard
          title={m.title}
          kicker={s.title}
          meta={m.year ? String(m.year) : null}
          tagline={m.tagline ?? m.synopsis}
          backdrop={m.art.backdrop}
          poster={m.art.poster}
          onPress={noop}
          actions={
            <Button variant="primary" icon="play">
              {t('play')}
            </Button>
          }
        />
      </View>
    )
  }
  const spotlight = s.layout === 'spotlight' && platform !== 'mobile'
  // a spotlight's card: clamp(14rem, 24vw, 20rem)
  const spot = Math.min(
    Math.max(admin.curationFrame.spot.min, window * 0.24),
    admin.curationFrame.spot.max,
  )
  const poster = pointerItemWidth(window)
  return (
    <View nativeID={id} style={first ? { paddingTop: sp['16'] + sp['4'] } : undefined}>
      <Row
        title={title}
        suffix={s.suffix}
        items={s.items}
        keyOf={(m) => m.id}
        render={(m) =>
          spotlight ? (
            <View style={{ width: spot, gap: sp['2'] }}>
              <Poster title={m.title} src={m.art.backdrop} aspect="still" width={spot} />
              <Text size={tokens.adminText.ui.size} weight={600}>
                {m.title}
              </Text>
              <Text variant="caption" color="text-2" numberOfLines={2}>
                {m.tagline ?? m.synopsis}
              </Text>
            </View>
          ) : (
            <Poster
              title={m.title}
              src={m.art.poster}
              width={poster}
              showTitle
              progress={m.progress === null ? undefined : m.progress * 100}
            />
          )
        }
      />
    </View>
  )
}
