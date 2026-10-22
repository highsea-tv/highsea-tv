'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Network and remote access (settings.md), ported from the signed-off prototype's
// Network (design/prototypes/src/admin/settings/reference.tsx) onto checkpoint 2's API. Remote
// access: the external URL, checked as the server checks it (http or https, no query or fragment).
// Reverse proxy and TLS: the three modes, the trusted proxies and the forwarded headers; built in
// shows the HTTPS port the API has and why it isn't serving when it can't, where the prototype
// offered a certificate choice the API doesn't have. Discovery: the switch, with the server's own
// name and discovery port in place of the prototype's, and the addresses it answers on. The
// prototype's Check from outside is gone (the owner's call, 2026-10-21). Admins read the area;
// only the owner saves it (the API refuses anyone else), so their fields are disabled.
import type { NetworkSettings, NetworkStatus } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import { Field, Input, SegmentedControl, Switch, toast } from '@highsea/ui-web'
import { useState } from 'react'
import { Loadable } from './loadable.tsx'
import { network as messages } from './network-messages.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { useShell } from './shell.tsx'

const TLS_MODES = ['proxy', 'built-in', 'off'] as const

type Draft = Omit<NetworkSettings, 'httpsPort'> & { httpsPort: string }
type Errors = Partial<Record<keyof Draft, string>>

const draftOf = ({
  localAddresses: _addresses,
  discoveryPort: _port,
  tlsProblem: _problem,
  ...s
}: NetworkStatus): Draft => ({ ...s, httpsPort: String(s.httpsPort) })

/** The field a refused save names (`details.field`, as checkNetwork gives it). */
function errorField(error: unknown): string | undefined {
  const field = (
    (error as { details?: unknown } | null)?.details as { field?: unknown } | undefined
  )?.field
  return typeof field === 'string' ? field : undefined
}

/** As the server checks it: http or https, a host, no query or fragment. */
function urlOk(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  try {
    const url = new URL(v)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.search && !url.hash
  } catch {
    return false
  }
}

export function Network() {
  const t = useT(messages)
  const data = useQuery('settings:network', (c) => c.settings.network(), ['settings.updated'])
  return (
    <AreaPage id="network">
      {data.status === 'success' ? (
        // a fresh draft whenever the saved settings change
        <Form key={JSON.stringify(data.data)} loaded={data.data} reload={data.refetch} />
      ) : (
        <Loadable query={data} what={t('what')}>
          {() => null}
        </Loadable>
      )}
    </AreaPage>
  )
}

function Form({ loaded, reload }: { loaded: NetworkStatus; reload: () => void }) {
  const t = useT(messages)
  const { role } = useShell()
  const owner = role === 'owner'
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  const initial = draftOf(loaded)
  const [v, setDraft] = useState(initial)
  const [errors, setErrors] = useState<Errors>({})
  const save = useAction((c, body: NetworkSettings) => c.settings.saveNetwork({ body }))
  const set = (patch: Partial<Draft>) => {
    setErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const name = info.data?.name ?? t('thisServer')

  const submit = async () => {
    const port = v.httpsPort.trim()
    const httpsPort = Number(port)
    const problems: Errors = {}
    if (!urlOk(v.externalUrl)) problems.externalUrl = t('externalUrl.invalid')
    if (!/^\d+$/.test(port) || httpsPort < 1024 || httpsPort > 65535)
      problems.httpsPort = t('httpsPort.invalid')
    if (Object.keys(problems).length) return setErrors(problems)
    try {
      await save.run({ ...v, httpsPort })
    } catch (e) {
      const field = errorField(e)
      if (field && field in v) setErrors({ [field]: (e as Error).message })
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      {!owner && <p className="text-caption text-text-3">{t('ownerOnly')}</p>}
      <Group title={t('remote.title')} description={t('remote.description')}>
        <Field label={t('externalUrl')} error={errors.externalUrl}>
          <Input
            value={v.externalUrl}
            disabled={!owner}
            placeholder="https://harbor.example.net"
            spellCheck={false}
            autoCapitalize="none"
            inputMode="url"
            onChange={(e) => set({ externalUrl: e.target.value })}
            className="font-mono"
          />
        </Field>
      </Group>
      <Group title={t('tls.title')}>
        {owner ? (
          <SegmentedControl
            aria-label={t('tls')}
            size="sm"
            value={v.tls}
            onValueChange={(tls) => set({ tls: tls as Draft['tls'] })}
            options={TLS_MODES.map((m) => ({ value: m, label: t(`tls.${m}`) }))}
            className="justify-self-start"
          />
        ) : (
          <p className="text-text text-ui">
            {t('tls')}: {t(`tls.${v.tls}`)}
          </p>
        )}
        {v.tls === 'built-in' && (
          <>
            <p className="text-caption text-text-3">{t('tls.builtInHint')}</p>
            {loaded.tlsProblem && loaded.tls === 'built-in' && (
              <p className="text-badge-warning text-caption">{loaded.tlsProblem}</p>
            )}
            <div className="grid gap-4 medium:grid-cols-2">
              <Field label={t('httpsPort')} error={errors.httpsPort}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1024}
                  max={65535}
                  value={v.httpsPort}
                  disabled={!owner}
                  onChange={(e) => set({ httpsPort: e.target.value })}
                />
              </Field>
            </div>
          </>
        )}
        {v.tls === 'off' && (
          <p className="text-badge-warning text-caption">{t('tls.offWarning')}</p>
        )}
        <Field
          label={t('trustedProxies')}
          hint={t('trustedProxiesHint')}
          error={errors.trustedProxies}
        >
          <Input
            value={v.trustedProxies}
            disabled={!owner}
            placeholder="172.16.0.0/12"
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => set({ trustedProxies: e.target.value })}
            className="font-mono"
          />
        </Field>
        <Field inline label={t('proxyHeaders')} hint={t('proxyHeadersHint')}>
          <Switch
            checked={v.proxyHeaders}
            disabled={!owner}
            onCheckedChange={(proxyHeaders) => set({ proxyHeaders })}
          />
        </Field>
      </Group>
      <Group title={t('discovery.title')}>
        <Field
          inline
          label={t('discovery', { name })}
          hint={t('discoveryHint', { port: loaded.discoveryPort })}
        >
          <Switch
            checked={v.discovery}
            disabled={!owner}
            onCheckedChange={(discovery) => set({ discovery })}
          />
        </Field>
        <div className="grid gap-1">
          <h3 className="font-semibold text-text text-ui">{t('addresses')}</h3>
          {loaded.localAddresses.length ? (
            <ul aria-label={t('addresses')} className="grid gap-1">
              {loaded.localAddresses.map((a) => (
                <li key={a} className="font-mono text-mono text-text-2 [overflow-wrap:anywhere]">
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-text-3">{t('addresses.none')}</p>
          )}
        </div>
      </Group>
      {owner && (
        <SaveBar
          dirty={dirty}
          saving={save.pending}
          onSave={submit}
          onDiscard={() => {
            setErrors({})
            setDraft(initial)
          }}
        />
      )}
    </>
  )
}
