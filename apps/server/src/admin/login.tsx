'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A18 Login (docs/product/login.md), ported from the prototype. Username and password; then the
// 6-digit code when the account has two-step verification on, or a recovery code; or setting it up
// when the server requires it. A passkey or the server's single sign-on provider skip the
// password. The OIDC round trip is real: the browser goes to the provider and comes back through
// /api/v1/auth/oidc/callback, which lands on the dashboard or back here with `?error=`.
import type { SignInResult } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { Button, EmptyState, Field, Icon, Input, Skeleton } from '@highsea-tv/ui-web'
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
} from '@simplewebauthn/browser'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Card, Divider, FormAlert, Heading } from './auth-card.tsx'
import { login as messages } from './login-messages.ts'
import { safeNext } from './next-path.ts'
import { CodeInput, Enrol, RecoveryCodes } from './two-factor.tsx'

type Step =
  | { kind: 'form' }
  | { kind: 'code'; challenge: string; recovery: boolean }
  | { kind: 'setup'; challenge: string; secret: string; uri: string }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'sso' }

const OIDC_ERRORS = [
  'oidc-unknown',
  'oidc-denied',
  'oidc-unreachable',
  'oidc-invalid',
  'oidc-off',
  'challenge-expired',
] as const

const reasonOf = (e: unknown) =>
  ((e as ApiError).details as { reason?: string } | undefined)?.reason

/** A fresh load, so the server components see the new session cookie. */
const go = (next: string) => window.location.assign(safeNext(next))

export function Login({ next, oidcError }: { next?: string; oidcError?: string }) {
  const t = useT(messages)
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [passkeys, setPasskeys] = useState(false)
  const codeInput = useRef<HTMLInputElement>(null)
  const usernameInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  const signIn = useAction((c) => c.auth.signIn({ body: { username, password } }))
  const verify = useAction((c, challenge: string, value: string) =>
    c.auth.twoFactor({ body: { challenge, code: value } }),
  )
  const passkey = useAction(async (c) => {
    const { challenge, options } = await c.auth.passkeyOptions({ body: {} })
    const response = await startAuthentication({
      optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
    })
    return c.auth.passkeySignIn({ body: { challenge, response: response as never } })
  })

  useEffect(() => setPasskeys(browserSupportsWebAuthn()), [])

  // nothing is remembered, so the username is the first thing to type (login.md § Focus)
  useEffect(() => {
    if (info.status === 'success') usernameInput.current?.focus()
  }, [info.status])

  useEffect(() => {
    if (step.kind === 'code' || step.kind === 'setup') codeInput.current?.focus()
  }, [step])

  const after = (result: SignInResult) => {
    setError(null)
    setCode('')
    if (result.status === 'two-factor')
      setStep({ kind: 'code', challenge: result.challenge, recovery: false })
    else if (result.status === 'two-factor-setup') setStep({ kind: 'setup', ...result })
    else if (result.recoveryCodes) setStep({ kind: 'codes', codes: result.recoveryCodes })
    else go(next ?? '/')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      after(await signIn.run())
    } catch (err) {
      setError(err as ApiError)
      passwordInput.current?.focus()
    }
  }

  const submitCode = async (value: string) => {
    if (step.kind !== 'code' && step.kind !== 'setup') return
    setError(null)
    try {
      after(await verify.run(step.challenge, value))
    } catch (err) {
      setError(err as ApiError)
      setCode('')
      // an expired challenge can't take another code: start again from the password
      if (reasonOf(err) === 'challenge-expired') setStep({ kind: 'form' })
      else codeInput.current?.focus()
    }
  }

  if (info.status === 'loading')
    return (
      <Card>
        <div className="grid gap-4" aria-busy>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-9" />
        </div>
      </Card>
    )

  if (info.status === 'error')
    return (
      <Card>
        <EmptyState
          size="sm"
          tone="error"
          title={t('unreachable')}
          action={<Button onClick={info.refetch}>{t('retry')}</Button>}
        >
          {info.error.message}
        </EmptyState>
      </Card>
    )

  const server = info.data
  const fieldError = error?.status === 401 ? error.message : undefined
  const alert = error && error.status !== 401 ? error.message : undefined

  if (step.kind === 'sso')
    return (
      <Card>
        <Heading title={t('oidc', { provider: server.auth.oidc?.name ?? '' })} />
        <p className="flex items-center gap-2 text-caption text-text-2" role="status">
          <Icon name="loading" size={16} className="animate-spin" />
          {t('oidcWait', { provider: server.auth.oidc?.name ?? '' })}
        </p>
        <Button variant="ghost" onClick={() => setStep({ kind: 'form' })}>
          {t('cancel')}
        </Button>
      </Card>
    )

  if (step.kind === 'codes')
    return (
      <Card>
        <RecoveryCodes codes={step.codes} onDone={() => go(next ?? '/')} />
      </Card>
    )

  if (step.kind === 'setup' || step.kind === 'code') {
    const recovery = step.kind === 'code' && step.recovery
    const otherAccount = (
      <Button
        variant="ghost"
        onClick={() => {
          setStep({ kind: 'form' })
          setCode('')
          setError(null)
        }}
      >
        {t('code.otherAccount')}
      </Button>
    )
    return (
      <Card>
        <Heading
          title={
            step.kind === 'setup'
              ? t('setup.title')
              : recovery
                ? t('recovery.title')
                : t('code.title')
          }
          detail={
            step.kind === 'setup'
              ? t('setup.detail')
              : recovery
                ? t('recovery.detail')
                : t('code.detail')
          }
        />
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submitCode(code)
          }}
        >
          {step.kind === 'setup' && <Enrol secret={step.secret} uri={step.uri} />}
          {recovery ? (
            <Field label={t('recovery.label')} error={fieldError}>
              <Input
                ref={codeInput}
                value={code}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono tracking-[0.15em]"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </Field>
          ) : (
            <Field label={t('code.label')} error={fieldError}>
              <CodeInput ref={codeInput} value={code} onChange={setCode} onComplete={submitCode} />
            </Field>
          )}
          {alert && <FormAlert>{alert}</FormAlert>}
          <Button
            type="submit"
            variant="primary"
            loading={verify.pending}
            disabled={recovery ? code.replace(/[^A-Z0-9]/g, '').length < 12 : code.length < 6}
          >
            {t('code.verify')}
          </Button>
          {step.kind === 'code' && (
            <Button
              variant="ghost"
              onClick={() => {
                setStep({ ...step, recovery: !recovery })
                setCode('')
                setError(null)
              }}
            >
              {recovery ? t('code.useApp') : t('code.useRecovery')}
            </Button>
          )}
          {otherAccount}
        </form>
      </Card>
    )
  }

  const oidcMessage = oidcError
    ? (OIDC_ERRORS as readonly string[]).includes(oidcError)
      ? t(`oidcError.${oidcError as (typeof OIDC_ERRORS)[number]}`)
      : t('oidcError.other')
    : undefined

  return (
    <Card>
      <Heading title={t('title', { name: server.name })} />
      {oidcMessage && !error && <FormAlert>{oidcMessage}</FormAlert>}
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field label={t('username')}>
          <Input
            ref={usernameInput}
            value={username}
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label={t('password')} error={fieldError}>
          <Input
            ref={passwordInput}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {alert && <FormAlert>{alert}</FormAlert>}
        <Button type="submit" variant="primary" loading={signIn.pending}>
          {t('signIn')}
        </Button>
      </form>
      {((passkeys && server.auth.passkeys) || server.auth.oidc) && (
        <>
          <Divider>{t('or')}</Divider>
          {/* both wrap rather than widening a phone at 200% text */}
          <div className="grid gap-2">
            {passkeys && server.auth.passkeys && (
              <Button
                icon="key"
                className="h-auto min-h-9 whitespace-normal py-1.5"
                loading={passkey.pending}
                onClick={() =>
                  passkey.run().then(after, (e: Error) =>
                    setError(
                      // the person closed the browser's prompt (WebAuthn: NotAllowedError)
                      e.name === 'NotAllowedError'
                        ? new ApiError('unauthorized', t('passkeyCancelled'))
                        : (e as ApiError),
                    ),
                  )
                }
              >
                {t('passkey')}
              </Button>
            )}
            {server.auth.oidc && (
              <Button
                icon="shield"
                className="h-auto min-h-9 whitespace-normal py-1.5"
                onClick={() => {
                  setStep({ kind: 'sso' })
                  window.location.assign('/api/v1/auth/oidc/start')
                }}
              >
                {t('oidc', { provider: server.auth.oidc.name })}
              </Button>
            )}
          </div>
        </>
      )}
      <p className="text-caption text-text-3">{t('footer')}</p>
    </Card>
  )
}
