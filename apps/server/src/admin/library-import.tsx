'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A17's Library import mode (manual-import.md › Library import; the owner's answer 9): a library
// already on disk. The same table as Manual import with folders for files and TMDB's match as the
// movie column. The owner picks a root folder (Settings › Media management's "Import what's
// already here" opens it with the folder chosen), looks inside, checks the matches, and starts a
// job that adds each movie where it is; Rename to my format renames them as it goes. The job's
// progress is live on `import.updated`.
import {
  LIBRARY_IMPORT_TOPIC,
  type LibraryCandidate,
  type LibraryImportRunInput,
  type LibraryImportStatus,
} from '@highsea-tv/api-contract'
import { bytes } from '@highsea-tv/core/format'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useClient, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Progress,
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
import { useEffect, useRef, useState } from 'react'
import { libraryImport as messages } from './library-import-messages.ts'
import { errorReason } from './metadata-locale.ts'
import { AdminPage } from './shell.tsx'

type Row = LibraryCandidate & { selected: boolean }

/** The id tags a folder name can carry, shown literally in the copy. */
const TAGS = { tmdb: '{tmdb-…}', imdb: '{imdb-…}' }

/** Manual import and Library import, two modes of A17. */
export function ImportModes({ mode }: { mode: 'files' | 'library' }) {
  const t = useT(messages)
  return (
    <nav aria-label={t('modes')} className="flex flex-wrap gap-1.5">
      <Button
        size="sm"
        variant={mode === 'files' ? 'secondary' : 'ghost'}
        aria-current={mode === 'files' ? 'page' : undefined}
        asChild
      >
        <a href="/activity/import">{t('filesMode')}</a>
      </Button>
      <Button
        size="sm"
        variant={mode === 'library' ? 'secondary' : 'ghost'}
        aria-current={mode === 'library' ? 'page' : undefined}
        asChild
      >
        <a href="/activity/import?mode=library">{t('libraryMode')}</a>
      </Button>
    </nav>
  )
}

export function LibraryImport({ root: initialRoot = '' }: { root?: string }) {
  const t = useT(messages)
  const client = useClient()
  const [root, setRoot] = useState(initialRoot)
  const [scanned, setScanned] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [rename, setRename] = useState(false)
  const [profileId, setProfileId] = useState('')
  const roots = useQuery('import:library:roots', (c) => c.rootFolders.list(), ['settings.updated'])
  const profiles = useQuery('import:library:profiles', (c) => c.quality.profiles())
  const status = useQuery('import:library:status', (c) => c.libraryImport.status(), [
    LIBRARY_IMPORT_TOPIC,
  ])
  const run = useAction((c, body: LibraryImportRunInput) => c.libraryImport.run({ body }))

  const scan = (folder = root) => {
    setScanning(true)
    setError(null)
    client.libraryImport
      .scan({ body: { root: folder } })
      .then((xs) => {
        setScanned(folder)
        setRows(xs.map((x) => ({ ...x, selected: !x.skip && x.match !== null })))
      })
      .catch((e: Error) => setError(errorReason(e) === 'no-tmdb-key' ? t('noKey') : e.message))
      .finally(() => setScanning(false))
  }

  // opened from a root folder: look inside on arrival, as Manual import does with its folder
  const looked = useRef(false)
  useEffect(() => {
    if (initialRoot && !looked.current) {
      looked.current = true
      scan(initialRoot)
    }
  })

  // the run finished: say how it went, once, and look again so the rows show what's in now
  const s: LibraryImportStatus | undefined = status.data
  const lastState = useRef<string | null>(null)
  useEffect(() => {
    if (!s) return
    const was = lastState.current
    lastState.current = s.state
    if (was !== 'running' || s.state === 'running') return
    const failed = s.failures.length
    if (s.state === 'done' && failed === 0) toast.success(t('done.title', { count: s.imported }))
    else if (s.state === 'done') toast.error(t('done.some', { failed, count: s.total }))
    if (scanned) scan(scanned)
  })

  const running = s?.state === 'running'
  const chosen = (rows ?? []).filter((r) => r.selected && r.match && !r.skip)
  const failures = new Map((s?.failures ?? []).map((f) => [f.folder, f.message]))
  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs?.map((r, j) => (j === i ? { ...r, ...patch } : r)) ?? null)
  const start = () =>
    run
      .run({
        items: chosen.map((r) => ({ folder: r.folder, tmdbId: r.match?.tmdbId as number })),
        rename,
        ...(profileId ? { qualityProfileId: profileId } : {}),
      })
      .catch((e: Error) => toast.error(t('fail.run'), { description: e.message }))

  const rootOptions = (roots.data ?? []).map((r) => ({ value: r.path, label: r.path }))
  const profileOptions = (profiles.data ?? []).map((p) => ({ value: p.id, label: p.name }))

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
        <ImportModes mode="library" />
        <section
          aria-label={t('root')}
          className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line bg-s1 p-4"
        >
          <Field
            label={t('root')}
            error={error ?? undefined}
            hint={roots.data && rootOptions.length === 0 ? t('noRoots') : t('rootHint', TAGS)}
          >
            <div className="flex min-w-0 gap-2">
              <Select
                aria-label={t('root')}
                className="min-w-0 flex-1 font-mono"
                value={root}
                placeholder={t('chooseRoot')}
                onValueChange={setRoot}
                options={rootOptions}
              />
              <Button
                variant="primary"
                icon="search"
                loading={scanning}
                disabled={!root}
                onClick={() => scan()}
              >
                {t('lookInside')}
              </Button>
            </div>
          </Field>
        </section>

        {s && (running || s.state === 'failed') && (
          <section
            aria-label={t('progress')}
            className="grid gap-2 rounded-lg border border-line bg-s1 p-4"
          >
            {running ? (
              <>
                <p className="text-body text-text">{t('running')}</p>
                <Progress
                  value={s.total ? (s.done / s.total) * 100 : 0}
                  showValue
                  aria-label={t('progressOf')}
                />
                <p className="text-caption text-text-3">
                  {t('progressBody', { done: s.done, total: s.total })}
                </p>
              </>
            ) : (
              <p className="text-caption text-badge-danger">{t('failed')}</p>
            )}
          </section>
        )}

        {rows === null ? (
          <p className="text-caption text-text-3">{t('start')}</p>
        ) : rows.length === 0 ? (
          <EmptyState icon="folder" title={t('empty')}>
            {t('emptyBody', { path: scanned })}
          </EmptyState>
        ) : (
          <TableFrame>
            <TableToolbar>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="library-import-rename"
                  checked={rename}
                  onCheckedChange={(c) => setRename(c === true)}
                />
                <label htmlFor="library-import-rename" className="text-body text-text">
                  {t('rename')}
                </label>
              </div>
              <span className="text-caption text-text-3">
                {rename ? t('renameBody') : t('keepBody')}
              </span>
              <div className="ms-auto flex items-center gap-2">
                <Select
                  aria-label={t('profile')}
                  className="w-44"
                  value={profileId || profileOptions[0]?.value || ''}
                  onValueChange={setProfileId}
                  options={profileOptions}
                />
                <Button
                  variant="primary"
                  disabled={!chosen.length || running}
                  loading={run.pending}
                  onClick={start}
                >
                  {t('run', { count: chosen.length })}
                </Button>
              </div>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="sr-only">{t('col.import')}</span>
                  </TableHead>
                  <TableHead>{t('col.folder')}</TableHead>
                  <TableHead>{t('col.movie')}</TableHead>
                  <TableHead>{t('col.quality')}</TableHead>
                  <TableHead numeric>{t('col.size')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const failure = failures.get(r.folder)
                  return (
                    <TableRow key={r.folder}>
                      <TableCell className="w-10">
                        <Checkbox
                          aria-label={t('importOf', { folder: r.name })}
                          checked={r.selected}
                          disabled={!r.match || !!r.skip || running}
                          onCheckedChange={(c) => set(i, { selected: c === true })}
                        />
                      </TableCell>
                      <TableCell className="max-w-72">
                        <div className="truncate font-mono text-release text-text" title={r.folder}>
                          {r.name}
                        </div>
                        {r.file && (
                          <div
                            className="truncate font-mono text-caption text-text-3"
                            title={r.file}
                          >
                            {r.file.split('/').pop()}
                          </div>
                        )}
                        {failure ? (
                          <div className="whitespace-normal text-caption text-badge-danger">
                            {failure}
                          </div>
                        ) : r.inLibrary ? (
                          <Badge tone="success">{t('inLibrary')}</Badge>
                        ) : r.match === null && r.file ? (
                          <div className="whitespace-normal text-caption text-badge-warning">
                            {t('noMatch', TAGS)}
                          </div>
                        ) : r.skip ? (
                          <div className="text-caption text-text-3">{r.skip}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="w-60 text-text">
                        {r.match
                          ? r.match.year
                            ? t('movieLabel', { title: r.match.title, year: r.match.year })
                            : r.match.title
                          : '—'}
                      </TableCell>
                      <TableCell className="text-text-2">{r.quality ?? '—'}</TableCell>
                      <TableCell numeric>{r.file ? bytes(r.size) : '—'}</TableCell>
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
