// SPDX-License-Identifier: AGPL-3.0-only
// A still-shaped frame (16:9, the tokens' `aspect.still`) for what plays in place: a trailer's
// player in its dialog (client-detail.md › Trailer; the prototypes' client/trailer.tsx). The
// player is an embedded page (`embed`): an iframe on the web and in the desktop app, a WebView on
// the phone (embed.tsx and embed.web.tsx). Without one the still lies behind and a note, on the
// dark glass parts lay over artwork, says what would play there, as the prototype's offline
// stand-in.
import { aspect } from '@highsea-tv/tokens'
import { StyleSheet, View } from 'react-native'
import { Embed } from './embed'
import { GLASS } from './glass.ts'
import { Image, type ImageSource } from './image.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

/** The prototype's max-w-sm (24rem), the note's widest. */
const NOTE_WIDTH = tokens.space['16'] * 6

export function StillFrame({
  still,
  note,
  embed,
}: {
  /** The picture behind a note. */
  still?: ImageSource | null
  /** What plays there, over the still, when nothing does. */
  note?: string
  /** The page that plays, filling the frame, loaded as the frame draws: its address and name. */
  embed?: { src: string; title: string }
}) {
  const theme = useTheme()
  const [w, h] = aspect.still
  return (
    <View
      style={{
        width: '100%',
        aspectRatio: w / h,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: tokens.radius.md,
        backgroundColor: theme.colors.s2,
      }}
    >
      {still ? (
        <Image
          source={still}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {embed ? (
        <View style={StyleSheet.absoluteFill}>
          <Embed src={embed.src} title={embed.title} />
        </View>
      ) : null}
      {note ? (
        <View
          style={{
            maxWidth: NOTE_WIDTH,
            marginHorizontal: tokens.space['4'],
            paddingHorizontal: tokens.space['4'],
            paddingVertical: tokens.space['3'],
            borderRadius: tokens.radius.md,
            backgroundColor: GLASS,
          }}
        >
          <Text variant="caption" color="text" style={{ textAlign: 'center' }}>
            {note}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
