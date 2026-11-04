// SPDX-License-Identifier: AGPL-3.0-only
// The player on touch (player.md › Phone; the prototype's mobile/player.tsx): touch's composition,
// since a tap rather than a pointer shows the controls. It turns with the phone. A tap shows or hides the controls; Back, the title, AirPlay, picture in
// picture and Audio and subtitles sit at the top, Back 10, Play and Forward 10 in the middle, the
// times and the scrubber at the bottom. AirPlay is iOS's own picker (./picture.tsx); while the film
// plays on another screen, the controls stay up over the dimmed picture and say so. Audio and
// subtitles is a sheet.
import { SEEK_S, titleLines } from '@highsea-tv/client/player'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import type { Playback } from '@highsea-tv/native/playback'
import { family, Icon, Press, Sheet, Text, tokens, useTheme } from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import { airPlayButton, DRAWS_CUES, HAS_AIRPLAY, useExternal, usePicture } from './picture'

const { space } = tokens

/** The scrim under the controls, the prototype's. */
const SCRIM = 'rgba(0,0,0,0.45)'
const SOFT = 'rgba(237,237,238,0.8)'

export function TouchPlayer({
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
  const insets = useSafeAreaInsets()
  const media = useMedia()
  const { state } = p
  const external = useExternal(p)
  const { picture, controls } = usePicture(p, { dim: external, raised: m.shown })
  const pip = controls.pip.on
  const d = p.detail.data
  // a message over the frame has the screen to itself; on another screen the controls stay up
  const chrome = !m.message && !pip && (external || m.shown)
  const top = Math.max(insets.top, 12)
  const side = Math.max(insets.left, insets.right, 16)
  const { wake, hide } = m

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {picture}
      {external && d?.item.art.backdrop ? (
        <Image
          source={media(d.item.art.backdrop)}
          style={{ position: 'absolute', inset: 0, opacity: 0.35 }}
          contentFit="cover"
          blurRadius={2}
        />
      ) : null}
      <Press
        accessibilityRole="button"
        accessibilityLabel={chrome ? t('hideControls') : t('showControls')}
        onPress={() => (chrome && state.playing && !external ? hide() : wake())}
        ring={false}
        style={{ position: 'absolute', inset: 0 }}
      >
        {null}
      </Press>
      {external ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '19%',
            alignItems: 'center',
            gap: space['1'],
            zIndex: 1,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
            <Icon name="airplay" size={20} />
            <Text variant="body" size={17} weight={600}>
              {t('external')}
            </Text>
          </View>
          <Text variant="caption" size={13} color="text-2">
            {t('externalBody')}
          </Text>
        </View>
      ) : DRAWS_CUES ? (
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
      ) : null}

      {chrome ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', inset: 0, backgroundColor: SCRIM }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space['1'],
              paddingTop: top,
              paddingHorizontal: side,
            }}
          >
            <Round
              icon="chevron-down"
              label={t('backToDetails')}
              iconSize={tokens.icon.size.lg}
              onPress={m.leave}
            />
            <Text
              variant="body"
              size={17}
              weight={600}
              numberOfLines={1}
              style={{ flex: 1 }}
              accessibilityRole="header"
            >
              {titleLines(d).title}
            </Text>
            {HAS_AIRPLAY
              ? airPlayButton({
                  label: external ? t('airplayOn') : t('airplay'),
                  tint: theme.colors.text,
                  activeTint: theme.colors['accent-text'],
                  onOpen: wake,
                })
              : null}
            {controls.pip.available ? (
              <Round icon="picture-in-picture" label={t('pip')} onPress={controls.pip.toggle} />
            ) : null}
            <Round
              icon="subtitles"
              label={t('tracks')}
              expanded={panel}
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
              gap: space['12'],
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
            <Round
              icon="replay"
              flip
              label={t('forwardBy', { seconds: SEEK_S })}
              size={56}
              iconSize={28}
              onPress={() => {
                p.seekBy(SEEK_S)
                wake()
              }}
            />
          </View>
          <View
            style={{
              gap: space['1'],
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
              <Text size={12} style={{ color: SOFT, fontFamily: family(400, 'mono') }}>
                {clock(state.position)}
              </Text>
              <Text size={12} style={{ color: SOFT, fontFamily: family(400, 'mono') }}>
                {`−${clock(Math.max(0, state.duration - state.position))}`}
              </Text>
            </View>
            <Scrubber p={p} id={id} manifest={m.manifest} onDrag={wake} />
          </View>
        </View>
      ) : null}

      {m.waiting && !m.message ? <Waiting preparing={m.stream === 'preparing'} /> : null}
      {m.message ? <StreamMessage p={p} onBack={m.leave} /> : null}
      {!pip ? (
        <NextUpCard
          m={m}
          place={{
            right: Math.max(insets.right, 16) + 32,
            bottom: Math.max(insets.bottom, 16) + 56,
            part: 300,
            choices: 420,
          }}
        />
      ) : null}
      <Sheet open={panel} onClose={() => setPanel(false)} title={t('tracks')}>
        <TrackLists p={p} />
      </Sheet>
    </View>
  )
}
