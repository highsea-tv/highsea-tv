// SPDX-License-Identifier: AGPL-3.0-only
// What Connect a device's two screens share (connectivity.md#pairing-a-tv-from-the-phone): their
// frame and title, laid out by the form factor as the prototypes draw them. With a pointer, under
// the top bar, a column no wider than 560 in the middle, 48 from the top (web/link.tsx's Page);
// by touch, with no tab bar, a back button over the title at the phone's 28 (mobile/pair.tsx).
import {
  Button,
  ScrollView,
  Text,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const { space } = tokens

/** The prototype's max-w-[560px]. */
const COLUMN = space['5'] * 28

export function LinkFrame({
  back,
  children,
  centred = false,
}: {
  /** Touch's back button: where it goes, named. */
  back?: { label: string; onPress: () => void }
  children: ReactNode
  /** Touch's signed-in screen sits in the middle of the screen (the prototype's content-center). */
  centred?: boolean
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const gutter = usePageGutter()
  const touch = useFormFactor().input === 'touch'
  if (!touch)
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        contentContainerStyle={{ paddingVertical: space['12'] }}
      >
        {/* the gutter inside the 560, as the prototype's padding on the same element */}
        <View
          style={{
            width: '100%',
            maxWidth: COLUMN,
            alignSelf: 'center',
            paddingHorizontal: gutter,
            gap: space['6'],
          }}
        >
          {children}
        </View>
      </ScrollView>
    )
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: centred ? 'center' : undefined,
        paddingTop: insets.top + space['1'],
        paddingBottom: insets.bottom + space['6'],
        paddingHorizontal: tokens.mobile.gutter,
        gap: space['4'],
      }}
    >
      {back ? (
        // the prototype's ghost button pulled to the gutter's edge (-ms-3)
        <View style={{ marginStart: -space['3'] }}>
          <Button variant="ghost" icon="chevron-left" onPress={back.onPress}>
            {back.label}
          </Button>
        </View>
      ) : null}
      {children}
    </ScrollView>
  )
}

/** The screen's title: the web's heading, the phone's 28 (its largeTitle). */
export function LinkTitle({ children }: { children: string }) {
  const touch = useFormFactor().input === 'touch'
  return (
    <Text variant={touch ? 'largeTitle' : 'heading'} accessibilityRole="header">
      {children}
    </Text>
  )
}

/** The line under it: the body, the prototype's 15 on the phone the tokens' 16. */
export function LinkText({ children }: { children: ReactNode }) {
  return (
    <Text variant="body" color="text-2">
      {children}
    </Text>
  )
}

/**
 * A line with one value in it set in mono, as the prototypes set the TV's address and its code
 * (`font-mono` spans): the words around it keep the line's own face, nested as React Native's Text
 * nests (https://reactnative.dev/docs/text#nested-text).
 */
export function withMono(
  line: string,
  value: string,
  /** The line's own style: the library's Text sets its size even when nested. */
  variant: 'body' | 'caption' = 'body',
): ReactNode {
  const at = value ? line.indexOf(value) : -1
  if (at < 0) return line
  return [
    line.slice(0, at),
    <Text key="mono" variant={variant} mono>
      {value}
    </Text>,
    line.slice(at + value.length),
  ]
}
