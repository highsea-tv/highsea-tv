'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Shows' Unmatched (Phase 5 B, docs/product/shows.md#unmatched): what the library import and the
// scan couldn't place, at `/shows/unmatched`, drawn as Music's Unmatched is (music-library.tsx, the
// approved layout): a table of path, size, why and when, with Match and Ignore on each row.
// - A show folder TMDB couldn't name surely is matched to a show found on TMDB, then imported as the
//   library import does.
// - An episode file whose name gives no episode the show has is matched to a season and its
//   episodes (several for a multi-episode file), and filed as the import files one.
// Ignore sets it aside: it stays on disk and leaves the list, and the scan doesn't offer it again.
import type { DiscoverSeries, UnmatchedShowPath } from '@highsea-tv/api-contract'
import { bytes, relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  type BadgeTone,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  SearchField,
  Select,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  toast,
  tokens,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { Loadable } from './loadable.tsx'
import { SHOWS_TOPICS } from './show-data.ts'
import { shows as messages } from './shows-messages.ts'

const s = tokens.space
const UI = tokens.adminText.ui.size

/** The reasons the import and the scan write, each with its badge; another reads as Unmatched. */
const REASONS = {
  'no-match': 'warning',
  ambiguous: 'info',
  'second-copy': 'info',
  'no-episode-number': 'warning',
  'unknown-season': 'warning',
  'unknown-episode': 'warning',
  'episode-has-file': 'info',
  unreadable: 'danger',
} as const satisfies Record<string, BadgeTone>
type Reason = keyof typeof REASONS
const known = (r: string): r is Reason => r in REASONS

/** The Unmatched list, for the Shows tabs' count. */
export function useUnmatchedShows() {
  return useQuery('shows:unmatched', (c) => c.series.unmatched({ query: {} }), SHOWS_TOPICS)
}

export function ShowsUnmatched() {
  const t = useT(messages)
  const locale = useLocale()
  const unmatched = useUnmatchedShows()
  const [matching, setMatching] = useState<UnmatchedShowPath | null>(null)
  const [ignoring, setIgnoring] = useState<UnmatchedShowPath | null>(null)
  const ignore = useAction((c, path: string) => c.series.dismissUnmatched({ body: { path } }))
  const now = Date.now()

  const doIgnore = (u: UnmatchedShowPath) =>
    ignore.run(u.path).then(
      () => toast.success(t('ignored', { path: u.path })),
      (e) => toast.error(t('ignore.failed'), { description: (e as Error).message }),
    )

  return (
    <>
      <Loadable query={unmatched} what={t('what.unmatched')}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon="success" title={t('unmatched.empty.title')}>
              {t('unmatched.empty.body')}
            </EmptyState>
          ) : (
            <View style={{ gap: s['4'], minWidth: 0 }}>
              <Text size={UI} color="text-2">
                {t('unmatched.intro')}
              </Text>
              <TableFrame>
                <Table label={t('unmatched.table')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('col.path')}</TableHead>
                      <TableHead numeric>{t('col.size')}</TableHead>
                      <TableHead>{t('col.why')}</TableHead>
                      <TableHead>{t('col.found')}</TableHead>
                      <TableHead>{t('col.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((u) => (
                      <TableRow key={u.path}>
                        <TableCell tall truncate>
                          <Text size={UI} mono numberOfLines={1}>
                            {u.path}
                          </Text>
                        </TableCell>
                        <TableCell tall numeric>
                          {bytes(u.size)}
                        </TableCell>
                        <TableCell tall>
                          <View style={{ gap: s['1'], alignItems: 'flex-start' }}>
                            <Badge tone={known(u.reason) ? REASONS[u.reason] : 'neutral'}>
                              {known(u.reason) ? t(`reason.${u.reason}`) : t('reason.other')}
                            </Badge>
                            <Text
                              size={tokens.adminText.release.size}
                              leading={tokens.adminText.release.leading}
                              color="text-3"
                            >
                              {u.message}
                            </Text>
                          </View>
                        </TableCell>
                        <TableCell tall>
                          <Text size={UI} color="text-2">
                            {relative(u.foundAt, now, locale)}
                          </Text>
                        </TableCell>
                        <TableCell tall>
                          <View style={{ flexDirection: 'row', gap: s['2'] }}>
                            <Button
                              size="sm"
                              icon="check"
                              accessibilityLabel={t('match.label', { path: u.path })}
                              onPress={() => setMatching(u)}
                            >
                              {t('match')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              accessibilityLabel={t('ignore.label', { path: u.path })}
                              onPress={() => setIgnoring(u)}
                            >
                              {t('ignore')}
                            </Button>
                          </View>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </View>
          )
        }
      </Loadable>
      <MatchDialog target={matching} onClose={() => setMatching(null)} />
      <ConfirmDialog
        open={ignoring !== null}
        onClose={() => setIgnoring(null)}
        title={t('ignore.title')}
        description={t('ignore.body')}
        confirmLabel={t('ignore')}
        onConfirm={() => ignoring && doIgnore(ignoring)}
      />
    </>
  )
}

/** The last part of a path: a show folder's name, the start of TMDB's search. */
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/** "3", "3-4", "3, 4": an episode, or several for a multi-episode file. */
export function episodeNumbers(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return null
  const out: number[] = []
  for (const p of parts) {
    const range = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(p)
    if (!range) return null
    const from = Number(range[1])
    const to = range[2] ? Number(range[2]) : from
    if (from < 1 || to < from || to - from > 19) return null
    for (let n = from; n <= to; n++) if (!out.includes(n)) out.push(n)
  }
  return out.length > 20 ? null : out
}

/**
 * Says what an unmatched path is. A show folder: the show, found on TMDB by the folder's name (or
 * another the owner types). An episode file: its season and episodes, of the show whose folder
 * holds it. The file or folder stays where it is.
 */
function MatchDialog({
  target,
  onClose,
}: {
  target: UnmatchedShowPath | null
  onClose: () => void
}) {
  const t = useT(messages)
  // stays mounted and opens when `target` turns, as Music's does (music-library.tsx)
  const [last, setLast] = useState(target)
  const [query, setQuery] = useState('')
  const [show, setShow] = useState('')
  const [season, setSeason] = useState('')
  const [episodes, setEpisodes] = useState('')
  const [touched, setTouched] = useState(false)
  if (target && target !== last) {
    setLast(target)
    setQuery(target.kind === 'show-folder' ? nameOf(target.path) : '')
    setShow('')
    setSeason('')
    setEpisodes('')
    setTouched(false)
  }
  const shown = target ?? last
  const folder = shown?.kind === 'show-folder'
  const q = query.trim()
  const found = useQuery(`shows:unmatched-discover:${q}`, (c) =>
    folder && q
      ? c.series.discover({ query: { query: q } })
      : Promise.resolve<DiscoverSeries[]>([]),
  )
  const match = useAction(
    (c, body: { path: string; show?: string; episodes?: { season: number; episode: number }[] }) =>
      c.series.matchUnmatched({ body }),
  )

  const seasonNumber = /^\d{1,4}$/.test(season.trim()) ? Number(season.trim()) : null
  const numbers = episodeNumbers(episodes)
  const ok = folder ? show !== '' : seasonNumber !== null && numbers !== null
  const submit = () => {
    setTouched(true)
    if (!ok || !target) return
    const body = folder
      ? { path: target.path, show }
      : {
          path: target.path,
          episodes: (numbers ?? []).map((episode) => ({
            season: seasonNumber as number,
            episode,
          })),
        }
    match.run(body).then(
      () => {
        toast.success(folder ? t('matched.folder') : t('matched.file'))
        onClose()
      },
      (e) => toast.error(t('match.failed'), { description: (e as Error).message }),
    )
  }

  const results = found.data ?? []
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      closable
      size="sm"
      title={folder ? t('match.folderTitle') : t('match.fileTitle')}
      description={t(folder ? 'match.folderBody' : 'match.fileBody', {
        path: shown?.path ?? '',
      })}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('match.cancel')}
          </Button>
          <Button variant="primary" icon="check" loading={match.pending} onPress={submit}>
            {t('match.save')}
          </Button>
        </>
      }
    >
      {folder ? (
        <View style={{ gap: s['4'] }}>
          <SearchField
            label={t('match.search')}
            icon="search"
            value={query}
            onChangeText={(v) => {
              setQuery(v)
              setShow('')
            }}
            placeholder={t('match.search')}
          />
          <Field
            label={t('match.show')}
            hint={
              found.status === 'loading'
                ? t('match.searching')
                : results.length
                  ? undefined
                  : t('match.none')
            }
            error={touched && !show ? t('match.pick') : undefined}
          >
            <Select
              value={show}
              onValueChange={setShow}
              aria-label={t('match.show')}
              placeholder={t('match.pick')}
              options={results.map((r) => ({
                value: String(r.tmdbId),
                label: r.year ? `${r.title} (${r.year})` : r.title,
                disabled: r.inLibrary,
              }))}
            />
          </Field>
        </View>
      ) : (
        <View style={{ gap: s['4'] }}>
          <Field
            label={t('match.season')}
            hint={t('match.seasonHint')}
            error={touched && seasonNumber === null ? t('match.badSeason') : undefined}
          >
            <Input inputMode="numeric" value={season} onChangeText={setSeason} />
          </Field>
          <Field
            label={t('match.episodes')}
            hint={t('match.episodesHint')}
            error={touched && numbers === null ? t('match.badEpisodes') : undefined}
          >
            <Input value={episodes} onChangeText={setEpisodes} />
          </Field>
        </View>
      )}
    </Dialog>
  )
}
