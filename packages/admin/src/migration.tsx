'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Migration (settings.md › Migration; the owner's answer 10; ADR 0041): the one-time
// importers. A card each for Radarr and qBittorrent: the connection and its path mappings, Test,
// Preview (what comes across, Radarr's profiles mapped to highsea's nearest first and editable,
// and what can't come across, with the way to Indexers), then Import, whose progress is live on
// `migration.updated`. qBittorrent's torrents come across paused; Resume asks first that
// qBittorrent is stopped. The owner's only. No prototype screen has it: approved as new layout,
// built from Settings' own parts (Group, Field, the tables and badges the other areas use).
// Drawn with the library's native renderer since D3 (one-client-platform-d.md).
import {
  type ImportStatus,
  MIGRATION_TOPIC,
  type PathMapping,
  type QbittorrentImportStatus,
  type QbittorrentPreview,
  type RadarrPreview,
} from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Disclosure,
  Field,
  Input,
  ProgressBar,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  TextLink,
  toast,
  tokens,
  useRegularWindow,
} from '@highsea-tv/ui/native'
import { type ReactNode, useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { migration as messages } from './migration-messages.ts'
import { AreaPage, Group } from './settings.tsx'
import { BREAK_ALL, Card, Line, Note } from './settings-card.tsx'

const sp = tokens.space

/** The preview's option that brings a Radarr profile across as it is (the importer's COPY_PROFILE). */
const COPY_PROFILE = 'copy'

const TOPICS = [MIGRATION_TOPIC]

/** The field an error names, so its message sits under that field. */
const fieldOf = (e: unknown) => ((e as ApiError).details as { field?: string } | undefined)?.field

/** No spelling help in an address, a key or a path. */
const plain = { spellCheck: false, autoComplete: 'off', autoCorrect: false } as const
const code = { ...plain, autoCapitalize: 'none', mono: true } as const

export function Migration() {
  const t = useT(messages)
  return (
    <AreaPage id="migration">
      <Text variant="body" color="text-2">
        {t('intro')}
      </Text>
      <RadarrCard />
      <QbittorrentCard />
    </AreaPage>
  )
}

// ---------- shared parts

/** Fields side by side in a regular window (the web's `grid items-start gap-4 medium:grid-cols-N`). */
function Columns({ count, children }: { count: number; children: ReactNode }) {
  const medium = useRegularWindow()
  return (
    <View
      style={
        {
          display: 'grid',
          gridTemplateColumns: medium ? `repeat(${count}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
          alignItems: 'start',
          gap: sp['4'],
        } as unknown as ViewStyle
      }
    >
      {children}
    </View>
  )
}

/** A section with its heading (the web's `<section aria-label>` and `<h3>`). */
function Section({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <View role="region" aria-label={label} style={{ gap: sp['2'], minWidth: 0 }}>
      <View style={{ gap: sp['0.5'] }}>
        <Line weight={600} role="heading" aria-level={3}>
          {label}
        </Line>
        {description ? <Note>{description}</Note> : null}
      </View>
      {children}
    </View>
  )
}

/** A row of a section's list: a path, its badge and its count, wrapping. */
function Item({ children }: { children: ReactNode }) {
  return (
    <View
      role="listitem"
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: sp['2'],
        minWidth: 0,
      }}
    >
      {children}
    </View>
  )
}

function Items({ children }: { children: ReactNode }) {
  return (
    <View role="list" style={{ gap: tokens.space['1.5'] }}>
      {children}
    </View>
  )
}

/** "Name: message" lines, shown by a disclosure (the web's `<details>`). */
function Failures({
  title,
  rows,
}: {
  title: string
  rows: readonly { name: string; message: string }[]
}) {
  return (
    <Disclosure title={title}>
      <View role="list" style={{ gap: sp['1'], paddingTop: sp['2'] }}>
        {rows.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: one name can fail twice
          <View role="listitem" key={i}>
            <Note color="text-2">
              <Text variant="caption" color="text" weight={600}>
                {r.name}
              </Text>
              : {r.message}
            </Note>
          </View>
        ))}
      </View>
    </Disclosure>
  )
}

function Mappings({
  value,
  onChange,
}: {
  value: PathMapping[]
  onChange: (next: PathMapping[]) => void
}) {
  const t = useT(messages)
  const medium = useRegularWindow()
  const set = (i: number, patch: Partial<PathMapping>) =>
    onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  return (
    // the web's <fieldset>, named by its legend's title
    <View role="group" aria-label={t('mappings.title')} style={{ gap: sp['3'] }}>
      <View style={{ gap: sp['0.5'], marginBottom: sp['1'] }}>
        <Line weight={600} aria-hidden>
          {t('mappings.title')}
        </Line>
        <Note>{t('mappings.description')}</Note>
      </View>
      {value.length === 0 && <Note>{t('mappings.empty')}</Note>}
      {value.map((m, i) => (
        <View
          // rows have no identity but their place; a removed row re-renders the rest
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          style={
            {
              display: 'grid',
              gridTemplateColumns: medium ? 'minmax(0, 1fr) minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
              alignItems: 'end',
              gap: sp['2'],
            } as unknown as ViewStyle
          }
        >
          <Field label={t('mappings.from')}>
            <Input
              value={m.from}
              placeholder="/movies"
              onChangeText={(from) => set(i, { from })}
              {...code}
            />
          </Field>
          <Field label={t('mappings.to')}>
            <Input
              value={m.to}
              icon="folder"
              placeholder="/data/media/movies"
              onChangeText={(to) => set(i, { to })}
              {...code}
            />
          </Field>
          <Button
            variant="ghost"
            icon="delete"
            iconOnly
            accessibilityLabel={t('mappings.remove')}
            onPress={() => onChange(value.filter((_, j) => j !== i))}
          />
        </View>
      ))}
      <Button
        variant="secondary"
        size="sm"
        icon="add"
        onPress={() => onChange([...value, { from: '', to: '' }])}
      >
        {t('mappings.add')}
      </Button>
    </View>
  )
}

/** The mappings with both sides filled; half-filled rows are left out. */
const filled = (maps: PathMapping[]) =>
  maps.map((m) => ({ from: m.from.trim(), to: m.to.trim() })).filter((m) => m.from && m.to)

/** Test, Preview and what Test found, in a row that wraps. */
function Actions({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: sp['2'] }}>
      {children}
    </View>
  )
}

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
    <Card role="region" label={t('progress.label')} gap={sp['2']}>
      {status.state === 'running' && (
        <>
          <Text variant="body" color="text">
            {t('progress.running')}
          </Text>
          <ProgressBar
            look="panel"
            value={status.total ? (status.done / status.total) * 100 : 0}
            showValue
            label={t('progress.of', { done: status.done, total: status.total })}
          />
          <Note>{t('progress.of', { done: status.done, total: status.total })}</Note>
        </>
      )}
      {status.state === 'done' && (
        <Text variant="body" color="text">
          {t('progress.done', { imported: status.imported, skipped: status.skipped })}
        </Text>
      )}
      {status.state === 'failed' && (
        <Text variant="body" color="badge-danger">
          {t('progress.failed')}
        </Text>
      )}
      {status.failures.length > 0 && (
        <Failures
          title={t('progress.failures', { count: status.failures.length })}
          rows={status.failures}
        />
      )}
      {children}
    </Card>
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

  const name = (id: string) =>
    id === COPY_PROFILE
      ? t('radarr.profile.copy')
      : (ours.data?.find((p) => p.id === id)?.name ?? id)

  return (
    <Group title={t('radarr.title')} description={t('radarr.description')}>
      <Columns count={2}>
        <Field
          label={t('url')}
          hint={t('urlHint')}
          error={error?.field === 'url' ? error.message : undefined}
        >
          <Input
            value={url}
            placeholder="http://radarr:7878"
            inputMode="url"
            keyboardType="url"
            onChangeText={setUrl}
            {...code}
          />
        </Field>
        <Field
          label={t('apiKey')}
          hint={t('apiKeyHint')}
          error={error?.field === 'apiKey' ? error.message : undefined}
        >
          <Input secureTextEntry value={apiKey} onChangeText={setApiKey} {...code} />
        </Field>
      </Columns>
      <Mappings value={mappings} onChange={setMappings} />
      <Actions>
        <Button variant="secondary" onPress={onTest} loading={test.pending} disabled={!url.trim()}>
          {t('test')}
        </Button>
        <Button
          variant="secondary"
          onPress={onPreview}
          loading={look.pending}
          disabled={!url.trim() || !apiKey.trim()}
        >
          {t('preview')}
        </Button>
        {connected && (
          <Note role="status" color="text-2">
            {connected}
          </Note>
        )}
      </Actions>

      {preview && (
        <View style={{ gap: sp['4'] }}>
          <Text variant="body" color="text">
            {t('radarr.counts', preview.movies)}
          </Text>
          {preview.rootFolders.length > 0 && (
            <Section label={t('radarr.roots')}>
              <Items>
                {preview.rootFolders.map((r) => (
                  <Item key={r.radarr}>
                    <Note mono color="text-2" style={BREAK_ALL}>
                      {r.radarr} → {r.path}
                    </Note>
                    <Badge
                      tone={
                        r.status === 'outside' ? 'danger' : r.status === 'add' ? 'info' : 'success'
                      }
                    >
                      {t(`radarr.root.${r.status}`)}
                    </Badge>
                    <Note>{t('radarr.root.movies', { count: r.movies })}</Note>
                  </Item>
                ))}
              </Items>
            </Section>
          )}
          {preview.profiles.length > 0 && (
            <Section label={t('radarr.profiles')} description={t('radarr.profiles.description')}>
              <Table label={t('radarr.profiles')}>
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
            </Section>
          )}
          <Switch
            label={t('radarr.settings')}
            hint={
              preview.naming.problem
                ? t('radarr.naming.problem', { problem: preview.naming.problem })
                : t('radarr.settings.hint')
            }
            checked={settings}
            onCheckedChange={setSettings}
          />
          <Note color="text-2">
            {t('radarr.tags', { tags: preview.tags, blocklist: preview.blocklist })}
          </Note>
          {(preview.kept.indexers.length > 0 || preview.kept.downloadClients.length > 0) && (
            <Card role="region" label={t('radarr.kept.title')} gap={tokens.space['1.5']}>
              <Line weight={600} role="heading" aria-level={3}>
                {t('radarr.kept.title')}
              </Line>
              <Note color="text-2">{t('radarr.kept.body')}</Note>
              {preview.kept.indexers.length > 0 && (
                <Note color="text-2">
                  {t('radarr.kept.indexers', { names: preview.kept.indexers.join(', ') })}
                </Note>
              )}
              {preview.kept.downloadClients.length > 0 && (
                <Note color="text-2">
                  {t('radarr.kept.clients', { names: preview.kept.downloadClients.join(', ') })}
                </Note>
              )}
              <TextLink href="/indexers">{t('radarr.kept.link')}</TextLink>
            </Card>
          )}
          {preview.problems.length > 0 && (
            <Failures
              title={t('radarr.problems')}
              rows={preview.problems.map((p) => ({ name: p.title, message: p.message }))}
            />
          )}
          <Button
            variant="primary"
            icon="import"
            onPress={onRun}
            loading={run.pending}
            disabled={running}
          >
            {status.data?.state === 'done' ? t('importAgain') : t('import')}
          </Button>
        </View>
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
      <Columns count={3}>
        <Field
          label={t('url')}
          hint={t('urlHint')}
          error={error?.field === 'url' ? error.message : undefined}
        >
          <Input
            value={url}
            placeholder="http://qbittorrent:8080"
            inputMode="url"
            keyboardType="url"
            onChangeText={setUrl}
            {...code}
          />
        </Field>
        <Field label={t('username')}>
          <Input value={username} autoCapitalize="none" onChangeText={setUsername} {...plain} />
        </Field>
        <Field label={t('password')} hint={t('passwordHint')} error={credentialError}>
          <Input secureTextEntry value={password} autoComplete="off" onChangeText={setPassword} />
        </Field>
      </Columns>
      <Mappings value={mappings} onChange={setMappings} />
      <Actions>
        <Button variant="secondary" onPress={onTest} loading={test.pending} disabled={!url.trim()}>
          {t('test')}
        </Button>
        <Button
          variant="secondary"
          onPress={onPreview}
          loading={look.pending}
          disabled={!url.trim()}
        >
          {t('preview')}
        </Button>
        {connected && (
          <Note role="status" color="text-2">
            {connected}
          </Note>
        )}
      </Actions>

      {preview && (
        <View style={{ gap: sp['4'] }}>
          <Text variant="body" color="text">
            {t('qbt.counts', preview.torrents)}
          </Text>
          {preview.savePaths.length > 0 && (
            <Section label={t('qbt.savePaths')}>
              <Items>
                {preview.savePaths.map((p) => (
                  <Item key={p.qbittorrent}>
                    <Note mono color="text-2" style={BREAK_ALL}>
                      {p.qbittorrent} → {p.path}
                    </Note>
                    <Badge tone={p.ok ? 'success' : 'danger'}>
                      {p.ok ? t('qbt.path.ok') : t('qbt.path.outside')}
                    </Badge>
                    <Note>{t('qbt.path.torrents', { count: p.torrents })}</Note>
                  </Item>
                ))}
              </Items>
            </Section>
          )}
          {preview.categories.length > 0 && (
            <Section label={t('qbt.categories')}>
              <Items>
                {preview.categories.map((c) => (
                  <Item key={c.qbittorrent}>
                    <Note color="text">{c.name}</Note>
                    <Note mono style={BREAK_ALL}>
                      {c.folder ?? t('qbt.category.default')}
                    </Note>
                  </Item>
                ))}
              </Items>
            </Section>
          )}
          <Button
            variant="primary"
            icon="import"
            onPress={onRun}
            loading={run.pending}
            disabled={running}
          >
            {s?.state === 'done' ? t('importAgain') : t('import')}
          </Button>
        </View>
      )}
      <Progressing status={s}>
        {s && !running && s.paused > 0 && (
          <View style={{ gap: sp['2'] }}>
            <Text variant="body" color="text">
              {t('qbt.paused', { paused: s.paused })}
            </Text>
            {s.checking > 0 && <Note>{t('qbt.checking', { checking: s.checking })}</Note>}
            <Button
              variant="primary"
              icon="play"
              loading={resume.pending}
              onPress={() => setConfirming(true)}
            >
              {t('qbt.resume')}
            </Button>
          </View>
        )}
      </Progressing>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('qbt.resume.title')}
        description={t('qbt.resume.body')}
        confirmLabel={t('qbt.resume.confirm')}
        onConfirm={onResume}
      />
    </Group>
  )
}
