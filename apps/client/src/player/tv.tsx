// SPDX-License-Identifier: AGPL-3.0-only
// The player on the TV (player.md › TV; the prototype's tv/player.tsx): the TV's composition, since
// the remote drives it rather than a pointer or a finger. The remote:
//   OK            play or pause            ← →  seek 10 s (on the scrubber)
//   ↓             to Audio and subtitles   Back  close the panel, hide the chrome, then leave
//   Play/Pause    play or pause, from anywhere
// Any key shows the chrome, which hides 3 s after the last one while playing; the scrubber keeps
// Left and Right inside a focus guide that traps them, so they seek instead of moving focus
// (@highsea-tv/ui/tv's FocusGuide and useRemote, on react-native-tvos's TVFocusGuideView and
// useTVEventHandler: https://github.com/react-native-tvos/react-native-tvos#readme). The chrome
// hides by fading what it draws, never the scrubber itself: the focus engine drops focus from a
// view under 0.01 alpha (Apple's "Supporting focus within your app"), and with nothing focused OK
// sends nothing. Audio and subtitles is the film page's TvTracks, kept open on a pick, with the
// subtitle timing under its groups.
import { OFF, picksOf } from '@highsea-tv/client/films'
import {
  backStep,
  chromeShown,
  NUDGE_MS,
  SCRUB_MS,
  SEEK_S,
  titleLines,
} from '@highsea-tv/client/player'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import type { Playback } from '@highsea-tv/native/playback'
import { art, line, player, tvText } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  family,
  glassOf,
  Icon,
  scrimOf,
  Text,
  tokens,
  useTheme,
} from '@highsea-tv/ui'
import {
  Focusable,
  FocusGuide,
  focusOn,
  TvMessage,
  useRemote,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useBack } from '../back.tsx'
import { TvTracks, type WatchWith } from '../detail/tracks.tsx'
import { playerScreenMessages as messages } from './messages.ts'
import {
  CueLine,
  clock,
  NudgePreview,
  nextHeading,
  type PlayerModel,
  Preview,
  playerText,
  SCRIM,
  useMessageWords,
  Waiting,
} from './parts.tsx'
import { usePicture } from './picture'

const tv = tokens.tv
const ptv = player.tv

/** The player's own picks as the film page's TvTracks takes them: a pick changes this play. */
function watchWithOf(p: Playback): WatchWith | null {
  const d = p.detail.data
  if (!d) return null
  return {
    ...picksOf(d.versions, {
      versionId: p.version?.id ?? null,
      audioId: p.audio?.id ?? null,
      subtitleId: p.subtitle?.id ?? null,
    }),
    error: null,
    pickVersion: p.setVersion,
    pickAudio: p.setAudio,
    pickSubtitle: (id: string) => p.setSubtitle(id === OFF ? null : id),
  } as WatchWith
}

/** Subtitle timing, under the panel's groups: Left and Right on its row nudge by 50 ms. */
function Timing({ p }: { p: Playback }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const [focused, setFocused] = useState(false)
  useRemote((e) => {
    if (!focused) return
    if (e.eventType === 'left') p.nudge(-1)
    else if (e.eventType === 'right') p.nudge(1)
  })
  const note = (text: string) => (
    <Text variant="pill" color="text-2">
      {text}
    </Text>
  )
  return (
    <View accessibilityLabel={t('timing')} style={{ gap: tv.space['3'] * u }}>
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
          <FocusGuide trapFocusLeft trapFocusRight>
            {/* biome-ignore lint/a11y/useValidAriaRole: React Native's accessibilityRole, not ARIA */}
            <Focusable
              role="adjustable"
              label={t('timingLabel', { ms: NUDGE_MS })}
              lift="none"
              radius={tv.radius.button * u}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: tv.space['5'] * u,
                paddingVertical: tv.space['3.5'] * u,
                backgroundColor: alpha(theme.colors.text, 0.12),
              }}
            >
              <Icon name="chevron-left" size={tokens.icon.sizeTv.min} />
              <Text variant="button" style={{ fontFamily: family(400, 'mono') }}>
                {playerText.offsetLabel(p.offsetMs)}
              </Text>
              <Icon name="chevron-right" size={tokens.icon.sizeTv.min} />
            </Focusable>
          </FocusGuide>
          <NudgePreview offsetMs={p.offsetMs} />
          {note(playerText.offsetHint(p.offsetMs))}
        </>
      )}
    </View>
  )
}

/** A stop that takes focus once its native view exists (a preferred focus over a focused screen doesn't move it). */
function useFirstFocus() {
  const first = useRef<ViewHandle>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => focusOn(first.current))
    return () => cancelAnimationFrame(frame)
  }, [])
  return first
}

/** A modal region that keeps focus inside. */
function Ask({ children, style }: { children: ReactNode; style: object }) {
  return (
    <FocusGuide
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
      accessibilityViewIsModal
      style={style}
    >
      {children}
    </FocusGuide>
  )
}

function TvStreamMessage({ p, onBack }: { p: Playback; onBack: () => void }) {
  const first = useFirstFocus()
  const w = useMessageWords(p)
  return (
    <Ask style={{ position: 'absolute', inset: 0, backgroundColor: SCRIM }}>
      <TvMessage
        title={w.title}
        actions={
          <>
            <Button ref={first} variant="primary" icon="refresh" onPress={p.retry}>
              {w.again}
            </Button>
            <Button variant="overlay" icon="chevron-left" onPress={onBack}>
              {w.back}
            </Button>
          </>
        }
      >
        {w.quote ? `${w.quote} ${w.body}` : w.body}
      </TvMessage>
    </Ask>
  )
}

function TvNextUp({ m }: { m: PlayerModel }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const first = useFirstFocus()
  const next = m.next
  if (!next) return null
  const box = {
    position: 'absolute',
    right: tv.safe.x * u,
    bottom: ptv.nextBottom * u,
    width: (next.kind === 'choices' ? ptv.nextChoices : ptv.next) * u,
    gap: tv.space['5'] * u,
    padding: tv.space['7'] * u,
    borderRadius: tv.radius.panel * u,
    borderWidth: line.thin,
    borderColor: theme.colors.line,
    backgroundColor: alpha(theme.colors.bg, 0.8),
    boxShadow: tokens.elevation[4].boxShadow,
  } as const
  if (next.kind === 'choices')
    return (
      <Ask style={box}>
        <Text variant="eyebrow" color="text-2" accessibilityRole="header">
          {t('moreLike')}
        </Text>
        <View style={{ flexDirection: 'row', gap: tv.space['5'] * u }}>
          {next.items.map((item, i) => (
            <Focusable
              key={item.id}
              ref={i === 0 ? first : undefined}
              role="button"
              label={item.title}
              lift="none"
              radius={tv.radius.sm * u}
              onPress={() => m.play(item.id)}
              style={{ flex: 1, minWidth: 0 }}
            >
              {(focused) => (
                <View style={{ gap: tv.space['3'] * u }}>
                  <Image
                    source={media(item.art.backdrop)}
                    style={{
                      width: '100%',
                      aspectRatio: 16 / 9,
                      borderRadius: tv.radius.sm * u,
                      backgroundColor: theme.colors.s2,
                    }}
                    contentFit="cover"
                  />
                  <Text variant="pill" color={focused ? 'text' : 'text-2'} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
              )}
            </Focusable>
          ))}
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Button variant="overlay" onPress={m.cancelNext}>
            {t('close')}
          </Button>
        </View>
      </Ask>
    )
  return (
    <Ask style={box}>
      <View style={{ flexDirection: 'row', gap: tv.space['5'] * u, alignItems: 'center' }}>
        <Image
          source={next.still ? media(next.still) : undefined}
          style={{
            width: ptv.upNextStill * u,
            aspectRatio: 16 / 9,
            borderRadius: tv.radius.sm * u,
            backgroundColor: theme.colors.s2,
          }}
          contentFit="cover"
        />
        <View style={{ flex: 1, minWidth: 0, gap: tv.space['1'] * u }}>
          <Text variant="eyebrow" color="text-2" accessibilityRole="header">
            {nextHeading(t, next)}
          </Text>
          <Text variant="rowTitle" numberOfLines={1}>
            {next.title}
          </Text>
          <Text variant="pill" color="text-2" numberOfLines={1}>
            {[next.line, m.counting ? t('startsIn', { seconds: m.left }) : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: tv.space['5'] * u }}>
        <Button ref={first} variant="primary" icon="play" onPress={() => m.play(next.id)}>
          {t('playNow')}
        </Button>
        <Button variant="overlay" onPress={m.cancelNext}>
          {t('cancel')}
        </Button>
      </View>
    </Ask>
  )
}

export function TvPlayer({
  id,
  p,
  m,
  panel,
  setPanel,
}: {
  id: number
  p: Playback
  m: PlayerModel
  panel: boolean
  setPanel: (open: boolean) => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const { state, dispatch } = p
  const { picture } = usePicture(p, { dim: false, raised: false })
  // the preview shows while seeking by key, until SCRUB_MS after the last press
  const [scrubAt, setScrubAt] = useState(0)
  const seeking = scrubAt > 0
  const [onScrubber, setOnScrubber] = useState(false)
  const scrubber = useRef<ViewHandle>(null)
  const asking = m.message || m.stream === 'next-up'
  const chrome = !m.message && m.shown
  const { wake } = m

  // any key shows the chrome but Back, which hides it (useBack below); Play/Pause works from
  // anywhere, Left and Right seek on the scrubber. The handler also hears focus moving, as
  // `focus` and `blur` (react-native-tvos's RCTTVNavigationEventNotification), which isn't a key:
  // focusing the scrubber as the chrome hides would wake it again
  const onEvent = useCallback(
    (e: { eventType: string }) => {
      if (e.eventType === 'menu' || e.eventType === 'focus' || e.eventType === 'blur') return
      wake()
      if (e.eventType === 'playPause') p.toggle()
      else if (onScrubber && (e.eventType === 'left' || e.eventType === 'right')) {
        setScrubAt(Date.now())
        p.seekBy(e.eventType === 'left' ? -SEEK_S : SEEK_S)
      }
    },
    [wake, p, onScrubber],
  )
  useRemote(onEvent)
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

  // the panel registers its own Back while it's open (TvTracks), so its step is the panel's
  useBack(() => {
    const step = backStep({
      panel,
      shown: chromeShown(state, Date.now(), false),
      playing: state.playing,
    })
    if (step === 'close-panel') setPanel(false)
    else if (step === 'hide') dispatch({ type: 'input', at: 0 })
    else m.leave()
    return true
  })

  const d = p.detail.data
  const v = p.version
  const versionId = v?.id
  const { position, duration } = state
  const fraction = duration ? Math.min(1, position / duration) : 0
  const safeX = tv.safe.x * u
  const safeY = tv.safe.y * u
  const shown = chrome ? 1 : 0
  const muted = { color: theme.colors['text-2'], fontFamily: family(400, 'mono') }
  const w = panel ? watchWithOf(p) : null

  return (
    <View style={{ flex: 1, backgroundColor: art.black }}>
      {picture}
      <View
        accessibilityRole="header"
        accessibilityLabel={t('playing', { title: titleLines(d).title })}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: safeX, right: safeX, bottom: chrome ? '24%' : '9%' }}
      >
        <CueLine p={p} />
      </View>

      {!m.message && (
        <View pointerEvents="box-none" style={{ position: 'absolute', inset: 0 }}>
          <View
            style={{
              opacity: shown,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: tv.space['6'] * u,
              paddingHorizontal: safeX,
              paddingTop: safeY,
              paddingBottom: tv.space['20'] * u,
              backgroundImage: `linear-gradient(180deg, ${scrimOf(70)}, transparent)`,
            }}
          >
            <View style={{ flex: 1, gap: tv.space['1.5'] * u }}>
              <Text size={tvText.title.size} weight={600} numberOfLines={1}>
                {titleLines(d).title}
              </Text>
              {v || titleLines(d).line ? (
                <Text variant="meta" color="text-2" numberOfLines={1}>
                  {[titleLines(d).line, v?.detail].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            {v ? (
              <View
                style={{
                  paddingHorizontal: tv.space['2.5'] * u,
                  paddingVertical: ptv.chipY * u,
                  borderRadius: tv.radius.pill * u,
                  backgroundColor: glassOf(theme.colors),
                }}
              >
                <Text variant="quality">{v.label}</Text>
              </View>
            ) : null}
          </View>
          {chrome && !state.playing && !m.waiting ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: ptv.play * u,
                height: ptv.play * u,
                marginLeft: (-ptv.play / 2) * u,
                marginTop: (-ptv.play / 2) * u,
                borderRadius: tokens.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: glassOf(theme.colors),
              }}
            >
              <Icon name="play" size={ptv.playIcon} />
            </View>
          ) : null}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              gap: tv.space['6'] * u,
              paddingHorizontal: safeX,
              paddingTop: ptv.fade * u,
              paddingBottom: safeY,
              backgroundImage: chrome
                ? `linear-gradient(180deg, transparent, ${scrimOf(80)})`
                : undefined,
            }}
          >
            <View>
              {seeking && m.manifest && versionId ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: tv.space['8'] * u,
                    left: `${fraction * 100}%`,
                    marginLeft: (-ptv.preview / 2) * u,
                  }}
                >
                  <Preview
                    id={id}
                    versionId={versionId}
                    manifest={m.manifest}
                    seconds={position}
                    width={ptv.preview * u}
                  />
                </View>
              ) : null}
              {/* Left and Right stay here, to seek; so does Down while the chrome is hidden, since
                  the key that wakes it would otherwise send focus toward Audio and subtitles
                  faded out, which can't take it, and leave nothing focused */}
              <FocusGuide trapFocusLeft trapFocusRight trapFocusDown={!chrome}>
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
                  style={{ height: ptv.scrubberHit * u, justifyContent: 'center' }}
                >
                  {(focused) => (
                    <View
                      accessibilityValue={{
                        text: t('positionText', { at: clock(position), total: clock(duration) }),
                      }}
                      style={{
                        opacity: shown,
                        height: (focused ? ptv.trackFocused : ptv.track) * u,
                        borderRadius: tv.radius.sm * u,
                        backgroundColor: alpha(theme.colors.text, 0.25),
                      }}
                    >
                      <View
                        style={{
                          width: `${fraction * 100}%`,
                          height: '100%',
                          borderRadius: tv.radius.sm * u,
                          backgroundColor: theme.colors['accent-fill'],
                        }}
                      />
                      {focused ? (
                        <View
                          style={{
                            position: 'absolute',
                            left: `${fraction * 100}%`,
                            top: '50%',
                            width: ptv.thumb * u,
                            height: ptv.thumb * u,
                            marginLeft: (-ptv.thumb / 2) * u,
                            marginTop: (-ptv.thumb / 2) * u,
                            borderRadius: tokens.radius.pill,
                            backgroundColor: theme.colors.text,
                          }}
                        />
                      ) : null}
                    </View>
                  )}
                </Focusable>
              </FocusGuide>
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
              style={{
                opacity: shown,
                flexDirection: 'row',
                alignItems: 'center',
                gap: tv.space['5'] * u,
              }}
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
                style={{ marginLeft: 'auto', flexDirection: 'row', gap: tv.space['8'] * u }}
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

      {w ? (
        <TvTracks
          w={w}
          stayOpen
          onClose={() => {
            // closing counts as input, so the chrome it leaves shown stays its 3 s and the next
            // Back hides it rather than leaving
            setPanel(false)
            wake()
          }}
        >
          {p.subtitle ? <Timing p={p} /> : null}
        </TvTracks>
      ) : null}
      {m.waiting && !m.message ? <Waiting preparing={m.stream === 'preparing'} /> : null}
      {m.message ? <TvStreamMessage p={p} onBack={m.leave} /> : null}
      {m.stream === 'next-up' && m.next ? <TvNextUp m={m} /> : null}
    </View>
  )
}
