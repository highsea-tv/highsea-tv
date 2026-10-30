// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, TV (client-detail.md#tv, the prototype's tv/detail.tsx): the ambient backdrop
// (the artwork blurred 2.6u and dimmed, elevation.md#blur), the poster beside the title and its
// actions, then the cast and More like this as rows. Audio and subtitles opens the shared panel,
// and a long press of OK on the actions opens Mark as watched; Back closes either, then leaves.
// The picks are the person's, kept on the server for every device (usePicks).
import type { ClientDetail } from '@highsea-tv/api-contract'
import { useItem, useMarkWatched, usePicks } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Text, tokens, useTheme } from '@highsea-tv/ui-native'
import {
  alpha,
  focusOn,
  TvButton,
  TvMessage,
  TvRow,
  TvTile,
  type ViewHandle,
} from '@highsea-tv/ui-native/tv'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, TVFocusGuideView, View } from 'react-native'
import { useBack } from '../../back.ts'
import { Ambient, GlobalNav, Kept, ServerIdentity, TvPage } from '../../kit.tsx'
import { detail as messages } from '../../messages.ts'
import { TvTracksPanel } from '../../tracks.tsx'

const tv = tokens.tv

export default function Detail() {
  const t = useT(messages)
  const theme = useTheme()
  const id = Number(useLocalSearchParams<{ id: string }>().id)
  const detail = useItem(id)
  if (detail.status === 'loading')
    return (
      <View accessibilityState={{ busy: true }} style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors['text-3']} />
      </View>
    )
  if (detail.status === 'error')
    return (
      <TvMessage
        title={detail.error.message}
        actions={
          <TvButton primary preferred onPress={() => router.dismissTo('/')}>
            {t('goHome')}
          </TvButton>
        }
      >
        {t('gone')}
      </TvMessage>
    )
  return <Item d={detail.data} refresh={detail.refresh} />
}

/** The poster's width and the gap beside it, in units. */
const POSTER = 13
const GAP = 2.4

function Item({ d, refresh }: { d: ClientDetail; refresh: () => void }) {
  const t = useT(messages)
  const f = useFormat()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const m = d.item
  const { picks, save } = usePicks(m.id)
  const [panel, setPanel] = useState(false)
  const [options, setOptions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const play = useRef<ViewHandle>(null)
  // the first action, kept as state too: the navigation's Down goes to it
  const [first, setFirst] = useState<ViewHandle | null>(null)
  const playRef = useCallback((node: ViewHandle | null) => {
    play.current = node
    setFirst(node)
  }, [])
  // the tabs take focus only while it's in the actions: once the page scrolls to the rows, their
  // guide across the top would catch Up before the row above it (Home's rule)
  const [atTop, setAtTop] = useState(true)
  const below = (onFocus: () => void) => () => {
    setAtTop(false)
    onFocus()
  }
  const tracksButton = useRef<ViewHandle>(null)

  const p = picks.data
  const playable = d.versions.filter((v) => v.playable)
  const version = playable.find((v) => v.id === p?.versionId) ?? playable[0]
  const audio =
    version?.audio.find((a) => a.id === p?.audioId) ?? version?.audio.find((a) => a.default) ?? null
  const subtitle = version?.subtitles.find((s) => s.id === p?.subtitleId) ?? null
  const resuming = m.progress !== null
  const pick = (patch: Parameters<typeof save.run>[0]) =>
    save.run(patch).then(
      () => picks.refresh(),
      (e: Error) => setError(t('saveFailed', { message: e.message })),
    )
  const hold = () => setOptions(true)

  return (
    <View style={{ flex: 1 }}>
      <Ambient source={media(m.art.backdrop)} />
      <TvPage keep={0.4}>
        <ServerIdentity />
        <View style={{ paddingTop: 8 * u, paddingBottom: 4 * u, gap: 2.4 * u }}>
          <View
            style={{
              flexDirection: 'row',
              gap: GAP * u,
              maxWidth: 60 * u,
              paddingHorizontal: tv.safe.x * u,
            }}
          >
            <View
              style={{
                width: POSTER * u,
                aspectRatio: 2 / 3,
                borderRadius: tv.radius.poster * u,
                overflow: 'hidden',
                backgroundColor: theme.colors.s2,
                boxShadow: tokens.elevation[4].boxShadow,
              }}
            >
              <Image
                source={media(m.art.poster)}
                style={{ flex: 1 }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View style={{ flex: 1, gap: 1 * u }}>
              <Text variant="heroTitle" size={3.6} accessibilityRole="header">
                {m.title}
              </Text>
              <Text variant="meta" color="text-2">
                {f.meta(m)}
              </Text>
              {m.synopsis ? (
                <Text
                  variant="synopsis"
                  color="text-2"
                  numberOfLines={4}
                  style={{ maxWidth: 44 * u }}
                >
                  {m.synopsis}
                </Text>
              ) : null}
              {d.directors.length > 0 ? (
                <Text variant="meta" color="text-3">
                  {t('directedBy', { names: d.directors.map((x) => x.name).join(' and ') })}
                </Text>
              ) : null}
              <Actions reach={POSTER + GAP} onEnter={() => setAtTop(true)}>
                {version ? (
                  <TvButton
                    ref={playRef}
                    primary
                    preferred
                    icon="play"
                    onPress={() => router.push(`/play/${m.id}`)}
                    onLongPress={hold}
                  >
                    {resuming ? t('resume', { left: f.left(m) ?? '' }) : t('play')}
                  </TvButton>
                ) : null}
                {version && resuming ? (
                  <TvButton
                    icon="replay"
                    onPress={() => router.push(`/play/${m.id}?start=1`)}
                    onLongPress={hold}
                  >
                    {t('fromStart')}
                  </TvButton>
                ) : null}
                {version ? (
                  <TvButton
                    ref={tracksButton}
                    icon="subtitles"
                    onPress={() => setPanel(true)}
                    onLongPress={hold}
                  >
                    {t('tracks')}
                  </TvButton>
                ) : (
                  // nothing to play, so OK alone opens what a long press would
                  <TvButton ref={setFirst} preferred icon="more" onPress={hold}>
                    {t('more')}
                  </TvButton>
                )}
              </Actions>
              {version ? (
                <Text variant="pill" color="text-3">
                  {[
                    version.label,
                    audio?.label ?? t('defaultAudio'),
                    subtitle?.label ?? t('subtitlesOff'),
                  ].join(' · ')}
                </Text>
              ) : (
                <Text variant="pill" color="text-3">
                  {t('notPlayable')}
                </Text>
              )}
              <Text variant="pill" color={error ? 'danger' : 'text-3'}>
                {error ?? (m.watched ? t('watchedHold') : t('holdForMore'))}
              </Text>
            </View>
          </View>
          {d.cast.length > 0 ? (
            <Row
              title={t('cast')}
              items={d.cast}
              keyOf={(c) => c.id}
              render={(c, onFocus) => (
                <TvTile
                  title={c.name}
                  caption={c.character ?? ''}
                  src={media(c.photo)}
                  width={8}
                  onFocus={below(onFocus)}
                />
              )}
            />
          ) : null}
          {d.related.length > 0 ? (
            <Row
              title={t('moreLike')}
              items={d.related}
              keyOf={(r) => r.id}
              render={(r, onFocus) => (
                <TvTile
                  title={r.title}
                  caption={r.year ? String(r.year) : ''}
                  src={media(r.art.poster)}
                  onFocus={below(onFocus)}
                  onPress={() => router.push(`/movies/${r.id}`)}
                  onPlay={() => router.push(`/play/${r.id}`)}
                />
              )}
            />
          ) : null}
        </View>
      </TvPage>
      <GlobalNav down={first} reachable={atTop} />
      {options ? (
        <Options
          title={m.title}
          watched={m.watched}
          id={m.id}
          onDone={(message) => {
            setOptions(false)
            setError(message)
            if (!message) refresh()
            focusOn(play.current)
          }}
        />
      ) : null}
      {panel && version ? (
        <TvTracksPanel
          versions={playable}
          version={version}
          audio={audio}
          subtitle={subtitle}
          // a new version has its own tracks: the picks for the old one don't carry over
          onVersion={(v) => {
            if (v !== version.id) void pick({ versionId: v, audioId: null, subtitleId: null })
          }}
          onAudio={(a) => void pick({ audioId: a })}
          onSubtitle={(s) => {
            void pick({ subtitleId: s })
            setPanel(false)
            focusOn(tracksButton.current)
          }}
          onClose={() => {
            setPanel(false)
            focusOn(tracksButton.current)
          }}
        />
      ) : null}
    </View>
  )
}

/**
 * The actions' row, which takes the page back to its top when focus comes up to it, as the
 * prototype's rests there (a long synopsis would otherwise land it 0.4 down by scrolling the
 * server's name off the top). The focus engine looks only
 * straight up, and the rows' first tiles sit under the poster, so the row's guide reaches `reach`
 * units left over the poster's column and takes focus from anything below; it returns to the action
 * last used.
 */
function Actions({
  reach,
  onEnter,
  children,
}: {
  reach: number
  onEnter: () => void
  children: React.ReactNode
}) {
  const u = useTheme().u
  return (
    <Kept rest style={{ marginTop: 0.6 * u, marginLeft: -reach * u }}>
      <TVFocusGuideView
        // without destinations a guide only takes focus with autoFocus, deprecated or not
        // (TVFocusGuideView.js: `focusable` defaults to false otherwise)
        autoFocus
        onFocusEnter={onEnter}
        style={{ flexDirection: 'row', gap: 1 * u, paddingLeft: reach * u }}
      >
        {children}
      </TVFocusGuideView>
    </Kept>
  )
}

function Row<T>({
  title,
  items,
  keyOf,
  render,
}: {
  title: string
  items: T[]
  keyOf: (item: T) => string | number
  render: (item: T, onFocus: () => void) => React.ReactNode
}) {
  return (
    <Kept>
      <TvRow
        title={title}
        items={items}
        keyOf={keyOf}
        render={(item, at) => render(item, at.onFocus)}
      />
    </Kept>
  )
}

/** What a long press of OK opens: Mark as watched or unwatched. Back closes it. */
function Options({
  title,
  watched,
  id,
  onDone,
}: {
  title: string
  watched: boolean
  id: number
  onDone: (error: string | null) => void
}) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const mark = useMarkWatched(id)
  useBack(() => onDone(null))
  return (
    <View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { zIndex: 40, backgroundColor: alpha(theme.colors.bg, 0.7) },
      ]}
    >
      <TVFocusGuideView
        trapFocusUp
        trapFocusDown
        trapFocusLeft
        trapFocusRight
        accessibilityLabel={title}
        style={{
          minWidth: 28 * u,
          gap: 1 * u,
          padding: 2 * u,
          borderRadius: tv.radius.poster * u,
          backgroundColor: theme.colors.s2,
          boxShadow: tokens.elevation[4].boxShadow,
        }}
      >
        <Text variant="button">{title}</Text>
        <TvButton
          primary
          preferred
          icon={watched ? 'replay' : 'check'}
          onPress={() =>
            mark.run(!watched).then(
              () => onDone(null),
              (e: Error) => onDone(t('markFailed', { message: e.message })),
            )
          }
        >
          {watched ? t('markUnwatched') : t('markWatched')}
        </TvButton>
        <TvButton onPress={() => onDone(null)}>{t('cancel')}</TvButton>
      </TVFocusGuideView>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
