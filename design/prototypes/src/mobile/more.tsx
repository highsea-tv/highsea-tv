// SPDX-License-Identifier: AGPL-3.0-only
// The mobile tabs after Library: Search (C6, reference), Offline (C8, reference), and You (C8),
// which leads to the settings (C7). docs/product/client-search.md, client-settings.md.

import {
  ConfirmDialog,
  cn,
  EmptyState,
  Field,
  Icon,
  Input,
  Poster,
  Switch,
  toast,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import {
  personCredits,
  searchedFor,
  searchKinds,
  searchPlaceholder,
  searchSuggestions,
  useConnection,
  usePhoneDownloadsLater,
  useSearch,
  useSearchQuery,
  useServer,
  useServerName,
} from '../client/data.ts'
import { useDownloads } from '../client/downloads.ts'
import { MediaPoster } from '../client/media-card.tsx'
import { songTime } from '../client/music.ts'
import { useMusicPlayer } from '../client/music-player.ts'
import { OfflineList } from '../client/offline-list.tsx'
import { usePeople } from '../client/profiles.ts'
import { type SettingsSectionId, settingsSections } from '../client/settings.ts'
import { SettingsSectionBody } from '../client/settings-sections.tsx'
import { ShowPoster } from '../client/show-card.tsx'
import { ProfileAvatar } from '../client/who.tsx'
import { hitSlop } from '../kit/mobile/device.tsx'
import type { SearchSection, SearchSong } from '../mock/types.ts'
import { PullToRefresh } from './pull.tsx'
import { gutter, Header, mobileHref } from './shell.tsx'
import { MobileWhoSheet } from './who-sheet.tsx'

const chip = cn(
  'relative min-h-9 cursor-pointer rounded-full border border-line px-3.5 text-[14px] text-text-2 outline-none focus-visible:ring-focus active:scale-97',
  hitSlop,
)

// ---------------------------------------------------------------- search

export function MobileSearch() {
  const { q, setQ } = useSearchQuery()
  const { results, settled } = useSearch(q)
  const server = useServerName()
  const r = results.data
  return (
    <div className="grid gap-4 pt-1">
      <Header title="Search" />
      <div className={gutter}>
        <Input
          type="search"
          icon="search"
          aria-label={`Search: ${searchPlaceholder.toLowerCase()}`}
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 text-[16px]"
        />
      </div>
      {!settled.trim() ? (
        <div className={cn('flex flex-wrap gap-2', gutter)}>
          {searchSuggestions.map((s) => (
            <button key={s} type="button" className={chip} onClick={() => setQ(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : !r ? (
        <p aria-busy className={cn('text-[13px] text-text-3', gutter)}>
          Searching…
        </p>
      ) : r.sections.length === 0 ? (
        <p className={cn('text-[15px] text-text-2', gutter)}>
          Nothing on {server} matches “{settled}”.
        </p>
      ) : (
        <div aria-live="polite" className="grid gap-6">
          {r.sections.map((section) => (
            <section
              key={section.kind}
              aria-label={searchKinds[section.kind].title}
              className="grid gap-2.5"
            >
              <h2 className={cn('font-semibold text-[17px]', gutter)}>
                {searchKinds[section.kind].title}{' '}
                <span className="font-normal text-text-3">{section.items.length}</span>
              </h2>
              <MobileResults section={section} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileResults({ section }: { section: SearchSection }) {
  switch (section.kind) {
    case 'movies':
      return (
        <ul className={cn('grid grid-cols-3 gap-x-2 gap-y-4', gutter)}>
          {section.items.map((m) => (
            <li key={m.id}>
              <MediaPoster item={m} href={mobileHref(`/movies/${m.id}`)} />
            </li>
          ))}
        </ul>
      )
    case 'shows':
      return (
        <ul className={row}>
          {section.items.map((x) => (
            <li key={x.id} className={third}>
              <ShowPoster show={x} href={mobileHref(`/shows/${x.id}`)} />
            </li>
          ))}
        </ul>
      )
    case 'episodes':
      return (
        <ul className={cn('grid gap-3', gutter)}>
          {section.items.map((e) => (
            <li key={e.id}>
              <a
                href={mobileHref(`/shows/${e.show.id}/episodes/${e.id}`)}
                className="grid grid-cols-[42%_minmax(0,1fr)] items-center gap-3 rounded-md outline-none transition-press focus-visible:ring-focus active:scale-97"
              >
                <img
                  src={e.still}
                  alt=""
                  className="aspect-still w-full rounded-md bg-s2 object-cover"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="line-clamp-2 font-semibold text-[15px] text-text">
                    {e.title}
                  </span>
                  <span className="truncate text-[13px] text-text-3">
                    {e.show.title} · {e.code}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )
    case 'artists':
      return (
        <ul className="flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
          {section.items.map((a) => (
            <li key={a.id} className="w-18 shrink-0">
              <a
                href={mobileHref(`/music/artists/${a.id}`)}
                className="grid w-full justify-items-center gap-1 text-center outline-none focus-visible:ring-focus"
              >
                <img src={a.photo} alt="" className="size-16 rounded-full bg-s2 object-cover" />
                <span className="line-clamp-2 text-[12px] text-text-2 leading-[1.2]">{a.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )
    case 'albums':
      return (
        <ul className={row}>
          {section.items.map((a) => (
            <li key={a.id} className={third}>
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
      )
    case 'songs':
      return <Songs songs={section.items} />
    case 'collections':
      return (
        <ul className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {section.items.map((c) => (
            <li key={c.id} className="w-[calc((100%-1rem)/3)] shrink-0">
              <Poster
                title={c.name}
                src={c.art.poster}
                href={mobileHref(`/collections/${c.id}`)}
                showTitle
                caption={`${c.count} ${c.count === 1 ? 'movie' : 'movies'}`}
              />
            </li>
          ))}
        </ul>
      )
    case 'people':
      return (
        <ul className="flex gap-3 overflow-x-auto px-4 [scrollbar-width:none]">
          {section.items.map((p) => (
            <li key={p.id} className="w-18 shrink-0">
              <a
                href={mobileHref(`/people/${p.id}`)}
                className="grid w-full justify-items-center gap-1 text-center outline-none focus-visible:ring-focus"
              >
                <img src={p.photo} alt="" className="size-16 rounded-full object-cover" />
                <span className="line-clamp-2 text-[12px] text-text-2 leading-[1.2]">{p.name}</span>
                <span className="sr-only">{personCredits(p)}</span>
              </a>
            </li>
          ))}
        </ul>
      )
  }
}

const row = 'flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]'
const third = 'w-[calc((100%-1rem)/3)] shrink-0'

/** Songs: each plays its album from it, as a song's row on the album's page does. */
function Songs({ songs }: { songs: SearchSong[] }) {
  const music = useMusicPlayer()
  return (
    <ul className={cn('grid gap-1', gutter)}>
      {songs.map((x) => (
        <li key={x.id}>
          <button
            type="button"
            onClick={() =>
              music.play(
                { album: x.album.id },
                { start: x.number - 1, from: { kind: 'search', name: searchedFor(), to: null } },
              )
            }
            aria-label={`Play ${x.title}, by ${x.album.artist.name}, from ${x.album.title}`}
            className="grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md py-1 text-start outline-none focus-visible:ring-focus"
          >
            <img src={x.album.cover} alt="" className="size-11 rounded-sm bg-s2 object-cover" />
            <span className="grid min-w-0">
              <span
                className={cn(
                  'truncate text-[15px]',
                  music.song?.id === x.id ? 'text-accent-text' : 'text-text',
                )}
              >
                {x.title}
              </span>
              <span className="truncate text-[13px] text-text-3">
                {x.album.artist.name} · {x.album.title}
              </span>
            </span>
            <span className="font-mono text-[12px] text-text-3">{songTime(x.duration)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------- offline

export function MobileOffline() {
  const [wifi, setWifi] = useState(true)
  const downloads = useDownloads('mobile')
  const connection = useConnection()
  // pulling asks the server again, which renews what had expired (client-settings.md#offline);
  // while it can't be reached, nothing changes and what's kept still plays
  const refresh = () => {
    if (connection === 'offline') return
    for (const x of downloads.items) if (x.state === 'expired') downloads.renew(x.id)
  }
  // the app until 4.6 builds downloads: the tab stays, and says what's coming (4.5a)
  const later = usePhoneDownloadsLater()
  if (later)
    return (
      <div className="grid gap-5 pt-1">
        <Header title="Offline" />
        <div className={cn('py-6', gutter)}>
          <EmptyState icon="download" title="Nothing downloaded">
            Downloading films to this phone comes in the next update of the app.
          </EmptyState>
        </div>
      </div>
    )
  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="grid gap-5 pt-1">
        <Header title="Offline" />
        <div className={gutter}>
          <OfflineList
            app="mobile"
            href={(x) => (x.kind === 'song' ? undefined : mobileHref(`/play/${x.id}`))}
            settings={
              <Field inline label="Download on Wi-Fi only">
                <Switch checked={wifi} onCheckedChange={setWifi} />
              </Field>
            }
          />
        </div>
      </div>
    </PullToRefresh>
  )
}

// ---------------------------------------------------------------- you

/** You; at `/you/who`, with Switch profile's sheet open over it. */
export function MobileYou({ who = false }: { who?: boolean }) {
  const server = useServer()
  const [, navigate] = useLocation()
  const name = server.data?.name ?? 'this server'
  const { people, me } = usePeople()
  const row =
    'flex min-h-13 items-center gap-3 px-4 py-2.5 text-[15px] outline-none active:bg-s2 focus-visible:focus-ring-inset'
  return (
    <div className="grid gap-6 pt-1">
      <Header title="You" />
      <div className={cn('flex items-center gap-3', gutter)}>
        <ProfileAvatar profile={me} className="size-14 text-[22px]" />
        <div className="grid">
          <p className="font-semibold text-[20px]">{me.name}</p>
          <p className="text-[13px] text-text-3">
            {me.main ? `@ines · owner of ${name}` : 'A profile on @ines’s account'}
          </p>
        </div>
      </div>
      <nav
        aria-label="Settings"
        className="mx-4 overflow-hidden rounded-lg border border-line bg-s1"
      >
        <ul className="divide-y divide-line">
          {settingsSections.map((s) => (
            <li key={s.id}>
              <a href={mobileHref(`/you/${s.id}`)} className={row}>
                <Icon name={s.icon} size={20} className="text-text-3" />
                <span className="flex-1">{s.label}</span>
                <Icon name="chevron-right" size={18} className="text-text-3" />
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <ul className="mx-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-s1">
        {people.length > 1 && (
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => navigate('/you/who', { replace: true })}
              className={cn(row, 'w-full cursor-pointer text-start')}
            >
              <Icon name="users" size={20} className="text-text-3" />
              <span className="flex-1">Switch profile</span>
            </button>
          </li>
        )}
        <li>
          <a href={mobileHref('/offline')} className={row}>
            <Icon name="download" size={20} className="text-text-3" />
            <span className="flex-1">Downloads</span>
            <Icon name="chevron-right" size={18} className="text-text-3" />
          </a>
        </li>
        <li>
          {/* asks first, as Forget this server does on the sign-in screen (connect-flow.tsx) */}
          <ConfirmDialog
            trigger={
              <button type="button" className={cn(row, 'w-full cursor-pointer text-badge-danger')}>
                <Icon name="sign-out" size={20} />
                Sign out of {name}
              </button>
            }
            title={`Sign out of ${name}?`}
            description="Your downloads stay on this phone. You can sign in again later."
            confirmLabel="Sign out"
            destructive
            onConfirm={() => {
              toast({
                title: `Signed out of ${name}`,
                description: 'Your downloads stay on this device.',
              })
              navigate('/connect')
            }}
          />
        </li>
      </ul>
      <MobileWhoSheet
        open={who}
        // the sheet's open state is in the address, without an entry of its own in the history
        onOpenChange={(open) => navigate(open ? '/you/who' : '/you', { replace: true })}
      />
    </div>
  )
}

/** One settings section, as its own screen with a way back to You. */
export function MobileSettingsScreen() {
  const { section } = useParams<{ section: string }>()
  const s = settingsSections.find((x) => x.id === section)
  if (!s)
    return (
      <div className={cn('py-10', gutter)}>
        <EmptyState icon="settings" title="There’s no setting here">
          It may have moved.
        </EmptyState>
      </div>
    )
  return (
    <div className="grid gap-4 pt-1">
      <a
        href={mobileHref('/you')}
        className={cn('flex min-h-11 items-center gap-1 text-[15px] text-accent-text', gutter)}
      >
        <Icon name="chevron-left" size={20} />
        You
      </a>
      <h1 className={cn('font-semibold text-[28px] tracking-display', gutter)}>{s.label}</h1>
      <div className={gutter}>
        <SettingsSectionBody id={s.id as SettingsSectionId} platform="mobile" />
      </div>
    </div>
  )
}
