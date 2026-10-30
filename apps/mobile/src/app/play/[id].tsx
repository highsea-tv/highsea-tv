// SPDX-License-Identifier: AGPL-3.0-only
// C5 Player on the phone (docs/product/player.md#mobile), ported from the prototype's
// mobile/player.tsx onto expo-video (`@highsea-tv/native/playback`). It opens as a full-screen modal that
// turns with the phone. A tap shows or hides the chrome; Back, the title, AirPlay, picture in
// picture and Audio and subtitles along the top; skip back, Play and skip forward in the middle;
// the times and the scrubber, with its trickplay frame while dragging, at the bottom. Subtitles
// are drawn here from the session's WebVTT with the person's offset. AirPlay is iOS's own picker
// (`VideoAirPlayButton`); while a film plays on another screen, the chrome stays up over the
// dimmed picture and the phone draws no subtitles. Picture in picture is AVKit's, started from
// the button or by leaving the app while playing
// (https://docs.expo.dev/versions/latest/sdk/video/#videoviewprops). It's drawn in the default
// theme whatever the person chose, since it's on black, as the web's is.
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
  SEEK_S,
  streamState,
  trickplayTile,
} from '@highsea-tv/client/player'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { type Playback, TRANSCODE_LIMIT, usePlayback } from '@highsea-tv/native/playback'
import { useQuery } from '@highsea-tv/sdk/react'
import type { ColorRole } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  family,
  Icon,
  type IconName,
  Press,
  Sheet,
  Text,
  ThemeProvider,
  useTheme,
} from '@highsea-tv/ui-native'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { VideoAirPlayButton, VideoView } from 'expo-video'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, type LayoutChangeEvent, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Center } from '../../kit.tsx'
import { player as messages } from '../../messages.ts'

const { clock } = createFormat()
const nudgeText = createPlayerText()
// the player is drawn on black in every theme, as the prototype's is
const ON_BLACK = '#ededee'
const SCRIM = 'rgba(0,0,0,0.45)'

export default function PlayRoute() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>()
  // a new film is a new player: Next up moves from one to the next
  return (
    <ThemeProvider>
      <Player key={id} id={Number(id)} fromStart={start === '1'} />
    </ThemeProvider>
  )
}

const leave = (id: number) => (router.canGoBack() ? router.back() : router.replace(`/movies/${id}`))

function Round({
  icon,
  label,
  size = 44,
  iconSize = 22,
  tint,
  onPress,
  filled,
}: {
  icon: IconName
  label: string
  size?: number
  iconSize?: number
  tint?: ColorRole
  onPress: () => void
  filled?: boolean
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? 'rgba(255,255,255,0.14)' : undefined,
      }}
    >
      <Icon name={icon} size={iconSize} color={tint ?? 'text'} />
    </Press>
  )
}

/** The trickplay frame for a time, cut from its sheet and shown 160pt wide. */
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
  const media = useMedia()
  const tile = trickplayTile(manifest, seconds)
  if (!tile) return null
  const scale = 160 / tile.width
  const sheet = media(
    `/api/v1/items/movie/${id}/trickplay/${tile.sheet}.jpg?versionId=${encodeURIComponent(versionId)}`,
  )
  const rows = Math.ceil(
    Math.min(manifest.count, manifest.columns * manifest.rows) / manifest.columns,
  )
  return (
    <View
      style={{
        width: 160,
        height: tile.height * scale,
        overflow: 'hidden',
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.24)',
        backgroundColor: '#1c1c1f',
      }}
    >
      <Image
        source={sheet}
        style={{
          position: 'absolute',
          left: -tile.x * scale,
          top: -tile.y * scale,
          width: manifest.columns * tile.width * scale,
          height: rows * tile.height * scale,
        }}
      />
    </View>
  )
}

/**
 * The position, dragged with a finger: the frame under it shows while dragging, and the seek
 * happens on letting go, so a drag asks the server for one place, not many.
 */
function Scrubber({
  p,
  id,
  manifest,
  onDrag,
}: {
  p: Playback
  id: number
  manifest: TrickplayManifest | null
  onDrag: () => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const { position, duration } = p.state
  const at = (x: number) =>
    duration && width ? Math.max(0, Math.min(1, x / width)) * duration : null
  const shown = drag ?? position
  const f = duration ? Math.min(1, shown / duration) : 0
  const versionId = p.version?.id
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('position')}
      accessibilityValue={{
        text: t('positionText', { at: clock(position), total: clock(duration) }),
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        p.seekBy(e.nativeEvent.actionName === 'increment' ? SEEK_S : -SEEK_S)
      }
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        onDrag()
        setDrag(at(e.nativeEvent.locationX))
      }}
      onResponderMove={(e) => {
        onDrag()
        setDrag(at(e.nativeEvent.locationX))
      }}
      onResponderRelease={() => {
        if (drag !== null) p.seekTo(drag)
        setDrag(null)
      }}
      onResponderTerminate={() => setDrag(null)}
      style={{ height: 32, justifyContent: 'center' }}
    >
      {drag !== null && manifest && versionId && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 36,
            left: Math.max(0, Math.min(width - 160, f * width - 80)),
          }}
        >
          <Preview id={id} versionId={versionId} manifest={manifest} seconds={drag} />
          <Text
            variant="caption"
            size={12}
            style={{
              color: ON_BLACK,
              textAlign: 'center',
              marginTop: 4,
              fontFamily: family(400, 'mono'),
            }}
          >
            {clock(drag)}
          </Text>
        </View>
      )}
      <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.24)' }}>
        <View
          style={{
            width: `${f * 100}%`,
            height: 4,
            borderRadius: 2,
            backgroundColor: theme.colors['accent-fill'],
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: f * width - (drag === null ? 7 : 10),
          width: drag === null ? 14 : 20,
          height: drag === null ? 14 : 20,
          borderRadius: 10,
          backgroundColor: ON_BLACK,
        }}
      />
    </View>
  )
}

/** The lines showing now, with the person's offset, over the bottom of the picture. */
function CueLine({ p }: { p: Playback }) {
  const lines = cuesAt(p.cues, p.state.position, p.offsetMs)
  if (!lines.length) return null
  return (
    <View pointerEvents="none" style={{ alignItems: 'center', gap: 2, paddingHorizontal: 48 }}>
      {lines.map((line) => (
        <Text
          key={line}
          size={17}
          weight={500}
          style={{
            color: '#fff',
            textAlign: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)',
            paddingHorizontal: 6,
            borderRadius: 2,
          }}
        >
          {cueText(line)}
        </Text>
      ))}
    </View>
  )
}

function Choice({
  label,
  chosen,
  onPress,
}: {
  label: string
  chosen: boolean
  onPress: () => void
}) {
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen }}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 12 }}
    >
      <Text variant="body" size={15} style={{ flex: 1 }}>
        {label}
      </Text>
      {chosen && <Icon name="check" size={18} color="accent-text" />}
    </Press>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text variant="caption" size={13} color="text-3" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  )
}

/** Audio and subtitles: the same panel as the web's, as iOS's page sheet. */
function Tracks({ p, open, onClose }: { p: Playback; open: boolean; onClose: () => void }) {
  const t = useT(messages)
  const versions = p.detail.data?.versions.filter((v) => v.playable) ?? []
  const v = p.version
  return (
    <Sheet open={open} onClose={onClose} title={t('tracks')}>
      <View style={{ gap: 24 }}>
        {versions.length > 1 && (
          <Section title={t('version')}>
            {versions.map((x) => (
              <Choice
                key={x.id}
                label={x.label}
                chosen={x.id === v?.id}
                onPress={() => p.setVersion(x.id)}
              />
            ))}
          </Section>
        )}
        {v && v.audio.length > 0 && (
          <Section title={t('audio')}>
            {v.audio.map((a) => (
              <Choice
                key={a.id}
                label={a.label}
                chosen={a.id === p.audio?.id}
                onPress={() => p.setAudio(a.id)}
              />
            ))}
          </Section>
        )}
        {v && (
          <Section title={t('subtitles')}>
            <Choice label={t('off')} chosen={!p.subtitle} onPress={() => p.setSubtitle(null)} />
            {v.subtitles.map((s) => (
              <Choice
                key={s.id}
                label={s.label}
                chosen={s.id === p.subtitle?.id}
                onPress={() => p.setSubtitle(s.id)}
              />
            ))}
            {p.pictureTrack && (
              <Text variant="caption" size={13} color="text-3">
                {t('pictureTrack')}
              </Text>
            )}
          </Section>
        )}
        {p.subtitle && !p.pictureTrack && (
          <Section title={t('timing')}>
            {p.burnt ? (
              <Text variant="caption" size={13} color="text-3">
                {t('burntTiming')}
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Button
                    icon="chevron-left"
                    onPress={() => p.nudge(-1)}
                    label={`${t('earlier')} ${NUDGE_MS} ms`}
                  >
                    {t('earlier')}
                  </Button>
                  <Text
                    variant="body"
                    size={15}
                    style={{ flex: 1, textAlign: 'center', fontFamily: family(400, 'mono') }}
                    accessibilityLiveRegion="polite"
                  >
                    {nudgeText.offsetLabel(p.offsetMs)}
                  </Text>
                  <Button
                    icon="chevron-right"
                    onPress={() => p.nudge(1)}
                    label={`${t('later')} ${NUDGE_MS} ms`}
                  >
                    {t('later')}
                  </Button>
                </View>
                {p.offsetMs !== 0 && (
                  <Button variant="ghost" onPress={() => p.nudge(0)}>
                    {t('reset')}
                  </Button>
                )}
                <Text variant="caption" size={13} color="text-3">
                  {`${nudgeText.offsetHint(p.offsetMs)} ${t('saved')}`}
                </Text>
              </View>
            )}
          </Section>
        )}
      </View>
    </Sheet>
  )
}

/** Didn't start, or stopped from Now playing: over a scrim, with what to do next. */
function StreamMessage({ p, onBack }: { p: Playback; onBack: () => void }) {
  const t = useT(messages)
  const failed = p.state.phase === 'failed'
  const by = p.state.stoppedBy
  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View style={{ maxWidth: 420, alignItems: 'center', gap: 12 }}>
        <Text
          variant="title"
          size={22}
          style={{ color: ON_BLACK, textAlign: 'center' }}
          accessibilityRole="header"
        >
          {failed ? t('failed') : t('stopped', { name: by?.name ?? '' })}
        </Text>
        {!failed && by?.message ? (
          <Text variant="body" size={15} style={{ color: ON_BLACK, textAlign: 'center' }}>
            {`“${by.message}”`}
          </Text>
        ) : null}
        <Text
          variant="body"
          size={15}
          style={{ color: 'rgba(237,237,238,0.75)', textAlign: 'center' }}
        >
          {failed
            ? p.state.error === TRANSCODE_LIMIT
              ? t('failedLimit')
              : t('failedBody')
            : t('stoppedBody')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button variant="primary" onPress={p.retry}>
            {failed ? t('tryAgain') : t('startAgain')}
          </Button>
          <Button onPress={onBack}>{t('back')}</Button>
        </View>
      </View>
    </View>
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
  const media = useMedia()
  return (
    <View
      style={{
        position: 'absolute',
        right: 48,
        bottom: 72,
        width: 300,
        gap: 12,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: 'rgba(11,11,12,0.86)',
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Image
          source={media(next.art.backdrop)}
          style={{
            width: 88,
            aspectRatio: 16 / 9,
            borderRadius: 4,
            backgroundColor: theme.colors.s2,
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="caption"
            size={12}
            color="text-2"
            style={{ fontFamily: family(400, 'mono') }}
            accessibilityRole="header"
          >
            {t('nextUp').toUpperCase()}
          </Text>
          <Text variant="body" size={15} weight={600} numberOfLines={1}>
            {next.title}
          </Text>
          <Text variant="caption" size={13} color="text-2">
            {t('startsIn', { seconds })}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="primary" onPress={onPlay}>
          {t('playNow')}
        </Button>
        <Button onPress={onCancel}>{t('cancel')}</Button>
      </View>
    </View>
  )
}

function Player({ id, fromStart }: { id: number; fromStart: boolean }) {
  const t = useT(messages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const media = useMedia()
  const p = usePlayback(id, fromStart)
  const { state, dispatch } = p
  const view = useRef<VideoView>(null)
  const [panel, setPanel] = useState(false)
  const [pip, setPip] = useState(false)
  const [now, setNow] = useState(() => Date.now())

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

  const wake = () => {
    const at = Date.now()
    dispatch({ type: 'input', at })
    setNow(at)
  }

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

  const playNext = () => {
    if (next) router.replace(`/play/${next.id}`)
  }
  // at zero the next film plays; Cancel lets this one end as before
  const left = nextUpIn(state)
  useEffect(() => {
    if (stream === 'next-up' && left === 0 && next) router.replace(`/play/${next.id}`)
  }, [stream, left, next])

  if (p.detail.status === 'error')
    return (
      <Center>
        <EmptyState
          icon="movie"
          tone="error"
          title={t('missing')}
          action={<Button onPress={() => router.replace('/')}>{t('back')}</Button>}
        >
          {p.detail.error.message}
        </EmptyState>
      </Center>
    )

  const d = p.detail.data
  const message = stream === 'failed' || stream === 'stopped'
  const waiting = stream === 'preparing' || stream === 'buffering'
  // a message over the frame has the screen to itself; on another screen the chrome stays up
  const chrome = !message && !pip && (p.external || chromeShown(state, now, panel) || waiting)
  const hide = () => dispatch({ type: 'input', at: 0 })
  const top = Math.max(insets.top, 12)
  const side = Math.max(insets.left, insets.right, 16)

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView
        ref={view}
        player={p.player}
        nativeControls={false}
        contentFit="contain"
        // Live Text's button sits over the video, under the player's own controls; none is drawn
        // (https://developer.apple.com/documentation/avkit/avplayerviewcontroller/allowsvideoframeanalysis)
        allowsVideoFrameAnalysis={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        onPictureInPictureStart={() => setPip(true)}
        onPictureInPictureStop={() => setPip(false)}
        style={{ position: 'absolute', inset: 0, opacity: p.external ? 0.35 : 1 }}
      />
      {p.external && d?.item.art.backdrop ? (
        <Image
          source={media(d.item.art.backdrop)}
          style={{ position: 'absolute', inset: 0, opacity: 0.35 }}
          contentFit="cover"
          blurRadius={2}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chrome ? t('hideControls') : t('showControls')}
        onPress={() => (chrome && state.playing && !p.external ? hide() : wake())}
        style={{ position: 'absolute', inset: 0 }}
      />
      {p.external ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '19%',
            alignItems: 'center',
            gap: 4,
            zIndex: 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="airplay" size={20} />
            <Text variant="body" size={17} weight={600} style={{ color: ON_BLACK }}>
              {t('external')}
            </Text>
          </View>
          <Text variant="caption" size={13} style={{ color: 'rgba(237,237,238,0.7)' }}>
            {t('externalBody')}
          </Text>
        </View>
      ) : (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: chrome ? 84 : Math.max(insets.bottom, 24),
          }}
        >
          <CueLine p={p} />
        </View>
      )}

      {chrome && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', inset: 0, backgroundColor: SCRIM }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingTop: top,
              paddingHorizontal: side,
            }}
          >
            <Round
              icon="chevron-down"
              label={t('backToDetails')}
              iconSize={24}
              onPress={() => leave(id)}
            />
            <Text
              variant="body"
              size={17}
              weight={600}
              numberOfLines={1}
              style={{ flex: 1, color: ON_BLACK }}
              accessibilityRole="header"
            >
              {d?.item.title ?? ''}
            </Text>
            <View
              accessibilityLabel={p.external ? t('airplayOn') : t('airplay')}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <VideoAirPlayButton
                tint={ON_BLACK}
                activeTint={theme.colors['accent-text']}
                prioritizeVideoDevices
                onBeginPresentingRoutes={wake}
                style={{ width: 28, height: 28 }}
              />
            </View>
            <Round
              icon="picture-in-picture"
              label={t('pip')}
              onPress={() => void view.current?.startPictureInPicture()}
            />
            <Round
              icon="subtitles"
              label={t('tracks')}
              onPress={() => {
                setPanel(true)
                wake()
              }}
            />
          </View>
          <View
            pointerEvents="box-none"
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 48,
            }}
          >
            <Round
              icon="replay"
              label={t('backBy', { seconds: SEEK_S })}
              size={56}
              iconSize={28}
              onPress={() => {
                p.seekBy(-SEEK_S)
                wake()
              }}
            />
            <Round
              icon={state.playing ? 'pause' : 'play'}
              label={state.playing ? t('pause') : t('play')}
              size={72}
              iconSize={36}
              filled
              onPress={() => {
                p.toggle()
                wake()
              }}
            />
            <View style={{ transform: [{ scaleX: -1 }] }}>
              <Round
                icon="replay"
                label={t('forwardBy', { seconds: SEEK_S })}
                size={56}
                iconSize={28}
                onPress={() => {
                  p.seekBy(SEEK_S)
                  wake()
                }}
              />
            </View>
          </View>
          <View
            style={{
              gap: 4,
              paddingHorizontal: side + 16,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            {/* the scrubber speaks the position, "4:10 of 1:52:00"; these only show it */}
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text
                size={12}
                style={{ color: 'rgba(237,237,238,0.8)', fontFamily: family(400, 'mono') }}
              >
                {clock(state.position)}
              </Text>
              <Text
                size={12}
                style={{ color: 'rgba(237,237,238,0.8)', fontFamily: family(400, 'mono') }}
              >
                {`−${clock(Math.max(0, state.duration - state.position))}`}
              </Text>
            </View>
            <Scrubber p={p} id={id} manifest={trickplay.data?.manifest ?? null} onDrag={wake} />
          </View>
        </View>
      )}

      {waiting && !message && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <ActivityIndicator color={ON_BLACK} size="large" />
          {stream === 'preparing' ? (
            <>
              <Text
                variant="body"
                size={17}
                weight={600}
                style={{ color: ON_BLACK, marginTop: 48 }}
              >
                {t('preparing')}
              </Text>
              <Text variant="caption" size={13} style={{ color: 'rgba(237,237,238,0.7)' }}>
                {t('preparingBody')}
              </Text>
            </>
          ) : (
            <Text variant="caption" size={13} style={{ color: ON_BLACK, marginTop: 48 }}>
              {t('buffering')}
            </Text>
          )}
        </View>
      )}
      {message && <StreamMessage p={p} onBack={() => leave(id)} />}
      {stream === 'next-up' && next && !pip && (
        <NextUp
          next={next}
          seconds={left}
          onPlay={playNext}
          onCancel={() => dispatch({ type: 'cancel-next' })}
        />
      )}
      <Tracks p={p} open={panel} onClose={() => setPanel(false)} />
    </View>
  )
}
