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
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).
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
  Text,
  toast,
  tokens,
} from '@highsea-tv/ui/native'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { manualImport as messages } from './import-messages.ts'
import { clashes, defaultVersion, VersionSelect } from './import-versions.tsx'
import { ImportModes, ImportPanel } from './library-import.tsx'
import { loadMovies } from './movie-data.ts'
import { AdminPage } from './shell.tsx'
import { Release } from './table-parts.tsx'

const sp = tokens.space
/** The movie and version columns (the web's w-60 and w-44), and a file's or name's (max-w-72). */
const MOVIE_WIDTH = 240
const VERSION_WIDTH = 176
const NAME_WIDTH = 288

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
        <Button variant="ghost" href="/activity">
          {t('back')}
        </Button>
      }
    >
      <View style={{ gap: sp['5'], minWidth: 0 }}>
        <ImportModes mode="files" />
        <ImportPanel label={t('folder')}>
          <Field label={t('folder')} error={error ?? undefined} hint={t('folderHint')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp['2'] }}>
              <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 192, minWidth: 0 }}>
                <Input mono value={path} onChangeText={setPath} />
              </View>
              <Button
                variant="primary"
                icon="search"
                loading={scanning}
                disabled={!path}
                onPress={() => scan()}
              >
                {t('lookInside')}
              </Button>
            </View>
          </Field>
          <View
            role="navigation"
            aria-label={t('foldersHere')}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: sp['1'] + sp['0.5'],
            }}
          >
            {parent && (
              <Button size="sm" variant="ghost" icon="arrow-left" onPress={() => setPath(parent)}>
                {t('up')}
              </Button>
            )}
            {(folders.data?.entries ?? [])
              .filter((f) => f.kind === 'folder')
              .map((f) => (
                <Button key={f.path} size="sm" icon="folder" onPress={() => setPath(f.path)}>
                  {f.name}
                </Button>
              ))}
          </View>
        </ImportPanel>

        {rows === null ? (
          <Text variant="caption" color="text-3">
            {t('start')}
          </Text>
        ) : rows.length === 0 ? (
          <EmptyState icon="folder" title={t('empty')}>
            {t('emptyBody', { path: scanned })}
          </EmptyState>
        ) : (
          <TableFrame>
            <TableToolbar>
              <SegmentedControl<Mode>
                aria-label={t('how')}
                size="sm"
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: 'hardlink', label: t('mode.hardlink') },
                  { value: 'move', label: t('mode.move') },
                ]}
              />
              <Text variant="caption" color="text-3">
                {mode === 'hardlink' ? t('mode.hardlinkBody') : t('mode.moveBody')}
              </Text>
              <View style={{ marginStart: 'auto' }}>
                <Button
                  variant="primary"
                  disabled={!chosen.length || clash.size > 0}
                  loading={run.pending}
                  onPress={importChosen}
                >
                  {t('run', { count: chosen.length })}
                </Button>
              </View>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead hidden>{t('col.import')}</TableHead>
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
                      <TableCell>
                        <Checkbox
                          label={t('importOf', { file })}
                          hideLabel
                          checked={r.selected}
                          disabled={r.movieId === null || !!r.skip || r.done}
                          onCheckedChange={(c) => set(i, { selected: c })}
                        />
                      </TableCell>
                      <TableCell tall maxWidth={NAME_WIDTH}>
                        <View style={{ minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2 }}>
                          <Release color="text">{file}</Release>
                          {r.skip ? (
                            <Text variant="caption" color="text-3">
                              {r.skip}
                            </Text>
                          ) : r.done ? (
                            <Badge tone="success">{t('imported')}</Badge>
                          ) : r.error ? (
                            <Text variant="caption" color="badge-danger">
                              {r.error}
                            </Text>
                          ) : r.movieId === null ? (
                            <Text variant="caption" color="badge-warning">
                              {t('noMatch')}
                            </Text>
                          ) : null}
                        </View>
                      </TableCell>
                      <TableCell>
                        <View style={{ width: MOVIE_WIDTH }}>
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
                        </View>
                      </TableCell>
                      <TableCell>
                        <View style={{ width: VERSION_WIDTH }}>
                          <VersionSelect
                            file={file}
                            movie={movies.data?.find((m) => m.id === r.movieId)}
                            value={r.versionId}
                            disabled={!!r.skip || r.done}
                            clash={clash.has(r.path)}
                            onChange={(versionId) => set(i, { versionId, error: null })}
                          />
                        </View>
                      </TableCell>
                      <TableCell>
                        <Text
                          size={tokens.adminText.ui.size}
                          leading={tokens.adminText.ui.leading}
                          color="text-2"
                          numberOfLines={1}
                        >
                          {r.quality}
                        </Text>
                      </TableCell>
                      <TableCell numeric>{bytes(r.size)}</TableCell>
                      <TableCell maxWidth={NAME_WIDTH}>
                        <Release>{becomes}</Release>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableFrame>
        )}
      </View>
    </AdminPage>
  )
}

/** The folder picker's frame (the web's section: `s1`, a line, the large corner, 16 in). */
