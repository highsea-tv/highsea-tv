// SPDX-License-Identifier: AGPL-3.0-only
// What the player's three compositions share (player.md; the prototype's client/player.ts and
// client/stream-states.tsx, and the old phone, TV and web apps' players): the clock that
// hides the controls and moves Buffering on, Next up and its countdown, the trickplay sheets,
// leaving; and the parts a pointer and touch draw alike: the round controls over the picture, the
// scrubber with its trickplay frame, the subtitle's lines where the engine hands its cues over,
// the timing's live preview, the waiting badge, a stream's message and Next up's card, and Audio
// and subtitles' lists. The TV's own are in ./tv.tsx.
import type { ClientDetail, ClientItem, TrickplayManifest } from '@highsea-tv/api-contract'
import type { TitleType } from '@highsea-tv/client/data'
import { createFormat } from '@highsea-tv/client/format'
import {
  chromeShown,
  countsDown,
  createPlayerText,
  cuesAt,
  cueText,
  filmUpNext,
  HIDE_MS,
  leavePlayer,
  NUDGE_MS,
  nextChange,
  nextUpIn,
  playNext,
  SEEK_S,
  SPEEDS,
  streamState,
  titlePage,
  trickplayTile,
  type UpNext,
} from '@highsea-tv/client/player'
import { usePlaybackPrefs } from '@highsea-tv/client/prefs'
import { episodePlayPath } from '@highsea-tv/client/shows'
import type { T } from '@highsea-tv/i18n'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { type Playback, TRANSCODE_LIMIT } from '@highsea-tv/native/playback'
import { useQuery } from '@highsea-tv/sdk/react'
import type { ColorRole } from '@highsea-tv/tokens'
import { alpha, Button, Icon, type IconName, Press, Text, tokens, useTheme } from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { type Href, router } from 'expo-router'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  View,
} from 'react-native'
import { playerScreenMessages as messages } from './messages.ts'

const { space, radius } = tokens

export const { clock } = createFormat()
export const playerText = createPlayerText()

/** The scrims over the picture, the prototype's: a message's, and the waiting badge's glass. */
export const SCRIM = 'rgba(0,0,0,0.72)'
/** The eyebrows' capitals, drawn so, while assistive technology reads the words. */
const UPPER = { textTransform: 'uppercase' } as const
export const GLASS = 'rgba(11,11,12,0.62)'

export type FilmUpNext = UpNext<ClientItem, number, string | null>

/**
 * An episode's Next up (player.md › Episodes): the next episode, counting down, with its place as
 * its line and the season it starts when it's another's first; none at the show's end.
 */
function episodeUpNext(n: ClientDetail | null, season: number | null): FilmUpNext | null {
  const place = n?.episode
  if (!n || !place) return null
  return {
    kind: 'episode',
    id: n.item.id,
    title: place.title,
    line: place.code,
    still: n.item.art.backdrop,
    season: season !== null && place.season !== season ? place.season : null,
  }
}

/** The next title takes the player's place: an episode's own address, or a film's. */
const go = (kind: FilmUpNext['kind'], to: number) =>
  kind === 'episode' ? router.replace(episodePlayPath(to) as Href) : playNext(router, to)

/**
 * The player's clock and what it decides: the time the screen draws at, moved on only when
 * something is due (Buffering's delay, or the controls hiding); the stream's state; Next up, its
 * countdown and the next film playing at zero; the trickplay manifest; and leaving.
 */
export function usePlayerModel(id: number, p: Playback, panel: boolean, type: TitleType = 'movie') {
  const { state, dispatch } = p
  const [now, setNow] = useState(() => Date.now())

  const versionId = p.version?.id
  const trickplay = useQuery(`client:trickplay:${type}:${id}:${versionId ?? ''}`, (c) =>
    versionId
      ? c.playback.trickplay({ params: { type, id }, query: { versionId } })
      : Promise.resolve(null),
  )
  const nextUp = useQuery(`client:next:${type}:${id}`, (c) =>
    c.playback.next({ params: { type, id } }),
  )
  const d = p.detail.data
  // an episode's next is the next episode, read as a title for its place: the card says when a
  // season starts (the prototype's client/stream-states.tsx). Films read nothing more
  const nextEpisodeId = type === 'episode' ? (nextUp.data?.item?.id ?? 0) : 0
  const nextEpisode = useQuery(`client:episode:${nextEpisodeId}`, (c) =>
    nextEpisodeId
      ? c.library.item({ params: { type: 'episode', id: nextEpisodeId } })
      : Promise.resolve(null),
  )
  const next: FilmUpNext | null =
    type === 'episode'
      ? episodeUpNext(nextEpisode.data ?? null, d?.episode?.season ?? null)
      : nextUp.data
        ? filmUpNext(
            nextUp.data.item
              ? {
                  id: nextUp.data.item.id,
                  title: nextUp.data.item.title,
                  still: nextUp.data.item.art.backdrop,
                }
              : null,
            d?.collection?.name ?? null,
            d?.related ?? [],
          )
        : null
  const autoplay = usePlaybackPrefs().current?.autoplayNext ?? true
  const counting = countsDown(next) && autoplay
  const stream = streamState(state, now, !!next)
  const left = nextUpIn(state)

  const wake = useCallback(() => {
    const at = Date.now()
    dispatch({ type: 'input', at })
    setNow(at)
  }, [dispatch])
  const hide = useCallback(() => dispatch({ type: 'input', at: 0 }), [dispatch])

  // the next moment the drawing changes on its own, against the `now` it was drawn with: the
  // state changes with every time update, which clears the timer, so a moment that passed before
  // the timer fired is still due and fires at once, or the controls would never hide
  useEffect(() => {
    const t0 = Date.now()
    const due = [nextChange(state, now), state.playing ? state.inputAt + HIDE_MS : null].filter(
      (x): x is number => x !== null && x > now,
    )
    if (!due.length) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(...due) - t0 + 10))
    return () => clearTimeout(timer)
  }, [state, now])

  // at zero the next part plays; Cancel lets this one end as before. Choices never count down
  useEffect(() => {
    if (stream === 'next-up' && left === 0 && counting && next) go(next.kind, next.id)
  }, [stream, left, counting, next])

  const waiting = stream === 'preparing' || stream === 'buffering'
  const message = stream === 'failed' || stream === 'stopped'
  return {
    now,
    wake,
    hide,
    stream,
    waiting,
    message,
    /** The controls show: woken, paused, a panel open, or the stream waiting. */
    shown: chromeShown(state, now, panel) || waiting,
    next,
    counting,
    left,
    manifest: (trickplay.data?.manifest ?? null) as TrickplayManifest | null,
    leave: () => leavePlayer(router, titlePage(d, id)),
    /** Next up's Play now: the next episode, a collection's next part, or a choice. */
    play: (to: number) => go(next?.kind ?? 'part', to),
    cancelNext: () => dispatch({ type: 'cancel-next' }),
  }
}

export type PlayerModel = ReturnType<typeof usePlayerModel>

/** One of the player's own round controls over the picture (controls.md › Rules: they may stay round). */
export function Round({
  icon,
  label,
  size = 44,
  iconSize = 22,
  tint,
  filled,
  flip,
  pressed,
  expanded,
  onPress,
}: {
  icon: IconName
  label: string
  size?: number
  iconSize?: number
  tint?: ColorRole
  filled?: boolean
  /** Mirrored: Forward is Back's icon turned round. */
  flip?: boolean
  /** A toggle's state (Mute, Picture in picture). */
  pressed?: boolean
  /** What it opens shows (Audio and subtitles). */
  expanded?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={
        pressed !== undefined
          ? { checked: pressed }
          : expanded !== undefined
            ? { expanded }
            : undefined
      }
      style={({ hovered }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled
          ? alpha(theme.colors.text, 0.14)
          : hovered
            ? alpha(theme.colors.text, 0.12)
            : undefined,
      })}
    >
      <View style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
        <Icon name={icon} size={iconSize} color={tint ?? 'text'} />
      </View>
    </Press>
  )
}

/** The trickplay frame for a time, cut from its sheet and shown `width` wide. */
export function Preview({
  id,
  versionId,
  manifest,
  seconds,
  width,
}: {
  id: number
  versionId: string
  manifest: TrickplayManifest
  seconds: number
  width: number
}) {
  const theme = useTheme()
  const media = useMedia()
  const tile = trickplayTile(manifest, seconds)
  if (!tile) return null
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
        borderRadius: 4 * theme.u,
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

/** Where along the bar a press or the pointer is, on the web from the element's own box. */
function xIn(e: GestureResponderEvent | { nativeEvent: unknown; currentTarget: unknown }) {
  const el = e.currentTarget as { getBoundingClientRect?: () => { left: number } } | null
  const n = e.nativeEvent as { clientX?: number; locationX?: number }
  if (el?.getBoundingClientRect && n.clientX !== undefined)
    return n.clientX - el.getBoundingClientRect().left
  return n.locationX ?? 0
}

/**
 * The position on a pointer and on touch: the frame under the finger or the pointer shows while
 * dragging, and over the bar with a pointer; the seek happens on letting go, so a drag asks the
 * server for one place, not many. It's an adjustable for assistive technology, which seeks 10 s.
 */
export function Scrubber({
  p,
  id,
  manifest,
  onDrag,
  hover,
}: {
  p: Playback
  id: number
  manifest: TrickplayManifest | null
  onDrag: () => void
  /** A pointer's preview follows it over the bar. */
  hover?: boolean
}) {
  const t = useT(messages)
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const { position, duration } = p.state
  const at = (x: number) =>
    duration && width ? Math.max(0, Math.min(1, x / width)) * duration : null
  const shown = drag ?? position
  const f = duration ? Math.min(1, shown / duration) : 0
  const preview = drag ?? over
  const versionId = p.version?.id
  const pf = duration && preview !== null ? Math.min(1, preview / duration) : 0
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('position')}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={t('positionText', { at: clock(position), total: clock(duration) })}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) =>
        p.seekBy(e.nativeEvent.actionName === 'increment' ? SEEK_S : -SEEK_S)
      }
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        onDrag()
        setDrag(at(xIn(e)))
      }}
      onResponderMove={(e) => {
        onDrag()
        setDrag(at(xIn(e)))
      }}
      onResponderRelease={() => {
        if (drag !== null) p.seekTo(drag)
        setDrag(null)
      }}
      onResponderTerminate={() => setDrag(null)}
      {...(hover
        ? {
            onPointerMove: (e: { nativeEvent: unknown; currentTarget: unknown }) =>
              setOver(at(xIn(e))),
            onPointerLeave: () => setOver(null),
          }
        : {})}
      style={{ height: 32, justifyContent: 'center' }}
    >
      {preview !== null && manifest && versionId ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 36,
            left: Math.max(0, Math.min(width - 160, pf * width - 80)),
            alignItems: 'center',
            gap: space['1'],
          }}
        >
          <Preview
            id={id}
            versionId={versionId}
            manifest={manifest}
            seconds={preview}
            width={160}
          />
          <Text variant="mono" mono>
            {clock(preview)}
          </Text>
        </View>
      ) : null}
      <View style={{ height: 4, borderRadius: 2, backgroundColor: alpha(theme.colors.text, 0.25) }}>
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
          backgroundColor: theme.colors.text,
        }}
      />
    </View>
  )
}

/** The subtitle's lines showing now, with the person's offset, where the engine hands cues over. */
export function CueLine({ p }: { p: Playback }) {
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const u = theme.u
  const lines = cuesAt(p.cues, p.state.position, p.offsetMs)
  if (!lines.length) return null
  return (
    <View pointerEvents="none" style={{ alignItems: 'center', gap: 2 * u }}>
      {lines.map((line) => (
        <Text
          key={line}
          size={tv ? 1.8 : 17}
          weight={600}
          align="center"
          style={{
            color: theme.colors.text,
            backgroundColor: 'rgba(0,0,0,0.6)',
            paddingHorizontal: (tv ? 0.5 : 6) * (tv ? u : 1),
            borderRadius: (tv ? 0.2 : 2) * (tv ? u : 1),
            maxWidth: '80%',
          }}
        >
          {cueText(line)}
        </Text>
      ))}
    </View>
  )
}

/**
 * The timing's live preview: the line's speech and the subtitle as two bars on one time axis, so
 * a nudge shows which way the subtitle moved, 1 px per 10 ms within ±600 ms (the TV's in its units).
 */
export function NudgePreview({ offsetMs }: { offsetMs: number }) {
  const t = useT(messages)
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const u = theme.u
  // the TV's 1920 points are its 100u: a pixel there is u / 19.2
  const px = tv ? u / 19.2 : 1
  const [width, setWidth] = useState(0)
  const shift = (Math.max(-600, Math.min(600, offsetMs)) / 10) * px
  const bar = 120 * px
  const label = { position: 'absolute', left: 8 * px } as const
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={{
        height: 48 * px,
        overflow: 'hidden',
        borderRadius: 6 * px,
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
          top: 8 * px,
          left: width / 2 - bar / 2,
          width: bar,
          height: 12 * px,
          borderRadius: 6 * px,
          backgroundColor: alpha(theme.colors['text-3'], 0.6),
        }}
      />
      <Text variant="caption" mono color="text-3" style={[label, { top: 6 * px }]}>
        {t('speech')}
      </Text>
      <View
        style={{
          position: 'absolute',
          bottom: 8 * px,
          left: width / 2 - bar / 2 + shift,
          width: bar,
          height: 12 * px,
          borderRadius: 6 * px,
          backgroundColor: theme.colors['accent-fill'],
        }}
      />
      <Text variant="caption" mono color="text-3" style={[label, { bottom: 6 * px }]}>
        {t('subtitle')}
      </Text>
    </View>
  )
}

/** Getting it ready and Buffering: a spinner over the picture, under the controls. */
export function Waiting({ preparing }: { preparing: boolean }) {
  const t = useT(messages)
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const u = theme.u
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        accessibilityRole="progressbar"
        accessibilityLiveRegion="polite"
        accessibilityLabel={preparing ? t('preparing') : t('buffering')}
        style={{
          alignItems: 'center',
          gap: tv ? 0.8 * u : 8,
          paddingHorizontal: preparing ? (tv ? 2.4 * u : 24) : tv ? 1.4 * u : 16,
          paddingVertical: preparing ? (tv ? 1.6 * u : 16) : tv ? 1.4 * u : 16,
          borderRadius: preparing ? (tv ? 1 * u : 12) : 999,
          backgroundColor: GLASS,
        }}
      >
        {/* the box above is the progress bar, with its name; the spinner only draws it */}
        <ActivityIndicator aria-hidden size="large" color={theme.colors.text} />
        {preparing ? (
          <>
            <Text variant={tv ? 'rowTitle' : 'title'}>{t('preparing')}</Text>
            <Text variant={tv ? 'pill' : 'caption'} color="text-2" align="center">
              {t('preparingBody')}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  )
}

/** A stream's message's words: didn't start (or the server's busy), or stopped from Now playing. */
export function useMessageWords(p: Playback) {
  const t = useT(messages)
  const failed = p.state.phase === 'failed'
  const by = p.state.stoppedBy
  return {
    failed,
    title: failed ? t('failed') : t('stopped', { name: by?.name ?? '' }),
    quote: !failed && by?.message ? `“${by.message}”` : null,
    body: failed
      ? p.state.error === TRANSCODE_LIMIT
        ? t('failedLimit')
        : t('failedBody')
      : t('stoppedBody'),
    again: failed ? t('tryAgain') : t('startAgain'),
    back: t('back'),
  }
}

/** Didn't start, or stopped from Now playing, with a pointer or on touch: over a scrim. */
export function StreamMessage({ p, onBack }: { p: Playback; onBack: () => void }) {
  const theme = useTheme()
  const w = useMessageWords(p)
  return (
    <View
      accessibilityViewIsModal
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: SCRIM,
        alignItems: 'center',
        justifyContent: 'center',
        padding: space['6'],
        zIndex: 30,
      }}
    >
      <View style={{ maxWidth: 448, alignItems: 'center', gap: space['3'] }}>
        <Text variant="title" align="center" accessibilityRole="header">
          {w.title}
        </Text>
        {w.quote ? (
          <View
            style={{
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: theme.colors.line,
              backgroundColor: alpha(theme.colors.s2, 0.8),
              paddingHorizontal: space['4'],
              paddingVertical: space['2'],
            }}
          >
            <Text variant="body">{w.quote}</Text>
          </View>
        ) : null}
        <Text variant="body" color="text-2" align="center">
          {w.body}
        </Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['2'], marginTop: space['2'] }}
        >
          <Button variant="primary" onPress={p.retry}>
            {w.again}
          </Button>
          <Button onPress={onBack}>{w.back}</Button>
        </View>
      </View>
    </View>
  )
}

/**
 * Next up's card with a pointer and on touch (player.md › Next up), in a film's last seconds: its
 * collection's next part, counting down when the person has Autoplay on, or three of More like
 * this, which play only when picked.
 */
export function NextUpCard({
  m,
  place,
}: {
  m: PlayerModel
  /** Where it sits: the right and bottom insets, and its widths for a part and for choices. */
  place: { right: number; bottom: number; part: number; choices: number }
}) {
  const t = useT(messages)
  const theme = useTheme()
  const media = useMedia()
  const next = m.next
  if (m.stream !== 'next-up' || !next) return null
  const eyebrow = (text: string) => (
    <Text variant="label" mono color="text-2" accessibilityRole="header" style={UPPER}>
      {text}
    </Text>
  )
  const box = {
    position: 'absolute',
    right: place.right,
    bottom: place.bottom,
    width: next.kind === 'choices' ? place.choices : place.part,
    maxWidth: '90%',
    gap: space['3'],
    padding: space['4'],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: alpha(theme.colors.bg, 0.8),
    boxShadow: tokens.elevation[4].boxShadow,
    zIndex: 30,
  } as const
  if (next.kind === 'choices')
    return (
      <View style={box} accessibilityLabel={t('moreLike')}>
        {eyebrow(t('moreLike'))}
        <View style={{ flexDirection: 'row', gap: space['3'] }}>
          {next.items.map((item) => (
            <Press
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              onPress={() => m.play(item.id)}
              style={{ flex: 1, minWidth: 0, gap: 6 }}
            >
              <Image
                source={media(item.art.backdrop)}
                style={{
                  width: '100%',
                  aspectRatio: 16 / 9,
                  borderRadius: 4,
                  backgroundColor: theme.colors.s2,
                }}
                contentFit="cover"
              />
              <Text variant="caption" color="text-2" numberOfLines={1}>
                {item.title}
              </Text>
            </Press>
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Button onPress={m.cancelNext}>{t('close')}</Button>
        </View>
      </View>
    )
  return (
    <View style={box} accessibilityLabel={t('nextUp')}>
      <View style={{ flexDirection: 'row', gap: space['3'], alignItems: 'center' }}>
        <Image
          source={next.still ? media(next.still) : undefined}
          style={{
            width: 96,
            aspectRatio: 16 / 9,
            borderRadius: 4,
            backgroundColor: theme.colors.s2,
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow(nextHeading(t, next))}
          <Text variant="body" weight={600} numberOfLines={1}>
            {next.title}
          </Text>
          <Text variant="caption" color="text-2" numberOfLines={1}>
            {[next.line || null, m.counting ? t('startsIn', { seconds: m.left }) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space['2'] }}>
        <Button variant="primary" icon="play" onPress={() => m.play(next.id)}>
          {t('playNow')}
        </Button>
        <Button onPress={m.cancelNext}>{t('cancel')}</Button>
      </View>
    </View>
  )
}

/** Next up's heading: Next episode, or the season it starts, for an episode; Next up otherwise. */
export function nextHeading(t: T<typeof messages>, next: Exclude<FilmUpNext, { kind: 'choices' }>) {
  if (next.kind !== 'episode') return t('nextUp')
  return next.season !== null ? t('seasonStarts', { season: next.season }) : t('nextEpisode')
}

/** One choice in a list of them: the whole row, its check before it. */
function Choice({
  label,
  detail,
  chosen,
  onPress,
}: {
  label: string
  detail?: string | null
  chosen: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  // on touch the check follows, as iOS's lists draw it, in rows of 44; with a pointer it leads
  const touch = theme.formFactor.input === 'touch'
  const check = (
    <View style={{ opacity: chosen ? 1 : 0 }}>
      <Icon name="check" size={touch ? 18 : 14} color={touch ? 'accent-text' : 'text'} />
    </View>
  )
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: chosen }}
      style={({ hovered }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: touch ? 12 : 8,
        minHeight: touch ? 44 : 40,
        paddingHorizontal: touch ? 0 : 10,
        borderRadius: 6,
        backgroundColor: hovered ? alpha(theme.colors.text, 0.08) : undefined,
      })}
    >
      {touch ? null : check}
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      {detail ? (
        <Text variant="caption" color="text-3">
          {detail}
        </Text>
      ) : null}
      {touch ? check : null}
    </Press>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space['1'] }} accessibilityRole="radiogroup" accessibilityLabel={title}>
      <Text variant="label" mono color="text-3" accessibilityRole="header" style={UPPER}>
        {title}
      </Text>
      {children}
    </View>
  )
}

/**
 * Audio and subtitles' lists with a pointer and on touch: the version (when there are several),
 * the audio, the subtitles with Off first, the speed where it's offered (a pointer's), and the
 * subtitle's timing with its live preview, saved for the film.
 */
export function TrackLists({
  p,
  speed,
}: {
  p: Playback
  speed?: { rate: number; setRate: (r: number) => void }
}) {
  const t = useT(messages)
  const v = p.version
  const d = p.detail.data
  if (!v || !d) return null
  // a version waiting for its file has nothing to play yet
  const versions = d.versions.filter((x) => x.playable || x.id === v.id)
  return (
    <View style={{ gap: space['5'] }}>
      {versions.length > 1 ? (
        <Group title={t('version')}>
          {versions.map((x) => (
            <Choice
              key={x.id}
              label={x.label}
              detail={x.detail?.split(' · ').slice(-1)[0]}
              chosen={x.id === v.id}
              onPress={() => p.setVersion(x.id)}
            />
          ))}
        </Group>
      ) : null}
      {v.audio.length > 0 ? (
        <Group title={t('audio')}>
          {v.audio.map((a) => (
            <Choice
              key={a.id}
              label={a.label}
              chosen={a.id === p.audio?.id}
              onPress={() => p.setAudio(a.id)}
            />
          ))}
        </Group>
      ) : null}
      <Group title={t('subtitles')}>
        {[null, ...v.subtitles].map((s) => (
          <Choice
            key={s?.id ?? 'off'}
            label={s ? s.label : t('off')}
            chosen={(s?.id ?? null) === (p.subtitle?.id ?? null)}
            onPress={() => p.setSubtitle(s?.id ?? null)}
          />
        ))}
        {p.pictureTrack ? (
          <Text variant="caption" color="text-3">
            {t('pictureTrack')}
          </Text>
        ) : null}
      </Group>
      {speed ? (
        <Group title={t('speed')}>
          {SPEEDS.map((x) => (
            <Choice
              key={x}
              label={playerText.speedLabel(x)}
              chosen={x === speed.rate}
              onPress={() => speed.setRate(x)}
            />
          ))}
        </Group>
      ) : null}
      {p.subtitle && !p.pictureTrack ? (
        <View style={{ gap: space['2'] }}>
          <Text variant="label" mono color="text-3" accessibilityRole="header" style={UPPER}>
            {t('timing')}
          </Text>
          {p.burnt ? (
            <Text variant="caption" color="text-3">
              {t('burntTiming')}
            </Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
                <Button
                  iconOnly
                  icon="remove"
                  accessibilityLabel={t('earlier', { ms: NUDGE_MS })}
                  onPress={() => p.nudge(-1)}
                />
                <Text
                  variant="body"
                  mono
                  align="center"
                  accessibilityLiveRegion="polite"
                  style={{ minWidth: 96 }}
                >
                  {playerText.offsetLabel(p.offsetMs)}
                </Text>
                <Button
                  iconOnly
                  icon="add"
                  accessibilityLabel={t('later', { ms: NUDGE_MS })}
                  onPress={() => p.nudge(1)}
                />
                <View style={{ marginStart: 'auto' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={p.offsetMs === 0}
                    onPress={() => p.nudge(0)}
                  >
                    {t('reset')}
                  </Button>
                </View>
              </View>
              <NudgePreview offsetMs={p.offsetMs} />
              <Text variant="caption" color="text-3">
                {`${playerText.offsetHint(p.offsetMs)} ${t('saved')}`}
              </Text>
            </>
          )}
        </View>
      ) : null}
    </View>
  )
}
