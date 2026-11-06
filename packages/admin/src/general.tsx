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
// Since D3 (one-client-platform-d.md) it's drawn with the library's native renderer, on the web
// through react-native-web, with the same parts, words and behaviour as the web renderer's.
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
import { breakpoints } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  Switch,
  Text,
  Tooltip,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View } from 'react-native'
import { general as messages } from './general-messages.ts'
import { Loadable } from './loadable.tsx'
import { InlineLink } from './media-sections.tsx'
import {
  errorReason,
  keyRejected,
  maskedKey,
  metadataOptions,
  TMDB_KEY_PAGE,
  tmdbBusy,
} from './metadata-locale.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { Line, Note } from './settings-card.tsx'
import { Columns, ExternalLink } from './settings-columns.tsx'
import { useShell } from './shell.tsx'

const s = tokens.space
const figure = tokens.adminText.figure

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
      {!owner && <Note>{t('ownerOnly')}</Note>}
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
      <Columns shares={[1, 1]}>
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
      </Columns>
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
        <View style={{ gap: s['2'] }}>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}
          >
            <Line weight={500}>{t('key.label')}</Line>
            {loaded.key.set ? (
              <Badge tone="success">{t('key.set')}</Badge>
            ) : loaded.key.builtIn ? (
              <Badge tone="neutral">{t('key.builtIn')}</Badge>
            ) : (
              <Badge tone="warning">{t('key.notSet')}</Badge>
            )}
            {loaded.key.set && (
              <Tooltip content={t('key.masked', { last4: loaded.key.last4 ?? '' })}>
                <Text
                  mono
                  size={figure.size}
                  leading={figure.leading}
                  color="text-2"
                  aria-label={t('key.masked', { last4: loaded.key.last4 ?? '' })}
                >
                  {maskedKey(loaded.key.last4)}
                </Text>
              </Tooltip>
            )}
            {loaded.key.set && owner && draft.key === null && (
              <View
                style={{ marginStart: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}
              >
                <Button size="sm" onPress={() => setDraft({ ...draft, key: '' })}>
                  {t('key.replace')}
                </Button>
                <Button size="sm" variant="danger" onPress={() => setRemoving(true)}>
                  {t('key.remove')}
                </Button>
              </View>
            )}
          </View>
          {!loaded.key.set && (
            <Note>{t(loaded.key.builtIn ? 'key.builtInBody' : 'key.notSetBody')}</Note>
          )}
        </View>
        {entering && owner && (
          <View style={{ gap: s['2'] }}>
            <Field label={t('key.new')} hint={t('key.hint')} error={keyError ?? undefined}>
              <Input
                secureTextEntry
                value={draft.key ?? ''}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                mono
                onChangeText={(key) => setDraft({ ...draft, key })}
              />
            </Field>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['3'] }}
            >
              <ExternalLink href={TMDB_KEY_PAGE} look="accent">
                {t('key.open')}
              </ExternalLink>
              {loaded.key.set && (
                <View style={{ marginStart: 'auto' }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => setDraft({ ...draft, key: null })}
                  >
                    {t('key.cancel')}
                  </Button>
                </View>
              )}
            </View>
          </View>
        )}
        <Columns shares={[1, 1]}>
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
        </Columns>
      </Group>
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
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
        <Note>{t('catalog.ownerOnly')}</Note>
      </Group>
    )
  return <CatalogSettingsGroup />
}

const blankExtra = { url: '', keyId: '', publicKey: '' }
const sp = tokens.space
/** The key id's column from medium widths, as the web's `12rem`. */
const KEY_ID_WIDTH = 192

function CatalogSettingsGroup() {
  const t = useT(messages)
  const data = useQuery('settings:catalog', (c) => c.catalog.settings(), [INDEXER_TOPICS.catalog])
  const save = useAction((c, body: CatalogSettingsPatch) => c.catalog.updateSettings({ body }))
  const [extra, setExtra] = useState(blankExtra)
  const [extraError, setExtraError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const theme = useTheme()
  const medium = useWindowAtLeast(breakpoints.medium)

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
        {(s: CatalogSettings) => {
          const add = () => {
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
          }
          return (
            <>
              <Columns shares={[1, 1]}>
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
              </Columns>
              <Switch
                label={t('catalog.auto')}
                hint={t('catalog.autoHint')}
                checked={s.autoUpdate}
                disabled={save.pending}
                onCheckedChange={(autoUpdate) => change({ autoUpdate }).catch(() => {})}
              />
              <View style={{ gap: sp['2'] }}>
                <Line weight={500}>{t('catalog.extras')}</Line>
                {s.extras.length === 0 ? (
                  <Note>{t('catalog.noExtras')}</Note>
                ) : (
                  <View role="list" style={{ gap: sp['2'] }}>
                    {s.extras.map((x) => (
                      <View
                        key={x.url}
                        role="listitem"
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: sp['3'],
                          minWidth: 0,
                          paddingHorizontal: sp['3'],
                          paddingVertical: sp['2'],
                          borderWidth: 1,
                          borderColor: theme.colors.line,
                          borderRadius: tokens.radius.md,
                          backgroundColor: theme.colors.s1,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Tooltip content={x.url}>
                            <Text
                              mono
                              size={figure.size}
                              leading={figure.leading}
                              numberOfLines={1}
                            >
                              {x.url}
                            </Text>
                          </Tooltip>
                          <Note>{t('catalog.keyId', { keyId: x.keyId })}</Note>
                        </View>
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() => setRemoving(x.url)}
                          accessibilityLabel={t('catalog.removeLabel', { url: x.url })}
                        >
                          {t('catalog.remove')}
                        </Button>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View
                style={{
                  gap: sp['3'],
                  padding: sp['3'],
                  borderWidth: 1,
                  borderColor: theme.colors.line,
                  borderRadius: tokens.radius.md,
                }}
              >
                <Line weight={500}>{t('catalog.add')}</Line>
                <Field label={t('catalog.url')} hint={t('catalog.urlHint')}>
                  <Input
                    value={extra.url}
                    keyboardType="url"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    mono
                    onSubmitEditing={add}
                    onChangeText={(url) => setExtra({ ...extra, url })}
                  />
                </Field>
                <View
                  style={{
                    flexDirection: medium ? 'row' : 'column',
                    alignItems: 'flex-start',
                    gap: sp['3'],
                  }}
                >
                  <View style={medium ? { width: KEY_ID_WIDTH } : { alignSelf: 'stretch' }}>
                    <Field label={t('catalog.keyIdLabel')}>
                      <Input
                        value={extra.keyId}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        mono
                        onSubmitEditing={add}
                        onChangeText={(keyId) => setExtra({ ...extra, keyId })}
                      />
                    </Field>
                  </View>
                  <View style={medium ? { flex: 1, minWidth: 0 } : { alignSelf: 'stretch' }}>
                    <Field
                      label={t('catalog.publicKey')}
                      hint={t('catalog.publicKeyHint')}
                      error={extraError ?? undefined}
                    >
                      <Input
                        value={extra.publicKey}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        mono
                        onSubmitEditing={add}
                        onChangeText={(publicKey) => setExtra({ ...extra, publicKey })}
                      />
                    </Field>
                  </View>
                </View>
                <View style={{ alignSelf: 'flex-start' }}>
                  <Button size="sm" loading={save.pending} onPress={add}>
                    {t('catalog.addButton')}
                  </Button>
                </View>
              </View>
              <ConfirmDialog
                open={removing !== null}
                onClose={() => setRemoving(null)}
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
          )
        }}
      </Loadable>
    </Group>
  )
}

// ---------------------------------------------------------------- updates

function Updates({ value, set, owner }: Part) {
  const t = useT(messages)
  return (
    <Group title={t('updates.title')} description={t('updates.description')}>
      <View style={{ gap: s['1'] + s['0.5'] }}>
        {owner ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <SegmentedControl
              aria-label={t('updates.channel')}
              size="sm"
              value={value.updateChannel}
              onValueChange={(c) => set({ updateChannel: c as GeneralSettings['updateChannel'] })}
              options={[
                { value: 'stable', label: t('updates.stable') },
                { value: 'beta', label: t('updates.beta') },
              ]}
            />
          </View>
        ) : (
          // the control has no disabled state: an admin reads the channel
          <Line>{t('updates.channelIs', { channel: t(`updates.${value.updateChannel}`) })}</Line>
        )}
        <Note>{t('updates.channelHint')}</Note>
      </View>
      <Note>{t('updates.docker')}</Note>
    </Group>
  )
}

// ---------------------------------------------------------------- diagnostics

/** The log level's select from medium widths, as the web's `max-w-72`. */
const LOG_LEVEL_WIDTH = 288

function Diagnostics({
  value,
  set,
  metrics,
  setMetrics,
  owner,
}: Part & { metrics: MetricsSettings; setMetrics: (m: MetricsSettings) => void }) {
  const t = useT(messages)
  const medium = useWindowAtLeast(breakpoints.medium)
  return (
    <Group title={t('diagnostics.title')} description={t('diagnostics.description')}>
      <Field label={t('diagnostics.logLevel')} hint={t('diagnostics.logLevelHint')}>
        <View style={medium ? { maxWidth: LOG_LEVEL_WIDTH } : undefined}>
          <Select
            value={value.logLevel}
            disabled={!owner}
            onValueChange={(l) => set({ logLevel: l as GeneralSettings['logLevel'] })}
            options={LOG_LEVELS.map((l) => ({ value: l, label: t(`diagnostics.level.${l}`) }))}
          />
        </View>
      </Field>
      <Switch
        label={t('diagnostics.crashes')}
        hint={t('diagnostics.crashesHint')}
        checked={value.crashReports}
        disabled={!owner}
        onCheckedChange={(crashReports) => set({ crashReports })}
      />
      <Switch
        label={t('diagnostics.metrics')}
        hint={t('diagnostics.metricsHint')}
        checked={metrics.enabled}
        disabled={!owner}
        onCheckedChange={(enabled) => setMetrics({ enabled })}
      />
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
    <View style={{ gap: s['1'] }}>
      <Tooltip content={`${base}/metrics`}>
        <Text mono size={figure.size} leading={figure.leading} numberOfLines={1}>
          {`${base}/metrics`}
        </Text>
      </Tooltip>
      <Note>
        {t('diagnostics.metricsKey')}{' '}
        <InlineLink href="/settings/users">{t('diagnostics.keys')}</InlineLink>
      </Note>
    </View>
  )
}
