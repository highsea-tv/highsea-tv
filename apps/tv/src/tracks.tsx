// SPDX-License-Identifier: AGPL-3.0-only
// Audio and subtitles on the TV (the prototype's tv/tracks.tsx): a panel from the right that
// keeps focus inside it until Back closes it (react-native-tvos's TVFocusGuideView traps). It
// takes focus on its first option as it opens, as the prototype's `data-panel-first`: a preferred
// focus alone held the first time it opened and not after.
// The movie page shares it now; the player adds the subtitle timing nudge.
import type { ClientAudio, ClientSubtitle, ClientVersion } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { Icon, Text, useTheme } from '@highsea-tv/ui-native'
import { alpha, Focusable, focusOn, type ViewHandle } from '@highsea-tv/ui-native/tv'
import { type ReactNode, type Ref, useEffect, useRef } from 'react'
import { TVFocusGuideView, View } from 'react-native'
import { useBack } from './back.ts'
import { tracks as messages } from './messages.ts'

function Group<T extends { id: string; label: string }>({
  title,
  items,
  current,
  onPick,
  first,
}: {
  title: string
  items: T[]
  current: string | null
  onPick: (id: string) => void
  /** The panel's first option, for it to focus as it opens. */
  first?: Ref<ViewHandle>
}) {
  const u = useTheme().u
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ gap: 0.4 * u }}>
      <Text variant="eyebrow" color="text-3">
        {title}
      </Text>
      {items.map((t, i) => {
        const on = t.id === current
        return (
          <Focusable
            key={t.id}
            ref={i === 0 ? first : undefined}
            role="radio"
            selected={on}
            label={t.label}
            preferred={first !== undefined && i === 0}
            ring={false}
            lift="none"
            radius={0.5 * u}
            onPress={() => onPick(t.id)}
          >
            {(focused) => <Option label={t.label} on={on} focused={focused} />}
          </Focusable>
        )
      })}
    </View>
  )
}

function Option({ label, on, focused }: { label: string; on: boolean; focused: boolean }) {
  const theme = useTheme()
  const u = theme.u
  const fg = focused ? 'bg' : on ? 'text' : 'text-2'
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.8 * u,
        paddingHorizontal: 1 * u,
        paddingVertical: 0.7 * u,
        borderRadius: 0.5 * u,
        backgroundColor: focused ? theme.colors.text : 'transparent',
        transform: [{ scale: focused ? 1.03 : 1 }],
      }}
    >
      <View style={{ opacity: on ? 1 : 0 }}>
        <Icon name="check" size={1.1} color={fg} />
      </View>
      <Text variant="button" color={fg} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </View>
  )
}

export function TvTracksPanel({
  versions,
  version,
  audio,
  subtitle,
  onVersion,
  onAudio,
  onSubtitle,
  onClose,
  children,
}: {
  versions: ClientVersion[]
  version: ClientVersion
  audio: ClientAudio | null
  subtitle: ClientSubtitle | null
  onVersion: (id: string) => void
  onAudio: (id: string) => void
  onSubtitle: (id: string | null) => void
  onClose: () => void
  /** What the player adds under the groups: the subtitle timing. */
  children?: ReactNode
}) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  useBack(onClose)
  const first = useRef<ViewHandle>(null)
  useEffect(() => {
    // after the native views exist: a request in the commit itself can land before them
    const frame = requestAnimationFrame(() => focusOn(first.current))
    return () => cancelAnimationFrame(frame)
  }, [])
  const several = versions.length > 1
  return (
    <TVFocusGuideView
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
      accessibilityLabel={t('title')}
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        zIndex: 30,
        width: 32 * u,
        gap: 1.6 * u,
        paddingHorizontal: 2.4 * u,
        paddingVertical: 3.2 * u,
        backgroundColor: alpha(theme.colors.s1, 0.95),
      }}
    >
      <Text variant="rowTitle" accessibilityRole="header">
        {t('title')}
      </Text>
      {several ? (
        <Group
          title={t('version')}
          items={versions}
          current={version.id}
          onPick={onVersion}
          first={first}
        />
      ) : null}
      <Group
        title={t('audio')}
        items={version.audio}
        current={audio?.id ?? null}
        onPick={onAudio}
        first={several ? undefined : first}
      />
      <Group
        title={t('subtitles')}
        items={[{ id: 'off', label: t('off') }, ...version.subtitles]}
        current={subtitle?.id ?? 'off'}
        onPick={(id) => onSubtitle(id === 'off' ? null : id)}
        first={!several && version.audio.length === 0 ? first : undefined}
      />
      {children}
      <Text variant="pill" color="text-3">
        {t('saved')}
      </Text>
    </TVFocusGuideView>
  )
}
