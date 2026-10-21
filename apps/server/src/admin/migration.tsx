'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Migration (settings.md › Migration; the owner's answer 10; ADR 0041): the one-time
// importers. A card each for Radarr and qBittorrent: the connection and its path mappings, Test,
// Preview (what comes across, Radarr's profiles mapped to highsea's nearest first and editable,
// and what can't come across, with the way to Indexers), then Import, whose progress is live on
// `migration.updated`. qBittorrent's torrents come across paused; Resume asks first that
// qBittorrent is stopped. The owner's only. No prototype screen has it: approved as new layout,
// built from Settings' own parts (Group, Field, the tables and badges the other areas use).
import {
  type ImportStatus,
  MIGRATION_TOPIC,
  type PathMapping,
  type QbittorrentImportStatus,
  type QbittorrentPreview,
  type RadarrPreview,
} from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
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
} from '@highsea/ui-web'
import { type ReactNode, useState } from 'react'
import { migration as messages } from './migration-messages.ts'
import { AreaPage, Group } from './settings.tsx'

const TOPICS = [MIGRATION_TOPIC]

/** The field an error names, so its message sits under that field. */
const fieldOf = (e: unknown) => ((e as ApiError).details as { field?: string } | undefined)?.field

export function Migration() {
  const t = useT(messages)
  return (
    <AreaPage id="migration">
      <p className="text-body text-text-2">{t('intro')}</p>
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
  const t = useT(messages)
  const set = (i: number, patch: Partial<PathMapping>) =>
    onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 grid gap-0.5">
        <span className="font-semibold text-text text-ui">{t('mappings.title')}</span>
        <span className="text-caption text-text-3">{t('mappings.description')}</span>
      </legend>
      {value.length === 0 && <p className="text-caption text-text-3">{t('mappings.empty')}</p>}
      {value.map((m, i) => (
        <div
          // rows have no identity but their place; a removed row re-renders the rest
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          className="grid items-end gap-2 medium:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <Field label={t('mappings.from')}>
            <Input
              value={m.from}
              spellCheck={false}
              autoComplete="off"
              placeholder="/movies"
              onChange={(e) => set(i, { from: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label={t('mappings.to')}>
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
            aria-label={t('mappings.remove')}
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
        {t('mappings.add')}
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
  const t = useT(messages)
  if (!status || status.state === 'idle') return null
  return (
    <section
      aria-label={t('progress.label')}
      className="grid gap-2 rounded-md border border-line bg-s2 p-3"
    >
      {status.state === 'running' && (
        <>
          <p className="text-body text-text">{t('progress.running')}</p>
          <Progress
            value={status.total ? (status.done / status.total) * 100 : 0}
            showValue
            aria-label={t('progress.of', { done: status.done, total: status.total })}
          />
          <p className="text-caption text-text-3">
            {t('progress.of', { done: status.done, total: status.total })}
          </p>
        </>
      )}
      {status.state === 'done' && (
        <p className="text-body text-text">
          {t('progress.done', { imported: status.imported, skipped: status.skipped })}
        </p>
      )}
      {status.state === 'failed' && (
        <p className="text-body text-badge-danger">{t('progress.failed')}</p>
      )}
      {status.failures.length > 0 && (
        <details className="text-caption text-text-2">
          <summary className="cursor-pointer text-text">
            {t('progress.failures', { count: status.failures.length })}
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

// ---------- Radarr

function RadarrCard() {
  const t = useT(messages)
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [mappings, setMappings] = useState<PathMapping[]>([])
  const [connected, setConnected] = useState<string | null>(null)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [preview, setPreview] = useState<RadarrPreview | null>(null)
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [settings, setSettings] = useState(true)
  const status = useQuery('migration:radarr', (c) => c.importers.radarrStatus(), TOPICS)
  const ours = useQuery('migration:profiles', (c) => c.quality.profiles())
  const test = useAction((c) => c.importers.radarrTest({ body: { url, apiKey } }))
  const look = useAction((c) =>
    c.importers.radarrPreview({ body: { url, apiKey, pathMappings: filled(mappings) } }),
  )
  const run = useAction((c) =>
    c.importers.radarrRun({
      body: { url, apiKey, pathMappings: filled(mappings), profiles, settings },
    }),
  )
  const running = status.data?.state === 'running'

  const fail = (what: string) => (e: unknown) => {
    setError({ field: fieldOf(e), message: (e as Error).message })
    toast.error(what, { description: (e as Error).message })
  }
  const onTest = () => {
    setError(null)
    test.run().then((r) => setConnected(t('radarr.connected', r)), fail(t('fail.test')))
  }
  const onPreview = () => {
    setError(null)
    look.run().then(
      (p) => {
        setPreview(p)
        setConnected(null)
        // each Radarr profile starts on its nearest
        setProfiles(
          Object.fromEntries(p.profiles.map((x) => [String(x.radarrId), x.options[0] ?? ''])),
        )
      },
      fail(t('fail.preview')),
    )
  }
  const onRun = () => run.run().then(() => toast.success(t('radarr.started')), fail(t('fail.run')))

  const name = (id: string) => ours.data?.find((p) => p.id === id)?.name ?? id

  return (
    <Group title={t('radarr.title')} description={t('radarr.description')}>
      <div className="grid items-start gap-4 medium:grid-cols-2">
        <Field
          label={t('url')}
          hint={t('urlHint')}
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
          label={t('apiKey')}
          hint={t('apiKeyHint')}
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
          {t('test')}
        </Button>
        <Button
          variant="secondary"
          onClick={onPreview}
          loading={look.pending}
          disabled={!url.trim() || !apiKey.trim()}
        >
          {t('preview')}
        </Button>
        {connected && (
          <p role="status" className="text-caption text-text-2">
            {connected}
          </p>
        )}
      </div>

      {preview && (
        <div className="grid gap-4">
          <p className="text-body text-text">{t('radarr.counts', preview.movies)}</p>
          {preview.rootFolders.length > 0 && (
            <section aria-label={t('radarr.roots')} className="grid gap-2">
              <h3 className="font-semibold text-text text-ui">{t('radarr.roots')}</h3>
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
                      {t(`radarr.root.${r.status}`)}
                    </Badge>
                    <span className="text-caption text-text-3">
                      {t('radarr.root.movies', { count: r.movies })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.profiles.length > 0 && (
            <section aria-label={t('radarr.profiles')} className="grid min-w-0 gap-2">
              <div className="grid gap-0.5">
                <h3 className="font-semibold text-text text-ui">{t('radarr.profiles')}</h3>
                <p className="text-caption text-text-3">{t('radarr.profiles.description')}</p>
              </div>
              <div className="min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('radarr.profile.radarr')}</TableHead>
                      <TableHead>{t('radarr.profile.cutoff')}</TableHead>
                      <TableHead numeric>{t('radarr.profile.movies')}</TableHead>
                      <TableHead>{t('radarr.profile.highsea')}</TableHead>
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
                            aria-label={t('radarr.profile.label', { name: p.name })}
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
            label={t('radarr.settings')}
            hint={
              preview.naming.problem
                ? t('radarr.naming.problem', { problem: preview.naming.problem })
                : t('radarr.settings.hint')
            }
          >
            <Switch checked={settings} onCheckedChange={setSettings} />
          </Field>
          <p className="text-caption text-text-2">
            {t('radarr.tags', { tags: preview.tags, blocklist: preview.blocklist })}
          </p>
          {(preview.kept.indexers.length > 0 || preview.kept.downloadClients.length > 0) && (
            <section
              aria-label={t('radarr.kept.title')}
              className="grid gap-1.5 rounded-md border border-line bg-s2 p-3"
            >
              <h3 className="font-semibold text-text text-ui">{t('radarr.kept.title')}</h3>
              <p className="text-caption text-text-2">{t('radarr.kept.body')}</p>
              {preview.kept.indexers.length > 0 && (
                <p className="text-caption text-text-2">
                  {t('radarr.kept.indexers', { names: preview.kept.indexers.join(', ') })}
                </p>
              )}
              {preview.kept.downloadClients.length > 0 && (
                <p className="text-caption text-text-2">
                  {t('radarr.kept.clients', { names: preview.kept.downloadClients.join(', ') })}
                </p>
              )}
              <a
                href="/indexers"
                className="justify-self-start text-caption text-text underline underline-offset-2"
              >
                {t('radarr.kept.link')}
              </a>
            </section>
          )}
          {preview.problems.length > 0 && (
            <details className="text-caption text-text-2">
              <summary className="cursor-pointer text-text">{t('radarr.problems')}</summary>
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
            disabled={running}
          >
            {status.data?.state === 'done' ? t('importAgain') : t('import')}
          </Button>
        </div>
      )}
      <Progressing status={status.data} />
    </Group>
  )
}

// ---------- qBittorrent

function QbittorrentCard() {
  const t = useT(messages)
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mappings, setMappings] = useState<PathMapping[]>([])
  const [connected, setConnected] = useState<string | null>(null)
  const [error, setError] = useState<{ field?: string; message: string } | null>(null)
  const [preview, setPreview] = useState<QbittorrentPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const status = useQuery('migration:qbittorrent', (c) => c.importers.qbittorrentStatus(), [
    ...TOPICS,
    'torrents.updated',
  ])
  const conn = { url, username, password }
  const test = useAction((c) => c.importers.qbittorrentTest({ body: conn }))
  const look = useAction((c) =>
    c.importers.qbittorrentPreview({ body: { ...conn, pathMappings: filled(mappings) } }),
  )
  const run = useAction((c) =>
    c.importers.qbittorrentRun({ body: { ...conn, pathMappings: filled(mappings) } }),
  )
  const resume = useAction((c) => c.importers.qbittorrentResume())
  const s: QbittorrentImportStatus | undefined = status.data
  const running = s?.state === 'running'

  const fail = (what: string) => (e: unknown) => {
    setError({ field: fieldOf(e), message: (e as Error).message })
    toast.error(what, { description: (e as Error).message })
  }
  const onTest = () => {
    setError(null)
    test.run().then((r) => setConnected(t('qbt.connected', r)), fail(t('fail.test')))
  }
  const onPreview = () => {
    setError(null)
    look.run().then(
      (p) => {
        setPreview(p)
        setConnected(null)
      },
      fail(t('fail.preview')),
    )
  }
  const onRun = () => run.run().then(() => toast.success(t('qbt.started')), fail(t('fail.run')))
  const onResume = () =>
    resume.run().then(
      () => toast.success(t('qbt.resumed')),
      (e: Error) => toast.error(t('fail.resume'), { description: e.message }),
    )

  const credentialError =
    error?.field === 'password' || error?.field === 'username' ? error.message : undefined

  return (
    <Group title={t('qbt.title')} description={t('qbt.description')}>
      <div className="grid items-start gap-4 medium:grid-cols-3">
        <Field
          label={t('url')}
          hint={t('urlHint')}
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
        <Field label={t('username')}>
          <Input
            value={username}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label={t('password')} hint={t('passwordHint')} error={credentialError}>
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
          {t('test')}
        </Button>
        <Button
          variant="secondary"
          onClick={onPreview}
          loading={look.pending}
          disabled={!url.trim()}
        >
          {t('preview')}
        </Button>
        {connected && (
          <p role="status" className="text-caption text-text-2">
            {connected}
          </p>
        )}
      </div>

      {preview && (
        <div className="grid gap-4">
          <p className="text-body text-text">{t('qbt.counts', preview.torrents)}</p>
          {preview.savePaths.length > 0 && (
            <section aria-label={t('qbt.savePaths')} className="grid gap-2">
              <h3 className="font-semibold text-text text-ui">{t('qbt.savePaths')}</h3>
              <ul className="grid gap-1.5">
                {preview.savePaths.map((p) => (
                  <li key={p.qbittorrent} className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 break-all font-mono text-caption text-text-2">
                      {p.qbittorrent} → {p.path}
                    </span>
                    <Badge tone={p.ok ? 'success' : 'danger'}>
                      {p.ok ? t('qbt.path.ok') : t('qbt.path.outside')}
                    </Badge>
                    <span className="text-caption text-text-3">
                      {t('qbt.path.torrents', { count: p.torrents })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {preview.categories.length > 0 && (
            <section aria-label={t('qbt.categories')} className="grid gap-2">
              <h3 className="font-semibold text-text text-ui">{t('qbt.categories')}</h3>
              <ul className="grid gap-1.5">
                {preview.categories.map((c) => (
                  <li key={c.qbittorrent} className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-caption text-text">{c.name}</span>
                    <span className="min-w-0 break-all font-mono text-caption text-text-3">
                      {c.folder ?? t('qbt.category.default')}
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
            disabled={running}
          >
            {s?.state === 'done' ? t('importAgain') : t('import')}
          </Button>
        </div>
      )}
      <Progressing status={s}>
        {s && !running && s.paused > 0 && (
          <div className="grid gap-2">
            <p className="text-body text-text">{t('qbt.paused', { paused: s.paused })}</p>
            {s.checking > 0 && (
              <p className="text-caption text-text-3">
                {t('qbt.checking', { checking: s.checking })}
              </p>
            )}
            <Button
              variant="primary"
              icon="play"
              className="justify-self-start"
              loading={resume.pending}
              onClick={() => setConfirming(true)}
            >
              {t('qbt.resume')}
            </Button>
          </div>
        )}
      </Progressing>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('qbt.resume.title')}
        description={t('qbt.resume.body')}
        confirmLabel={t('qbt.resume.confirm')}
        onConfirm={onResume}
      />
    </Group>
  )
}
