// SPDX-License-Identifier: AGPL-3.0-only
// A collection on the TV (client-search.md#collections, the prototype's tv/collection.tsx): the
// ambient backdrop, the name, how many are here and their years, and the overview, then its titles
// as a row, oldest first. A smart one says so and gives its rules in words. Focus starts on the
// first title; Back goes back to wherever it was opened from.
import { useCollection } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Text, tokens, useTheme } from '@highsea-tv/ui-native'
import { TvButton, TvMessage, TvRow, TvTile, type ViewHandle } from '@highsea-tv/ui-native/tv'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Ambient, appKind, GlobalNav, ServerIdentity } from '../../kit.tsx'
import { collection as messages } from '../../messages.ts'

const tv = tokens.tv

export default function Collection() {
  const t = useT(messages)
  const f = useFormat()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  // the first title: the navigation's Down goes to it
  const [first, setFirst] = useState<ViewHandle | null>(null)
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
          <TvButton primary preferred onPress={() => router.replace('/search')}>
            {t('search')}
          </TvButton>
        }
      >
        {t('gone')}
      </TvMessage>
    )
  const { collection: c, items } = found.data
  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <Ambient source={media(c.art.backdrop)} />
      <ServerIdentity />
      <View style={{ paddingTop: 8 * u, gap: 2.4 * u }}>
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
            {[f.moviesHere(c.count), c.years].filter(Boolean).join(' · ')}
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
        <TvRow
          title={t('movies')}
          items={items}
          keyOf={(m) => m.id}
          render={(m, at) => (
            <TvTile
              ref={at.index === 0 ? setFirst : undefined}
              preferred={at.index === 0}
              title={m.title}
              caption={m.progress !== null ? (f.left(m) ?? '') : m.year ? String(m.year) : ''}
              src={media(m.art.poster)}
              progress={m.progress}
              onPress={() => router.push(`/movies/${m.id}`)}
              onPlay={() => router.push(`/play/${m.id}`)}
            />
          )}
        />
      </View>
      <GlobalNav down={first} />
    </View>
  )
}
