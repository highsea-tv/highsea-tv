'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Security (settings.md), the owner's only (ADR 0032), ported from the signed-off
// prototype's Security (design/prototypes/src/admin/settings/reference.tsx) onto checkpoint 2's
// API. Signing in: two-step for the owner and admins, passkeys and how long the admin stays signed
// in, with proxy sign-in, which the API has and the prototype doesn't, beside them. Single sign-on:
// the provider's label, client ID, issuer and secret, which is write-only: left blank it's kept,
// pasted it's replaced, and it can be removed. The redirect URL is built from Network's external
// URL, as the server builds it, and without one the area says so. The prototype's Ownership group
// (Hand the server over) has no API yet and is left out.
import type { SecurityInput, SecuritySettings } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { Button, Field, Input, Select, Switch, toast } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { Loadable } from './loadable.tsx'
import { security as messages } from './security-messages.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'

/** The choices the server takes (SESSION_DAYS in @highsea-tv/auth). */
const SESSION_DAYS = [1, 7, 30, 90]
/** Where the provider sends people back (the contract's `auth/oidc/callback`). */
const CALLBACK_PATH = '/api/v1/auth/oidc/callback'

type Draft = Omit<SecuritySettings, 'oidc'> & {
  oidc: Omit<SecuritySettings['oidc'], 'clientSecretSet'> & {
    /** A new secret; blank keeps the stored one. */
    clientSecret: string
    removeSecret: boolean
  }
}
type ErrorField =
  | 'sessionDays'
  | 'oidc.enabled'
  | 'oidc.issuer'
  | 'oidc.clientId'
  | 'proxyAuth.header'
type Errors = Partial<Record<ErrorField, string>>
const FIELDS: readonly string[] = [
  'sessionDays',
  'oidc.enabled',
  'oidc.issuer',
  'oidc.clientId',
  'proxyAuth.header',
] satisfies ErrorField[]

const draftOf = ({ oidc: { clientSecretSet: _set, ...oidc }, ...s }: SecuritySettings): Draft => ({
  ...s,
  oidc: { ...oidc, clientSecret: '', removeSecret: false },
})

/** The field a refused save names (`details.field`). */
function errorField(error: unknown): string | undefined {
  const field = (
    (error as { details?: unknown } | null)?.details as { field?: unknown } | undefined
  )?.field
  return typeof field === 'string' ? field : undefined
}

/** As the server checks it (OIDC Discovery § 2): https, no query or fragment. */
function issuerOk(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.search && !url.hash
  } catch {
    return false
  }
}

// an HTTP field name is a token (RFC 9110 § 5.1), as the server checks it
const FIELD_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

export function Security() {
  const t = useT(messages)
  const data = useQuery('settings:security', (c) => c.settings.security(), ['settings.updated'])
  return (
    <AreaPage id="security">
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

function Form({ loaded, reload }: { loaded: SecuritySettings; reload: () => void }) {
  const t = useT(messages)
  const network = useQuery('settings:network', (c) => c.settings.network(), ['settings.updated'])
  const initial = draftOf(loaded)
  const [v, setDraft] = useState(initial)
  const [errors, setErrors] = useState<Errors>({})
  const save = useAction((c, body: SecurityInput) => c.settings.saveSecurity({ body }))
  const set = (patch: Partial<Draft>) => {
    setErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }
  const setOidc = (patch: Partial<Draft['oidc']>) => set({ oidc: { ...v.oidc, ...patch } })
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const external = network.data?.externalUrl.replace(/\/+$/, '') ?? ''
  const redirect = external ? `${external}${CALLBACK_PATH}` : null

  const submit = async () => {
    const problems: Errors = {}
    if (v.oidc.enabled) {
      if (!issuerOk(v.oidc.issuer)) problems['oidc.issuer'] = t('oidc.issuer.invalid')
      if (!v.oidc.clientId.trim()) problems['oidc.clientId'] = t('oidc.clientId.missing')
    }
    if (!FIELD_NAME.test(v.proxyAuth.header.trim()))
      problems['proxyAuth.header'] = t('proxyHeader.invalid')
    if (Object.keys(problems).length) return setErrors(problems)
    const { clientSecret, removeSecret, ...oidc } = v.oidc
    const secret = clientSecret.trim()
    try {
      await save.run({
        ...v,
        oidc: {
          ...oidc,
          name: oidc.name.trim(),
          issuer: oidc.issuer.trim(),
          clientId: oidc.clientId.trim(),
          // omitted keeps the stored secret; null removes it
          ...(removeSecret ? { clientSecret: null } : secret ? { clientSecret: secret } : {}),
        },
        proxyAuth: { ...v.proxyAuth, header: v.proxyAuth.header.trim() },
      })
    } catch (e) {
      const field = errorField(e)
      if (field && FIELDS.includes(field)) setErrors({ [field]: (e as Error).message })
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      <Group title={t('signIn.title')}>
        <Field inline label={t('twoFactor')} hint={t('twoFactorHint')}>
          <Switch checked={v.twoFactor} onCheckedChange={(twoFactor) => set({ twoFactor })} />
        </Field>
        <Field inline label={t('passkeys')} hint={t('passkeysHint')}>
          <Switch checked={v.passkeys} onCheckedChange={(passkeys) => set({ passkeys })} />
        </Field>
        <Field label={t('sessionDays')} hint={t('sessionDaysHint')} error={errors.sessionDays}>
          <Select
            value={String(v.sessionDays)}
            onValueChange={(d) => set({ sessionDays: Number(d) })}
            options={SESSION_DAYS.map((d) => ({
              value: String(d),
              label: t('days', { count: d }),
            }))}
            className="medium:max-w-48"
          />
        </Field>
        <Field inline label={t('proxyAuth')} hint={t('proxyAuthHint')}>
          <Switch
            checked={v.proxyAuth.enabled}
            onCheckedChange={(enabled) => set({ proxyAuth: { ...v.proxyAuth, enabled } })}
          />
        </Field>
        {v.proxyAuth.enabled && (
          <div className="grid gap-4 medium:grid-cols-2">
            <Field label={t('proxyHeader')} error={errors['proxyAuth.header']}>
              <Input
                value={v.proxyAuth.header}
                placeholder="Remote-User"
                spellCheck={false}
                autoCapitalize="none"
                onChange={(e) => set({ proxyAuth: { ...v.proxyAuth, header: e.target.value } })}
                className="font-mono"
              />
            </Field>
          </div>
        )}
      </Group>
      <Group title={t('oidc.title')} description={t('oidc.description')}>
        <Field inline label={t('oidc.enabled')} error={errors['oidc.enabled']}>
          <Switch checked={v.oidc.enabled} onCheckedChange={(enabled) => setOidc({ enabled })} />
        </Field>
        {v.oidc.enabled && (
          <div className="grid gap-4 medium:grid-cols-2">
            <Field label={t('oidc.name')} hint={t('oidc.nameHint', { name: v.oidc.name || '…' })}>
              <Input
                value={v.oidc.name}
                placeholder="Authentik"
                onChange={(e) => setOidc({ name: e.target.value })}
              />
            </Field>
            <Field label={t('oidc.clientId')} error={errors['oidc.clientId']}>
              <Input
                value={v.oidc.clientId}
                spellCheck={false}
                autoCapitalize="none"
                onChange={(e) => setOidc({ clientId: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Field
              label={t('oidc.issuer')}
              error={errors['oidc.issuer']}
              className="medium:col-span-2"
            >
              <Input
                value={v.oidc.issuer}
                placeholder="https://auth.example.net"
                spellCheck={false}
                autoCapitalize="none"
                inputMode="url"
                onChange={(e) => setOidc({ issuer: e.target.value })}
                className="font-mono"
              />
            </Field>
            <Secret v={v.oidc} stored={loaded.oidc.clientSecretSet} onChange={setOidc} />
            <Field
              label={t('oidc.redirect')}
              hint={redirect ? t('oidc.redirectHint') : undefined}
              className="medium:col-span-2"
            >
              {redirect ? (
                <div className="flex min-w-0 gap-2">
                  <Input
                    readOnly
                    value={redirect}
                    aria-label={t('oidc.redirect')}
                    className="font-mono"
                  />
                  <Button
                    icon="copy"
                    onClick={() => {
                      navigator.clipboard?.writeText(redirect).catch(() => {})
                      toast({ title: t('copied') })
                    }}
                  >
                    {t('copy')}
                  </Button>
                </div>
              ) : (
                <Loadable query={network} what={t('oidc.redirect')}>
                  {() => (
                    <div className="grid gap-2">
                      <p className="text-badge-warning text-caption">{t('oidc.redirectMissing')}</p>
                      <Button size="sm" variant="ghost" className="justify-self-start" asChild>
                        <a href="/settings/network">{t('oidc.openNetwork')}</a>
                      </Button>
                    </div>
                  )}
                </Loadable>
              )}
            </Field>
          </div>
        )}
      </Group>
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onSave={submit}
        onDiscard={() => {
          setErrors({})
          setDraft(initial)
        }}
      />
    </>
  )
}

/** Write-only: blank keeps what's stored, a new one replaces it, and a stored one can go. */
function Secret({
  v,
  stored,
  onChange,
}: {
  v: Draft['oidc']
  stored: boolean
  onChange: (patch: Partial<Draft['oidc']>) => void
}) {
  const t = useT(messages)
  return (
    <Field
      label={t('oidc.secret')}
      hint={
        v.removeSecret
          ? t('oidc.secretRemoved')
          : stored
            ? t('oidc.secretHint')
            : t('oidc.secretNone')
      }
    >
      <div className="grid gap-2">
        <Input
          type="password"
          value={v.clientSecret}
          placeholder={stored && !v.removeSecret ? '••••••••••••' : undefined}
          autoComplete="off"
          disabled={v.removeSecret}
          onChange={(e) => onChange({ clientSecret: e.target.value })}
        />
        {stored && (
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => onChange({ removeSecret: !v.removeSecret, clientSecret: '' })}
          >
            {v.removeSecret ? t('oidc.secretKeep') : t('oidc.secretRemove')}
          </Button>
        )}
      </div>
    </Field>
  )
}
