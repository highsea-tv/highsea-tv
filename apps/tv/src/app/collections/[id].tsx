// SPDX-License-Identifier: AGPL-3.0-only
// A collection on the TV (client-search.md#collections, the prototype's tv/collection.tsx): the
// ambient backdrop, the head, the name, how many are here and their years, and the overview, then
// its titles as a film row, oldest first, named by what's in it (Films while it holds films only).
// A smart one says so and gives its rules in words. Focus starts on the row; Back goes back to
// wherever it was opened from. An error offers Collections.
import { useCollection } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Button, Text, tokens, useTheme } from '@highsea-tv/ui'
import { TvAmbient, TvFilmRow, TvMessage, type ViewHandle } from '@highsea-tv/ui/tv'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { appKind, TvHead } from '../../kit.tsx'
import { collection as messages, shell } from '../../messages.ts'

const tv = tokens.tv

export default function Collection() {
  const t = useT(messages)
  const s = useT(shell)
  const f = useFormat()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  // the row's card: the head's Down goes to it
  const [row, setRow] = useState<ViewHandle | null>(null)
  const { id } = useLocalSearchParams<{ id: string }>()
  const found = useCollection(id, appKind)
  if (found.status === 'loading')
    return (
      <View
        accessibilityState={{ busy: true }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator size="large" color={theme.colors['text-3']} />
      </View>
    )
  if (found.status === 'error')
    return (
      <TvMessage
        title={found.error.message}
        actions={
          <Button
            variant="primary"
            hasTVPreferredFocus
            onPress={() => router.replace('/collections')}
          >
            {s('collections')}
          </Button>
        }
      >
        {t('gone')}
      </TvMessage>
    )
  const { collection: c, items } = found.data
  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <TvAmbient source={media(c.art.backdrop)} />
      <View style={{ gap: 1.6 * u }}>
        <TvHead down={row} />
        <View
          accessibilityRole="summary"
          style={{ maxWidth: 60 * u, paddingHorizontal: tv.safe.x * u, gap: 1 * u }}
        >
          <Text variant="meta" color="text-3">
            {c.smart?.words ? t('smartCollection') : t('collection')}
          </Text>
          <Text variant="heroTitle" size={3.6} accessibilityRole="header">
            {c.name}
          </Text>
          <Text variant="meta" color="text-2">
            {[f.moviesHere(items.length), c.years].filter(Boolean).join(' · ')}
          </Text>
          {c.smart?.words ? (
            <Text variant="pill" color="text-3">
              {c.smart.words}
            </Text>
          ) : null}
          {c.overview ? (
            <Text variant="synopsis" color="text-2" numberOfLines={3} style={{ maxWidth: 44 * u }}>
              {c.overview}
            </Text>
          ) : null}
        </View>
        <TvFilmRow
          ref={setRow}
          preferred
          title={f.titlesRow(items.length)}
          items={items}
          art={(m) => ({ poster: media(m.art.poster), backdrop: media(m.art.backdrop) })}
          meta={f.meta}
          onOpen={(m) => router.push(`/movies/${m.id}`)}
          onPlay={(m) => router.push(`/play/${m.id}`)}
        />
      </View>
    </View>
  )
}
