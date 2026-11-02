// SPDX-License-Identifier: AGPL-3.0-only
// Collections, TV (collections.md#in-the-apps, the prototype's tv/collections.tsx): a destination
// of its own in the head. A collection holds one family of media, video (movies and shows) or audio
// (music), so the page has three choices beside its title: All, the default, with Video and Audio
// as two sections, then each family on its own. The collections are a poster grid, smart ones
// marked in their caption; one without its own poster shows the first of its mosaic. Up from the
// grid reaches the choices, Up again the head; focus starts on the first collection. Until the
// owner can make collections of music, every collection is video, so Audio says there are none.
import type { LibraryCollection } from '@highsea-tv/api-contract'
import { useCollections } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Button, Chip, Text, tokens, useTheme } from '@highsea-tv/ui'
import { Kept, TvGrid, TvMessage, TvPage, TvTile, type ViewHandle } from '@highsea-tv/ui/tv'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { appKind, TvHead } from '../../kit.tsx'
import { library as messages } from '../../messages.ts'

const tv = tokens.tv

type Family = 'video' | 'audio'
type Show = 'all' | Family

const CHOICES = ['all', 'video', 'audio'] as const satisfies Show[]
const FAMILIES = ['video', 'audio'] as const satisfies Family[]

/** A collection's family: video for every one until the server sends it (music's phase). */
const familyOf = (_c: LibraryCollection): Family => 'video'

export default function Collections() {
  const t = useT(messages)
  const f = useFormat()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const list = useCollections(appKind)
  const [show, setShow] = useState<Show>('all')
  const [arrived, setArrived] = useState(false)
  const firstChoice = useRef<ViewHandle>(null)
  if (list.status === 'error')
    return (
      <TvMessage
        title={t('collectionsFailed')}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={list.refetch}>
            {t('tryAgain')}
          </Button>
        }
      >
        {list.error.message}
      </TvMessage>
    )
  const xs = list.data ?? []
  const shown = FAMILIES.filter((x) => show === 'all' || show === x)
  return (
    <View style={{ flex: 1 }}>
      <TvPage keep={0.35}>
        <TvHead down={firstChoice.current} />
        <View
          style={{
            paddingHorizontal: tv.safe.x * u,
            paddingTop: 1.6 * u,
            paddingBottom: tv.safe.y * u,
            gap: 1.6 * u,
          }}
        >
          <Kept style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 * u }}>
            <Text
              size={2.6}
              weight={600}
              accessibilityRole="header"
              style={{ lineHeight: 2.6 * u }}
            >
              {t('collections')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 0.8 * u }}>
              {CHOICES.map((c, i) => (
                <Chip
                  key={c}
                  ref={i === 0 ? firstChoice : undefined}
                  selected={show === c}
                  onPress={() => setShow(c)}
                >
                  {t(c)}
                </Chip>
              ))}
            </View>
          </Kept>
          {list.status === 'loading' ? (
            <View accessibilityState={{ busy: true }} style={{ paddingVertical: 6 * u }}>
              <ActivityIndicator size="large" color={theme.colors['text-3']} />
            </View>
          ) : (
            <View style={{ gap: 2.4 * u }}>
              {shown.map((family, s) => {
                const mine = xs.filter((c) => familyOf(c) === family)
                return (
                  <View key={family} accessibilityLabel={t(family)} style={{ gap: 1 * u }}>
                    {/* All names each section; a family on its own is named by its choice */}
                    {show === 'all' ? (
                      <Text variant="rowTitle" accessibilityRole="header">
                        {t(family)}
                      </Text>
                    ) : null}
                    {mine.length === 0 ? (
                      <Text variant="synopsis" color="text-2">
                        {family === 'video' ? t('noVideo') : t('noAudio')}
                      </Text>
                    ) : (
                      <TvGrid
                        items={mine}
                        keyOf={(c) => c.id}
                        render={(c, at) => {
                          const caption = f.caption(c)
                          return (
                            <TvTile
                              preferred={!arrived && s === 0 && at.index === 0}
                              title={c.name}
                              caption={c.smart?.words ? t('smart', { caption }) : caption}
                              src={media(c.art.poster ?? c.smart?.mosaic?.[0] ?? null)}
                              width={at.width}
                              onFocus={() => setArrived(true)}
                              onPress={() => router.push(`/collections/${c.id}`)}
                            />
                          )
                        }}
                      />
                    )}
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </TvPage>
    </View>
  )
}
