// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player on the TV (docs/product/player.md#tv), ported from the prototype's tv/player.tsx onto
// the phone's engine (`@highsea-tv/native/playback`, expo-video). The remote, mapped:
//   OK            play or pause            ← →  seek 10 s (on the scrubber)
//   ↓             Audio and subtitles      Back  close the panel, hide the chrome, then leave
//   Play/Pause    play or pause, from anywhere
// Any key shows the chrome, which hides 3 s after the last one while playing; the scrubber keeps
// Left and Right inside a focus guide that traps them, so they seek instead of moving focus. The
// keys come from react-native-tvos's useTVEventHandler, on Apple TV and Android TV alike
// (https://github.com/react-native-tvos/react-native-tvos#readme). Subtitles are drawn here from
// the session's WebVTT with the person's offset, as on the phone. Drawn in the default theme
// whatever the person chose, since it's on black, as the phone's and the web's are.
import type { ClientItem, TrickplayManifest } from '@highsea-tv/api-contract'
import { createFormat } from '@highsea-tv/client/format'
import {
  chromeShown,
  createPlayerText,
  cuesAt,
  cueText,
  HIDE_MS,
  NUDGE_MS,
  nextChange,
  nextUpIn,
  SCRUB_MS,
  SEEK_S,
  streamState,
  trickplayTile,
} from '@highsea-tv/client/player'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { type Playback, TRANSCODE_LIMIT, usePlayback } from '@highsea-tv/native/playback'
import { useQuery } from '@highsea-tv/sdk/react'
import { Button, family, Icon, Text, ThemeProvider, tokens, useTheme } from '@highsea-tv/ui'
import { alpha, Focusable, focusOn, TvMessage, type ViewHandle } from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { VideoView } from 'expo-video'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  TVFocusGuideView,
  useTVEventHandler,
  View,
} from 'react-native'
import { useBack } from '../../back.ts'
import { player as messages } from '../../messages.ts'
import { TvTracksPanel } from '../../tracks.tsx'

const { clock } = createFormat()
const nudgeText = createPlayerText()
const tv = tokens.tv
// on black in every theme, as the prototype's is
const GLASS = 'rgba(11,11,12,0.62)'

export default function PlayRoute() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>()
  // a new film is a new player: Next up moves from one to the next
  return (
    <ThemeProvider platform="tv">
      <Player key={id} id={Number(id)} fromStart={start === '1'} />
    </ThemeProvider>
  )
}

const leave = (id: number) => (router.canGoBack() ? router.back() : router.replace(`/movies/${id}`))

/** The trickplay frame for a time, cut from its sheet and shown 14u wide. */
function Preview({
  id,
  versionId,
  manifest,
  seconds,
}: {
  id: number
  versionId: string
  manifest: TrickplayManifest
  seconds: number
}) {
  const theme = useTheme()
  const media = useMedia()
  const tile = trickplayTile(manifest, seconds)
  if (!tile) return null
  const width = 14 * theme.u
  const scale = width / tile.width
  const sheet = media(
    `/api/v1/items/movie/${id}/trickplay/${tile.sheet}.jpg?versionId=${encodeURIComponent(versionId)}`,
  )
  return (
    <View
      style={{
        width,
        height: tile.height * scale,
        overflow: 'hidden',
        borderRadius: 0.4 * theme.u,
        borderWidth: 1,
        borderColor: theme.colors['line-strong'],
        backgroundColor: theme.colors.s2,
      }}
    >
      <Image
        source={sheet}
        style={{
          position: 'absolute',
          left: -tile.x * scale,
          top: -tile.y * scale,
          width: manifest.columns * tile.width * scale,
          height: manifest.rows * tile.height * scale,
        }}
        // a sheet is always the full grid: ffmpeg's tile filter pads the last one
        // (https://ffmpeg.org/ffmpeg-filters.html#tile); pinned to its top left all the same
        contentPosition="top left"
      />
    </View>
  )
}

/** The lines showing now, with the person's offset. */
function CueLine({ p }: { p: Playback }) {
  const u = useTheme().u
  const lines = cuesAt(p.cues, p.state.position, p.offsetMs)
  if (!lines.length) return null
  return (
    <View pointerEvents="none" style={{ alignItems: 'center', gap: 0.2 * u }}>
      {lines.map((line) => (
        <Text
          key={line}
          size={1.8}
          weight={500}
          style={{
            color: '#fff',
            textAlign: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)',
            paddingHorizontal: 0.5 * u,
            borderRadius: 0.2 * u,
          }}
        >
          {cueText(line)}
        </Text>
      ))}
    </View>
  )
}

/** The prototype's NudgePreview: the speech bar fixed, the subtitle's moved 1 px per 10 ms. */
function NudgePreview({ offsetMs }: { offsetMs: number }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const [width, setWidth] = useState(0)
  const shift = (Math.max(-600, Math.min(600, offsetMs)) / 10) * (u / 19.2)
  const bar = 6 * u
  const label = {
    position: 'absolute',
    left: 0.4 * u,
    fontFamily: family(400, 'mono'),
  } as const
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: 3 * u,
        overflow: 'hidden',
        borderRadius: 0.3 * u,
        backgroundColor: theme.colors.s2,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: width / 2,
          width: 1,
          backgroundColor: theme.colors['line-strong'],
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0.4 * u,
          left: width / 2 - bar / 2,
          width: bar,
          height: 0.6 * u,
          borderRadius: 0.3 * u,
          backgroundColor: alpha(theme.colors['text-3'], 0.6),
        }}
      />
      <Text size={0.8} color="text-3" style={[label, { top: 0.3 * u }]}>
        {t('speech')}
      </Text>
      <View
        style={{
          position: 'absolute',
          bottom: 0.4 * u,
          left: width / 2 - bar / 2 + shift,
          width: bar,
          height: 0.6 * u,
          borderRadius: 0.3 * u,
          backgroundColor: theme.colors['accent-fill'],
        }}
      />
      <Text size={0.8} color="text-3" style={[label, { bottom: 0.3 * u }]}>
        {t('subtitle')}
      </Text>
    </View>
  )
}

/** Subtitle timing, under the panel's groups: Left and Right on its row nudge by 50 ms. */
function Timing({ p }: { p: Playback }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const [focused, setFocused] = useState(false)
  const onEvent = useCallback(
    (e: { eventType: string }) => {
      if (!focused) return
      if (e.eventType === 'left') p.nudge(-1)
      else if (e.eventType === 'right') p.nudge(1)
    },
    [focused, p],
  )
  useTVEventHandler(onEvent)
  const note = (text: string) => (
    <Text variant="pill" color="text-2">
      {text}
    </Text>
  )
  return (
    <View accessibilityLabel={t('timing')} style={{ gap: 0.6 * u }}>
      <Text variant="eyebrow" color="text-3" accessibilityRole="header">
        {t('timing')}
      </Text>
      {p.pictureTrack ? (
        note(t('pictureTrack'))
      ) : p.burnt ? (
        note(t('burntTiming'))
      ) : (
        <>
          {/* Left and Right stay on the row: they nudge instead of leaving the panel's column */}
          <TVFocusGuideView trapFocusLeft trapFocusRight>
            {/* biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, not ARIA */}
            <Focusable
              role="adjustable"
              label={t('timingLabel', { ms: NUDGE_MS })}
              lift="none"
              radius={0.5 * u}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 1 * u,
                paddingVertical: 0.7 * u,
                backgroundColor: alpha(theme.colors.text, 0.12),
              }}
            >
              <Icon name="chevron-left" size={1.2} />
              <Text variant="button" style={{ fontFamily: family(400, 'mono') }}>
                {nudgeText.offsetLabel(p.offsetMs)}
              </Text>
              <Icon name="chevron-right" size={1.2} />
            </Focusable>
          </TVFocusGuideView>
          <NudgePreview offsetMs={p.offsetMs} />
          {note(nudgeText.offsetHint(p.offsetMs))}
        </>
      )}
    </View>
  )
}

/** Over the picture while it waits: the first minute being made, or Buffering. */
function StreamWaiting({ preparing }: { preparing: boolean }) {
  const t = useT(messages)
  const u = useTheme().u
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        inset: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          alignItems: 'center',
          gap: 0.8 * u,
          paddingHorizontal: 2.4 * u,
          paddingVertical: 1.6 * u,
          borderRadius: 1 * u,
          backgroundColor: GLASS,
        }}
      >
        <ActivityIndicator size="large" color={tokens.themes.default.colors.text} />
        <Text variant="rowTitle">{preparing ? t('preparing') : t('buffering')}</Text>
        {preparing ? (
          <Text variant="pill" color="text-2">
            {t('preparingBody')}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** A modal region that keeps focus inside, taking it on its first button as it opens. */
function Ask({ children, style }: { children: ReactNode; style: object }) {
  return (
    <TVFocusGuideView
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
      accessibilityViewIsModal
      style={style}
    >
      {children}
    </TVFocusGuideView>
  )
}

/** Didn't start, or stopped from Now playing: over a scrim, with what to do next. */
function StreamMessage({ p, onBack }: { p: Playback; onBack: () => void }) {
  const t = useT(messages)
  const first = useFirstFocus()
  const failed = p.state.phase === 'failed'
  const by = p.state.stoppedBy
  const body = failed
    ? p.state.error === TRANSCODE_LIMIT
      ? t('failedLimit')
      : t('failedBody')
    : t('stoppedBody')
  return (
    <Ask style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)' }}>
      <TvMessage
        title={failed ? t('failed') : t('stopped', { name: by?.name ?? '' })}
        actions={
          <>
            <Button ref={first} variant="primary" icon="refresh" onPress={p.retry}>
              {failed ? t('tryAgain') : t('startAgain')}
            </Button>
            <Button variant="overlay" icon="chevron-left" onPress={onBack}>
              {t('back')}
            </Button>
          </>
        }
      >
        {!failed && by?.message ? `“${by.message}” ${body}` : body}
      </TvMessage>
    </Ask>
  )
}

/** Next up: in a film's last seconds, the next one in its collection, counting down with it. */
function NextUp({
  next,
  seconds,
  onPlay,
  onCancel,
}: {
  next: ClientItem
  seconds: number
  onPlay: () => void
  onCancel: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const first = useFirstFocus()
  return (
    <Ask
      style={{
        position: 'absolute',
        right: tv.safe.x * u,
        bottom: tv.safe.y * u,
        width: 30 * u,
        gap: 1.2 * u,
        padding: 1.4 * u,
        borderRadius: 1 * u,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: alpha(theme.colors.s1, 0.92),
      }}
    >
      <View style={{ flexDirection: 'row', gap: 1.2 * u, alignItems: 'center' }}>
        <Image
          source={media(next.art.backdrop)}
          style={{
            width: 9 * u,
            aspectRatio: 16 / 9,
            borderRadius: 0.4 * u,
            backgroundColor: theme.colors.s2,
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1, minWidth: 0, gap: 0.2 * u }}>
          <Text variant="eyebrow" color="text-2" accessibilityRole="header">
            {t('nextUp')}
          </Text>
          <Text variant="rowTitle" numberOfLines={1}>
            {next.title}
          </Text>
          <Text variant="pill" color="text-2">
            {t('startsIn', { seconds })}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 1 * u }}>
        <Button ref={first} variant="primary" icon="play" onPress={onPlay}>
          {t('playNow')}
        </Button>
        <Button variant="overlay" onPress={onCancel}>
          {t('cancel')}
        </Button>
      </View>
    </Ask>
  )
}

/**
 * A stop that takes focus once its native view exists, as the tracks panel's first option does:
 * a preferred focus on a view mounted over a screen that already has focus doesn't move it.
 */
function useFirstFocus() {
  const first = useRef<ViewHandle>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusOn(first.current))
    return () => cancelAnimationFrame(frame)
  }, [])
  return first
}

function Player({ id, fromStart }: { id: number; fromStart: boolean }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const p = usePlayback(id, fromStart)
  const { state, dispatch } = p
  const [panel, setPanel] = useState(false)
  // the preview shows while seeking by key, until SCRUB_MS after the last press
  const [scrubAt, setScrubAt] = useState(0)
  const seeking = scrubAt > 0
  const [onScrubber, setOnScrubber] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const scrubber = useRef<ViewHandle>(null)

  const versionId = p.version?.id
  const trickplay = useQuery(`client:trickplay:${id}:${versionId ?? ''}`, (c) =>
    versionId
      ? c.playback.trickplay({ params: { type: 'movie', id }, query: { versionId } })
      : Promise.resolve(null),
  )
  const nextUp = useQuery(`client:next:${id}`, (c) =>
    c.playback.next({ params: { type: 'movie', id } }),
  )
  const next = nextUp.data?.item ?? null
  const stream = streamState(state, now, !!next)
  const message = stream === 'failed' || stream === 'stopped'
  const asking = message || stream === 'next-up'
  const waiting = stream === 'preparing' || stream === 'buffering'
  const chrome = !message && (chromeShown(state, now, panel) || waiting)

  const wake = useCallback(() => {
    const at = Date.now()
    dispatch({ type: 'input', at })
    setNow(at)
  }, [dispatch])

  // any key shows the chrome but Back, which hides it (useBack below); Play/Pause works from
  // anywhere, Left and Right seek on the scrubber
  const onEvent = useCallback(
    (e: { eventType: string }) => {
      if (e.eventType === 'menu') return
      wake()
      if (e.eventType === 'playPause') p.toggle()
      else if (onScrubber && (e.eventType === 'left' || e.eventType === 'right')) {
        setScrubAt(Date.now())
        p.seekBy(e.eventType === 'left' ? -SEEK_S : SEEK_S)
      }
    },
    [wake, p, onScrubber],
  )
  useTVEventHandler(onEvent)

  // the clock moves only when something is due: Buffering's delay, or the chrome hiding
  useEffect(() => {
    const t0 = Date.now()
    const due = [nextChange(state, t0), state.playing ? state.inputAt + HIDE_MS : null].filter(
      (x): x is number => x !== null && x > t0,
    )
    if (!due.length) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(...due) - t0 + 10)
    return () => clearTimeout(timer)
  }, [state])
  useEffect(() => {
    if (!scrubAt) return
    const timer = setTimeout(() => setScrubAt(0), SCRUB_MS)
    return () => clearTimeout(timer)
  }, [scrubAt])

  // the scrubber has focus whenever nothing else asks for it: on arrival, and after the panel or
  // a question closes, whose stops unmount with focus on them
  const ready = p.detail.status === 'success'
  useEffect(() => {
    if (!ready || panel || asking) return
    const frame = requestAnimationFrame(() => focusOn(scrubber.current))
    return () => cancelAnimationFrame(frame)
  }, [ready, panel, asking])
  // and as the chrome hides, since Audio and subtitles faded out can't keep it
  useEffect(() => {
    if (chrome || !ready || panel || asking) return
    focusOn(scrubber.current)
  }, [chrome, ready, panel, asking])

  useBack(() => {
    if (state.playing && chromeShown(state, Date.now(), false)) dispatch({ type: 'input', at: 0 })
    else leave(id)
  })

  // at zero the next film plays; Cancel lets this one end as before
  const left = nextUpIn(state)
  useEffect(() => {
    if (stream === 'next-up' && left === 0 && next) router.replace(`/play/${next.id}`)
  }, [stream, left, next])

  if (p.detail.status === 'error')
    return (
      <TvMessage
        title={t('missing')}
        actions={
          <Button
            variant="primary"
            hasTVPreferredFocus
            icon="home"
            onPress={() => router.replace('/')}
          >
            {t('goHome')}
          </Button>
        }
      >
        {t('gone')}
      </TvMessage>
    )

  const d = p.detail.data
  const v = p.version
  const { position, duration } = state
  const fraction = duration ? Math.min(1, position / duration) : 0
  const manifest = trickplay.data?.manifest ?? null
  const safeX = tv.safe.x * u
  const safeY = tv.safe.y * u
  const shown = chrome ? 1 : 0
  const muted = { color: theme.colors['text-2'], fontFamily: family(400, 'mono') }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* AVPlayerViewController's view takes focus on tvOS even without its controls, and would
          catch Left and Right from the scrubber and OK after them. The focus engine skips views
          that don't take user interaction (Apple's "Supporting focus within your app"), which
          is what pointerEvents none sets on iOS; collapsable keeps the wrapper from being
          flattened away */}
      <View pointerEvents="none" collapsable={false} style={{ position: 'absolute', inset: 0 }}>
        <VideoView
          player={p.player}
          nativeControls={false}
          contentFit="contain"
          style={{ flex: 1 }}
        />
      </View>
      <View
        accessibilityRole="header"
        accessibilityLabel={t('playing', { title: d?.item.title ?? '' })}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: safeX,
          right: safeX,
          bottom: chrome ? '24%' : '9%',
        }}
      >
        <CueLine p={p} />
      </View>

      {/* the chrome hides by fading what it draws, never the scrubber itself: the focus engine
          drops focus from a view under 0.01 alpha (Apple's "Supporting focus within your app"),
          and with nothing focused OK sends nothing, so the scrubber keeps it while hidden */}
      {!message && (
        <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0 }}>
          <View
            style={{
              opacity: shown,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 1.2 * u,
              paddingHorizontal: safeX,
              paddingTop: safeY,
              paddingBottom: 4 * u,
              experimental_backgroundImage: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent)',
            }}
          >
            <View style={{ flex: 1, gap: 0.3 * u }}>
              <Text size={2.2} weight={600} numberOfLines={1}>
                {d?.item.title ?? ''}
              </Text>
              {v ? (
                <Text variant="meta" color="text-2" numberOfLines={1}>
                  {v.detail}
                </Text>
              ) : null}
            </View>
            {v ? (
              <View
                style={{
                  paddingHorizontal: 0.5 * u,
                  paddingVertical: 0.15 * u,
                  borderRadius: 0.3 * u,
                  backgroundColor: GLASS,
                }}
              >
                <Text variant="quality">{v.label}</Text>
              </View>
            ) : null}
          </View>
          {chrome && !state.playing && !waiting ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 6 * u,
                height: 6 * u,
                marginLeft: -3 * u,
                marginTop: -3 * u,
                borderRadius: 3 * u,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: GLASS,
              }}
            >
              <Icon name="play" size={2.6} />
            </View>
          ) : null}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              gap: 1.2 * u,
              paddingHorizontal: safeX,
              paddingTop: 6 * u,
              paddingBottom: safeY,
              experimental_backgroundImage: chrome
                ? 'linear-gradient(180deg, transparent, rgba(0,0,0,0.8))'
                : undefined,
            }}
          >
            <View>
              {seeking && manifest && versionId ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: 1.6 * u,
                    left: `${fraction * 100}%`,
                    marginLeft: -7 * u,
                  }}
                >
                  <Preview id={id} versionId={versionId} manifest={manifest} seconds={position} />
                </View>
              ) : null}
              {/* Left and Right stay here, to seek; so does Down while the chrome is hidden, since
                  the key that wakes it would otherwise send focus toward Audio and subtitles
                  faded out, which can't take it, and leave nothing focused */}
              <TVFocusGuideView trapFocusLeft trapFocusRight trapFocusDown={!chrome}>
                {/* biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, not ARIA */}
                <Focusable
                  ref={scrubber}
                  role="adjustable"
                  label={t('position')}
                  lift="none"
                  ring={false}
                  onPress={() => {
                    setScrubAt(0)
                    p.toggle()
                  }}
                  onFocus={() => setOnScrubber(true)}
                  onBlur={() => {
                    setOnScrubber(false)
                    setScrubAt(0)
                  }}
                  style={{ height: 1.6 * u, justifyContent: 'center' }}
                >
                  {(focused) => (
                    <View
                      accessibilityValue={{
                        text: t('positionText', { at: clock(position), total: clock(duration) }),
                      }}
                      style={{
                        opacity: shown,
                        height: (focused ? 0.8 : 0.5) * u,
                        borderRadius: 0.4 * u,
                        backgroundColor: alpha(theme.colors.text, 0.25),
                      }}
                    >
                      <View
                        style={{
                          width: `${fraction * 100}%`,
                          height: '100%',
                          borderRadius: 0.4 * u,
                          backgroundColor: theme.colors['accent-fill'],
                        }}
                      />
                      {focused ? (
                        <View
                          style={{
                            position: 'absolute',
                            left: `${fraction * 100}%`,
                            top: '50%',
                            width: 1.4 * u,
                            height: 1.4 * u,
                            marginLeft: -0.7 * u,
                            marginTop: -0.7 * u,
                            borderRadius: 0.7 * u,
                            backgroundColor: theme.colors.text,
                          }}
                        />
                      ) : null}
                    </View>
                  )}
                </Focusable>
              </TVFocusGuideView>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ opacity: shown, flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <Text variant="meta" style={muted}>
                  {clock(position)}
                </Text>
                <Text variant="meta" style={muted}>
                  {`−${clock(Math.max(0, duration - position))}`}
                </Text>
              </View>
            </View>
            <View
              style={{ opacity: shown, flexDirection: 'row', alignItems: 'center', gap: 1 * u }}
            >
              <Button
                variant="overlay"
                icon="subtitles"
                disabled={!v}
                onPress={() => {
                  setScrubAt(0)
                  setPanel(true)
                }}
              >
                {t('tracks')}
              </Button>
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  marginLeft: 'auto',
                  flexDirection: 'row',
                  gap: 1.6 * u,
                }}
              >
                {[
                  t('legendSeek', { seconds: SEEK_S }),
                  state.playing ? t('legendPause') : t('legendPlay'),
                  t('legendTracks'),
                  state.playing ? t('legendHide') : t('legendLeave'),
                ].map((line) => (
                  <Text key={line} variant="pill" color="text-2">
                    {line}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {panel && v ? (
        <TvTracksPanel
          versions={d?.versions.filter((x) => x.playable) ?? []}
          version={v}
          audio={p.audio}
          subtitle={p.subtitle}
          onVersion={p.setVersion}
          onAudio={p.setAudio}
          onSubtitle={p.setSubtitle}
          onClose={() => {
            // closing counts as input, so the chrome it leaves shown stays its 3 s and the next
            // Back hides it rather than leaving
            setPanel(false)
            wake()
          }}
        >
          {p.subtitle ? <Timing p={p} /> : null}
        </TvTracksPanel>
      ) : null}
      {waiting && !message ? <StreamWaiting preparing={stream === 'preparing'} /> : null}
      {message ? <StreamMessage p={p} onBack={() => leave(id)} /> : null}
      {stream === 'next-up' && next ? (
        <NextUp
          next={next}
          seconds={left}
          onPlay={() => router.replace(`/play/${next.id}`)}
          onCancel={() => dispatch({ type: 'cancel-next' })}
        />
      ) : null}
    </View>
  )
}
