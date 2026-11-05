// SPDX-License-Identifier: AGPL-3.0-only
// What music's pages share (an album, an artist, a playlist): the way back to Music, the missing
// page with Music as its way out (every prototype's album.tsx, artist.tsx and playlist.tsx), and
// the art blurred behind a page's head, as the person page draws its own (detail/layout.ts's
// PERSON_ART: opacity 0.45, a 40 blur, scaled 1.25 by touch and 1.1 with a pointer).

import { useT } from '@highsea-tv/i18n/react'
import type { IconName } from '@highsea-tv/ui'
import { Button, EmptyState, useFormFactor, useTheme } from '@highsea-tv/ui'
import { alpha, TvMessage } from '@highsea-tv/ui/tv'
import { Image, type ImageSource } from 'expo-image'
import { type Href, router } from 'expo-router'
import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { PERSON_ART } from '../detail/layout.ts'
import { Middle } from '../detail/parts.tsx'
import { musicScreenMessages } from './messages.ts'
import { BLACK, TV_MUSIC } from './sizes.ts'

/** Music: the phone's Library view of it (its /music is Library's), or the pointer's and TV's page. */
export function useMusicHome(): Href {
  const touch = useFormFactor().input === 'touch'
  return (touch ? '/library?view=music' : '/music') as Href
}

/** A page that isn't here, or a read that failed, with Music as the way out. */
export function MusicMissing({
  title,
  body,
  icon = 'music',
}: {
  title: string
  body: string
  icon?: IconName
}) {
  const t = useT(musicScreenMessages)
  const input = useFormFactor().input
  const home = useMusicHome()
  const go = () => router.navigate(home)
  if (input === 'tv')
    return (
      <TvMessage
        title={title}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={go}>
            {t('music')}
          </Button>
        }
      >
        {body}
      </TvMessage>
    )
  return (
    <Middle back={input === 'touch'}>
      <EmptyState
        icon={icon}
        tone="error"
        title={title}
        action={
          <Button variant="primary" onPress={go}>
            {t('music')}
          </Button>
        }
      >
        {body}
      </EmptyState>
    </Middle>
  )
}

/** The page's art blurred behind its head, fading into the page at its foot. */
export function BlurredHead({
  source,
  children,
}: {
  source: ImageSource | null | undefined
  children: ReactNode
}) {
  const theme = useTheme()
  const touch = useFormFactor().input === 'touch'
  return (
    <View style={{ overflow: 'hidden' }}>
      {source ? (
        <Image
          source={source}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: PERSON_ART.opacity,
              transform: [{ scale: PERSON_ART.scale[touch ? 'touch' : 'pointer'] }],
            },
          ]}
          blurRadius={PERSON_ART.blur}
          contentFit="cover"
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundImage: `linear-gradient(0deg, ${theme.colors.bg}, transparent ${touch ? 75 : 70}%)`,
          },
        ]}
      />
      {children}
    </View>
  )
}

/** The TV's art behind the whole page, dimmed and blurred (tv/album.tsx's brightness 0.4). */
export function TvBlurredArt({ source }: { source: ImageSource | null | undefined }) {
  const theme = useTheme()
  const u = theme.u
  if (!source) return null
  // clipped to the screen, so the art scaled past its edge doesn't widen the page
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Image
        source={source}
        style={[StyleSheet.absoluteFill, { transform: [{ scale: TV_MUSIC.artScale }] }]}
        blurRadius={2.6 * u}
        contentFit="cover"
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: alpha(BLACK, 0.6),
            backgroundImage: `linear-gradient(90deg, ${theme.colors.bg} 5%, transparent 80%)`,
          },
        ]}
      />
    </View>
  )
}
