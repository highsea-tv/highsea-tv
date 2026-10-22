'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A17 Manual import (manual-import.md), ported from the prototype with real data: files highsea
// didn't download, or couldn't import on its own. Pick a folder, check what each file matched, see
// the name it will get, then hardlink or move them in. What real data changes from the prototype:
// - the browser starts where the server's folder browser does, the downloads folder when it
//   exists, and looks inside on arrival;
// - Up goes to the listing's parent, and only while it's still inside what highsea may browse;
// - Becomes is the server's name for the matched movie; a movie chosen by hand gets its name on
//   the next Look inside, so the column shows a dash until then;
// - each file comes back imported or with the reason it wasn't, shown in its row;
// - `initialPath` (Downloads' Import into the library, 6b) opens it on a torrent's folder;
// - a Version column (6b, answer 8): each file picks one of its movie's versions, the scan's
//   choice (the first without a file) by default; two files for one version are refused.
import type { ImportCandidate, Movie } from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useClient, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  Checkbox,
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
} from '@highsea-tv/ui-web'
import { useEffect, useState } from 'react'
import { manualImport as messages } from './import-messages.ts'
import { clashes, defaultVersion, VersionSelect } from './import-versions.tsx'
import { ImportModes } from './library-import.tsx'
import { loadMovies } from './movie-data.ts'
import { AdminPage } from './shell.tsx'

type Mode = 'hardlink' | 'move'
type Row = ImportCandidate & { selected: boolean; done: boolean; error: string | null }

export function ManualImport({ initialPath }: { initialPath?: string } = {}) {
  const t = useT(messages)
  const client = useClient()
  const [path, setPath] = useState(initialPath ?? '')
  const [scanned, setScanned] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [mode, setMode] = useState<Mode>('hardlink')
  const folders = useQuery(`import:folders:${path}`, async (c) => {
    const listing = await c.fs.list({ query: path ? { path } : {} })
    // with no path the server lists where browsing starts, the downloads folder: show it in the
    // field and look inside, as the prototype does, since that's where stray files usually are
    if (!path) {
      setPath(listing.path)
      scan(listing.path)
    }
    return listing
  })
  const movies = useQuery(
    'import:movies',
    async (c) => (await loadMovies(c, { sort: 'title' }, Number.POSITIVE_INFINITY)).items,
    ['movies.updated'],
  )
  const run = useAction((c, files: Row[]) =>
    c.manualImport.run({
      body: {
        files: files.map((r) => ({
          path: r.path,
          movieId: r.movieId as number,
          versionId: r.versionId,
        })),
        mode,
      },
    }),
  )

  const scan = (folder = path) => {
    setScanning(true)
    setError(null)
    client.manualImport
      .scan({ body: { path: folder } })
      .then((xs) => {
        setScanned(folder)
        setRows(
          xs.map((x) => ({
            ...x,
            selected: !x.skip && x.movieId !== null,
            done: false,
            error: null,
          })),
        )
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setScanning(false))
  }

  // opened on a torrent's folder: look inside it straight away
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => {
    if (initialPath) scan(initialPath)
  }, [])

  const label = (m: Movie) => (m.year ? t('movieLabel', { title: m.title, year: m.year }) : m.title)
  const chosen = (rows ?? []).filter((r) => r.selected && r.movieId !== null && !r.done)
  const clash = clashes(chosen)
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs?.map((r, j) => (j === i ? { ...r, ...patch } : r)) ?? null)

  const importChosen = () =>
    run.run(chosen).then(
      ({ results }) => {
        const outcome = new Map(results.map((r) => [r.path, r]))
        setRows(
          (rs) =>
            rs?.map((r) => {
              const o = outcome.get(r.path)
              if (!o) return r
              return o.ok
                ? { ...r, done: true, selected: false, error: null }
                : { ...r, error: o.message }
            }) ?? null,
        )
        const imported = results.filter((r) => r.ok).length
        const failed = results.length - imported
        if (failed === 0)
          toast.success(t('done.title', { count: imported }), { description: t('done.body') })
        else toast.error(t('done.some', { failed, count: results.length }))
      },
      (e: Error) => toast.error(t('fail.run'), { description: e.message }),
    )

  const parent = folders.data?.path === path ? folders.data.parent : null

  return (
    <AdminPage
      title={t('title')}
      description={t('description')}
      actions={
        <Button variant="ghost" asChild>
          <a href="/activity">{t('back')}</a>
        </Button>
      }
    >
      <div className="grid gap-5">
        <ImportModes mode="files" />
        <section
          aria-label={t('folder')}
          className="grid gap-3 rounded-lg border border-line bg-s1 p-4"
        >
          <Field label={t('folder')} error={error ?? undefined} hint={t('folderHint')}>
            <div className="flex gap-2">
              <Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" />
              <Button
                variant="primary"
                icon="search"
                loading={scanning}
                disabled={!path}
                onClick={() => scan()}
              >
                {t('lookInside')}
              </Button>
            </div>
          </Field>
          <nav aria-label={t('foldersHere')} className="flex flex-wrap items-center gap-1.5">
            {parent && (
              <Button size="sm" variant="ghost" icon="arrow-left" onClick={() => setPath(parent)}>
                {t('up')}
              </Button>
            )}
            {(folders.data?.entries ?? [])
              .filter((f) => f.kind === 'folder')
              .map((f) => (
                <Button key={f.path} size="sm" icon="folder" onClick={() => setPath(f.path)}>
                  {f.name}
                </Button>
              ))}
          </nav>
        </section>

        {rows === null ? (
          <p className="text-caption text-text-3">{t('start')}</p>
        ) : rows.length === 0 ? (
          <EmptyState icon="folder" title={t('empty')}>
            {t('emptyBody', { path: scanned })}
          </EmptyState>
        ) : (
          <TableFrame>
            <TableToolbar>
              <SegmentedControl
                aria-label={t('how')}
                size="sm"
                value={mode}
                onValueChange={(v) => setMode(v as Mode)}
                options={[
                  { value: 'hardlink', label: t('mode.hardlink') },
                  { value: 'move', label: t('mode.move') },
                ]}
              />
              <span className="text-caption text-text-3">
                {mode === 'hardlink' ? t('mode.hardlinkBody') : t('mode.moveBody')}
              </span>
              <Button
                variant="primary"
                className="ms-auto"
                disabled={!chosen.length || clash.size > 0}
                loading={run.pending}
                onClick={importChosen}
              >
                {t('run', { count: chosen.length })}
              </Button>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">{t('col.import')}</span>
                  </TableHead>
                  <TableHead>{t('col.file')}</TableHead>
                  <TableHead>{t('col.movie')}</TableHead>
                  <TableHead>{t('col.version')}</TableHead>
                  <TableHead>{t('col.quality')}</TableHead>
                  <TableHead numeric>{t('col.size')}</TableHead>
                  <TableHead>{t('col.becomes')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const file = r.path.split('/').pop() ?? r.path
                  const becomes = r.becomes ?? '—'
                  return (
                    <TableRow key={r.path}>
                      <TableCell className="w-10">
                        <Checkbox
                          aria-label={t('importOf', { file })}
                          checked={r.selected}
                          disabled={r.movieId === null || !!r.skip || r.done}
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
                          <Badge tone="success">{t('imported')}</Badge>
                        ) : r.error ? (
                          <div className="whitespace-normal text-caption text-badge-danger">
                            {r.error}
                          </div>
                        ) : r.movieId === null ? (
                          <div className="text-caption text-badge-warning">{t('noMatch')}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="w-60">
                        <Select
                          aria-label={t('movieOf', { file })}
                          value={r.movieId === null ? '' : String(r.movieId)}
                          placeholder={t('choose')}
                          disabled={!!r.skip || r.done}
                          onValueChange={(id) =>
                            set(i, {
                              movieId: Number(id),
                              versionId: defaultVersion(
                                movies.data?.find((m) => m.id === Number(id)),
                              ),
                              becomes: null,
                              selected: true,
                              error: null,
                            })
                          }
                          options={(movies.data ?? []).map((m) => ({
                            value: String(m.id),
                            label: label(m),
                          }))}
                        />
                      </TableCell>
                      <TableCell className="w-44">
                        <VersionSelect
                          file={file}
                          movie={movies.data?.find((m) => m.id === r.movieId)}
                          value={r.versionId}
                          disabled={!!r.skip || r.done}
                          clash={clash.has(r.path)}
                          onChange={(versionId) => set(i, { versionId, error: null })}
                        />
                      </TableCell>
                      <TableCell className="text-text-2">{r.quality}</TableCell>
                      <TableCell numeric>{bytes(r.size)}</TableCell>
                      <TableCell
                        className="max-w-72 truncate font-mono text-release text-text-2"
                        title={becomes}
                      >
                        {becomes}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </div>
    </AdminPage>
  )
}
