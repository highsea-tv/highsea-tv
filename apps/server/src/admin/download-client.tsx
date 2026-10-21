'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client (settings.md), ported from the signed-off prototype's DownloadClient
// (design/prototypes/src/admin/settings/reference.tsx): the VPN in one line with the way to
// Settings › VPN, then Connections. The owner's only (ADR 0032's answers). Encryption and UPnP are
// stored now and take effect with 6b, which a caption says. Two changes from the prototype, both
// forced by real data:
// - a Seeding group for the default seeding rule, which an indexer's own rule (A9) falls back to;
//   no prototype screen sets it, and Downloads' Seeding tab only reads it;
// - the speed limits stay on Downloads, as the prototype's caption says, so they aren't fields
//   here; the save sends the current ones, read just before, so it never undoes a change made
//   there.
import type { DownloadClientSettings } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Button, Field, Input, Select, Switch, toast } from '@highsea/ui-web'
import { useState } from 'react'
import { downloadClient as messages } from './download-client-messages.ts'
import { hoursText, minutesOf, ratioOf, ratioText } from './download-client-seeding.ts'
import { Loadable } from './loadable.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { VpnSummary } from './vpn.tsx'

type Draft = {
  port: string
  encryption: DownloadClientSettings['encryption']
  upnp: boolean
  maxActive: string
  seedRatio: string
  seedHours: string
}

const draftOf = (s: DownloadClientSettings): Draft => ({
  port: String(s.port),
  encryption: s.encryption,
  upnp: s.upnp,
  maxActive: String(s.maxActive),
  seedRatio: ratioText(s.seedRatio),
  seedHours: hoursText(s.seedMinutes),
})

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
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
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
  const show = (bad: boolean, message: string) => (touched && bad ? message : undefined)

  const submit = async () => {
    setTouched(true)
    if (
      port === undefined ||
      maxActive === undefined ||
      seedRatio === undefined ||
      seedMinutes === undefined
    )
      return
    try {
      await save.run({
        port,
        encryption: v.encryption,
        upnp: v.upnp,
        maxActive,
        seedRatio,
        seedMinutes,
      })
    } catch (e) {
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
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
        <p className="text-caption text-text-3">{t('later')}</p>
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
