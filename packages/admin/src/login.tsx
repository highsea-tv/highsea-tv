'use client'
import type { SignInResult } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { ApiError } from '@highsea-tv/sdk'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
// SPDX-License-Identifier: AGPL-3.0-only
// A18 Login (docs/product/login.md), ported from the prototype. Username and password; then the
// 6-digit code when the account has two-step verification on, or a recovery code; or setting it up
// when the server requires it. A passkey or the server's single sign-on provider skip the
// password. The OIDC round trip is real: the browser goes to the provider and comes back through
// /api/v1/auth/oidc/callback, which lands on the dashboard or back here with `?error=`. Drawn
// with the library's native renderer since D3 (one-client-platform-d.md): a form's submit is the
// primary button and Enter in its fields (`onSubmitEditing`), as a native screen has no <form>.
import { admin, controlGeometry } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Text,
  tokens,
  useControl,
  useTheme,
} from '@highsea-tv/ui/native'
import {
  browserSupportsWebAuthn,
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
} from '@simplewebauthn/browser'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Card, Divider, FormAlert, Heading } from './auth-card.tsx'
import { login as messages } from './login-messages.ts'
import { useLoad } from './navigation.tsx'
import { safeNext } from './next-path.ts'
import { CodeInput, Enrol, type InputHandle, RecoveryCodes } from './two-factor.tsx'

const s = tokens.space

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

export function Login({ next, oidcError }: { next?: string; oidcError?: string }) {
  const t = useT(messages)
  const theme = useTheme()
  const m = useControl()
  const load = useLoad()
  /** A fresh load, so the server components see the new session cookie. */
  const go = (to: string) => load(safeNext(to))
  const info = useQuery('public-info', (c) => c.system.publicInfo())
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [passkeys, setPasskeys] = useState(false)
  const codeInput = useRef<InputHandle>(null)
  const usernameInput = useRef<InputHandle>(null)
  const passwordInput = useRef<InputHandle>(null)

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

  const submit = async () => {
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
        <View aria-busy style={{ gap: s['4'] }}>
          <Skeleton width={admin.skeleton.width.md} height={admin.skeleton.title} />
          <Skeleton height={admin.skeleton.field} />
          <Skeleton height={admin.skeleton.field} />
          <Skeleton height={controlGeometry.md.height} />
        </View>
      </Card>
    )

  if (info.status === 'error')
    return (
      <Card>
        <EmptyState
          size="sm"
          tone="error"
          icon="error"
          title={t('unreachable')}
          action={<Button onPress={info.refetch}>{t('retry')}</Button>}
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
        <View role="status" style={{ flexDirection: 'row', alignItems: 'center', gap: s['2'] }}>
          <ActivityIndicator
            aria-hidden
            size={tokens.icon.size.sm}
            color={theme.colors['text-2']}
          />
          <Text variant="caption" color="text-2" style={{ flex: 1, minWidth: 0 }}>
            {t('oidcWait', { provider: server.auth.oidc?.name ?? '' })}
          </Text>
        </View>
        <Button variant="ghost" block onPress={() => setStep({ kind: 'form' })}>
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
        block
        onPress={() => {
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
        <View style={{ gap: s['4'] }}>
          {step.kind === 'setup' && <Enrol secret={step.secret} uri={step.uri} />}
          {recovery ? (
            <Field label={t('recovery.label')} error={fieldError}>
              <Input
                ref={codeInput}
                value={code}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                mono
                // the web's tracking-[0.15em]
                style={{ letterSpacing: m.text * 0.15 }}
                onChangeText={(v) => setCode(v.toUpperCase())}
                onSubmitEditing={() => submitCode(code)}
              />
            </Field>
          ) : (
            <Field label={t('code.label')} error={fieldError}>
              <CodeInput ref={codeInput} value={code} onChange={setCode} onComplete={submitCode} />
            </Field>
          )}
          {alert && <FormAlert>{alert}</FormAlert>}
          <Button
            variant="primary"
            block
            loading={verify.pending}
            disabled={recovery ? code.replace(/[^A-Z0-9]/g, '').length < 12 : code.length < 6}
            onPress={() => submitCode(code)}
          >
            {t('code.verify')}
          </Button>
          {step.kind === 'code' && (
            <Button
              variant="ghost"
              block
              onPress={() => {
                setStep({ ...step, recovery: !recovery })
                setCode('')
                setError(null)
              }}
            >
              {recovery ? t('code.useApp') : t('code.useRecovery')}
            </Button>
          )}
          {otherAccount}
        </View>
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
      <View style={{ gap: s['4'] }}>
        <Field label={t('username')}>
          <Input
            ref={usernameInput}
            value={username}
            // the browser offers its passkeys in the field (WebAuthn's conditional mediation)
            autoComplete={'username webauthn' as 'username'}
            autoCapitalize="none"
            spellCheck={false}
            onChangeText={setUsername}
            onSubmitEditing={submit}
          />
        </Field>
        <Field label={t('password')} error={fieldError}>
          <Input
            ref={passwordInput}
            secureTextEntry
            value={password}
            autoComplete="current-password"
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
        </Field>
        {alert && <FormAlert>{alert}</FormAlert>}
        <Button variant="primary" block loading={signIn.pending} onPress={submit}>
          {t('signIn')}
        </Button>
      </View>
      {((passkeys && server.auth.passkeys) || server.auth.oidc) && (
        <>
          <Divider>{t('or')}</Divider>
          <View style={{ gap: s['2'] }}>
            {passkeys && server.auth.passkeys && (
              <Button
                icon="key"
                block
                loading={passkey.pending}
                onPress={() =>
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
                block
                onPress={() => {
                  setStep({ kind: 'sso' })
                  load('/api/v1/auth/oidc/start')
                }}
              >
                {t('oidc', { provider: server.auth.oidc.name })}
              </Button>
            )}
          </View>
        </>
      )}
      <Text variant="caption" color="text-3">
        {t('footer')}
      </Text>
    </Card>
  )
}
