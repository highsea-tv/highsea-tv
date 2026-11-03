// SPDX-License-Identifier: AGPL-3.0-only
// The TV's head (the prototype's kit.tsx TvHead): one line across the top of a page, its start
// (the server's mark and name), its destinations centred, and its end (Alerts and the account). It's
// the first thing in the page and scrolls away with it, so nothing passes under it. Up reaches it
// from the page's top stops: the focus guide around it spans the screen's width and sends focus
// arriving from below to `goal`, the stop for where the person is (react-native-tvos's
// TVFocusGuideView `destinations`, https://github.com/react-native-tvos/react-native-tvos#readme).
// A page whose first stop isn't straight under the head names it as `down`: while focus is in the
// head, a guide under it sends Down there, and is only there then, or it would catch Up on the way
// in. A page that scrolls makes the head `reachable` only while its top is in view.
//
// The head holds no routes or data: an app hands it its parts and what each stop does, so another
// app on the TV's rule lays out its own head the same way.
import { type ReactNode, type Ref, useState } from 'react'
import { View } from 'react-native'
import { Avatar } from '../brand.tsx'
import { Icon } from '../icon.tsx'
import type { IconName } from '../icons.ts'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { FocusGuide } from './engine'
import { Focusable, type ViewHandle } from './focusable.tsx'

const tv = tokens.tv

/** A stop's height, in units: a tab's pill, or the round stop of an icon. */
const STOP = 2.6
/** The account's round stop, and the avatar inside it. */
const ACCOUNT = 3
const AVATAR = 2.2

export function TvHead({
  label,
  start,
  center,
  end,
  goal,
  down,
  reachable = true,
}: {
  /** The navigation's name for VoiceOver. */
  label: string
  start?: ReactNode
  center?: ReactNode
  end?: ReactNode
  /** Where Up from the page lands: the stop for where the person is. */
  goal: ViewHandle | null
  /** Where Down from the head goes, when the page's first stop isn't straight under it. */
  down?: ViewHandle | null
  reachable?: boolean
}) {
  const u = useTheme().u
  const [inside, setInside] = useState(false)
  return (
    <FocusGuide
      // until the goal is set, `destinations` is empty and the guide would be a stop itself;
      // autoFocus hands focus on to the stop last focused in it, or its first
      autoFocus
      accessibilityLabel={label}
      destinations={goal && reachable ? [goal] : []}
      onFocusEnter={() => setInside(true)}
      onFocusLeave={() => setInside(false)}
      style={{ paddingTop: tv.safe.y * u, paddingHorizontal: tv.safe.x * u }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>{start}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0.6 * u }}>{center}</View>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 0.6 * u,
          }}
        >
          {end}
        </View>
      </View>
      {inside && down ? (
        <FocusGuide destinations={[down]} style={{ alignSelf: 'stretch', height: 1 * u }} />
      ) : null}
    </FocusGuide>
  )
}

/**
 * One of the head's stops: a tab's words, an icon's round stop (Search, the bell, with `dot` while
 * there's something new) or a person's avatar. The current one is `text`, the others `text-2`;
 * focus fills it with `text`.
 */
export function TvHeadStop({
  label,
  text,
  icon,
  avatar,
  dot = false,
  here,
  onPress,
  disabled,
  ref,
}: {
  /** For VoiceOver; a tab also shows it. */
  label: string
  /** The tab's words, shown; without it the stop is an icon's or an avatar's. */
  text?: string
  icon?: IconName
  /** A person's name, for their avatar. */
  avatar?: string
  dot?: boolean
  here: boolean
  onPress: () => void
  disabled?: boolean
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const size = (avatar !== undefined ? ACCOUNT : STOP) * u
  return (
    <Focusable
      ref={ref}
      role="link"
      selected={here}
      label={label}
      ring={false}
      lift="none"
      radius={size / 2}
      disabled={disabled}
      onPress={() => (here ? undefined : onPress())}
    >
      {(focused) => {
        const fg = focused ? 'bg' : here ? 'text' : 'text-2'
        return (
          <View
            style={{
              height: size,
              minWidth: size,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: size / 2,
              paddingHorizontal: text ? 1.4 * u : 0,
              backgroundColor: focused ? theme.colors.text : 'transparent',
            }}
          >
            {text ? (
              <Text variant="button" color={fg} numberOfLines={1}>
                {text}
              </Text>
            ) : avatar !== undefined ? (
              <Avatar name={avatar} size={AVATAR} />
            ) : icon ? (
              <Icon name={icon} size={tokens.icon.sizeTv.min} color={fg} />
            ) : null}
            {dot ? (
              <View
                style={{
                  position: 'absolute',
                  top: 0.45 * u,
                  right: 0.45 * u,
                  width: 0.6 * u,
                  height: 0.6 * u,
                  borderRadius: tokens.tv.radius.pill * u,
                  backgroundColor: theme.colors.accent,
                }}
              />
            ) : null}
          </View>
        )
      }}
    </Focusable>
  )
}
