// SPDX-License-Identifier: AGPL-3.0-only
// Settings › General (settings.md), as apps/server built it (general.tsx): Region (the server's
// language and time zone), Metadata (the TMDB key, set or not, its last four characters, Replace
// and Remove, and the metadata language and region), the indexer catalog (the channel, automatic
// updates and extra catalogs, saved at once and the owner's alone even to read), Updates (the
// channel and the Docker note, in place of installing updates on their own) and Diagnostics (the
// log level, crash reports and /metrics, without the anonymous usage counts). Region, Metadata,
// Updates and Diagnostics share one draft and the page's one Save bar, which saves each part that
// changed. An admin sees them all, read-only. In the mock a key shorter than 16 characters, or
// with "wrong" in it, is one TMDB refuses.
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  SegmentedControl,
  Select,
  Switch,
  toast,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type {
  CatalogSettings,
  GeneralSettings,
  LogLevel,
  MetadataSettings,
  MetricsSettings,
} from '../../mock/settings.ts'
import { Loadable } from '../loadable.tsx'
import { adminHref, useShell } from '../shell.tsx'
import { reasonOf } from './parts.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'

/** The admin's locale: Intl names languages and regions in it, as the server's admin does. */
const LOCALE = 'en-GB'

/** Where TMDB's API key and Read Access Token are (TMDB's Getting Started guide). */
const TMDB_KEY_PAGE = 'https://www.themoviedb.org/settings/api'

/** The languages TMDB has the most translations in, as `language-REGION` (metadata-locale.ts). */
const METADATA_LANGUAGES = [
  'ar-SA',
  'cs-CZ',
  'da-DK',
  'de-DE',
  'el-GR',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-US',
  'es-ES',
  'es-MX',
  'fi-FI',
  'fr-CA',
  'fr-FR',
  'he-IL',
  'hi-IN',
  'hu-HU',
  'id-ID',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nb-NO',
  'nl-NL',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'sv-SE',
  'th-TH',
  'tr-TR',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
]

/** Regions with their own release dates and certifications at TMDB. */
const METADATA_REGIONS = [
  'AR',
  'AT',
  'AU',
  'BE',
  'BR',
  'CA',
  'CH',
  'CL',
  'CN',
  'CO',
  'CZ',
  'DE',
  'DK',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'HK',
  'HU',
  'ID',
  'IE',
  'IL',
  'IN',
  'IT',
  'JP',
  'KR',
  'MX',
  'MY',
  'NL',
  'NO',
  'NZ',
  'PH',
  'PL',
  'PT',
  'RO',
  'RU',
  'SE',
  'SG',
  'TH',
  'TR',
  'TW',
  'UA',
  'US',
  'VN',
  'ZA',
]

const displayName = (type: 'language' | 'region', code: string) => {
  try {
    return new Intl.DisplayNames([LOCALE], { type }).of(code) ?? code
  } catch {
    return code
  }
}

/** The choices for a select, named and sorted by name, with `current` among them. */
function metadataOptions(type: 'language' | 'region', current: string) {
  const codes = [...(type === 'language' ? METADATA_LANGUAGES : METADATA_REGIONS)]
  if (current && !codes.includes(current)) codes.push(current)
  return codes
    .map((value) => ({ value, label: displayName(type, value) }))
    .sort((a, b) => a.label.localeCompare(b.label, LOCALE))
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function General() {
  const metadata = useQuery('settings:metadata', (c) => c.settings.metadata(), ['settings.updated'])
  const general = useQuery(
    'settings:general',
    (c) => c.settings.get('general') as Promise<GeneralSettings>,
    ['settings.updated'],
  )
  const metrics = useQuery(
    'settings:metrics',
    (c) => c.settings.get('metrics') as Promise<MetricsSettings>,
    ['settings.updated'],
  )
  return (
    <AreaPage id="general">
      <Loadable query={metadata} what="these settings">
        {(m) => (
          <Loadable query={general} what="these settings">
            {(g) => (
              <Loadable query={metrics} what="these settings">
                {(x) => (
                  // a fresh draft whenever the saved settings change
                  <Drafted
                    key={JSON.stringify([m, g, x])}
                    loaded={{ metadata: m, general: g, metrics: x }}
                  />
                )}
              </Loadable>
            )}
          </Loadable>
        )}
      </Loadable>
    </AreaPage>
  )
}

type Loaded = { metadata: MetadataSettings; general: GeneralSettings; metrics: MetricsSettings }
type MetadataDraft = { language: string; region: string; key: string | null }

/** Region, Metadata, the catalog, Updates and Diagnostics, with one Save bar for the drafted ones. */
function Drafted({ loaded }: { loaded: Loaded }) {
  const { role } = useShell()
  const owner = role === 'owner'
  const initialMetadata: MetadataDraft = {
    language: loaded.metadata.language,
    region: loaded.metadata.region,
    key: null,
  }
  const [meta, setMeta] = useState(initialMetadata)
  const [general, setGeneral] = useState(loaded.general)
  const [metrics, setMetrics] = useState(loaded.metrics)
  const [keyError, setKeyError] = useState<string | null>(null)
  const saveMetadata = useAction((c, body: { language: string; region: string; key?: string }) =>
    c.settings.saveMetadata(body),
  )
  const saveGeneral = useAction((c, body: GeneralSettings) => c.settings.save('general', body))
  const saveMetrics = useAction((c, body: MetricsSettings) => c.settings.save('metrics', body))
  const metaDirty =
    meta.language !== initialMetadata.language ||
    meta.region !== initialMetadata.region ||
    (meta.key !== null && meta.key.trim() !== '')
  const generalDirty = !same(general, loaded.general)
  const metricsDirty = !same(metrics, loaded.metrics)
  const setPart = (p: Partial<GeneralSettings>) => setGeneral({ ...general, ...p })

  const submit = async () => {
    if (metaDirty) {
      const key = meta.key?.trim()
      try {
        await saveMetadata.run({
          language: meta.language,
          region: meta.region,
          ...(key ? { key } : {}),
        })
      } catch (e) {
        if (reasonOf(e) === 'tmdb-key-rejected')
          return setKeyError('TMDB didn’t accept that key. Copy it again from your TMDB account.')
        return toast.error('Couldn’t save', { description: (e as Error).message })
      }
    }
    try {
      if (generalDirty) await saveGeneral.run(general)
      if (metricsDirty) await saveMetrics.run(metrics)
    } catch (e) {
      return toast.error('Couldn’t save', { description: (e as Error).message })
    }
    toast.success('Settings saved')
  }

  return (
    <>
      {!owner && (
        <p className="text-caption text-text-3">Only the owner can change these settings.</p>
      )}
      <Region value={general} set={setPart} owner={owner} />
      <Metadata
        loaded={loaded.metadata}
        draft={meta}
        setDraft={(d) => {
          setKeyError(null)
          setMeta(d)
        }}
        keyError={keyError}
      />
      <Catalog />
      <Updates value={general} set={setPart} owner={owner} />
      <Diagnostics
        value={general}
        set={setPart}
        metrics={metrics}
        setMetrics={setMetrics}
        owner={owner}
      />
      <SaveBar
        dirty={metaDirty || generalDirty || metricsDirty}
        saving={saveMetadata.pending || saveGeneral.pending || saveMetrics.pending}
        onDiscard={() => {
          setKeyError(null)
          setMeta(initialMetadata)
          setGeneral(loaded.general)
          setMetrics(loaded.metrics)
        }}
        onSave={submit}
      />
    </>
  )
}

// ---------------------------------------------------------------- region

/** The languages highsea's own messages are written in so far. */
const SERVER_LANGUAGES = ['en']

/** Every IANA time zone the browser knows, with the saved one kept if it isn't among them. */
function timeZones(current: string): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    // an older engine: the saved zone and UTC
  }
  return [...new Set([current, 'UTC', ...zones])].sort((a, b) => a.localeCompare(b))
}

type Part = {
  value: GeneralSettings
  set: (patch: Partial<GeneralSettings>) => void
  owner: boolean
}

function Region({ value, set, owner }: Part) {
  return (
    <Group title="Region" description="The server’s own language and time.">
      <div className="grid items-start gap-4 medium:grid-cols-2">
        <Field
          label="Language"
          hint="For the server’s messages: notifications and the calendar feed. More come with translations."
        >
          <Select
            value={value.language}
            disabled={!owner}
            onValueChange={(language) => set({ language })}
            options={[...new Set([value.language, ...SERVER_LANGUAGES])].map((l) => ({
              value: l,
              label: displayName('language', l),
            }))}
          />
        </Field>
        <Field label="Time zone" hint="For schedules, such as when backups run.">
          <Select
            value={value.timeZone}
            disabled={!owner}
            onValueChange={(timeZone) => set({ timeZone })}
            options={timeZones(value.timeZone).map((z) => ({
              value: z,
              label: z.replaceAll('_', ' '),
            }))}
          />
        </Field>
      </div>
    </Group>
  )
}

// ---------------------------------------------------------------- metadata

function Metadata({
  loaded,
  draft,
  setDraft,
  keyError,
}: {
  loaded: MetadataSettings
  draft: MetadataDraft
  setDraft: (d: MetadataDraft) => void
  keyError: string | null
}) {
  const { role } = useShell()
  const owner = role === 'owner'
  const [removing, setRemoving] = useState(false)
  const remove = useAction((c) => c.settings.removeMetadataKey())
  // the field for a new key: always when none is set, after Replace when one is
  const entering = !loaded.key.set || draft.key !== null

  return (
    <>
      <Group
        title="Metadata"
        description="Where movie details come from, and the language and region they’re in."
      >
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text text-ui">TMDB key</span>
            {loaded.key.set ? (
              <Badge tone="success">Set</Badge>
            ) : loaded.key.builtIn ? (
              <Badge tone="neutral">highsea’s key</Badge>
            ) : (
              <Badge tone="warning">Not set</Badge>
            )}
            {loaded.key.set && (
              <span
                className="font-mono text-figure text-text-2"
                title={`Ending in ${loaded.key.last4 ?? ''}`}
              >
                ••••{loaded.key.last4 ?? ''}
              </span>
            )}
            {loaded.key.set && owner && draft.key === null && (
              <span className="ms-auto flex gap-2">
                <Button size="sm" onClick={() => setDraft({ ...draft, key: '' })}>
                  Replace
                </Button>
                <Button size="sm" variant="danger" onClick={() => setRemoving(true)}>
                  Remove
                </Button>
              </span>
            )}
          </div>
          {!loaded.key.set && (
            <p className="text-caption text-text-3">
              {loaded.key.builtIn
                ? 'highsea’s own key is in use. Add yours to use it instead.'
                : 'Discover, adding movies and refreshing their details need a key.'}
            </p>
          )}
        </div>
        {entering && owner && (
          <div className="grid gap-2">
            <Field
              label="New TMDB key"
              hint="The API key or the API Read Access Token: either works. It’s checked with TMDB when you save."
              error={keyError ?? undefined}
            >
              <Input
                type="password"
                value={draft.key ?? ''}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={TMDB_KEY_PAGE}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-sm text-accent-text text-ui outline-none hover:underline focus-visible:ring-focus"
              >
                Open TMDB’s API page
                <Icon name="external" size={14} />
              </a>
              {loaded.key.set && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ms-auto"
                  onClick={() => setDraft({ ...draft, key: null })}
                >
                  Keep the current key
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="grid gap-4 medium:grid-cols-2">
          <Field
            label="Metadata language"
            hint="Titles, overviews and taglines, where TMDB has them in this language."
          >
            <Select
              value={draft.language}
              disabled={!owner}
              onValueChange={(language) => setDraft({ ...draft, language })}
              options={metadataOptions('language', draft.language)}
            />
          </Field>
          <Field label="Region" hint="For certifications, release dates and Discover’s lists.">
            <Select
              value={draft.region}
              disabled={!owner}
              onValueChange={(region) => setDraft({ ...draft, region })}
              options={metadataOptions('region', draft.region)}
            />
          </Field>
        </div>
      </Group>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove the TMDB key?"
        description={
          loaded.key.builtIn
            ? 'highsea goes back to its own key.'
            : 'Discover, adding movies and refreshing their details stop until you add a key. The library and its pages keep working.'
        }
        confirmLabel="Remove key"
        cancelLabel="Keep it"
        destructive
        onConfirm={() =>
          remove.run().then(
            () => toast({ title: 'TMDB key removed' }),
            (e: Error) => toast.error('Couldn’t remove the key', { description: e.message }),
          )
        }
      />
    </>
  )
}

// ---------------------------------------------------------------- catalog

const CATALOG_TITLE = 'Indexer catalog'
const CATALOG_DESCRIPTION =
  'Where indexer definitions come from, and how new versions of them arrive.'

function Catalog() {
  const { role } = useShell()
  if (role !== 'owner')
    return (
      <Group title={CATALOG_TITLE} description={CATALOG_DESCRIPTION}>
        <p className="text-caption text-text-3">
          Only the owner can see and change the catalog’s channel, updates and extra catalogs.
        </p>
      </Group>
    )
  return <CatalogSettingsGroup />
}

const blankExtra = { url: '', keyId: '', publicKey: '' }

function CatalogSettingsGroup() {
  const data = useQuery('settings:catalog', (c) => c.catalog.settings(), ['settings.updated'])
  const save = useAction((c, patch: Partial<CatalogSettings>) => c.catalog.updateSettings(patch))
  const [extra, setExtra] = useState(blankExtra)
  const [extraError, setExtraError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const change = (patch: Partial<CatalogSettings>) =>
    save.run(patch).then(
      () => toast.success('Settings saved'),
      (e: Error) => toast.error('Couldn’t save', { description: e.message }),
    )

  return (
    <Group title={CATALOG_TITLE} description={CATALOG_DESCRIPTION}>
      <Loadable query={data} what="the catalog’s settings">
        {(s) => (
          <>
            <div className="grid gap-4 medium:grid-cols-2">
              <Field label="Channel" hint="Beta gets new and changed definitions first.">
                <Select
                  value={s.channel}
                  disabled={save.pending}
                  onValueChange={(channel) =>
                    change({ channel: channel as CatalogSettings['channel'] })
                  }
                  options={[
                    { value: 'stable', label: 'Stable' },
                    { value: 'beta', label: 'Beta' },
                  ]}
                />
              </Field>
            </div>
            <Field
              inline
              label="Install new versions automatically"
              hint="Each version is verified before it’s used. Off, a new version waits on Indexers for you to install it."
            >
              <Switch
                checked={s.autoUpdate}
                disabled={save.pending}
                onCheckedChange={(autoUpdate) => change({ autoUpdate })}
              />
            </Field>
            <div className="grid gap-2">
              <span className="font-medium text-text text-ui">Extra catalogs</span>
              {s.extras.length === 0 ? (
                <p className="text-caption text-text-3">
                  None. Add one to use definitions someone else publishes and signs.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {s.extras.map((x) => (
                    <li
                      key={x.url}
                      className="flex min-w-0 items-center gap-3 rounded-md border border-line bg-s1 px-3 py-2"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-mono text-figure text-text" title={x.url}>
                          {x.url}
                        </span>
                        <span className="text-caption text-text-3">Key {x.keyId}</span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemoving(x.url)}
                        aria-label={`Remove ${x.url}`}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form
              className="grid gap-3 rounded-md border border-line p-3"
              onSubmit={(e) => {
                e.preventDefault()
                const next = {
                  url: extra.url.trim(),
                  keyId: extra.keyId.trim(),
                  publicKey: extra.publicKey.trim(),
                }
                if (!next.url || !next.keyId || !next.publicKey)
                  return setExtraError('Fill in the address, the key ID and the public key.')
                setExtraError(null)
                save.run({ extras: [...s.extras, next] }).then(
                  () => {
                    toast.success('Catalog added')
                    setExtra(blankExtra)
                  },
                  (err: Error) => setExtraError(err.message),
                )
              }}
            >
              <span className="font-medium text-text text-ui">Add a catalog</span>
              <Field
                label="Manifest address"
                hint="An https address that publishes a signed catalog manifest."
              >
                <Input
                  value={extra.url}
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  onChange={(e) => setExtra({ ...extra, url: e.target.value })}
                />
              </Field>
              <div className="grid gap-3 medium:grid-cols-[12rem_minmax(0,1fr)]">
                <Field label="Key ID">
                  <Input
                    value={extra.keyId}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    onChange={(e) => setExtra({ ...extra, keyId: e.target.value })}
                  />
                </Field>
                <Field
                  label="Public key"
                  hint="The publisher’s ed25519 public key, in base64, as they publish it."
                  error={extraError ?? undefined}
                >
                  <Input
                    value={extra.publicKey}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    onChange={(e) => setExtra({ ...extra, publicKey: e.target.value })}
                  />
                </Field>
              </div>
              <Button type="submit" size="sm" className="justify-self-start" loading={save.pending}>
                Add catalog
              </Button>
            </form>
            <ConfirmDialog
              open={removing !== null}
              onOpenChange={(o) => !o && setRemoving(null)}
              title="Remove this catalog?"
              description="Its definitions go with it, and indexers that use them stop working until you add it again."
              confirmLabel="Remove catalog"
              cancelLabel="Keep it"
              destructive
              onConfirm={() => change({ extras: s.extras.filter((x) => x.url !== removing) })}
            />
          </>
        )}
      </Loadable>
    </Group>
  )
}

// ---------------------------------------------------------------- updates

function Updates({ value, set, owner }: Part) {
  return (
    <Group
      title="Updates"
      description="highsea tells you when a new version is out. It never updates itself."
    >
      <div className="grid gap-1.5">
        {owner ? (
          <SegmentedControl
            aria-label="Update channel"
            size="sm"
            value={value.updateChannel}
            onValueChange={(c) => set({ updateChannel: c as GeneralSettings['updateChannel'] })}
            options={[
              { value: 'stable', label: 'Stable' },
              { value: 'beta', label: 'Beta' },
            ]}
            className="justify-self-start"
          />
        ) : (
          // the control has no disabled state: an admin reads the channel
          <p className="text-text text-ui">
            {value.updateChannel === 'beta' ? 'Beta' : 'Stable'} channel
          </p>
        )}
        <p className="text-caption text-text-3">
          Beta gets new versions first. Stable versions show on both.
        </p>
      </div>
      <p className="text-caption text-text-3">
        To update, pull the new image and recreate the container. highsea backs up before it
        migrates.
      </p>
    </Group>
  )
}

// ---------------------------------------------------------------- diagnostics

const LOG_LEVELS: [LogLevel, string][] = [
  ['debug', 'Debug'],
  ['info', 'Info (default)'],
  ['warn', 'Warnings and errors'],
  ['error', 'Errors'],
]

function Diagnostics({
  value,
  set,
  metrics,
  setMetrics,
  owner,
}: Part & { metrics: MetricsSettings; setMetrics: (m: MetricsSettings) => void }) {
  return (
    <Group title="Diagnostics" description="What the server writes down when something goes wrong.">
      <Field
        label="Log level"
        hint="Debug is chatty: use it while chasing a problem. It changes at once, without a restart."
      >
        <Select
          value={value.logLevel}
          disabled={!owner}
          onValueChange={(l) => set({ logLevel: l as LogLevel })}
          options={LOG_LEVELS.map(([v, label]) => ({ value: v, label }))}
          className="medium:max-w-72"
        />
      </Field>
      <Field
        inline
        label="Write crash reports"
        hint="To the config folder, to attach to an issue. Nothing is sent anywhere. Find them in System, under Logs."
      >
        <Switch
          checked={value.crashReports}
          disabled={!owner}
          onCheckedChange={(crashReports) => set({ crashReports })}
        />
      </Field>
      <Field
        inline
        label="Metrics for Prometheus"
        hint="Requests, downloads, indexers and the server’s resources, at /metrics."
      >
        <Switch
          checked={metrics.enabled}
          disabled={!owner}
          onCheckedChange={(enabled) => setMetrics({ enabled })}
        />
      </Field>
      {metrics.enabled && <MetricsAddress />}
    </Group>
  )
}

/** Where Prometheus scrapes: the server's external address. */
function MetricsAddress() {
  const network = useQuery('settings:network', (c) => c.settings.get('network'), [
    'settings.updated',
  ])
  const base = network.data && 'externalUrl' in network.data ? network.data.externalUrl : ''
  return (
    <div className="grid gap-1">
      <span className="truncate font-mono text-figure text-text" title={`${base}/metrics`}>
        {base}/metrics
      </span>
      <p className="text-caption text-text-3">
        Prometheus signs in with an API key held by the owner or an admin, as a bearer token. A
        read-only key is enough.{' '}
        <a
          href={adminHref('/settings/users')}
          className="rounded-sm text-text-2 underline underline-offset-2 outline-none hover:text-text focus-visible:ring-focus"
        >
          API keys are in Users and devices.
        </a>
      </p>
    </div>
  )
}
