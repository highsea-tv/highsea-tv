// SPDX-License-Identifier: AGPL-3.0-only
// Music on the phone: Library's third section beside Movies and Collections, with the view as a
// segmented control under it, as Apple Music and Spotify switch theirs. Albums are two covers a
// row with the title and artist, as Apple Music's phone grid is; artists are a list with round
// photos, as Apple Music, Spotify and Plexamp list them. One Sort and filter button opens a sheet,
// as Movies' does.
import {
  Button,
  cn,
  EmptyState,
  Poster,
  Sheet,
  SheetContent,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMusic } from '../client/data.ts'
import {
  ALL_GENRES,
  type AlbumSort,
  type ArtistSort,
  albumSorts,
  albumsCount,
  arrangeAlbums,
  arrangeArtists,
  artistSorts,
  type MusicView,
  musicGenresOf,
} from '../client/music.ts'
import { LibraryNav } from './collections.tsx'
import { gutter, Header, mobileHref } from './shell.tsx'

const chip =
  'min-h-9 cursor-pointer rounded-full border border-line px-3.5 text-[14px] text-text-2 outline-none focus-visible:ring-focus aria-pressed:border-transparent aria-pressed:bg-text aria-pressed:text-bg'

export function MobileMusic({ view }: { view: MusicView }) {
  const music = useMusic()
  const [, navigate] = useLocation()
  const [genre, setGenre] = useState(ALL_GENRES)
  const [albumSort, setAlbumSort] = useState<AlbumSort>('title')
  const [artistSort, setArtistSort] = useState<ArtistSort>('name')
  const [open, setOpen] = useState(false)
  const albums = music.data?.albums ?? []
  const artists = music.data?.artists ?? []
  const shownAlbums = arrangeAlbums(albums, genre, albumSort)
  const shownArtists = arrangeArtists(artists, artistSort)
  const filtered =
    view === 'albums' ? genre !== ALL_GENRES || albumSort !== 'title' : artistSort !== 'name'
  const count =
    view === 'albums'
      ? `${shownAlbums.length} of ${albums.length} albums`
      : `${artists.length} ${artists.length === 1 ? 'artist' : 'artists'}`
  return (
    // the whole page is the tabs' root, so each view's list is its panel
    <Tabs
      value={view}
      onValueChange={(v) => navigate(v === 'artists' ? '/library/music/artists' : '/library/music')}
      asChild
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-1">
        <Header title="Library" />
        <LibraryNav current="music" />
        <div className={gutter}>
          <TabsList aria-label="View" className="flex w-full *:flex-1">
            <TabsTrigger value="albums" className="h-8 justify-center text-[13px]">
              Albums
            </TabsTrigger>
            <TabsTrigger value="artists" className="h-8 justify-center text-[13px]">
              Artists
            </TabsTrigger>
          </TabsList>
        </div>
        <div className={cn('flex items-center gap-2', gutter)}>
          {music.status === 'loading' ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <p className="text-[13px] text-text-3">{music.status === 'success' ? count : ' '}</p>
          )}
          <Button
            size="sm"
            icon="filter"
            className="ms-auto"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            {filtered ? 'Sorted and filtered' : view === 'albums' ? 'Sort and filter' : 'Sort'}
          </Button>
        </div>
        <TabsContent value={view} className={gutter}>
          {music.status === 'loading' ? (
            view === 'albums' ? (
              <div aria-busy className="grid grid-cols-2 gap-x-3 gap-y-5">
                {Array.from({ length: 6 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                  <div key={i} aria-hidden>
                    <Skeleton className="aspect-square rounded-poster" />
                    <div className="mt-2 grid gap-1.5 py-1">
                      <Skeleton className="h-3.5 w-4/5" />
                      <Skeleton className="h-3 w-2/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div aria-busy className="grid gap-1">
                {Array.from({ length: 8 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                  <div key={i} aria-hidden className="flex items-center gap-3 py-1.5">
                    <Skeleton className="size-14 rounded-full" />
                    <div className="grid flex-1 gap-1.5">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : music.status === 'error' ? (
            <EmptyState
              tone="error"
              icon="alert"
              title="Couldn’t load the music"
              action={<Button onClick={music.refetch}>Try again</Button>}
            >
              {music.error.message}
            </EmptyState>
          ) : albums.length === 0 ? (
            <EmptyState icon="library" title="No music yet">
              When the server’s owner adds music, it shows up here.
            </EmptyState>
          ) : view === 'albums' && shownAlbums.length === 0 ? (
            <EmptyState icon="filter" title="No albums match">
              Try another genre.
            </EmptyState>
          ) : view === 'albums' ? (
            <ul aria-label="Albums" className="grid grid-cols-2 gap-x-3 gap-y-5">
              {shownAlbums.map((a) => (
                <li key={a.id}>
                  <Poster
                    aspect="square"
                    title={a.title}
                    src={a.cover}
                    href={mobileHref(`/music/albums/${a.id}`)}
                    showTitle
                    caption={a.artist.name}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul aria-label="Artists" className="grid">
              {shownArtists.map((a) => (
                <li key={a.id}>
                  <a
                    href={mobileHref(`/music/artists/${a.id}`)}
                    className="flex min-h-11 items-center gap-3 rounded-sm py-1.5 outline-none focus-visible:ring-focus"
                  >
                    <img
                      src={a.photo}
                      alt=""
                      className="size-14 shrink-0 rounded-full bg-s2 object-cover"
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate font-semibold text-[15px] text-text">{a.name}</span>
                      <span className="text-[13px] text-text-3">{albumsCount(a.albums)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            title={view === 'albums' ? 'Sort and filter' : 'Sort'}
            footer={
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setGenre(ALL_GENRES)
                    setAlbumSort('title')
                    setArtistSort('name')
                  }}
                >
                  Reset
                </Button>
                <Button variant="primary" onClick={() => setOpen(false)}>
                  {view === 'albums' ? `Show ${shownAlbums.length} albums` : 'Done'}
                </Button>
              </>
            }
          >
            <div className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-mono text-label text-text-3 uppercase">Sort by</legend>
                <div className="flex flex-wrap gap-2">
                  {view === 'albums'
                    ? albumSorts.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          aria-pressed={albumSort === s.value}
                          onClick={() => setAlbumSort(s.value)}
                          className={chip}
                        >
                          {s.label}
                        </button>
                      ))
                    : artistSorts.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          aria-pressed={artistSort === s.value}
                          onClick={() => setArtistSort(s.value)}
                          className={chip}
                        >
                          {s.label}
                        </button>
                      ))}
                </div>
              </fieldset>
              {view === 'albums' && (
                <fieldset className="grid gap-2">
                  <legend className="mb-2 font-mono text-label text-text-3 uppercase">Genre</legend>
                  <div className="flex flex-wrap gap-2">
                    {[ALL_GENRES, ...musicGenresOf(albums)].map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={genre === g}
                        onClick={() => setGenre(g)}
                        className={chip}
                      >
                        {g === ALL_GENRES ? 'All' : g}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </Tabs>
  )
}
