// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Migration (settings.md › Migration; ADR 0041), as apps/server built it (migration.tsx):
// the one-time importers, the owner's alone. A group each for Radarr and qBittorrent: the
// connection and its path mappings, Test, Preview (what comes across, Radarr's profiles mapped to
// highsea's nearest first and editable, and what can't come across, with the way to Indexers),
// then Import, whose progress follows the simulated clock. qBittorrent's torrents come across
// paused; Resume asks first that qBittorrent is stopped. Any address and key work in the mock
// except one with "wrong" in it.
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Progress,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@highsea-tv/ui'
import { type ReactNode, useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import {
  COPY_PROFILE,
  type ImportStatus,
  type PathMapping,
  type QbittorrentPreview,
  type RadarrPreview,
} from '../../mock/migration.ts'
import type { EventTopic } from '../../mock/types.ts'
import { adminHref } from '../shell.tsx'
import { fieldOf } from './parts.tsx'
import { AreaPage, Group } from './settings.tsx'

const n = (count: number, one: string, other: string) => `${count} ${count === 1 ? one : other}`

/** A run's status follows the clock while it goes, so it listens to the tick only then. */
const topics = (running: boolean, ...more: EventTopic[]): EventTopic[] =>
  running ? ['settings.updated', 'tick', ...more] : ['settings.updated', ...more]

export function Migration() {
  return (
    <AreaPage id="migration">
      <p className="text-body text-text-2">
        Nothing is changed in either program. Import Radarr first, so torrents it grabbed find their
        movies.
      </p>
      <RadarrCard />
      <QbittorrentCard />
    </AreaPage>
  )
}

// ---------- shared parts

function Mappings({
  value,
  onChange,
}: {
  value: PathMapping[]
  onChange: (next: PathMapping[]) => void
}) {
  const set = (i: number, patch: Partial<PathMapping>) =>
    onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 grid gap-0.5">
        <span className="font-semibold text-text text-ui">Path mappings</span>
        <span className="text-caption text-text-3">
          When the other program sees your folders under different paths, say where each one is for
          highsea.
        </span>
      </legend>
      {value.length === 0 && (
        <p className="text-caption text-text-3">No mappings: the paths are the same for both.</p>
      )}
      {value.map((m, i) => (
        <div
          // rows have no identity but their place; a removed row re-renders the rest
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          className="grid items-end gap-2 medium:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <Field label="Their path">
            <Input
              value={m.from}
              spellCheck={false}
              autoComplete="off"
              placeholder="/movies"
              onChange={(e) => set(i, { from: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label="highsea’s path">
            <Input
              value={m.to}
              icon="folder"
              spellCheck={false}
              autoComplete="off"
              placeholder="/data/media/movies"
              onChange={(e) => set(i, { to: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Button
            variant="ghost"
            icon="delete"
            iconOnly
            aria-label="Remove this mapping"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          />
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        icon="add"
        className="justify-self-start"
        onClick={() => onChange([...value, { from: '', to: '' }])}
      >
        Add a mapping
      </Button>
    </fieldset>
  )
}

/** The mappings with both sides filled; half-filled rows are left out. */
const filled = (maps: PathMapping[]) =>
  maps.map((m) => ({ from: m.from.trim(), to: m.to.trim() })).filter((m) => m.from && m.to)

function Progressing({
  status,
  children,
}: {
  status: ImportStatus | undefined
  children?: ReactNode
}) {
  if (!status || status.state === 'idle') return null
  const of = `${status.done} of ${status.total}`
  return (
    <section
      aria-label="Import progress"
      className="grid gap-2 rounded-md border border-line bg-s2 p-3"
    >
      {status.state === 'running' && (
        <>
          <p className="text-body text-text">Importing. You can leave this page; it carries on.</p>
          <Progress
            value={status.total ? (status.done / status.total) * 100 : 0}
            showValue
            aria-label={of}
          />
          <p className="text-caption text-text-3">{of}</p>
        </>
      )}
      {status.state === 'done' && (
        <p className="text-body text-text">
          Imported {n(status.imported, 'item', 'items')}, skipped {status.skipped} already here.
        </p>
      )}
      {status.state === 'failed' && (
        <p className="text-badge-danger text-body">
          The import stopped. Run it again to carry on where it left off.
        </p>
      )}
      {status.failures.length > 0 && (
        <details className="text-caption text-text-2">
          <summary className="cursor-pointer text-text">
            {status.failures.length} couldn’t come across
          </summary>
          <ul className="mt-2 grid gap-1">
            {status.failures.map((f, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: one name can fail twice
              <li key={i}>
                <span className="font-semibold text-text">{f.name}</span>: {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {children}
    </section>
  )
}

const ROOT_STATUS = { 'root-folder': 'Root folder', add: 'Added', outside: 'Can’t use' } as const

// ---------- Radarr

function RadarrCard() {
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [mappings, setMappings] = useState<PathMapping[]>([])
  const [connected, setConnected] = useState<string | null>(null)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [preview, setPreview] = useState<RadarrPreview | null>(null)
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState(true)
  const [running, setRunning] = useState(false)
  const status = useQuery('migration:radarr', (c) => c.importers.radarrStatus(), topics(running))
  const isRunning = status.data?.state === 'running'
  if (isRunning !== running) setRunning(isRunning)
  const ours = useQuery('migration:profiles', (c) => c.movies.qualityProfiles())
  const test = useAction((c) => c.importers.radarrTest({ url, apiKey }))
  const look = useAction((c) =>
    c.importers.radarrPreview({ url, apiKey, pathMappings: filled(mappings) }),
  )
  const run = useAction((c) =>
    c.importers.radarrRun({ url, apiKey, pathMappings: filled(mappings), profiles, settings }),
  )

  const fail = (what: string) => (e: unknown) => {
    setError({ field: fieldOf(e), message: (e as Error).message })
    toast.error(what, { description: (e as Error).message })
  }
  const onTest = () => {
    setError(null)
    test
      .run()
      .then(
        (r) =>
          setConnected(`Connected to Radarr ${r.version}, with ${n(r.movies, 'movie', 'movies')}.`),
        fail('Couldn’t connect'),
      )
  }
  const onPreview = () => {
    setError(null)
    look.run().then((p) => {
      setPreview(p)
      setConnected(null)
      // each Radarr profile starts on its nearest
      setProfiles(
        Object.fromEntries(p.profiles.map((x) => [String(x.radarrId), x.options[0] ?? ''])),
      )
    }, fail('Couldn’t read what would come across'))
  }
  const onRun = () =>
    run
      .run()
      .then(() => toast.success('The Radarr import has started'), fail('Couldn’t start the import'))

  const name = (id: string) =>
    id === COPY_PROFILE
      ? 'Bring it across as it is'
      : (ours.data?.find((p) => p.id === id)?.name ?? id)

  return (
    <Group
      title="Radarr"
      description="Movies, where they are on disk, quality profiles, tags, naming, and the blocklist. Files stay where they are."
    >
      <div className="grid items-start gap-4 medium:grid-cols-2">
        <Field
          label="Address"
          hint="As highsea reaches it, with the port."
          error={error?.field === 'url' ? error.message : undefined}
        >
          <Input
            value={url}
            placeholder="http://radarr:7878"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field
          label="API key"
          hint="In Radarr, Settings › General › Security."
          error={error?.field === 'apiKey' ? error.message : undefined}
        >
          <Input
            type="password"
            value={apiKey}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono"
          />
        </Field>
      </div>
      <Mappings value={mappings} onChange={setMappings} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onTest} loading={test.pending} disabled={!url.trim()}>
          Test
        </Button>
        <Button
          variant="secondary"
          onClick={onPreview}
          loading={look.pending}
          disabled={!url.trim() || !apiKey.trim()}
        >
          Preview
        </Button>
        {connected && (
          <p role="status" className="text-caption text-text-2">
            {connected}
          </p>
        )}
      </div>

      {preview && (
        <div className="grid gap-4">
          <p className="text-body text-text">
            {n(preview.movies.total, 'movie', 'movies')}, {preview.movies.withFiles} with files.{' '}
            {preview.movies.inLibrary} already in highsea, {preview.movies.ready} ready to come
            across.
          </p>
          {preview.rootFolders.length > 0 && (
            <section aria-label="Root folders" className="grid gap-2">
              <h3 className="font-semibold text-text text-ui">Root folders</h3>
              <ul className="grid gap-1.5">
                {preview.rootFolders.map((r) => (
                  <li key={r.radarr} className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 break-all font-mono text-caption text-text-2">
                      {r.radarr} → {r.path}
                    </span>
                    <Badge
                      tone={
                        r.status === 'outside' ? 'danger' : r.status === 'add' ? 'info' : 'success'
                      }
                    >
                      {ROOT_STATUS[r.status]}
                    </Badge>
                    <span className="text-caption text-text-3">
                      {n(r.movies, 'movie', 'movies')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.profiles.length > 0 && (
            <section aria-label="Quality profiles" className="grid min-w-0 gap-2">
              <div className="grid gap-0.5">
                <h3 className="font-semibold text-text text-ui">Quality profiles</h3>
                <p className="text-caption text-text-3">
                  Each of Radarr’s profiles becomes the nearest of yours by its cutoff. Change any
                  of them here, or bring one across as it is.
                </p>
              </div>
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Radarr’s profile</TableHead>
                      <TableHead>Cutoff</TableHead>
                      <TableHead numeric>Movies</TableHead>
                      <TableHead>In highsea</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.profiles.map((p) => (
                      <TableRow key={p.radarrId}>
                        <TableCell>{p.name}</TableCell>
                        <TableCell>{p.cutoff}</TableCell>
                        <TableCell numeric>{p.movies}</TableCell>
                        <TableCell>
                          <Select
                            aria-label={`highsea’s profile for ${p.name}`}
                            value={profiles[String(p.radarrId)] ?? ''}
                            onValueChange={(v) =>
                              setProfiles((m) => ({ ...m, [String(p.radarrId)]: v }))
                            }
                            // nearest first, as the preview orders them
                            options={p.options.map((id) => ({ value: id, label: name(id) }))}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
          <Field
            inline
            label="Bring the naming format and file settings across"
            hint={
              preview.naming.problem
                ? `Radarr’s naming format stays behind: ${preview.naming.problem}`
                : 'Radarr’s folder and file formats, colon replacement, hardlinks and permissions.'
            }
          >
            <Switch checked={settings} onCheckedChange={setSettings} />
          </Field>
          <p className="text-caption text-text-2">
            {n(preview.tags, 'tag', 'tags')} and{' '}
            {n(preview.blocklist, 'blocklisted release', 'blocklisted releases')} come across too.
          </p>
          {(preview.kept.indexers.length > 0 || preview.kept.downloadClients.length > 0) && (
            <section
              aria-label="What can’t come across"
              className="grid gap-1.5 rounded-md border border-line bg-s2 p-3"
            >
              <h3 className="font-semibold text-text text-ui">What can’t come across</h3>
              <p className="text-caption text-text-2">
                Radarr’s API never hands out the passwords and keys of its indexers and download
                clients, so add them again in highsea.
              </p>
              {preview.kept.indexers.length > 0 && (
                <p className="text-caption text-text-2">
                  Indexers: {preview.kept.indexers.join(', ')}
                </p>
              )}
              {preview.kept.downloadClients.length > 0 && (
                <p className="text-caption text-text-2">
                  Download clients: {preview.kept.downloadClients.join(', ')}. highsea downloads by
                  itself.
                </p>
              )}
              <a
                href={adminHref('/indexers')}
                className="justify-self-start text-caption text-text underline underline-offset-2"
              >
                Go to Indexers
              </a>
            </section>
          )}
          {preview.problems.length > 0 && (
            <details className="text-caption text-text-2">
              <summary className="cursor-pointer text-text">
                Movies that can’t come across as things stand
              </summary>
              <ul className="mt-2 grid gap-1">
                {preview.problems.map((p, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: titles can repeat
                  <li key={i}>
                    <span className="font-semibold text-text">{p.title}</span>: {p.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button
            variant="primary"
            icon="import"
            className="justify-self-start"
            onClick={onRun}
            loading={run.pending}
            disabled={isRunning}
          >
            {status.data?.state === 'done' ? 'Import again' : 'Import'}
          </Button>
        </div>
      )}
      <Progressing status={status.data} />
    </Group>
  )
}

// ---------- qBittorrent

function QbittorrentCard() {
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mappings, setMappings] = useState<PathMapping[]>([])
  const [connected, setConnected] = useState<string | null>(null)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [preview, setPreview] = useState<QbittorrentPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [running, setRunning] = useState(false)
  const status = useQuery(
    'migration:qbittorrent',
    (c) => c.importers.qbittorrentStatus(),
    topics(running, 'torrents.updated'),
  )
  const s = status.data
  const isRunning = s?.state === 'running'
  if (isRunning !== running) setRunning(isRunning)
  const conn = { url, username, password }
  const test = useAction((c) => c.importers.qbittorrentTest(conn))
  const look = useAction((c) =>
    c.importers.qbittorrentPreview({ ...conn, pathMappings: filled(mappings) }),
  )
  const run = useAction((c) =>
    c.importers.qbittorrentRun({ ...conn, pathMappings: filled(mappings) }),
  )
  const resume = useAction((c) => c.importers.qbittorrentResume())

  const fail = (what: string) => (e: unknown) => {
    setError({ field: fieldOf(e), message: (e as Error).message })
    toast.error(what, { description: (e as Error).message })
  }
  const onTest = () => {
    setError(null)
    test
      .run()
      .then(
        (r) =>
          setConnected(
            `Connected to qBittorrent ${r.version} (Web API ${r.webApi}), with ${n(r.torrents, 'torrent', 'torrents')}.`,
          ),
        fail('Couldn’t connect'),
      )
  }
  const onPreview = () => {
    setError(null)
    look.run().then((p) => {
      setPreview(p)
      setConnected(null)
    }, fail('Couldn’t read what would come across'))
  }
  const onRun = () =>
    run
      .run()
      .then(
        () => toast.success('The qBittorrent import has started'),
        fail('Couldn’t start the import'),
      )
  const onResume = () =>
    resume.run().then(
      () => toast.success('The torrents are running in highsea'),
      (e: Error) => toast.error('Couldn’t resume the torrents', { description: e.message }),
    )

  const credentialError =
    error?.field === 'password' || error?.field === 'username' ? error.message : undefined

  return (
    <Group
      title="qBittorrent"
      description="Torrents with their categories, limits and totals. Each comes across paused, where its data already is, and is checked once."
    >
      <div className="grid items-start gap-4 medium:grid-cols-3">
        <Field
          label="Address"
          hint="As highsea reaches it, with the port."
          error={error?.field === 'url' ? error.message : undefined}
        >
          <Input
            value={url}
            placeholder="http://qbittorrent:8080"
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono"
          />
        </Field>
        <Field label="Username">
          <Input
            value={username}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field
          label="Password"
          hint="Leave both empty if qBittorrent lets this address in without signing in."
          error={credentialError}
        >
          <Input
            type="password"
            value={password}
            autoComplete="off"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>
      <Mappings value={mappings} onChange={setMappings} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onTest} loading={test.pending} disabled={!url.trim()}>
          Test
        </Button>
        <Button
          variant="secondary"
          onClick={onPreview}
          loading={look.pending}
          disabled={!url.trim()}
        >
          Preview
        </Button>
        {connected && (
          <p role="status" className="text-caption text-text-2">
            {connected}
          </p>
        )}
      </div>

      {preview && (
        <div className="grid gap-4">
          <p className="text-body text-text">
            {n(preview.torrents.total, 'torrent', 'torrents')}: {preview.torrents.ready} ready to
            come across, {preview.torrents.inDownloads} already in highsea,{' '}
            {preview.torrents.outside} outside the folders highsea may use.{' '}
            {preview.torrents.linked} linked to movies Radarr grabbed.
          </p>
          {preview.savePaths.length > 0 && (
            <section aria-label="Save paths" className="grid gap-2">
              <h3 className="font-semibold text-text text-ui">Save paths</h3>
              <ul className="grid gap-1.5">
                {preview.savePaths.map((p) => (
                  <li key={p.qbittorrent} className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 break-all font-mono text-caption text-text-2">
                      {p.qbittorrent} → {p.path}
                    </span>
                    <Badge tone={p.ok ? 'success' : 'danger'}>
                      {p.ok ? 'Usable' : 'Can’t use'}
                    </Badge>
                    <span className="text-caption text-text-3">
                      {n(p.torrents, 'torrent', 'torrents')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.categories.length > 0 && (
            <section aria-label="Categories" className="grid gap-2">
              <h3 className="font-semibold text-text text-ui">Categories</h3>
              <ul className="grid gap-1.5">
                {preview.categories.map((c) => (
                  <li key={c.qbittorrent} className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-caption text-text">{c.name}</span>
                    <span className="min-w-0 break-all font-mono text-caption text-text-3">
                      {c.folder ?? 'In the downloads folder'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Button
            variant="primary"
            icon="import"
            className="justify-self-start"
            onClick={onRun}
            loading={run.pending}
            disabled={isRunning}
          >
            {s?.state === 'done' ? 'Import again' : 'Import'}
          </Button>
        </div>
      )}
      <Progressing status={s}>
        {s && !isRunning && s.paused > 0 && (
          <div className="grid gap-2">
            <p className="text-body text-text">
              {s.paused === 1 ? '1 torrent waits' : `${s.paused} torrents wait`} paused. Stop
              qBittorrent, then resume them here, so the two never seed the same files at once.
            </p>
            {s.checking > 0 && (
              <p className="text-caption text-text-3">
                {s.checking === 1 ? '1 torrent is' : `${s.checking} torrents are`} having its data
                checked.
              </p>
            )}
            <Button
              variant="primary"
              icon="play"
              className="justify-self-start"
              loading={resume.pending}
              onClick={() => setConfirming(true)}
            >
              Resume torrents
            </Button>
          </div>
        )}
      </Progressing>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Is qBittorrent stopped?"
        description="Resume only once qBittorrent has stopped. Two clients writing to the same files can damage them."
        confirmLabel="qBittorrent is stopped, resume"
        onConfirm={onResume}
      />
    </Group>
  )
}
