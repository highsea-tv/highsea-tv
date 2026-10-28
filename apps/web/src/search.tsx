// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search on the web (docs/product/client-search.md), ported from
// design/prototypes/src/web/search.tsx: results as you type, a section per kind (movies,
// collections, people), the best-matching kind first. Kinds the web doesn't show yet (`discover`,
// TMDB's titles that aren't here, for requests) are skipped, as the API asks of clients.
import type { SearchSection } from '@highsea-tv/api-contract'
import { useSearch } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { cn, Icon, Input, Poster } from '@highsea-tv/ui-web'
import { useEffect, useState } from 'react'
import { search as messages } from './messages.ts'
import { gutter, href, useFormat, useServerName } from './shell.tsx'

/** Quick picks for an empty search. */
const SUGGESTIONS = ['Comedy', 'Horror', 'Animation', 'Science Fiction', 'Drama']

const KINDS = ['movies', 'collections', 'people'] as const
type Shown = Extract<SearchSection, { kind: (typeof KINDS)[number] }>
const shown = (s: SearchSection): s is Shown => (KINDS as readonly string[]).includes(s.kind)

/**
 * The field's text, kept in this history entry: coming Back to Search from a result finds the
 * query and its results as they were, while opening Search afresh starts empty.
 */
function useSearchQuery() {
  const [q, setQ] = useState(() => {
    try {
      const v = (history.state as Record<string, unknown> | null)?.hsSearch
      return typeof v === 'string' ? v : ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    try {
      history.replaceState({ ...(history.state as object | null), hsSearch: q }, '')
    } catch {}
  }, [q])
  return [q, setQ] as const
}

export function WebSearch() {
  const t = useT(messages)
  const name = useServerName()
  const [q, setQ] = useSearchQuery()
  const { results, settled } = useSearch(q)
  const sections = results.data?.sections.filter(shown)
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] content-start gap-8 py-8', gutter)}>
      <h1 className="sr-only">{t('title')}</h1>
      <Input
        type="search"
        icon="search"
        aria-label={t('field')}
        placeholder={t('placeholder')}
        value={q}
        autoFocus
        onChange={(e) => setQ(e.target.value)}
        className="h-12 text-body"
      />
      {!settled.trim() ? (
        <section aria-label={t('try')} className="grid gap-3">
          <h2 className="font-mono text-label text-text-3 uppercase">{t('try')}</h2>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setQ(s)}
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-text-2 text-ui outline-none hover:bg-s2 hover:text-text focus-visible:ring-focus"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : results.status === 'error' ? (
        <p className="text-badge-danger text-ui">
          {t('failed', { message: results.error.message })}
        </p>
      ) : !sections ? (
        <p aria-busy className="text-caption text-text-3">
          {t('searching')}
        </p>
      ) : sections.length === 0 ? (
        <p className="text-text-2 text-ui">{t('nothing', { name, query: settled.trim() })}</p>
      ) : (
        <div aria-live="polite" className="grid gap-8">
          {sections.map((section) => (
            <section key={section.kind} aria-label={t(section.kind)} className="grid gap-3">
              <h2 className="text-title">
                {t(section.kind)}{' '}
                <span className="font-normal text-text-3">{section.items.length}</span>
              </h2>
              <Results section={section} onPerson={setQ} />
            </section>
          ))}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-caption text-text-3">
        <Icon name="info" size={14} />
        {t('footer', { name })}
      </p>
    </main>
  )
}

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

function Results({ section, onPerson }: { section: Shown; onPerson: (name: string) => void }) {
  const f = useFormat()
  switch (section.kind) {
    case 'movies':
      return (
        <ul className={grid}>
          {section.items.map((m) => (
            <li key={m.id}>
              <Poster
                title={m.title}
                src={m.art.poster ?? undefined}
                href={href(`/movies/${m.id}`)}
                showTitle
                caption={m.year ?? undefined}
              />
            </li>
          ))}
        </ul>
      )
    case 'collections':
      return (
        <ul className={grid}>
          {section.items.map((c) => (
            <li key={c.id}>
              <Poster
                title={c.name}
                src={c.art.poster ?? undefined}
                href={href(`/collections/${c.id}`)}
                showTitle
                caption={f.caption(c)}
              />
            </li>
          ))}
        </ul>
      )
    case 'people':
      return (
        <ul className="flex flex-wrap gap-2">
          {section.items.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPerson(p.name)}
                className="flex items-center gap-2.5 rounded-full border border-line bg-s1 py-1 ps-1 pe-3.5 text-start outline-none hover:bg-s2 focus-visible:ring-focus"
              >
                {p.photo ? (
                  <img src={p.photo} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="size-8 rounded-full bg-s2" />
                )}
                <span className="grid">
                  <span className="text-text text-ui">{p.name}</span>
                  <span className="text-caption text-text-3">{f.moviesHere(p.titles)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )
  }
}
