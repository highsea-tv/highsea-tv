// SPDX-License-Identifier: AGPL-3.0-only
// The player with a pointer (player.md › Web and desktop; the prototype's web/player.tsx, ported
// from apps/web's): a pointer's composition, since moving it shows the controls and the keyboard
// has its shortcuts (Space, ← →, M, F, Esc: ./picture.web.tsx's usePageInput). The title and the
// version at the top; a big Play over the frame while paused; the scrubber, the transport, the
// volume, the time, Audio and subtitles, picture in picture and full screen at the bottom; Audio
// and subtitles a panel at the right, with the speed. In the desktop app the window's own chrome
// is drawn over the film (WindowChrome's overlay), with room left at the top for it.
import { SEEK_S, titleLines } from '@highsea-tv/client/player'
import { useT } from '@highsea-tv/i18n/react'
import type { Playback } from '@highsea-tv/native/playback'
import { art, blur, line, player } from '@highsea-tv/tokens'
import {
  alpha,
  Button,
  glassOf,
  Icon,
  QualityTag,
  scrimOf,
  Text,
  tokens,
  useTheme,
} from '@highsea-tv/ui'
import { useState } from 'react'
import { type LayoutChangeEvent, Platform, ScrollView, View } from 'react-native'
import {
  TITLE_BAR_HEIGHT,
  TRAFFIC_LIGHT_ROOM,
  useWindowChrome,
  WindowChrome,
} from '../desktop/window.tsx'
import { playerScreenMessages as messages } from './messages.ts'
import {
  CueLine,
  clock,
  NextUpCard,
  type PlayerModel,
  Round,
  Scrubber,
  StreamMessage,
  TrackLists,
  Waiting,
} from './parts.tsx'
import { DRAWS_CUES, type MediaControls, usePageInput, usePicture } from './picture'

const { space } = tokens

/** The volume, 80 wide beside Mute from a regular width: 5% a step. */
function Volume({ c }: { c: MediaControls }) {
  const t = useT(messages)
  const theme = useTheme()
  const [width, setWidth] = useState(0)
  const level = c.muted ? 0 : c.volume
  const set = (x: number) => {
    if (width) c.setVolume(Math.max(0, Math.min(1, x / width)))
  }
  const step = (by: number) =>
    c.setVolume(Math.max(0, Math.min(1, Math.round((level + by) * 20) / 20)))
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('volume')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      aria-valuetext={c.muted ? t('muted') : t('volumeText', { percent: Math.round(level * 100) })}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}
      style={{
        width: player.volume.width,
        height: tokens.targets.pointer,
        marginHorizontal: space['2'],
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          height: player.volume.track,
          borderRadius: tokens.radius.pill,
          backgroundColor: alpha(theme.colors.text, 0.25),
        }}
      >
        <View
          style={{
            width: `${level * 100}%`,
            height: player.volume.track,
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors.text,
          }}
        />
      </View>
    </View>
  )
}

/**
 * The web blurs the film behind the panel (react-native-web's backdropFilter) by the scrim's
 * token, as the prototype's glass-scrim did, so the top bar and its badge don't read through it.
 */
const PANEL_BLUR =
  Platform.OS === 'web' ? ({ backdropFilter: `blur(${blur.scrim.radius}px)` } as object) : null

export function PointerPlayer({
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
  const regular = theme.formFactor.widthClass === 'regular'
  const windowChrome = useWindowChrome()
  const { state } = p
  const chrome = m.shown
  const { picture, controls: c } = usePicture(p, { dim: false, raised: chrome })
  const pip = c.pip.on
  const d = p.detail.data
  const v = p.version
  const { wake } = m

  usePageInput({
    enabled: true,
    hideCursor: !chrome,
    onMove: wake,
    onKey: (e) => {
      wake()
      const target = e.target as { closest?: (s: string) => unknown } | null
      const within = (s: string) => !!target?.closest?.(s)
      const inControl = within('input, aside, [role="slider"], [role="dialog"]')
      if (e.key === ' ' && !within('button, input, [role="button"]')) {
        e.preventDefault()
        p.toggle()
      } else if (e.key === 'ArrowLeft' && !inControl) p.seekBy(-SEEK_S)
      else if (e.key === 'ArrowRight' && !inControl) p.seekBy(SEEK_S)
      else if ((e.key === 'm' || e.key === 'M') && !within('input')) c.toggleMute()
      else if ((e.key === 'f' || e.key === 'F') && !within('input')) c.fullScreen?.toggle()
      else if (e.key === 'Escape') {
        if (panel) setPanel(false)
        else m.leave()
      }
    },
  })

  const gutter = regular ? space['8'] : space['4']
  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: art.black }}>
      {picture}
      <View
        accessibilityRole="header"
        accessibilityLabel={t('playing', { title: titleLines(d).title })}
      />

      {pip ? (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            alignItems: 'center',
            justifyContent: 'center',
            gap: space['4'],
            backgroundColor: art.black,
          }}
        >
          <Icon name="picture-in-picture" size={player.pictureIcon} color="text-2" />
          <Text variant="body" color="text-2">
            {t('pipShowing')}
          </Text>
          <Button onPress={c.pip.toggle}>{t('pipBack')}</Button>
        </View>
      ) : null}

      {DRAWS_CUES && !pip ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: chrome ? '22%' : '16%' }}
        >
          <CueLine p={p} />
        </View>
      ) : null}

      {/* the player's own controls over the picture, which may stay round (controls.md › Rules) */}
      <View
        pointerEvents={chrome ? 'box-none' : 'none'}
        style={{ position: 'absolute', inset: 0, opacity: chrome ? 1 : 0 }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: space['3'],
            paddingHorizontal: gutter,
            paddingTop: windowChrome === 'bar' ? TITLE_BAR_HEIGHT + space['4'] : space['4'],
            paddingBottom: space['4'],
            backgroundImage: `linear-gradient(180deg, ${scrimOf(70)}, transparent)`,
          }}
        >
          {windowChrome === 'mac' ? <View style={{ width: TRAFFIC_LIGHT_ROOM }} /> : null}
          <Round
            icon="arrow-left"
            label={t('backToDetails')}
            iconSize={tokens.icon.size.md}
            onPress={m.leave}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="title" weight={600} numberOfLines={1}>
              {titleLines(d).title}
            </Text>
            {v?.detail || titleLines(d).line ? (
              <Text variant="caption" color="text-2" numberOfLines={1}>
                {[titleLines(d).line, v?.detail].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          {v ? <QualityTag overlay>{v.label}</QualityTag> : null}
        </View>

        {!state.playing && !m.waiting && !m.message ? (
          // a big target over the frame; the transport's Play is the one assistive tech uses
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            aria-hidden
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginTop: -player.round.xl / 2,
              marginLeft: -player.round.xl / 2,
              width: player.round.xl,
              height: player.round.xl,
              borderRadius: tokens.radius.pill,
              overflow: 'hidden',
              backgroundColor: glassOf(theme.colors),
            }}
          >
            <Round
              icon="play"
              label={t('play')}
              size={player.round.xl}
              iconSize={player.icon.xl}
              onPress={p.toggle}
            />
          </View>
        ) : null}

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            gap: space['2'],
            paddingHorizontal: gutter,
            paddingTop: space['16'],
            paddingBottom: space['4'],
            backgroundImage: `linear-gradient(180deg, transparent, ${scrimOf(80)})`,
          }}
        >
          <Scrubber p={p} id={id} manifest={m.manifest} onDrag={wake} hover />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] }}>
            <Round
              icon={state.playing ? 'pause' : 'play'}
              label={state.playing ? t('pause') : t('play')}
              onPress={p.toggle}
            />
            <Round
              icon="replay"
              iconSize={tokens.icon.size.md}
              label={t('backBy', { seconds: SEEK_S })}
              onPress={() => p.seekBy(-SEEK_S)}
            />
            <Round
              icon="forward"
              iconSize={tokens.icon.size.md}
              label={t('forwardBy', { seconds: SEEK_S })}
              onPress={() => p.seekBy(SEEK_S)}
            />
            {/* phones and tablets set the volume with their own buttons; this leaves Picture in
                picture and Full screen room at a compact width */}
            {regular ? (
              <>
                <Round
                  icon={c.muted || c.volume === 0 ? 'mute' : 'sound'}
                  iconSize={tokens.icon.size.md}
                  label={c.muted ? t('unmute') : t('mute')}
                  pressed={c.muted}
                  onPress={c.toggleMute}
                />
                <Volume c={c} />
              </>
            ) : null}
            <Text
              variant="mono"
              mono
              color="text-2"
              style={{ marginStart: space['2'] }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {`${clock(state.position)} / ${clock(state.duration)}`}
            </Text>
            <View style={{ marginStart: 'auto' }}>
              <Round
                icon="subtitles"
                iconSize={tokens.icon.size.md}
                label={t('tracks')}
                expanded={panel}
                onPress={() => setPanel(!panel)}
              />
            </View>
            {c.pip.available ? (
              <Round
                icon="picture-in-picture"
                iconSize={tokens.icon.size.md}
                label={t('pip')}
                pressed={pip}
                onPress={c.pip.toggle}
              />
            ) : null}
            {c.fullScreen ? (
              <Round
                icon="view"
                iconSize={tokens.icon.size.md}
                label={c.fullScreen.on ? t('exitFullScreen') : t('fullScreen')}
                onPress={c.fullScreen.toggle}
              />
            ) : null}
          </View>
        </View>
      </View>

      {panel ? (
        <View
          accessibilityRole="complementary"
          accessibilityLabel={t('tracks')}
          aria-label={t('tracks')}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: '100%',
            maxWidth: player.panel.width,
            borderStartWidth: line.thin,
            borderColor: theme.colors.line,
            backgroundColor: alpha(theme.colors.bg, 0.8),
            zIndex: 20,
            ...PANEL_BLUR,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: space['5'],
              paddingTop: windowChrome === 'bar' ? TITLE_BAR_HEIGHT + space['4'] : space['4'],
              paddingBottom: space['2'],
            }}
          >
            <Text variant="title" accessibilityRole="header">
              {t('tracks')}
            </Text>
            <Button
              variant="ghost"
              iconOnly
              icon="close"
              accessibilityLabel={t('close')}
              onPress={() => setPanel(false)}
            />
          </View>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: space['5'], paddingBottom: space['5'] }}
          >
            <TrackLists p={p} speed={{ rate: c.rate, setRate: c.setRate }} />
          </ScrollView>
        </View>
      ) : null}
      {m.waiting && !m.message ? <Waiting preparing={m.stream === 'preparing'} /> : null}
      {m.message ? <StreamMessage p={p} onBack={m.leave} /> : null}
      <NextUpCard m={m} place={{ right: 32, bottom: 112, part: 320, choices: 512 }} />
      {/* the desktop app's window chrome over the film: a title bar on Windows and Linux, macOS's
          own buttons there already; nothing outside the app */}
      <WindowChrome overlay />
    </View>
  )
}
