// SPDX-License-Identifier: AGPL-3.0-only
// A17 Manual import (reference, docs/product/manual-import.md): files highsea didn't download, or
// couldn't import on its own. Pick a folder, check what each file matched, see the name it will
// get, then hardlink or move them in. Since stage 6 of the prototypes' gaps a file matches a movie
// or a show's episodes (several, for a double episode), chosen in one dialog.

import { bytes } from '@highsea-tv/core/format'
import type { AdminShowDetail, ImportCandidate, MediaItem } from '@highsea-tv/mock/types'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  toast,
} from '@highsea-tv/ui'
import { useEffect, useState } from 'react'
import { useAction, useClient, useQuery } from '../../mock/hooks.tsx'
import { episodeCode } from '../episodes.ts'
import { buildEpisodeName, importedAs } from '../naming.ts'
import { AdminPage, adminHref } from '../shell.tsx'

type Row = ImportCandidate & { selected: boolean; done: boolean }
type Match = Pick<ImportCandidate, 'itemId' | 'episodes'>

const matched = (r: Match) => !!r.itemId || !!r.episodes?.episodeIds.length

/** The mock's quality line ("WEB 1080p") as Sonarr's names write it ("WEBDL-1080p"). */
const qualityName = (line: string) => line.replace(/^WEB /, 'WEBDL ').replace(' ', '-')

export function ManualImport() {
  const client = useClient()
  const [path, setPath] = useState('/data/downloads/complete')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [mode, setMode] = useState<'hardlink' | 'move'>('hardlink')
  const folders = useQuery(`import:folders:${path}`, (c) => c.fs.list(path))
  const movies = useQuery('import:movies', (c) => c.movies.list())
  // each show with its seasons, for the match dialog and the episodes' names
  const shows = useQuery(
    'import:shows',
    async (c) => Promise.all((await c.shows.list()).map((x) => c.shows.get(x.id))),
    ['shows.updated'],
  )
  const media = useQuery('import:naming', (c) => c.settings.get('media'))
  const [matching, setMatching] = useState<number | null>(null)
  const run = useAction((c, files: Parameters<typeof c.manualImport.run>[0]) =>
    c.manualImport.run(files, mode),
  )

  const scan = () => {
    setScanning(true)
    setError(null)
    client.manualImport
      .scan(path)
      .then((xs) =>
        setRows(xs.map((x) => ({ ...x, selected: !x.skip && matched(x), done: false }))),
      )
      .catch((e: Error) => setError(e.message))
      .finally(() => setScanning(false))
  }

  // the downloads folder is where stray files usually are: look there straight away
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => scan(), [])

  const movie = (id: string | null) => movies.data?.find((m) => m.id === id)
  const show = (id: string | undefined) => shows.data?.find((x) => x.id === id)
  /** The matched episodes, in order, from the show's seasons. */
  const episodesOf = (r: Match) => {
    const x = show(r.episodes?.show)
    const ids = r.episodes?.episodeIds ?? []
    return {
      show: x,
      episodes: (x?.seasonList ?? [])
        .flatMap((season) => season.episodes)
        .filter((e) => ids.includes(e.id))
        .sort((a, b) => a.season - b.season || a.number - b.number),
    }
  }
  /** "Saltmarsh · S01E01–E02", or the movie and its year. */
  const matchName = (r: Match) => {
    if (r.episodes) {
      const { show: x, episodes } = episodesOf(r)
      const first = episodes[0]
      return x && first
        ? `${x.title} · ${episodeCode(
            first.season,
            episodes.map((e) => e.number),
          )}`
        : null
    }
    const m = movie(r.itemId)
    return m ? `${m.title} (${m.year})` : null
  }
  const becomes = (r: Row) => {
    if (!media.data || !('fileFormat' in media.data)) return '—'
    const ext = r.path.split('.').pop()
    if (r.episodes) {
      const { show: x, episodes } = episodesOf(r)
      const naming = 'episodes' in media.data ? media.data.episodes : null
      if (!x || !naming || episodes.length === 0) return '—'
      const named = episodes.map((e) => ({
        season: e.season,
        episode: e.number,
        title: e.title,
        aired: e.aired,
      }))
      const file = { quality: qualityName(r.quality), releaseGroup: null }
      const parts = [
        buildEpisodeName(naming.seriesFolderFormat, x),
        x.seasonFolders ? buildEpisodeName(naming.seasonFolderFormat, x, named) : '',
        buildEpisodeName(naming.standardFormat, x, named, file, naming.multiEpisodeStyle),
      ]
      return `${parts.filter(Boolean).join('/')}.${ext}`
    }
    const m = movie(r.itemId)
    if (!m) return '—'
    return importedAs(media.data, m, r)
  }
  const chosen = (rows ?? []).filter((r) => r.selected && matched(r) && !r.done)
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs?.map((r, j) => (j === i ? { ...r, ...patch } : r)) ?? null)
  const editing = matching === null ? null : (rows?.[matching] ?? null)

  return (
    <AdminPage
      title="Manual import"
      description="Bring in files highsea didn’t download, or couldn’t import on its own."
      actions={
        <Button variant="ghost" asChild>
          <a href={adminHref('/activity')}>Back to Activity</a>
        </Button>
      }
    >
      <div className="grid gap-5">
        <section
          aria-label="Folder"
          className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-s1 p-4"
        >
          <Field
            label="Folder"
            error={error ?? undefined}
            hint="A folder on the server. highsea looks inside it, and one level down."
          >
            <div className="flex flex-wrap gap-2">
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                className="min-w-0 flex-1 basis-48 font-mono"
              />
              <Button variant="primary" icon="search" loading={scanning} onClick={scan}>
                Look inside
              </Button>
            </div>
          </Field>
          <nav aria-label="Folders here" className="flex flex-wrap items-center gap-1.5">
            {path !== '/' && (
              <Button
                size="sm"
                variant="ghost"
                icon="arrow-left"
                onClick={() => setPath(path.split('/').slice(0, -1).join('/') || '/')}
              >
                Up
              </Button>
            )}
            {(folders.data ?? []).map((f) => (
              <Button key={f.path} size="sm" icon="folder" onClick={() => setPath(f.path)}>
                {f.name}
              </Button>
            ))}
          </nav>
        </section>

        {rows === null ? (
          <p className="text-caption text-text-3">Choose a folder, then look inside it.</p>
        ) : rows.length === 0 ? (
          <EmptyState icon="folder" title="Nothing to import here">
            There are no video files in {path}.
          </EmptyState>
        ) : (
          <TableFrame>
            <TableToolbar>
              <SegmentedControl
                aria-label="How to bring them in"
                size="sm"
                value={mode}
                onValueChange={(v) => setMode(v as 'hardlink' | 'move')}
                options={[
                  { value: 'hardlink', label: 'Hardlink' },
                  { value: 'move', label: 'Move' },
                ]}
              />
              <span className="text-caption text-text-3">
                {mode === 'hardlink'
                  ? 'No extra space, and anything seeding keeps seeding.'
                  : 'The files leave this folder.'}
              </span>
              <Button
                variant="primary"
                className="ms-auto"
                disabled={!chosen.length}
                loading={run.pending}
                onClick={() =>
                  run
                    .run(
                      chosen.map((r) =>
                        r.episodes
                          ? { path: r.path, episodes: r.episodes }
                          : { path: r.path, itemId: r.itemId as string },
                      ),
                    )
                    .then((n) => {
                      setRows(
                        (rs) =>
                          rs?.map((r) =>
                            r.selected && matched(r) ? { ...r, done: true, selected: false } : r,
                          ) ?? null,
                      )
                      toast.success(`${n} ${n === 1 ? 'file' : 'files'} imported`, {
                        description: 'Renamed into the library. Subtitles are next.',
                      })
                    })
                }
              >
                Import {chosen.length} {chosen.length === 1 ? 'file' : 'files'}
              </Button>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">Import</span>
                  </TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Matches</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead numeric>Size</TableHead>
                  <TableHead>Becomes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const file = r.path.split('/').pop() ?? r.path
                  return (
                    <TableRow key={r.path}>
                      <TableCell className="w-10">
                        <Checkbox
                          aria-label={`Import ${file}`}
                          checked={r.selected}
                          disabled={!matched(r) || !!r.skip || r.done}
                          onCheckedChange={(c) => set(i, { selected: c === true })}
                        />
                      </TableCell>
                      <TableCell className="max-w-72">
                        <div className="truncate font-mono text-release text-text" title={r.path}>
                          {file}
                        </div>
                        {r.skip ? (
                          <div className="text-caption text-text-3">{r.skip}</div>
                        ) : r.done ? (
                          <Badge tone="success">Imported</Badge>
                        ) : !matched(r) ? (
                          <div className="text-caption text-badge-warning">
                            Didn’t match a movie or an episode. Choose one.
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="w-60 max-w-60">
                        <Button
                          size="sm"
                          icon={r.episodes ? 'tv' : 'movie'}
                          aria-label={`${file}: ${matchName(r) ?? 'choose a match'}`}
                          disabled={!!r.skip || r.done}
                          className="max-w-full"
                          onClick={() => setMatching(i)}
                        >
                          <span className="truncate">{matchName(r) ?? 'Choose a match'}</span>
                        </Button>
                      </TableCell>
                      <TableCell className="text-text-2">{r.quality}</TableCell>
                      <TableCell numeric>{bytes(r.size)}</TableCell>
                      <TableCell
                        className="max-w-72 truncate font-mono text-release text-text-2"
                        title={becomes(r)}
                      >
                        {becomes(r)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
      <MatchDialog
        file={editing?.path.split('/').pop() ?? ''}
        match={editing}
        movies={movies.data ?? []}
        shows={shows.data ?? []}
        onClose={() => setMatching(null)}
        onChoose={(m) => {
          if (matching !== null) set(matching, { ...m, selected: true })
          setMatching(null)
        }}
      />
    </AdminPage>
  )
}

/**
 * What a file is: a movie, or a show's episodes, from one season. A double episode is two ticked
 * at once, as Sonarr's Select Episodes has it.
 */
function MatchDialog({
  file,
  match,
  movies,
  shows,
  onClose,
  onChoose,
}: {
  file: string
  match: Match | null
  movies: MediaItem[]
  shows: AdminShowDetail[]
  onClose: () => void
  onChoose: (m: Match) => void
}) {
  const [kind, setKind] = useState<'movie' | 'episodes'>('movie')
  const [movieId, setMovieId] = useState('')
  const [showId, setShowId] = useState('')
  const [season, setSeason] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  // each time it opens, it starts from the file's match
  useEffect(() => {
    if (!match) return
    const eps = match.episodes
    const first = eps ? shows.find((x) => x.id === eps.show) : undefined
    const inSeason = first?.seasonList.find((x) =>
      x.episodes.some((e) => eps?.episodeIds.includes(e.id)),
    )
    setKind(eps ? 'episodes' : 'movie')
    setMovieId(match.itemId ?? '')
    setShowId(eps?.show ?? '')
    setSeason(inSeason ? String(inSeason.number) : '')
    setPicked(eps?.episodeIds ?? [])
  }, [match, shows])
  const show = shows.find((x) => x.id === showId)
  const seasons = [...(show?.seasonList ?? [])].sort((a, b) => a.number - b.number)
  const episodes = seasons.find((x) => String(x.number) === season)?.episodes ?? []
  const ready = kind === 'movie' ? !!movieId : picked.length > 0
  return (
    <Dialog open={!!match} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Choose what this file is"
        description={
          <span className="font-mono text-release [overflow-wrap:anywhere]">{file}</span>
        }
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!ready}
              onClick={() =>
                onChoose(
                  kind === 'movie'
                    ? { itemId: movieId, episodes: null }
                    : { itemId: null, episodes: { show: showId, episodeIds: picked } },
                )
              }
            >
              Use this match
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <SegmentedControl
            aria-label="Kind"
            size="sm"
            value={kind}
            onValueChange={(v) => setKind(v as 'movie' | 'episodes')}
            options={[
              { value: 'movie', label: 'A movie' },
              { value: 'episodes', label: 'Episodes of a show' },
            ]}
          />
          {kind === 'movie' ? (
            <Field label="Movie">
              <Select
                value={movieId}
                placeholder="Choose a movie"
                onValueChange={setMovieId}
                options={movies.map((m) => ({ value: m.id, label: `${m.title} (${m.year})` }))}
              />
            </Field>
          ) : (
            <>
              <div className="grid gap-4 medium:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Field label="Show">
                  <Select
                    value={showId}
                    placeholder="Choose a show"
                    onValueChange={(v) => {
                      setShowId(v)
                      setSeason('')
                      setPicked([])
                    }}
                    options={shows.map((x) => ({ value: x.id, label: `${x.title} (${x.year})` }))}
                  />
                </Field>
                <Field label="Season">
                  <Select
                    value={season}
                    placeholder="Choose"
                    disabled={!show}
                    onValueChange={(v) => {
                      setSeason(v)
                      setPicked([])
                    }}
                    options={seasons.map((x) => ({ value: String(x.number), label: x.title }))}
                  />
                </Field>
              </div>
              {episodes.length > 0 && (
                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-caption text-text-3">
                    Episodes in the file. Tick two or more for a double episode.
                  </legend>
                  <div className="grid max-h-64 gap-2 overflow-y-auto">
                    {episodes.map((e) => (
                      <Field
                        key={e.id}
                        inline
                        label={`${episodeCode(e.season, e.number)} · ${e.title}`}
                        hint={e.file ? 'Has a file. This one replaces it.' : undefined}
                      >
                        <Checkbox
                          checked={picked.includes(e.id)}
                          onCheckedChange={(c) =>
                            setPicked((xs) =>
                              c === true ? [...xs, e.id] : xs.filter((x) => x !== e.id),
                            )
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </fieldset>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
