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
// only the owner saves it (the API refuses anyone else), so their fields are disabled. Drawn with the
// library's native renderer since D3 (one-client-platform-d.md).
import type { NetworkSettings, NetworkStatus } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  Field,
  Input,
  SegmentedControl,
  Switch,
  Text,
  toast,
  tokens,
  useRegularWindow,
} from '@highsea-tv/ui/native'
import { useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { Loadable } from './loadable.tsx'
import { network as messages } from './network-messages.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { useShell } from './shell.tsx'

const s = tokens.space
const ui = tokens.adminText.ui

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
  const medium = useRegularWindow()

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
      {!owner && (
        <Text variant="caption" color="text-3">
          {t('ownerOnly')}
        </Text>
      )}
      <Group title={t('remote.title')} description={t('remote.description')}>
        <Field label={t('externalUrl')} error={errors.externalUrl}>
          <Input
            mono
            value={v.externalUrl}
            disabled={!owner}
            placeholder="https://harbor.example.net"
            spellCheck={false}
            autoCapitalize="none"
            inputMode="url"
            keyboardType="url"
            onChangeText={(externalUrl) => set({ externalUrl })}
          />
        </Field>
      </Group>
      <Group title={t('tls.title')}>
        {owner ? (
          <SegmentedControl
            aria-label={t('tls')}
            size="sm"
            value={v.tls}
            onValueChange={(tls) => set({ tls })}
            options={TLS_MODES.map((m) => ({ value: m, label: t(`tls.${m}`) }))}
          />
        ) : (
          <Text size={ui.size} leading={ui.leading}>
            {t('tls')}: {t(`tls.${v.tls}`)}
          </Text>
        )}
        {v.tls === 'built-in' && (
          <>
            <Text variant="caption" color="text-3">
              {t('tls.builtInHint')}
            </Text>
            {loaded.tlsProblem && loaded.tls === 'built-in' && (
              <Text variant="caption" color="badge-warning">
                {loaded.tlsProblem}
              </Text>
            )}
            <View
              style={
                {
                  display: 'grid',
                  gridTemplateColumns: medium ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                  gap: s['4'],
                } as unknown as ViewStyle
              }
            >
              <Field label={t('httpsPort')} error={errors.httpsPort}>
                <Input
                  inputMode="numeric"
                  keyboardType="number-pad"
                  value={v.httpsPort}
                  disabled={!owner}
                  onChangeText={(httpsPort) => set({ httpsPort })}
                />
              </Field>
            </View>
          </>
        )}
        {v.tls === 'off' && (
          <Text variant="caption" color="badge-warning">
            {t('tls.offWarning')}
          </Text>
        )}
        <Field
          label={t('trustedProxies')}
          hint={t('trustedProxiesHint')}
          error={errors.trustedProxies}
        >
          <Input
            mono
            value={v.trustedProxies}
            disabled={!owner}
            placeholder="172.16.0.0/12"
            spellCheck={false}
            autoCapitalize="none"
            onChangeText={(trustedProxies) => set({ trustedProxies })}
          />
        </Field>
        <Switch
          label={t('proxyHeaders')}
          hint={t('proxyHeadersHint')}
          checked={v.proxyHeaders}
          disabled={!owner}
          onCheckedChange={(proxyHeaders) => set({ proxyHeaders })}
        />
      </Group>
      <Group title={t('discovery.title')}>
        <Switch
          label={t('discovery', { name })}
          hint={t('discoveryHint', { port: loaded.discoveryPort })}
          checked={v.discovery}
          disabled={!owner}
          onCheckedChange={(discovery) => set({ discovery })}
        />
        <View style={{ gap: s['1'] }}>
          <Text role="heading" aria-level={3} size={ui.size} leading={ui.leading} weight={600}>
            {t('addresses')}
          </Text>
          {loaded.localAddresses.length ? (
            <View role="list" aria-label={t('addresses')} style={{ gap: s['1'] }}>
              {loaded.localAddresses.map((a) => (
                <Text
                  key={a}
                  role="listitem"
                  variant="mono"
                  color="text-2"
                  style={{ overflowWrap: 'anywhere' } as object}
                >
                  {a}
                </Text>
              ))}
            </View>
          ) : (
            <Text variant="caption" color="text-3">
              {t('addresses.none')}
            </Text>
          )}
        </View>
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
