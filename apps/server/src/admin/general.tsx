'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › General (settings.md). Checkpoint 4 builds its Metadata group, after Region, where
// the owner's decision 1 puts it: the TMDB key (set or not, its last four characters, Replace and
// Remove), the metadata language and the region. A new key is checked with TMDB on Save, as setup
// checks it. Checkpoint 5 adds the Catalog group after it (its answer 7): the channel, automatic
// updates and extra catalogs with their keys. Its settings are the owner's to read as well as to
// change (ADR 0032), so an admin sees a line saying so; each change saves at once, as Monitored
// does, so the page keeps one Save bar, Metadata's. Region, Updates and Diagnostics have no API
// yet, so they're left out with a line saying so rather than shown as controls that do nothing.
import {
  CATALOG_CHANNELS,
  type CatalogSettings,
  type CatalogSettingsPatch,
  INDEXER_TOPICS,
  type MetadataInput,
  type MetadataSettings,
} from '@highsea/api-contract'
import { useLocale, useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Icon,
  Input,
  Select,
  Switch,
  toast,
} from '@highsea/ui-web'
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
  const data = useQuery('settings:metadata', (c) => c.settings.metadata(), ['settings.updated'])
  return (
    <AreaPage id="general">
      <Loadable query={data} what={t('what')}>
        {/* a fresh draft whenever the saved settings change */}
        {(m) => <Metadata key={JSON.stringify(m)} loaded={m} reload={data.refetch} />}
      </Loadable>
      <Catalog />
      <p className="text-caption text-text-3">{t('later')}</p>
    </AreaPage>
  )
}

type Draft = { language: string; region: string; key: string | null }

function Metadata({ loaded, reload }: { loaded: MetadataSettings; reload: () => void }) {
  const t = useT(messages)
  const locale = useLocale()
  const { role } = useShell()
  const owner = role === 'owner'
  const initial: Draft = { language: loaded.language, region: loaded.region, key: null }
  const [draft, setDraft] = useState(initial)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const save = useAction((c, body: MetadataInput) => c.settings.saveMetadata({ body }))
  const remove = useAction((c) => c.settings.removeMetadataKey())
  const dirty =
    draft.language !== initial.language ||
    draft.region !== initial.region ||
    (draft.key !== null && draft.key.trim() !== '')
  // the field for a new key: always when none is set, after Replace when one is
  const entering = !loaded.key.set || draft.key !== null

  const submit = async () => {
    const key = draft.key?.trim()
    try {
      await save.run({ language: draft.language, region: draft.region, ...(key ? { key } : {}) })
    } catch (e) {
      const reason = errorReason(e)
      if (keyRejected(reason)) return setKeyError(t('key.rejected'))
      return toast.error(t('saveError'), {
        description: tmdbBusy(reason) ? t('key.unavailable') : (e as Error).message,
      })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      <Group title={t('metadata.title')} description={t('metadata.description')}>
        {!owner && <p className="text-caption text-text-3">{t('ownerOnly')}</p>}
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-text text-ui">{t('key.label')}</span>
            {loaded.key.set ? (
              <Badge tone="success">{t('key.set')}</Badge>
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
          {!loaded.key.set && <p className="text-caption text-text-3">{t('key.notSetBody')}</p>}
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
                onChange={(e) => {
                  setKeyError(null)
                  setDraft({ ...draft, key: e.target.value })
                }}
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
                  onClick={() => {
                    setKeyError(null)
                    setDraft({ ...draft, key: null })
                  }}
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
        description={t('key.removeBody')}
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
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onDiscard={() => {
          setKeyError(null)
          setDraft(initial)
        }}
        onSave={submit}
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
