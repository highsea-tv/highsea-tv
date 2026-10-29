'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › General (settings.md). Checkpoint 4 builds its Metadata group, after Region, where
// the owner's decision 1 puts it: the TMDB key (set or not, its last four characters, Replace and
// Remove), the metadata language and the region. A new key is checked with TMDB on Save, as setup
// checks it. Checkpoint 5 adds the Catalog group after it (its answer 7): the channel, automatic
// updates and extra catalogs with their keys. Its settings are the owner's to read as well as to
// change (ADR 0032), so an admin sees a line saying so; each change saves at once, as Monitored
// does. Checkpoint 8b adds the prototype's Region (the server's language and time zone), Updates
// (the channel; the Docker note in place of installing updates on their own, the owner's answer
// 11) and Diagnostics (the log level, crash reports, and /metrics, without the anonymous usage
// counts). Region, Metadata, Updates and Diagnostics share one draft and the page's one Save bar,
// which saves each part that changed. An admin sees them all, read-only.
import {
  CATALOG_CHANNELS,
  type CatalogSettings,
  type CatalogSettingsPatch,
  type GeneralSettings,
  INDEXER_TOPICS,
  LOG_LEVELS,
  type MetadataInput,
  type MetadataSettings,
  type MetricsSettings,
  OPERATIONS_TOPICS,
} from '@highsea-tv/api-contract'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
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
import { general as messages } from './general-messages.ts'
import { Loadable } from './loadable.tsx'
import {
  errorReason,
  keyRejected,
  maskedKey,
  metadataOptions,
  TMDB_KEY_PAGE,
  tmdbBusy,
} from './metadata-locale.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { useShell } from './shell.tsx'

export function General() {
  const t = useT(messages)
  const metadata = useQuery('settings:metadata', (c) => c.settings.metadata(), [
    OPERATIONS_TOPICS.settings,
  ])
  const general = useQuery('settings:general', (c) => c.settings.general(), [
    OPERATIONS_TOPICS.settings,
  ])
  const metrics = useQuery('settings:metrics', (c) => c.settings.metrics(), [
    OPERATIONS_TOPICS.settings,
  ])
  return (
    <AreaPage id="general">
      <Loadable query={metadata} what={t('what')}>
        {(m) => (
          <Loadable query={general} what={t('what')}>
            {(g) => (
              <Loadable query={metrics} what={t('what')}>
                {(x) => (
                  // a fresh draft whenever the saved settings change
                  <Drafted
                    key={JSON.stringify([m, g, x])}
                    loaded={{ metadata: m, general: g, metrics: x }}
                    reload={() => {
                      metadata.refetch()
                      general.refetch()
                      metrics.refetch()
                    }}
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Region, Metadata, the catalog, Updates and Diagnostics, with one Save bar for the drafted ones. */
function Drafted({ loaded, reload }: { loaded: Loaded; reload: () => void }) {
  const t = useT(messages)
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
  const saveMetadata = useAction((c, body: MetadataInput) => c.settings.saveMetadata({ body }))
  const saveGeneral = useAction((c, body: GeneralSettings) => c.settings.saveGeneral({ body }))
  const saveMetrics = useAction((c, body: MetricsSettings) => c.settings.saveMetrics({ body }))
  const metaDirty =
    meta.language !== initialMetadata.language ||
    meta.region !== initialMetadata.region ||
    (meta.key !== null && meta.key.trim() !== '')
  const generalDirty = !same(general, loaded.general)
  const metricsDirty = !same(metrics, loaded.metrics)

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
        const reason = errorReason(e)
        if (keyRejected(reason)) return setKeyError(t('key.rejected'))
        return toast.error(t('saveError'), {
          description: tmdbBusy(reason) ? t('key.unavailable') : (e as Error).message,
        })
      }
    }
    try {
      if (generalDirty) await saveGeneral.run(general)
      if (metricsDirty) await saveMetrics.run(metrics)
    } catch (e) {
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      {!owner && <p className="text-caption text-text-3">{t('ownerOnly')}</p>}
      <Region value={general} set={(p) => setGeneral({ ...general, ...p })} owner={owner} />
      <Metadata
        loaded={loaded.metadata}
        draft={meta}
        setDraft={(d) => {
          setKeyError(null)
          setMeta(d)
        }}
        keyError={keyError}
        reload={reload}
      />
      <Catalog />
      <Updates value={general} set={(p) => setGeneral({ ...general, ...p })} owner={owner} />
      <Diagnostics
        value={general}
        set={(p) => setGeneral({ ...general, ...p })}
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

/** Every IANA time zone the runtime knows, with the saved one kept if it isn't among them. */
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
  const t = useT(messages)
  const locale = useLocale()
  const languageName = (code: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
    } catch {
      return code
    }
  }
  return (
    <Group title={t('region.title')} description={t('region.description')}>
      <div className="grid items-start gap-4 medium:grid-cols-2">
        <Field label={t('region.language')} hint={t('region.languageHint')}>
          <Select
            value={value.language}
            disabled={!owner}
            onValueChange={(language) => set({ language })}
            options={[...new Set([value.language, ...SERVER_LANGUAGES])].map((l) => ({
              value: l,
              label: languageName(l),
            }))}
          />
        </Field>
        <Field label={t('region.timeZone')} hint={t('region.timeZoneHint')}>
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
  reload,
}: {
  loaded: MetadataSettings
  draft: MetadataDraft
  setDraft: (d: MetadataDraft) => void
  keyError: string | null
  reload: () => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const { role } = useShell()
  const owner = role === 'owner'
  const [removing, setRemoving] = useState(false)
  const remove = useAction((c) => c.settings.removeMetadataKey())
  // the field for a new key: always when none is set, after Replace when one is
  const entering = !loaded.key.set || draft.key !== null

  return (
    <>
      <Group title={t('metadata.title')} description={t('metadata.description')}>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text text-ui">{t('key.label')}</span>
            {loaded.key.set ? (
              <Badge tone="success">{t('key.set')}</Badge>
            ) : loaded.key.builtIn ? (
              <Badge tone="neutral">{t('key.builtIn')}</Badge>
            ) : (
              <Badge tone="warning">{t('key.notSet')}</Badge>
            )}
            {loaded.key.set && (
              <span
                className="font-mono text-figure text-text-2"
                title={t('key.masked', { last4: loaded.key.last4 ?? '' })}
              >
                {maskedKey(loaded.key.last4)}
              </span>
            )}
            {loaded.key.set && owner && draft.key === null && (
              <span className="ms-auto flex gap-2">
                <Button size="sm" onClick={() => setDraft({ ...draft, key: '' })}>
                  {t('key.replace')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setRemoving(true)}>
                  {t('key.remove')}
                </Button>
              </span>
            )}
          </div>
          {!loaded.key.set && (
            <p className="text-caption text-text-3">
              {t(loaded.key.builtIn ? 'key.builtInBody' : 'key.notSetBody')}
            </p>
          )}
        </div>
        {entering && owner && (
          <div className="grid gap-2">
            <Field label={t('key.new')} hint={t('key.hint')} error={keyError ?? undefined}>
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
                {t('key.open')}
                <Icon name="external" size={14} />
              </a>
              {loaded.key.set && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ms-auto"
                  onClick={() => setDraft({ ...draft, key: null })}
                >
                  {t('key.cancel')}
                </Button>
              )}
            </div>
          </div>
        )}
        <div className="grid gap-4 medium:grid-cols-2">
          <Field label={t('language')} hint={t('languageHint')}>
            <Select
              value={draft.language}
              disabled={!owner}
              onValueChange={(language) => setDraft({ ...draft, language })}
              options={metadataOptions('language', draft.language, locale)}
            />
          </Field>
          <Field label={t('region')} hint={t('regionHint')}>
            <Select
              value={draft.region}
              disabled={!owner}
              onValueChange={(region) => setDraft({ ...draft, region })}
              options={metadataOptions('region', draft.region, locale)}
            />
          </Field>
        </div>
      </Group>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t('key.removeTitle')}
        description={t(loaded.key.builtIn ? 'key.removeBodyBuiltIn' : 'key.removeBody')}
        confirmLabel={t('key.removeConfirm')}
        cancelLabel={t('key.keep')}
        destructive
        onConfirm={() =>
          remove.run().then(
            () => {
              toast({ title: t('key.removed') })
              reload()
            },
            (e: Error) => toast.error(t('key.removeFailed'), { description: e.message }),
          )
        }
      />
    </>
  )
}

// ---------------------------------------------------------------- catalog

function Catalog() {
  const t = useT(messages)
  const { role } = useShell()
  if (role !== 'owner')
    return (
      <Group title={t('catalog.title')} description={t('catalog.description')}>
        <p className="text-caption text-text-3">{t('catalog.ownerOnly')}</p>
      </Group>
    )
  return <CatalogSettingsGroup />
}

const blankExtra = { url: '', keyId: '', publicKey: '' }

function CatalogSettingsGroup() {
  const t = useT(messages)
  const data = useQuery('settings:catalog', (c) => c.catalog.settings(), [INDEXER_TOPICS.catalog])
  const save = useAction((c, body: CatalogSettingsPatch) => c.catalog.updateSettings({ body }))
  const [extra, setExtra] = useState(blankExtra)
  const [extraError, setExtraError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const change = (patch: CatalogSettingsPatch) =>
    save.run(patch).then(
      () => {
        toast.success(t('saved'))
        data.refetch()
      },
      (e: Error) => {
        toast.error(t('saveError'), { description: e.message })
        throw e
      },
    )

  return (
    <Group title={t('catalog.title')} description={t('catalog.description')}>
      <Loadable query={data} what={t('catalog.what')}>
        {(s: CatalogSettings) => (
          <>
            <div className="grid gap-4 medium:grid-cols-2">
              <Field label={t('catalog.channel')} hint={t('catalog.channelHint')}>
                <Select
                  value={s.channel}
                  disabled={save.pending}
                  onValueChange={(channel) =>
                    change({ channel: channel as CatalogSettings['channel'] }).catch(() => {})
                  }
                  options={CATALOG_CHANNELS.map((c) => ({
                    value: c,
                    label: t(`catalog.${c}`),
                  }))}
                />
              </Field>
            </div>
            <Field inline label={t('catalog.auto')} hint={t('catalog.autoHint')}>
              <Switch
                checked={s.autoUpdate}
                disabled={save.pending}
                onCheckedChange={(autoUpdate) => change({ autoUpdate }).catch(() => {})}
              />
            </Field>
            <div className="grid gap-2">
              <span className="font-medium text-text text-ui">{t('catalog.extras')}</span>
              {s.extras.length === 0 ? (
                <p className="text-caption text-text-3">{t('catalog.noExtras')}</p>
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
                        <span className="text-caption text-text-3">
                          {t('catalog.keyId', { keyId: x.keyId })}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemoving(x.url)}
                        aria-label={t('catalog.removeLabel', { url: x.url })}
                      >
                        {t('catalog.remove')}
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
                  return setExtraError(t('catalog.extraMissing'))
                setExtraError(null)
                save.run({ extras: [...s.extras, next] }).then(
                  () => {
                    toast.success(t('catalog.added'))
                    setExtra(blankExtra)
                    data.refetch()
                  },
                  (err: Error) => setExtraError(err.message),
                )
              }}
            >
              <span className="font-medium text-text text-ui">{t('catalog.add')}</span>
              <Field label={t('catalog.url')} hint={t('catalog.urlHint')}>
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
                <Field label={t('catalog.keyIdLabel')}>
                  <Input
                    value={extra.keyId}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono"
                    onChange={(e) => setExtra({ ...extra, keyId: e.target.value })}
                  />
                </Field>
                <Field
                  label={t('catalog.publicKey')}
                  hint={t('catalog.publicKeyHint')}
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
                {t('catalog.addButton')}
              </Button>
            </form>
            <ConfirmDialog
              open={removing !== null}
              onOpenChange={(o) => !o && setRemoving(null)}
              title={t('catalog.removeTitle')}
              description={t('catalog.removeBody')}
              confirmLabel={t('catalog.removeConfirm')}
              cancelLabel={t('catalog.keep')}
              destructive
              onConfirm={() =>
                change({ extras: s.extras.filter((x) => x.url !== removing) }).catch(() => {})
              }
            />
          </>
        )}
      </Loadable>
    </Group>
  )
}

// ---------------------------------------------------------------- updates

function Updates({ value, set, owner }: Part) {
  const t = useT(messages)
  return (
    <Group title={t('updates.title')} description={t('updates.description')}>
      <div className="grid gap-1.5">
        {owner ? (
          <SegmentedControl
            aria-label={t('updates.channel')}
            size="sm"
            value={value.updateChannel}
            onValueChange={(c) => set({ updateChannel: c as GeneralSettings['updateChannel'] })}
            options={[
              { value: 'stable', label: t('updates.stable') },
              { value: 'beta', label: t('updates.beta') },
            ]}
            className="justify-self-start"
          />
        ) : (
          // the control has no disabled state: an admin reads the channel
          <p className="text-text text-ui">
            {t('updates.channelIs', { channel: t(`updates.${value.updateChannel}`) })}
          </p>
        )}
        <p className="text-caption text-text-3">{t('updates.channelHint')}</p>
      </div>
      <p className="text-caption text-text-3">{t('updates.docker')}</p>
    </Group>
  )
}

// ---------------------------------------------------------------- diagnostics

function Diagnostics({
  value,
  set,
  metrics,
  setMetrics,
  owner,
}: Part & { metrics: MetricsSettings; setMetrics: (m: MetricsSettings) => void }) {
  const t = useT(messages)
  return (
    <Group title={t('diagnostics.title')} description={t('diagnostics.description')}>
      <Field label={t('diagnostics.logLevel')} hint={t('diagnostics.logLevelHint')}>
        <Select
          value={value.logLevel}
          disabled={!owner}
          onValueChange={(l) => set({ logLevel: l as GeneralSettings['logLevel'] })}
          options={LOG_LEVELS.map((l) => ({ value: l, label: t(`diagnostics.level.${l}`) }))}
          className="medium:max-w-72"
        />
      </Field>
      <Field inline label={t('diagnostics.crashes')} hint={t('diagnostics.crashesHint')}>
        <Switch
          checked={value.crashReports}
          disabled={!owner}
          onCheckedChange={(crashReports) => set({ crashReports })}
        />
      </Field>
      <Field inline label={t('diagnostics.metrics')} hint={t('diagnostics.metricsHint')}>
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

/** Where Prometheus scrapes: the external URL, else the first address on the LAN. */
function MetricsAddress() {
  const t = useT(messages)
  const info = useQuery('public-info', (c) => c.system.publicInfo(), ['server.updated'])
  const base = info.data?.publicUrl ?? info.data?.localAddresses[0] ?? ''
  return (
    <div className="grid gap-1">
      <span className="truncate font-mono text-figure text-text" title={`${base}/metrics`}>
        {base}/metrics
      </span>
      <p className="text-caption text-text-3">
        {t('diagnostics.metricsKey')}{' '}
        <a
          href="/settings/users"
          className="rounded-sm text-text-2 underline underline-offset-2 outline-none hover:text-text focus-visible:ring-focus"
        >
          {t('diagnostics.keys')}
        </a>
      </p>
    </div>
  )
}
