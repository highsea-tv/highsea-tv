// SPDX-License-Identifier: AGPL-3.0-only
// A season's episode on a show's page, by touch and with a pointer (the prototypes' mobile/ and
// web/show.tsx, as Netflix, Infuse and the Apple TV app list a season): the still with its
// progress along the foot and a play mark, the number and title, the length and air date, and two
// lines of synopsis, the still and words playing it; Mark as watched at the end as its own button,
// its fill the secondary look once it's watched (the library's Button has no pressed look). By
// touch the synopsis runs under the row across its width; with a pointer it's beside the still,
// the play mark showing while the pointer is over the row, and the row's fill a step up. The TV
// lists episodes as stills in a Row of Posters instead (tv/show.tsx).

import { StyleSheet, View } from 'react-native'
import { Button } from './button.tsx'
import { glassOf } from './glass.ts'
import { Icon } from './icon.tsx'
import { Image } from './image.tsx'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'
import type { TileSource } from './tv/tiles.tsx'

const { space } = tokens

export type EpisodeRowProps = {
  still?: TileSource | null
  /** Its place in the season. */
  number: number
  title: string
  /** "42 min", or "21 min left" part way. */
  time: string
  /** "12 Mar 2024". */
  aired: string
  synopsis: string
  /** 0–1 through it, or null. */
  progress: number | null
  watched: boolean
  /** What the still and words are read as: "Play Season 1, Episode 2, Fault Lines, 42 min". */
  playLabel: string
  /** Mark as watched's name, with the episode's title. */
  markLabel: string
  onPlay: () => void
  onMark: () => void
}

/** The still's width with a pointer: the prototype's minmax(7.5rem, 14rem) at its widest. */
const POINTER_STILL = space['16'] * 3 + space['8']
/** By touch the still takes 42% of the row (mobile/show.tsx). */
const TOUCH_STILL = '42%'

export function EpisodeRow(props: EpisodeRowProps) {
  const pointer = useTheme().formFactor.input === 'pointer'
  return pointer ? <PointerEpisode {...props} /> : <TouchEpisode {...props} />
}

function Still({
  still,
  progress,
  shown = true,
  size,
}: Pick<EpisodeRowProps, 'still' | 'progress'> & { shown?: boolean; size: number }) {
  const theme = useTheme()
  const [w, h] = tokens.aspect.still
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: w / h,
        borderRadius: tokens.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {still ? <Image source={still} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      <View
        style={{
          opacity: shown ? 1 : 0,
          width: size,
          height: size,
          borderRadius: tokens.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: glassOf(theme.colors),
        }}
      >
        <Icon name="play" size={size * 0.45} filled />
      </View>
      {progress !== null ? (
        <View
          style={{
            position: 'absolute',
            start: space['2'],
            end: space['2'],
            bottom: space['2'],
            height: space['1'],
            borderRadius: tokens.radius.pill,
            overflow: 'hidden',
            backgroundColor: `${theme.colors.text}40`,
          }}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              borderRadius: tokens.radius.pill,
              backgroundColor: theme.colors.accent,
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

function Mark({ watched, markLabel, onMark }: EpisodeRowProps) {
  return (
    <Button
      variant={watched ? 'secondary' : 'ghost'}
      size="sm"
      icon="check"
      iconOnly
      accessibilityLabel={markLabel}
      accessibilityState={{ checked: watched }}
      onPress={onMark}
    />
  )
}

function TouchEpisode(props: EpisodeRowProps) {
  const { still, number, title, time, aired, synopsis, progress, playLabel, onPlay } = props
  return (
    <View style={{ gap: space['2'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] }}>
        <Press
          onPress={onPlay}
          accessibilityRole="link"
          accessibilityLabel={playLabel}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space['3'] }}
        >
          <View style={{ width: TOUCH_STILL }}>
            <Still still={still} progress={progress} size={space['8']} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: space['0.5'] }}>
            <Text variant="callout" weight={600} numberOfLines={2}>
              {`${number}. ${title}`}
            </Text>
            <Text variant="caption" color="text-3">
              {time}
            </Text>
            <Text variant="caption" color="text-3">
              {aired}
            </Text>
          </View>
        </Press>
        <Mark {...props} />
      </View>
      {synopsis ? (
        <Text variant="body" color="text-2" numberOfLines={2}>
          {synopsis}
        </Text>
      ) : null}
    </View>
  )
}

function PointerEpisode(props: EpisodeRowProps) {
  const { still, number, title, time, aired, synopsis, progress, playLabel, onPlay } = props
  const theme = useTheme()
  // Mark as watched is beside the link, not in it: a button inside a link is read as neither
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
      <Press
        onPress={onPlay}
        accessibilityRole="link"
        accessibilityLabel={playLabel}
        style={(s) => ({
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['4'],
          padding: space['2'],
          borderRadius: tokens.radius.lg,
          backgroundColor: s.hovered || s.focused ? theme.colors.s1 : 'transparent',
        })}
      >
        {(s) => (
          <>
            <View
              style={{
                width: POINTER_STILL,
                flexShrink: 1,
                minWidth: space['16'] * 2 - space['2'],
              }}
            >
              <Still
                still={still}
                progress={progress}
                shown={s.hovered || s.focused}
                size={space['10']}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: space['1'] }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space['2'] }}>
                <Text variant="caption" color="text-3" mono>
                  {String(number)}
                </Text>
                <Text variant="body" weight={600} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {title}
                </Text>
              </View>
              <Text variant="caption" color="text-3">
                {`${time} · ${aired}`}
              </Text>
              {synopsis ? (
                <Text variant="body" color="text-2" numberOfLines={2}>
                  {synopsis}
                </Text>
              ) : null}
            </View>
          </>
        )}
      </Press>
      <Mark {...props} />
    </View>
  )
}
