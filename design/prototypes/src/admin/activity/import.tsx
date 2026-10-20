// SPDX-License-Identifier: AGPL-3.0-only
// A17 Manual import (reference, docs/product/manual-import.md): files highsea didn't download, or
// couldn't import on its own. Pick a folder, check what each file matched, see the name it will
// get, then hardlink or move them in.

import { bytes } from '@highsea/core/format'
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
} from '@highsea/ui-web'
import { useEffect, useState } from 'react'
import { useAction, useClient, useQuery } from '../../mock/hooks.tsx'
import type { ImportCandidate } from '../../mock/types.ts'
import { AdminPage, adminHref } from '../shell.tsx'

type Row = ImportCandidate & { selected: boolean; done: boolean }

export function ManualImport() {
  const client = useClient()
  const [path, setPath] = useState('/data/downloads/complete')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [mode, setMode] = useState<'hardlink' | 'move'>('hardlink')
  const folders = useQuery(`import:folders:${path}`, (c) => c.fs.list(path))
  const movies = useQuery('import:movies', (c) => c.movies.list())
  const media = useQuery('import:naming', (c) => c.settings.get('media'))
  const run = useAction((c, files: { path: string; itemId: string }[]) =>
    c.manualImport.run(files, mode),
  )

  const scan = () => {
    setScanning(true)
    setError(null)
    client.manualImport
      .scan(path)
      .then((xs) =>
        setRows(xs.map((x) => ({ ...x, selected: !x.skip && !!x.itemId, done: false }))),
      )
      .catch((e: Error) => setError(e.message))
      .finally(() => setScanning(false))
  }

  // the downloads folder is where stray files usually are: look there straight away
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => scan(), [])

  const movie = (id: string | null) => movies.data?.find((m) => m.id === id)
  const format =
    media.data && 'fileFormat' in media.data
      ? media.data.fileFormat
      : '{Movie Title} ({Release Year}) {Quality Full}'
  const becomes = (r: Row) => {
    const m = movie(r.itemId)
    if (!m) return '—'
    const ext = r.path.split('.').pop()
    const name = format
      .replace('{Movie Title}', m.title)
      .replace('{Release Year}', String(m.year))
      .replace('{Quality Full}', r.quality.replace(' ', '-'))
    return `${m.title} (${m.year})/${name}.${ext}`
  }
  const chosen = (rows ?? []).filter((r) => r.selected && r.itemId && !r.done)
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs?.map((r, j) => (j === i ? { ...r, ...patch } : r)) ?? null)

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
        <section aria-label="Folder" className="grid gap-3 rounded-lg border border-line bg-s1 p-4">
          <Field
            label="Folder"
            error={error ?? undefined}
            hint="A folder on the server. highsea looks inside it, and one level down."
          >
            <div className="flex gap-2">
              <Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" />
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
                    .run(chosen.map((r) => ({ path: r.path, itemId: r.itemId as string })))
                    .then((n) => {
                      setRows(
                        (rs) =>
                          rs?.map((r) =>
                            r.selected && r.itemId ? { ...r, done: true, selected: false } : r,
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
                  <TableHead>Movie</TableHead>
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
                          disabled={!r.itemId || !!r.skip || r.done}
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
                        ) : !r.itemId ? (
                          <div className="text-caption text-badge-warning">
                            Didn’t match a movie. Choose one.
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="w-60">
                        <Select
                          aria-label={`${file}: movie`}
                          value={r.itemId ?? ''}
                          placeholder="Choose a movie"
                          disabled={!!r.skip || r.done}
                          onValueChange={(itemId) => set(i, { itemId, selected: true })}
                          options={(movies.data ?? []).map((m) => ({
                            value: m.id,
                            label: `${m.title} (${m.year})`,
                          }))}
                        />
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
    </AdminPage>
  )
}
