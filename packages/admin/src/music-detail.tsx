'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// An artist's page (`/music/artists/{id}`) and an album's (`/music/albums/{id}`, Files at
// `/music/albums/{id}/files`), docs/product/music.md, HT-68. Laid out as a show's page is: the
// summary card, then the album's discs as Shows' seasons are drawn, each a frame with its own
// table, and a Files tab with each file's format, bitrate and size.
//
// Music differs from a show here in what it can do: nothing is monitored or searched for, so the
// actions are Refresh metadata (the tags read again, then MusicBrainz) and, with a MusicBrainz id,
// a link to MusicBrainz's page. Remove from library isn't drawn: the files would come back with the
// next scan (a question for the owner, docs/product/music.md › Open questions).
import type { LibraryAlbumDetail, LibraryArtistDetail, LibraryDisc } from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { admin } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Menu,
  Poster,
  QualityTag,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  TitleCell,
  TitleLink,
  toast,
  tokens,
} from '@highsea-tv/ui/native'
import { type ComponentRef, type ReactNode, useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { ItemWorkMark, useItemWork } from './item-work.tsx'
import { LibraryPosters } from './library-grid.tsx'
import { SummaryCard, SummarySkeleton, useLongDate } from './media-sections.tsx'
import {
  ALBUM_TABS,
  type AlbumTab,
  albumPath,
  artistPath,
  basename,
  clock,
  dirname,
  formatDetail,
  formatsLine,
  kilohertz,
  MUSIC_TOPICS,
  musicBrainzUrl,
  musicPath,
  sourceBadge,
} from './music-data.ts'
import { AlbumTable, AlbumTile, useMusicView } from './music-library.tsx'
import { music as messages } from './music-messages.ts'
import { Served } from './serves.tsx'
import { AdminPage } from './shell.tsx'
import { Line } from './show-detail.tsx'
import { useTabAddress } from './tabs.ts'

const s = tokens.space
const UI = tokens.adminText.ui.size
const FIGURE = tokens.adminText.figure

/** Refresh metadata's toast: what's read, and whether MusicBrainz has more to give. */
function useRefresh(kind: 'artist' | 'album', id: string) {
  const t = useT(messages)
  const run = useAction((c) =>
    kind === 'artist'
      ? c.musicLibrary.refreshArtist({ params: { id } })
      : c.musicLibrary.refreshAlbum({ params: { id } }),
  )
  return {
    pending: run.pending,
    start: (title: string, musicBrainz: boolean) =>
      run.run().then(
        () =>
          toast.success(
            t(kind === 'artist' ? 'refresh.artist' : 'refresh.album', { name: title, title }),
            {
              description: t(musicBrainz ? 'refresh.body.musicbrainz' : 'refresh.body.tags'),
            },
          ),
        (e) => toast.error(t('refresh.failed'), { description: (e as Error).message }),
      ),
  }
}

/** Refresh metadata, and MusicBrainz's page when there's an id; what's in hand on it beside them. */
function Actions({
  onRefresh,
  pending,
  musicBrainz,
  item,
}: {
  onRefresh: () => void
  pending: boolean
  musicBrainz: string | null
  /** HT-106: the artist or album, for the mark of what the server is doing to it. */
  item: { kind: 'artist' | 'album'; id: string; title: string }
}) {
  const t = useT(messages)
  const work = useItemWork(item.kind, item.id, item.title)
  const more = useRef<ComponentRef<typeof Button>>(null)
  const [menu, setMenu] = useState(false)
  // Refresh, then a More menu with MusicBrainz's page, as a show's header has Search, Edit and More
  // (show-detail.tsx), so it fits a compact window
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'], flexShrink: 1 }}>
      <ItemWorkMark jobs={work.jobs} look="page" item={work.item} />
      <Button
        icon="refresh"
        loading={pending}
        disabled={work.busy('music.metadata')}
        onPress={onRefresh}
      >
        {t('refresh')}
      </Button>
      {musicBrainz && (
        <>
          <Button
            ref={more}
            variant="ghost"
            iconOnly
            icon="more"
            accessibilityLabel={t('moreActions')}
            hasPopup="menu"
            accessibilityState={{ expanded: menu }}
            onPress={() => setMenu(true)}
          />
          <Menu
            title={t('moreActions')}
            open={menu}
            onClose={() => setMenu(false)}
            anchor={more}
            items={[
              {
                label: t('openMusicBrainz'),
                icon: 'external',
                onSelect: () => void Linking.openURL(musicBrainz),
              },
            ]}
          />
        </>
      )}
    </View>
  )
}

/** The path, which wraps anywhere: a folder name has no spaces to break at. */
function Path({ children }: { children: string }) {
  return (
    <Text variant="caption" color="text-3" mono style={{ wordBreak: 'break-all' } as object}>
      {children}
    </Text>
  )
}

function Missing({ message, body }: { message: string; body: string }) {
  const t = useT(messages)
  return (
    <EmptyState
      tone="error"
      icon="music"
      title={message}
      action={<Button href={musicPath()}>{t('artist.go')}</Button>}
    >
      {body}
    </EmptyState>
  )
}

// ---------------------------------------------------------------- an artist

/** `/music/artists/{id}`. */
export function ArtistDetail({ id }: { id: string }) {
  return (
    <Served source="music">
      <Artist id={id} />
    </Served>
  )
}

function Artist({ id }: { id: string }) {
  const t = useT(messages)
  const artist = useQuery(
    `music:artist:${id}`,
    (c) => c.musicLibrary.artist({ params: { id } }),
    MUSIC_TOPICS,
  )
  const refresh = useRefresh('artist', id)
  const a = artist.data
  const actions = a ? (
    <Actions
      pending={refresh.pending}
      onRefresh={() => refresh.start(a.name, a.source === 'musicbrainz')}
      musicBrainz={a.musicBrainzId ? musicBrainzUrl('artist', a.musicBrainzId) : null}
      item={{ kind: 'artist', id, title: a.name }}
    />
  ) : undefined
  return (
    <AdminPage title={a?.name ?? t('artist')} actions={actions}>
      {artist.status === 'error' ? (
        <Missing message={artist.error.message} body={t('artist.missing')} />
      ) : !a ? (
        <SummarySkeleton />
      ) : (
        <View style={{ gap: s['6'], minWidth: 0 }}>
          <ArtistSummary artist={a} />
          <ArtistAlbums artist={a} />
        </View>
      )}
    </AdminPage>
  )
}

function ArtistSummary({ artist: a }: { artist: LibraryArtistDetail }) {
  const t = useT(messages)
  const badge = sourceBadge[a.source]
  return (
    <SummaryCard
      label={t('artist.summary')}
      poster={(width) => (
        <Poster title={a.name} src={a.photo} aspect="square" round width={width} />
      )}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
        <Badge tone={badge.tone}>{t(badge.label)}</Badge>
      </View>
      <Line>
        {[
          a.genres.length ? (
            <Text key="genres" variant="caption" color="text-2">
              {a.genres.join(t('comma'))}
            </Text>
          ) : null,
          <Text key="albums" variant="caption" color="text-2">
            {t('albums', { count: a.albums })}
          </Text>,
          <Text key="tracks" variant="caption" color="text-2">
            {t('tracks', { count: a.tracks })}
          </Text>,
          <Text key="size" variant="caption" color="text-2" mono>
            {bytes(a.size)}
          </Text>,
        ]}
      </Line>
      <Text variant="body" color={a.bio ? 'text' : 'text-3'}>
        {a.bio ?? t('artist.noBio')}
      </Text>
      <Path>{a.path}</Path>
      {a.videos > 0 && (
        <Text variant="caption" color="text-3">
          {t('artist.videos', { count: a.videos })}
        </Text>
      )}
    </SummaryCard>
  )
}

/** Their albums, newest first, as a grid or the table, following Music's view. */
function ArtistAlbums({ artist: a }: { artist: LibraryArtistDetail }) {
  const t = useT(messages)
  const [view] = useMusicView()
  return (
    <View role="region" aria-label={t('artist.albums')}>
      <TableFrame>
        <TableToolbar>
          <View role="heading" aria-level={2}>
            <Text size={UI} weight={600}>
              {t('artist.albums')}
            </Text>
          </View>
          <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-3">
            {t('albums', { count: a.albumList.length })}
          </Text>
        </TableToolbar>
        {a.albumList.length === 0 ? (
          <View style={{ padding: s['5'] }}>
            <EmptyState icon="music" title={t('artist.noAlbums.title')}>
              {t('artist.noAlbums.body')}
            </EmptyState>
          </View>
        ) : view === 'grid' ? (
          <View style={{ padding: admin.table.cellX }}>
            <LibraryPosters
              items={a.albumList}
              keyOf={(x) => x.id}
              label={t('artist.albums')}
              render={(x) => <AlbumTile album={x} artist={false} />}
              square
            />
          </View>
        ) : (
          <AlbumTable albums={a.albumList} artist={false} />
        )}
      </TableFrame>
    </View>
  )
}

// ---------------------------------------------------------------- an album

/** `/music/albums/{id}`, Files at `/music/albums/{id}/files`. */
export function AlbumDetail({ id, tab = 'tracks' }: { id: string; tab?: AlbumTab }) {
  return (
    <Served source="music">
      <Album id={id} tab={ALBUM_TABS.includes(tab) ? tab : 'tracks'} />
    </Served>
  )
}

function Album({ id, tab }: { id: string; tab: AlbumTab }) {
  const t = useT(messages)
  const album = useQuery(
    `music:album:${id}`,
    (c) => c.musicLibrary.album({ params: { id } }),
    MUSIC_TOPICS,
  )
  const setTab = useTabAddress<AlbumTab>(albumPath(id), 'tracks')
  const refresh = useRefresh('album', id)
  const a = album.data
  const actions = a ? (
    <Actions
      pending={refresh.pending}
      onRefresh={() => refresh.start(a.title, a.source === 'musicbrainz')}
      musicBrainz={a.musicBrainzId ? musicBrainzUrl('release-group', a.musicBrainzId) : null}
      item={{ kind: 'album', id, title: a.title }}
    />
  ) : undefined
  return (
    <AdminPage title={a?.title ?? t('album')} actions={actions}>
      {album.status === 'error' ? (
        <Missing message={album.error.message} body={t('album.missing')} />
      ) : !a ? (
        <SummarySkeleton />
      ) : (
        <>
          <AlbumSummary album={a} />
          <View>
            <Tabs<AlbumTab>
              variant="line"
              aria-label={t('album.sections')}
              value={tab}
              onValueChange={setTab}
              options={ALBUM_TABS.map((value) => ({ value, label: t(`tab.${value}`) }))}
            />
            <View
              role="tabpanel"
              aria-label={t(`tab.${tab}`)}
              style={{ paddingTop: s['5'], gap: s['4'], minWidth: 0 }}
            >
              {tab === 'tracks' ? (
                a.discList.map((d) => <Disc key={d.number} disc={d} many={a.discs > 1} />)
              ) : (
                <Files album={a} />
              )}
            </View>
          </View>
        </>
      )}
    </AdminPage>
  )
}

function AlbumSummary({ album: a }: { album: LibraryAlbumDetail }) {
  const t = useT(messages)
  const long = useLongDate()
  const badge = sourceBadge[a.source]
  return (
    <SummaryCard
      label={t('album.summary')}
      poster={(width) => <Poster title={a.title} src={a.cover} aspect="square" width={width} />}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
        <Badge tone={badge.tone}>{t(badge.label)}</Badge>
        {a.kind !== 'album' && <Badge tone="neutral">{t(`kind.${a.kind}`)}</Badge>}
        <QualityTag overlay={false}>{formatsLine(a)}</QualityTag>
      </View>
      <Line>
        {[
          <TitleLink key="artist" href={artistPath(a.artist.id)}>
            {a.artist.name}
          </TitleLink>,
          a.year ? (
            <Text key="year" variant="caption" color="text-2" mono>
              {String(a.year)}
            </Text>
          ) : null,
          <Text key="tracks" variant="caption" color="text-2">
            {t('tracks', { count: a.tracks })}
          </Text>,
          a.discs > 1 ? (
            <Text key="discs" variant="caption" color="text-2">
              {t('discs', { count: a.discs })}
            </Text>
          ) : null,
          <Text key="length" variant="caption" color="text-2" mono>
            {clock(a.duration)}
          </Text>,
          <Text key="size" variant="caption" color="text-2" mono>
            {bytes(a.size)}
          </Text>,
        ]}
      </Line>
      {(a.released || a.label || a.genres.length > 0) && (
        <Line>
          {[
            a.released ? (
              <Text key="released" variant="caption" color="text-2">
                {t('released', { date: long(a.released) })}
              </Text>
            ) : null,
            a.label ? (
              <Text key="label" variant="caption" color="text-2">
                {a.label}
              </Text>
            ) : null,
            a.genres.length ? (
              <Text key="genres" variant="caption" color="text-2">
                {a.genres.join(t('comma'))}
              </Text>
            ) : null,
          ]}
        </Line>
      )}
      <Path>{a.path}</Path>
    </SummaryCard>
  )
}

/** A disc's tracks, drawn as a show's season is: a frame with its heading and figures, then rows. */
function Disc({ disc: d, many }: { disc: LibraryDisc; many: boolean }) {
  const t = useT(messages)
  const length = d.tracks.reduce((n, x) => n + x.duration, 0)
  const size = d.tracks.reduce((n, x) => n + x.file.size, 0)
  const title = many ? t('disc', { number: d.number }) : t('tab.tracks')
  return (
    <View role="region" aria-label={title}>
      <TableFrame>
        <TableToolbar>
          <View role="heading" aria-level={3}>
            <Text size={UI} weight={600}>
              {title}
            </Text>
          </View>
          <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-3">
            {t('disc.figures', {
              tracks: t('tracks', { count: d.tracks.length }),
              length: clock(length),
              size: bytes(size),
            })}
          </Text>
        </TableToolbar>
        {d.tracks.length === 0 ? (
          <View style={{ padding: s['5'] }}>
            <Text size={UI} color="text-3">
              {t('noTracks')}
            </Text>
          </View>
        ) : (
          <Table label={many ? t('disc.table', { number: d.number }) : t('tracks.table')}>
            <TableHeader>
              <TableRow>
                <TableHead width={admin.table.checkColumn} numeric>
                  {t('col.number')}
                </TableHead>
                <TableHead>{t('col.title')}</TableHead>
                <TableHead numeric>{t('col.length')}</TableHead>
                <TableHead>{t('col.quality')}</TableHead>
                <TableHead numeric>{t('col.size')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.tracks.map((x) => (
                <TableRow key={x.id}>
                  <TableCell numeric>{String(x.number)}</TableCell>
                  <TableCell truncate>
                    <View style={{ flexShrink: 1, minWidth: 0 }}>
                      <Text size={UI} numberOfLines={1}>
                        {x.title}
                      </Text>
                      {x.artist && (
                        <Text
                          size={tokens.adminText.release.size}
                          leading={tokens.adminText.release.leading}
                          color="text-3"
                          numberOfLines={1}
                        >
                          {x.artist}
                        </Text>
                      )}
                    </View>
                  </TableCell>
                  <TableCell numeric>{clock(x.duration)}</TableCell>
                  <TableCell>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
                      <QualityTag overlay={false}>{x.file.format}</QualityTag>
                      <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-3">
                        {formatDetail(x.file)}
                      </Text>
                    </View>
                  </TableCell>
                  <TableCell numeric>{bytes(x.file.size)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableFrame>
    </View>
  )
}

/** Each file on disk with its format, bitrate and size, then what else the folder holds. */
function Files({ album: a }: { album: LibraryAlbumDetail }) {
  const t = useT(messages)
  const tracks = a.discList.flatMap((d) => d.tracks)
  return (
    <>
      <TableFrame>
        <TableToolbar>
          <Text size={UI} color="text-2">
            {t('files.summary', { count: tracks.length, size: bytes(a.size) })}
          </Text>
        </TableToolbar>
        <Table label={t('tab.files')}>
          <TableHeader>
            <TableRow>
              {a.discs > 1 && <TableHead numeric>{t('col.disc')}</TableHead>}
              <TableHead>{t('col.file')}</TableHead>
              <TableHead>{t('col.format')}</TableHead>
              <TableHead>{t('col.quality')}</TableHead>
              <TableHead numeric>{t('col.bitrate')}</TableHead>
              <TableHead numeric>{t('col.size')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tracks.map((x) => (
              <TableRow key={x.file.path}>
                {a.discs > 1 && (
                  <TableCell tall numeric>
                    {String(x.disc)}
                  </TableCell>
                )}
                <TableCell tall truncate>
                  <TitleCell title={basename(x.file.path)} detail={dirname(x.file.path)} />
                </TableCell>
                <TableCell tall>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
                    <QualityTag overlay={false}>{x.file.format}</QualityTag>
                    {x.file.lyrics && (
                      <Badge tone="neutral" icon="subtitles">
                        {t('lyrics')}
                      </Badge>
                    )}
                  </View>
                </TableCell>
                <TableCell tall>
                  <Text size={FIGURE.size} leading={FIGURE.leading} mono color="text-2">
                    {x.file.bitDepth ? formatDetail(x.file) : kilohertz(x.file.sampleRate)}
                  </Text>
                </TableCell>
                <TableCell tall numeric>
                  {t('kbps', { rate: x.file.bitrate })}
                </TableCell>
                <TableCell tall numeric>
                  {bytes(x.file.size)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      <Extras album={a} />
    </>
  )
}

/** The folder's cover and album.nfo, which the scan reads but aren't tracks. */
function Extras({ album: a }: { album: LibraryAlbumDetail }) {
  const t = useT(messages)
  const rows: ReactNode[] = []
  if (a.extras.coverFile)
    rows.push(
      <Extra
        key="cover"
        icon="music"
        name={basename(a.extras.coverFile)}
        what={t('files.cover')}
      />,
    )
  if (a.extras.nfo)
    rows.push(<Extra key="nfo" icon="info" name="album.nfo" what={t('files.nfo')} />)
  return (
    <TableFrame>
      <TableToolbar>
        <View role="heading" aria-level={3}>
          <Text size={UI} weight={600}>
            {t('files.extras')}
          </Text>
        </View>
      </TableToolbar>
      <View style={{ padding: admin.table.cellX, gap: s['2'] }}>
        {rows.length ? (
          rows
        ) : (
          <Text size={UI} color="text-3">
            {a.source === 'musicbrainz' ? t('files.noCover') : t('files.noCoverTags')}
          </Text>
        )}
      </View>
    </TableFrame>
  )
}

function Extra({ icon, name, what }: { icon: 'music' | 'info'; name: string; what: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
      <Icon name={icon} size={tokens.icon.size.sm} color="text-3" />
      <Text size={UI} mono>
        {name}
      </Text>
      <Text size={UI} color="text-3">
        {what}
      </Text>
    </View>
  )
}
