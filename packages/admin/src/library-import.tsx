'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A17's Library import mode (manual-import.md › Library import; the owner's answer 9): a library
// already on disk. The same table as Manual import with folders for files and TMDB's match as the
// movie column. The owner picks a root folder (Settings › Media management's "Import what's
// already here" opens it with the folder chosen), looks inside, checks the matches, and starts a
// job that adds each movie where it is; Rename to my format renames them as it goes. The job's
// progress is live on `import.updated`.
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).
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
  ProgressBar,
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
  useTheme,
} from '@highsea-tv/ui/native'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { libraryImport as messages } from './library-import-messages.ts'
import { errorReason } from './metadata-locale.ts'
import { AdminPage } from './shell.tsx'
import { Release } from './table-parts.tsx'

const sp = tokens.space
/** The movie and profile columns (the web's w-60 and w-44), and a folder's (max-w-72). */
const MOVIE_WIDTH = 240
const PROFILE_WIDTH = 176
const NAME_WIDTH = 288

type Row = LibraryCandidate & { selected: boolean }

/** The id tags a folder name can carry, shown literally in the copy. */
const TAGS = { tmdb: '{tmdb-…}', imdb: '{imdb-…}' }

/** Manual import and Library import, two modes of A17. */
export function ImportModes({ mode }: { mode: 'files' | 'library' }) {
  const t = useT(messages)
  return (
    <View
      role="navigation"
      aria-label={t('modes')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp['1'] + sp['0.5'] }}
    >
      <Button
        size="sm"
        variant={mode === 'files' ? 'secondary' : 'ghost'}
        current={mode === 'files' ? 'page' : undefined}
        href="/activity/import"
      >
        {t('filesMode')}
      </Button>
      <Button
        size="sm"
        variant={mode === 'library' ? 'secondary' : 'ghost'}
        current={mode === 'library' ? 'page' : undefined}
        href="/activity/import?mode=library"
      >
        {t('libraryMode')}
      </Button>
    </View>
  )
}

/** A17's panels: a named region on `s1` (the web's `rounded-lg border border-line bg-s1 p-4`). */
export function ImportPanel({
  label,
  gap = sp['3'],
  children,
}: {
  label: string
  gap?: number
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <View
      role="region"
      aria-label={label}
      style={{
        gap,
        padding: sp['4'],
        borderWidth: 1,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.lg,
        backgroundColor: theme.colors.s1,
        minWidth: 0,
      }}
    >
      {children}
    </View>
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: checked after every render, once (`looked`)
  useEffect(() => {
    if (initialRoot && !looked.current) {
      looked.current = true
      scan(initialRoot)
    }
  })

  // the run finished: say how it went, once, and look again so the rows show what's in now
  const s: LibraryImportStatus | undefined = status.data
  const lastState = useRef<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: compares every render's state with the last (`lastState`)
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
  const ui = tokens.adminText.ui

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
        <ImportModes mode="library" />
        <ImportPanel label={t('root')}>
          <Field
            label={t('root')}
            error={error ?? undefined}
            hint={roots.data && rootOptions.length === 0 ? t('noRoots') : t('rootHint', TAGS)}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: sp['2'] }}>
              <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 192, minWidth: 0 }}>
                <Select
                  aria-label={t('root')}
                  value={root}
                  placeholder={t('chooseRoot')}
                  onValueChange={setRoot}
                  options={rootOptions}
                />
              </View>
              <Button
                variant="primary"
                icon="search"
                loading={scanning}
                disabled={!root}
                onPress={() => scan()}
              >
                {t('lookInside')}
              </Button>
            </View>
          </Field>
        </ImportPanel>

        {s && (running || s.state === 'failed') && (
          <ImportPanel label={t('progress')} gap={sp['2']}>
            {running ? (
              <>
                <Text variant="body">{t('running')}</Text>
                <ProgressBar
                  look="panel"
                  value={s.total ? (s.done / s.total) * 100 : 0}
                  showValue
                  label={t('progressOf')}
                />
                <Text variant="caption" color="text-3">
                  {t('progressBody', { done: s.done, total: s.total })}
                </Text>
              </>
            ) : (
              <Text variant="caption" color="badge-danger">
                {t('failed')}
              </Text>
            )}
          </ImportPanel>
        )}

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
              <Checkbox label={t('rename')} checked={rename} onCheckedChange={setRename} />
              <Text variant="caption" color="text-3">
                {rename ? t('renameBody') : t('keepBody')}
              </Text>
              <View
                style={{
                  marginStart: 'auto',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: sp['2'],
                }}
              >
                <View style={{ width: PROFILE_WIDTH }}>
                  <Select
                    aria-label={t('profile')}
                    value={profileId || profileOptions[0]?.value || ''}
                    onValueChange={setProfileId}
                    options={profileOptions}
                  />
                </View>
                <Button
                  variant="primary"
                  disabled={!chosen.length || running}
                  loading={run.pending}
                  onPress={start}
                >
                  {t('run', { count: chosen.length })}
                </Button>
              </View>
            </TableToolbar>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead hidden>{t('col.import')}</TableHead>
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
                      <TableCell>
                        <Checkbox
                          label={t('importOf', { folder: r.name })}
                          hideLabel
                          checked={r.selected}
                          disabled={!r.match || !!r.skip || running}
                          onCheckedChange={(c) => set(i, { selected: c })}
                        />
                      </TableCell>
                      <TableCell tall maxWidth={NAME_WIDTH}>
                        <View style={{ minWidth: 0, flex: 1, alignItems: 'flex-start', gap: 2 }}>
                          <Release color="text">{r.name}</Release>
                          {r.file && (
                            <Release color="text-3">{r.file.split('/').pop() ?? r.file}</Release>
                          )}
                          {failure ? (
                            <Text variant="caption" color="badge-danger">
                              {failure}
                            </Text>
                          ) : r.inLibrary ? (
                            <Badge tone="success">{t('inLibrary')}</Badge>
                          ) : r.match === null && r.file ? (
                            <Text variant="caption" color="badge-warning">
                              {t('noMatch', TAGS)}
                            </Text>
                          ) : r.skip ? (
                            <Text variant="caption" color="text-3">
                              {r.skip}
                            </Text>
                          ) : null}
                        </View>
                      </TableCell>
                      <TableCell>
                        <View style={{ width: MOVIE_WIDTH }}>
                          <Text size={ui.size} leading={ui.leading} numberOfLines={1}>
                            {r.match
                              ? r.match.year
                                ? t('movieLabel', { title: r.match.title, year: r.match.year })
                                : r.match.title
                              : '—'}
                          </Text>
                        </View>
                      </TableCell>
                      <TableCell>
                        <Text size={ui.size} leading={ui.leading} color="text-2" numberOfLines={1}>
                          {r.quality ?? '—'}
                        </Text>
                      </TableCell>
                      <TableCell numeric>{r.file ? bytes(r.size) : '—'}</TableCell>
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
