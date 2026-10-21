'use client'
import type { DownloadClientSettings } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (settings.md), ported from the signed-off prototype's DownloadClient
// (design/prototypes/src/admin/settings/reference.tsx): the VPN in one line with the way to
// Settings › VPN, then Connections. The owner's only (ADR 0032's answers). 6b gives encryption and
// UPnP their effect (the caption saying they'd come later is gone) and adds the IP blocklist to
// Connections, as settings.md says. Two changes from the prototype, both forced by real data:
// - a Seeding group for the default seeding rule, which an indexer's own rule (A9) falls back to;
//   no prototype screen sets it, and Downloads' Seeding tab only reads it;
// - the speed limits stay on Downloads, as the prototype's caption says, so they aren't fields
//   here; the save sends the current ones, read just before, so it never undoes a change made
//   there.
// 6b adds two groups no prototype screen has (judgement calls in phase-3-checkpoint-6.md): the
// watch folder, saved with the rest, and the categories, which save at once (download-categories).
import type { ApiError } from '@highsea/sdk'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Button, Field, Input, Select, Switch, toast } from '@highsea/ui-web'
import { useState } from 'react'
import { CATEGORY_TOPICS, Categories } from './download-categories.tsx'
import { watchFolder as watchMessages } from './download-categories-messages.ts'
import { downloadClient as messages } from './download-client-messages.ts'
import { hoursText, minutesOf, ratioOf, ratioText } from './download-client-seeding.ts'
import { Loadable } from './loadable.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { VpnSummary } from './vpn.tsx'

type Draft = {
  port: string
  encryption: DownloadClientSettings['encryption']
  upnp: boolean
  utp: boolean
  maxActive: string
  blocklistUrl: string
  seedRatio: string
  seedHours: string
  watchFolder: string
  watchCategory: string
}

const draftOf = (s: DownloadClientSettings): Draft => ({
  port: String(s.port),
  encryption: s.encryption,
  upnp: s.upnp,
  utp: s.utp,
  maxActive: String(s.maxActive),
  blocklistUrl: s.blocklistUrl,
  seedRatio: ratioText(s.seedRatio),
  seedHours: hoursText(s.seedMinutes),
  watchFolder: s.watchFolder ?? '',
  watchCategory: s.watchCategory,
})

/** Empty, an http(s) address, or a path in the config folder (the server checks it's inside). */
const blocklistOk = (text: string) => {
  const s = text.trim()
  if (!s) return true
  if (/^https?:\/\//i.test(s)) return URL.canParse(s)
  return !/^[a-z][a-z0-9+.-]*:/i.test(s)
}

const wholeIn = (text: string, min: number, max: number) => {
  const n = Number(text.trim())
  return /^\d+$/.test(text.trim()) && n >= min && n <= max ? n : undefined
}

export function DownloadClient() {
  const t = useT(messages)
  const data = useQuery('settings:download-client', (c) => c.settings.downloadClient(), [
    'settings.updated',
  ])
  return (
    <AreaPage id="downloads">
      <Group title={t('vpn.title')}>
        <VpnSummary
          action={
            <Button size="sm" variant="secondary" asChild>
              <a href="/settings/vpn">{t('vpn.settings')}</a>
            </Button>
          }
        />
      </Group>
      <Loadable query={data} what={t('what')}>
        {/* a fresh draft whenever the saved settings change */}
        {(s) => <Form key={JSON.stringify(s)} loaded={s} reload={data.refetch} />}
      </Loadable>
      <Categories />
      <p className="text-caption text-text-3">
        {t('elsewhere.before')}{' '}
        <a href="/downloads" className="text-text underline underline-offset-2">
          {t('elsewhere.link')}
        </a>
        .
      </p>
    </AreaPage>
  )
}

function Form({ loaded, reload }: { loaded: DownloadClientSettings; reload: () => void }) {
  const t = useT(messages)
  const initial = draftOf(loaded)
  const [v, setDraft] = useState(initial)
  const [touched, setTouched] = useState(false)
  const [watchError, setWatchError] = useState<string | null>(null)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const tw = useT(watchMessages)
  const categories = useQuery(
    'torrents:categories',
    (c) => c.downloads.categories(),
    CATEGORY_TOPICS,
  )
  const save = useAction(
    async (c, body: Omit<DownloadClientSettings, 'downloadRate' | 'uploadRate'>) => {
      const limits = await c.downloads.limits()
      return c.settings.saveDownloadClient({ body: { ...body, ...limits } })
    },
  )
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)

  const port = wholeIn(v.port, 1024, 65_535)
  const maxActive = wholeIn(v.maxActive, 1, 20)
  const seedRatio = ratioOf(v.seedRatio)
  const seedMinutes = minutesOf(v.seedHours)
  const blocklistValid = blocklistOk(v.blocklistUrl)
  const show = (bad: boolean, message: string) => (touched && bad ? message : undefined)

  const submit = async () => {
    setTouched(true)
    if (
      port === undefined ||
      maxActive === undefined ||
      seedRatio === undefined ||
      seedMinutes === undefined ||
      !blocklistValid
    )
      return
    try {
      await save.run({
        port,
        encryption: v.encryption,
        upnp: v.upnp,
        utp: v.utp,
        maxActive,
        blocklistUrl: v.blocklistUrl.trim(),
        seedRatio,
        seedMinutes,
        watchFolder: v.watchFolder.trim() || null,
        watchCategory: v.watchCategory,
      })
    } catch (e) {
      const field = ((e as ApiError).details as { field?: string } | undefined)?.field
      if (field === 'watchFolder' || field === 'watchCategory') setWatchError((e as Error).message)
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    setWatchError(null)
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      <Group title={t('connections.title')}>
        <div className="grid items-start gap-4 medium:grid-cols-3">
          <Field label={t('port')} error={show(port === undefined, t('portInvalid'))}>
            <Input
              type="number"
              inputMode="numeric"
              min={1024}
              max={65535}
              value={v.port}
              onChange={(e) => set({ port: e.target.value })}
              className="font-mono"
            />
          </Field>
          <Field label={t('encryption')}>
            <Select
              value={v.encryption}
              onValueChange={(e) => set({ encryption: e as Draft['encryption'] })}
              options={(['require', 'prefer', 'allow'] as const).map((e) => ({
                value: e,
                label: t(`encryption.${e}`),
              }))}
            />
          </Field>
          <Field
            label={t('maxActive')}
            hint={t('maxActiveHint')}
            error={show(maxActive === undefined, t('maxActiveInvalid'))}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={v.maxActive}
              onChange={(e) => set({ maxActive: e.target.value })}
            />
          </Field>
        </div>
        <Field inline label={t('upnp')} hint={t('upnpHint')}>
          <Switch checked={v.upnp} onCheckedChange={(upnp) => set({ upnp })} />
        </Field>
        <Field inline label={t('utp')} hint={t('utpHint')}>
          <Switch checked={v.utp} onCheckedChange={(utp) => set({ utp })} />
        </Field>
        <Field
          label={t('blocklist')}
          hint={t('blocklistHint')}
          error={show(!blocklistValid, t('blocklistInvalid'))}
        >
          <Input
            value={v.blocklistUrl}
            placeholder={t('blocklistPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => set({ blocklistUrl: e.target.value })}
            className="font-mono"
          />
        </Field>
      </Group>
      <Group title={t('seeding.title')} description={t('seeding.description')}>
        <div className="grid items-start gap-4 medium:grid-cols-3">
          <Field
            label={t('seedRatio')}
            hint={t('seedRatioHint')}
            error={show(seedRatio === undefined, t('seedRatioInvalid'))}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.1"
              value={v.seedRatio}
              onChange={(e) => set({ seedRatio: e.target.value })}
            />
          </Field>
          <Field
            label={t('seedHours')}
            hint={t('seedHoursHint')}
            error={show(seedMinutes === undefined, t('seedHoursInvalid'))}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={v.seedHours}
              onChange={(e) => set({ seedHours: e.target.value })}
            />
          </Field>
        </div>
      </Group>
      <Group title={tw('title')} description={tw('description')}>
        <div className="grid items-start gap-4 medium:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label={tw('folder')} hint={tw('folderHint')} error={watchError ?? undefined}>
            <Input
              value={v.watchFolder}
              icon="folder"
              placeholder={tw('folderPlaceholder')}
              spellCheck={false}
              autoCapitalize="none"
              className="font-mono"
              onChange={(e) => {
                setWatchError(null)
                set({ watchFolder: e.target.value })
              }}
            />
          </Field>
          <Field label={tw('category')} hint={tw('categoryHint')}>
            <Select
              value={v.watchCategory}
              onValueChange={(watchCategory) => set({ watchCategory })}
              options={(categories.data ?? [{ name: v.watchCategory }])
                .filter((c) => c.name !== 'movies')
                .map((c) => ({ value: c.name, label: c.name }))}
            />
          </Field>
        </div>
      </Group>
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onSave={submit}
        onDiscard={() => {
          setTouched(false)
          setDraft(initial)
        }}
      />
    </>
  )
}
