// SPDX-License-Identifier: AGPL-3.0-only
// The mobile tabs after Library: Search (C6, reference), Offline (C8, reference), and You (C8),
// which leads to the settings (C7). docs/product/client-search.md, client-settings.md.

import { cn, EmptyState, Field, Icon, Input, Poster, Switch } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import {
  searchKinds,
  searchSuggestions,
  useSearch,
  useSearchQuery,
  useServer,
} from '../client/data.ts'
import { OfflineList } from '../client/offline-list.tsx'
import { type SettingsSectionId, settingsSections } from '../client/settings.ts'
import { SettingsSectionBody } from '../client/settings-sections.tsx'
import type { SearchSection } from '../mock/types.ts'
import { gutter, Header, mobileHref } from './shell.tsx'

const chip =
  'min-h-9 cursor-pointer rounded-full border border-line px-3.5 text-[14px] text-text-2 outline-none focus-visible:ring-focus active:scale-97'

// ---------------------------------------------------------------- search

export function MobileSearch() {
  const { q, setQ } = useSearchQuery()
  const { results, settled } = useSearch(q)
  const r = results.data
  return (
    <div className="grid gap-4 pt-1">
      <Header title="Search" />
      <div className={gutter}>
        <Input
          type="search"
          icon="search"
          aria-label="Search titles, genres and people"
          placeholder="Titles, genres and people"
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
          Nothing on Harbor matches “{settled}”.
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
              <MobileResults section={section} onPerson={setQ} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MobileResults({
  section,
  onPerson,
}: {
  section: SearchSection
  onPerson: (name: string) => void
}) {
  switch (section.kind) {
    case 'movies':
      return (
        <ul className={cn('grid grid-cols-3 gap-x-2 gap-y-4', gutter)}>
          {section.items.map((m) => (
            <li key={m.id}>
              <Poster
                title={m.title}
                src={m.art.poster}
                href={mobileHref(`/movies/${m.id}`)}
                showTitle
                caption={String(m.year)}
              />
            </li>
          ))}
        </ul>
      )
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
              <button
                type="button"
                onClick={() => onPerson(p.name)}
                className="grid w-full justify-items-center gap-1 text-center outline-none focus-visible:ring-focus"
              >
                <img src={p.photo} alt="" className="size-16 rounded-full object-cover" />
                <span className="line-clamp-2 text-[12px] text-text-2 leading-[1.2]">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )
  }
}

// ---------------------------------------------------------------- offline

export function MobileOffline() {
  const [wifi, setWifi] = useState(true)
  return (
    <div className="grid gap-5 pt-1">
      <Header title="Offline" />
      <div className={gutter}>
        <OfflineList
          app="mobile"
          href={(id) => mobileHref(`/play/${id}`)}
          settings={
            <Field inline label="Download on Wi-Fi only">
              <Switch checked={wifi} onCheckedChange={setWifi} />
            </Field>
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- you

export function MobileYou() {
  const server = useServer()
  const [, navigate] = useLocation()
  const name = server.data?.name ?? 'Harbor'
  const row =
    'flex min-h-13 items-center gap-3 px-4 py-2.5 text-[15px] outline-none active:bg-s2 focus-visible:focus-ring-inset'
  return (
    <div className="grid gap-6 pt-1">
      <Header title="You" />
      <div className={cn('flex items-center gap-3', gutter)}>
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-full bg-accent-soft font-semibold text-[22px] text-accent-text"
        >
          I
        </span>
        <div className="grid">
          <p className="font-semibold text-[20px]">Ines</p>
          <p className="text-[13px] text-text-3">@ines · owner of {name}</p>
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
        <li>
          <a href={mobileHref('/offline')} className={row}>
            <Icon name="download" size={20} className="text-text-3" />
            <span className="flex-1">Downloads</span>
            <Icon name="chevron-right" size={18} className="text-text-3" />
          </a>
        </li>
        <li>
          <button
            type="button"
            className={cn(row, 'w-full text-badge-danger')}
            onClick={() => navigate('/connect')}
          >
            <Icon name="sign-out" size={20} />
            Sign out of {name}
          </button>
        </li>
      </ul>
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
