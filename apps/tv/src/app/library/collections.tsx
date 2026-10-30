// SPDX-License-Identifier: AGPL-3.0-only
// Library › Collections, TV (collections.md#in-the-apps, the prototype's tv/collections.tsx): the
// heading with Movies or Collections, then the collections as a poster grid, smart ones marked in
// their caption. A collection without its own poster shows the first of its mosaic.
import { useCollections } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { tokens, useTheme } from '@highsea-tv/ui-native'
import { TvButton, TvMessage, TvTile } from '@highsea-tv/ui-native/tv'
import { router } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import {
  appKind,
  GlobalNav,
  LibraryHeader,
  ServerIdentity,
  TvGrid,
  TvPage,
  Words,
} from '../../kit.tsx'
import { library as messages } from '../../messages.ts'

const tv = tokens.tv

export default function Collections() {
  const t = useT(messages)
  const f = useFormat()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const list = useCollections(appKind)
  if (list.status === 'error')
    return (
      <TvMessage
        title={t('collectionsFailed')}
        actions={
          <TvButton primary preferred onPress={list.refetch}>
            {t('tryAgain')}
          </TvButton>
        }
      >
        {list.error.message}
      </TvMessage>
    )
  const xs = list.data ?? []
  return (
    <View style={{ flex: 1 }}>
      <TvPage keep={0.35}>
        <ServerIdentity />
        <View
          style={{
            paddingHorizontal: tv.safe.x * u,
            paddingTop: 7 * u,
            paddingBottom: 4 * u,
            gap: 1.6 * u,
          }}
        >
          <LibraryHeader current="collections" />
          {list.status === 'loading' ? (
            <View accessibilityState={{ busy: true }} style={{ paddingVertical: 6 * u }}>
              <ActivityIndicator size="large" color={theme.colors['text-3']} />
            </View>
          ) : xs.length === 0 ? (
            <Words title={t('noCollections')} />
          ) : (
            <TvGrid
              items={xs}
              keyOf={(c) => c.id}
              render={(c, at) => {
                const caption = f.caption(c)
                return (
                  <TvTile
                    preferred={at.index === 0}
                    title={c.name}
                    caption={c.smart?.words ? t('smart', { caption }) : caption}
                    src={media(c.art.poster ?? c.smart?.mosaic?.[0] ?? null)}
                    width={at.width}
                    onPress={() => router.push(`/collections/${c.id}`)}
                  />
                )
              }}
            />
          )}
        </View>
      </TvPage>
      <GlobalNav />
    </View>
  )
}
