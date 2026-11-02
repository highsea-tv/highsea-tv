// SPDX-License-Identifier: AGPL-3.0-only
// C1's sign-in on the phone, from the prototype's client/connect-flow.tsx and the web's
// sign-in.tsx: a username and password sent with this phone as the device, so the server answers
// with a device token the app keeps in the keychain (@highsea-tv/native/servers); then a 6-digit code or a
// recovery code when the account has two-step verification. Single sign-on opens the server's
// OIDC start in an authentication session (ASWebAuthenticationSession through expo-web-browser,
// https://docs.expo.dev/versions/latest/sdk/webbrowser/#webbrowseropenauthsessionasyncurl-redirecturl-options)
// with a PKCE challenge, and the code that comes back to `highsea://oidc` is exchanged for the
// token (RFC 8252, ADR 0024). Passkeys and setting up two-step verification stay on the server's
// sign-in page, which opens in Safari.
import type { SignInResult } from '@highsea-tv/api-contract'
import { usePublicInfo } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { deviceInput, pkce } from '@highsea-tv/native/device'
import { useCurrent, useServers } from '@highsea-tv/native/servers'
import type { ApiError } from '@highsea-tv/sdk'
import { useAction, useClient } from '@highsea-tv/sdk/react'
import { Button, Field, Input, Mark, Text, tokens, useTheme } from '@highsea-tv/ui'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { type ComponentRef, useRef, useState } from 'react'
import { ActivityIndicator, type TextInput, View } from 'react-native'
import { useForget } from '../forget.ts'
import { Alert, Screen, Title } from '../kit.tsx'
import { forget as forgetMessages, signIn as messages } from '../messages.ts'

type Step =
  | { kind: 'form' }
  | { kind: 'code'; challenge: string; recovery: boolean }
  | { kind: 'setup' }
  | { kind: 'sso' }

const reasonOf = (e: unknown) =>
  ((e as ApiError).details as { reason?: string } | undefined)?.reason

const REDIRECT = 'highsea://oidc'
const OIDC_REASONS = ['oidc-unknown', 'oidc-denied', 'challenge-expired']

export default function SignIn() {
  const t = useT(messages)
  const theme = useTheme()
  const client = useClient()
  const current = useCurrent()
  const servers = useServers()
  const f = useT(forgetMessages)
  const forget = useForget()
  // at the foot of the screen, also when the server doesn't answer (the owner, 2026-10-29): a
  // server that's gone, or whose address changed, can be let go of from here
  const forgetButton = (
    <Button
      variant="danger-ghost"
      block
      onPress={() => forget(current.server.id, current.server.name)}
    >
      {f('thisServer')}
    </Button>
  )
  const info = usePublicInfo()
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [ssoError, setSsoError] = useState<string | null>(null)
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null)
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null)

  const signIn = useAction((c) =>
    c.auth.signIn({ body: { username, password, device: deviceInput() } }),
  )
  const verify = useAction((c, challenge: string, value: string) =>
    c.auth.twoFactor({ body: { challenge, code: value } }),
  )

  const keep = async (token: string | undefined) => {
    if (!token) return setSsoError(t('keychain'))
    try {
      await servers.signedIn(token)
    } catch {
      setSsoError(t('keychain'))
    }
  }

  const after = async (result: SignInResult) => {
    setError(null)
    setCode('')
    if (result.status === 'two-factor')
      setStep({ kind: 'code', challenge: result.challenge, recovery: false })
    else if (result.status === 'two-factor-setup') setStep({ kind: 'setup' })
    else await keep(result.token)
  }

  const submit = async () => {
    setError(null)
    setSsoError(null)
    try {
      await after(await signIn.run())
    } catch (err) {
      setError(err as ApiError)
      passwordInput.current?.focus()
    }
  }

  const submitCode = async () => {
    if (step.kind !== 'code') return
    setError(null)
    try {
      await after(await verify.run(step.challenge, code))
    } catch (err) {
      setError(err as ApiError)
      setCode('')
      // an expired challenge can't take another code: start again from the password
      if (reasonOf(err) === 'challenge-expired') setStep({ kind: 'form' })
      else codeInput.current?.focus()
    }
  }

  const sso = async (provider: string, name: string) => {
    const base = current.base()
    if (!base) return
    setSsoError(null)
    setStep({ kind: 'sso' })
    const failed = (reason?: string) => {
      setStep({ kind: 'form' })
      setSsoError(
        t(
          reason && OIDC_REASONS.includes(reason)
            ? (`oidc.${reason}` as 'oidc.oidc-unknown')
            : 'oidc.other',
          { name, provider },
        ),
      )
    }
    try {
      const { verifier, challenge } = await pkce()
      const start = `${base}/api/v1/auth/oidc/start?app=ios&challenge=${challenge}`
      const result = await WebBrowser.openAuthSessionAsync(start, REDIRECT)
      if (result.type !== 'success') return setStep({ kind: 'form' })
      const back = new URL(result.url)
      const reason = back.searchParams.get('error')
      const value = back.searchParams.get('code')
      if (reason || !value) return failed(reason ?? undefined)
      const done = await client.auth.oidcExchange({
        body: { code: value, verifier, device: deviceInput() },
      })
      await after(done)
    } catch (e) {
      failed(reasonOf(e))
    }
  }

  if (info.status === 'loading')
    return (
      <Screen>
        <View style={{ paddingTop: 80, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors['text-3']} />
        </View>
      </Screen>
    )

  if (info.status === 'error')
    return (
      <Screen gap={20} footer={forgetButton}>
        <Button variant="ghost" icon="chevron-left" onPress={() => router.push('/connect')}>
          {t('otherAccount')}
        </Button>
        <Title>{t('signIn')}</Title>
        <Alert>{t('failed', { message: info.error.message })}</Alert>
        <Button variant="primary" icon="refresh" block onPress={info.refetch}>
          {t('signIn')}
        </Button>
      </Screen>
    )

  const server = info.data
  const provider = server.auth.oidc?.name ?? ''
  const fieldError = error?.status === 401 ? error.message : undefined
  const alert = error && error.status !== 401 ? error.message : undefined
  const address = current.base() ?? current.server.addresses[0]?.url ?? ''
  const remote = current.server.addresses.find((a) => address.startsWith(a.url))?.kind === 'remote'
  const choose = () => router.push('/connect')

  if (step.kind === 'sso')
    return (
      <Screen gap={20}>
        <Title>{t('oidc', { provider })}</Title>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={theme.colors['text-3']} />
          <Text variant="callout" color="text-2" style={{ flex: 1 }}>
            {t('oidcWait', { provider })}
          </Text>
        </View>
      </Screen>
    )

  if (step.kind === 'setup')
    return (
      <Screen gap={20}>
        <Title>{t('setupTitle')}</Title>
        <Text variant="body" color="text-2">
          {t('setupDetail', { name: server.name })}
        </Text>
        <Button
          variant="primary"
          icon="globe"
          block
          onPress={() => void WebBrowser.openBrowserAsync(`${address}/login`)}
        >
          {t('setupAction')}
        </Button>
        <Button variant="ghost" block onPress={() => setStep({ kind: 'form' })}>
          {t('otherAccount')}
        </Button>
      </Screen>
    )

  if (step.kind === 'code') {
    const recovery = step.recovery
    return (
      <Screen gap={20}>
        <Title>{recovery ? t('recoveryTitle') : t('codeTitle')}</Title>
        <Text variant="body" color="text-2">
          {recovery ? t('recoveryDetail') : t('codeDetail')}
        </Text>
        <Field label={recovery ? t('recoveryLabel') : t('codeLabel')} error={fieldError}>
          <Input
            ref={codeInput}
            value={code}
            onChangeText={(v) =>
              setCode(recovery ? v.toUpperCase() : v.replace(/\D/g, '').slice(0, 6))
            }
            keyboardType={recovery ? 'default' : 'number-pad'}
            textContentType={recovery ? 'none' : 'oneTimeCode'}
            autoComplete={recovery ? 'off' : 'one-time-code'}
            autoCapitalize={recovery ? 'characters' : 'none'}
            autoCorrect={false}
            autoFocus
            mono
            invalid={!!fieldError}
            style={{ letterSpacing: recovery ? 2 : 6 }}
          />
        </Field>
        {alert && <Alert>{alert}</Alert>}
        <Button
          variant="primary"
          block
          loading={verify.pending}
          disabled={recovery ? code.replace(/[^A-Z0-9]/g, '').length < 12 : code.length < 6}
          onPress={() => void submitCode()}
        >
          {t('verify')}
        </Button>
        <Button
          variant="ghost"
          block
          onPress={() => {
            setStep({ ...step, recovery: !recovery })
            setCode('')
            setError(null)
          }}
        >
          {recovery ? t('useApp') : t('useRecovery')}
        </Button>
        <Button
          variant="ghost"
          block
          onPress={() => {
            setStep({ kind: 'form' })
            setCode('')
            setError(null)
          }}
        >
          {t('otherAccount')}
        </Button>
      </Screen>
    )
  }

  return (
    <Screen gap={20} footer={forgetButton}>
      <Button variant="ghost" icon="chevron-left" onPress={choose}>
        {t('servers')}
      </Button>
      <Title>{t('title', { name: server.name })}</Title>
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          borderRadius: tokens.radius.md,
          backgroundColor: theme.colors.s2,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Mark size={28} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" size={15} weight={600} numberOfLines={1}>
            {server.name}
          </Text>
          <Text variant="caption" color="text-3" numberOfLines={1}>
            {remote
              ? t('remoteAt', { address: address.replace(/^https?:\/\//, '') })
              : t('localAt', { address: address.replace(/^https?:\/\//, '') })}
          </Text>
        </View>
      </View>
      {ssoError && <Alert>{ssoError}</Alert>}
      {server.auth.local ? (
        <View style={{ gap: 16 }}>
          <Field label={t('username')}>
            <Input
              value={username}
              onChangeText={setUsername}
              autoComplete="username"
              textContentType="username"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInput.current?.focus()}
            />
          </Field>
          <Field label={t('password')} error={fieldError}>
            <Input
              ref={passwordInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              invalid={!!fieldError}
            />
          </Field>
          {alert && <Alert>{alert}</Alert>}
          <Button
            variant="primary"
            block
            loading={signIn.pending}
            disabled={!username || !password}
            onPress={() => void submit()}
          >
            {t('signIn')}
          </Button>
        </View>
      ) : (
        <Text variant="callout" color="text-2">
          {t('localOff', { name: server.name })}
        </Text>
      )}
      {server.auth.oidc && (
        <>
          {server.auth.local && (
            <Text variant="caption" color="text-3" align="center">
              {t('or')}
            </Text>
          )}
          <Button icon="lock" block onPress={() => void sso(provider, server.name)}>
            {t('oidc', { provider })}
          </Button>
        </>
      )}
    </Screen>
  )
}
