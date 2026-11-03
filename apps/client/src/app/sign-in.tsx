// SPDX-License-Identifier: AGPL-3.0-only
// C1's sign-in (connectivity.md), one screen for every client, laid out by the form factor.
//
// On touch and with a pointer, the prototype's client/connect-flow.tsx: a username and password,
// then a 6-digit code or a recovery code when the account has two-step verification. The phone
// names itself as the device, so the server answers with a device token it keeps in the keychain;
// a browser signs in by the session cookie and names no device (../host.web.ts's useDeviceInput),
// and a server not set up yet sends it to the server's setup, as apps/web did.
// Single sign-on opens the server's OIDC start: on the phone in an authentication session
// (ASWebAuthenticationSession through expo-web-browser,
// https://docs.expo.dev/versions/latest/sdk/webbrowser/#webbrowseropenauthsessionasyncurl-redirecturl-options)
// with a PKCE challenge, and the code that comes back to `highsea://oidc` is exchanged for the
// token (RFC 8252, ADR 0024); on the web the page goes to the start and comes back signed in. In
// mock mode the mock's `oidc` stands in for the browser. Setting up two-step verification stays
// on the server's sign-in page.
//
// On the TV, the prototype's tv/connect.tsx: by code first (RFC 8628's device flow: `startPairing`,
// then `pollPairing` every `interval` seconds until a phone approves it or the code runs out, when
// a new one is asked for), with a password on the on-screen keys as the fallback.
//
// Forget this server stays at the foot, also when the server doesn't answer (the owner,
// 2026-10-29), so a server that's gone can be let go of from here; it and Back to Servers show only
// where the app keeps a list of servers, never in a plain browser (connectivity.md).
import type { Pairing, SignInResult } from '@highsea-tv/api-contract'
import { usePublicInfo } from '@highsea-tv/client/data'
import {
  forgetMessages,
  hostOf,
  OIDC_REDIRECT,
  oidcMessage,
  oidcStart,
  pairingLink,
  pairingPage,
  reachedRemotely,
  reasonOf,
  signInMessages,
  tvConnectMessages,
} from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { pkce } from '@highsea-tv/native/device'
import { useCurrent, useServers } from '@highsea-tv/native/servers'
import { ApiError } from '@highsea-tv/sdk'
import { useAction, useClient } from '@highsea-tv/sdk/react'
import {
  Button,
  Field,
  fieldBox,
  Icon,
  Input,
  Mark,
  QrCode,
  Text,
  textStyle,
  tokens,
  useControl,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { TvKey } from '@highsea-tv/ui/tv'
import { router } from 'expo-router'
import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, type TextInput, View } from 'react-native'
import { useBack } from '../back.tsx'
import { openAuthSession, openBrowser } from '../browser.ts'
import { useForget } from '../forget.tsx'
import { useDeviceClient, useDeviceInput, useKeepsServers } from '../host'
import { Centered, GateFrame, MARK, Notice, SaidNote, TvIdentity } from '../kit.tsx'
import { mock } from '../transport.ts'

const { space } = tokens

export default function SignIn() {
  return useFormFactor().input === 'tv' ? <TvSignIn /> : <SignInForm />
}

/**
 * The address the server answers at, once its connection has probed: single sign-on's start and
 * the line under the server's name follow it.
 */
function useBase() {
  const current = useCurrent()
  const [base, setBase] = useState(() => current.base())
  useEffect(() => {
    let alive = true
    void current.connection.probe().then(() => {
      if (alive) setBase(current.base())
    })
    return () => {
      alive = false
    }
  }, [current])
  return {
    base,
    /** The address, waiting for the probe when it hasn't answered yet. */
    settled: async () => {
      if (current.base() === null) await current.connection.probe()
      return current.base()
    },
  }
}

/** Sends a browser to the server's own setup, as apps/web's sign-in did (connectivity.md). */
function useSetupRedirect(setupComplete: boolean | undefined, address: string) {
  const keeps = useKeepsServers()
  const go = !keeps && !mock && setupComplete === false
  useEffect(() => {
    if (go) goTo(`${address}/setup`)
  }, [go, address])
  return go
}

/** Where a browser is sent to sign in by single sign-on: the start, which comes back home. */
function goTo(url: string) {
  ;(globalThis as { location?: { assign(url: string): void } }).location?.assign(url)
}

// ---------------------------------------------------------------- touch and pointer

type Step =
  | { kind: 'form' }
  | { kind: 'code'; challenge: string; recovery: boolean }
  | { kind: 'setup' }
  | { kind: 'sso' }

function SignInForm() {
  const t = useT(signInMessages)
  const f = useT(forgetMessages)
  const theme = useTheme()
  const client = useClient()
  const current = useCurrent()
  const servers = useServers()
  const device = useDeviceInput()
  const app = useDeviceClient()
  const keeps = useKeepsServers()
  const at = useBase()
  const { forget, prompt } = useForget()
  const info = usePublicInfo()
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<ApiError | null>(null)
  const [ssoError, setSsoError] = useState<string | null>(null)
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null)
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null)

  // a plain browser has only its own server: nothing to forget, and no list to go back to
  const forgetButton = keeps ? (
    <Button variant="danger-ghost" onPress={() => forget(current.server.id, current.server.name)}>
      {f('thisServer')}
    </Button>
  ) : undefined
  const toServers = keeps ? { label: t('servers'), run: () => router.push('/connect') } : undefined

  const signIn = useAction((c) => c.auth.signIn({ body: { username, password, device: device() } }))
  const verify = useAction((c, challenge: string, value: string) =>
    c.auth.twoFactor({ body: { challenge, code: value } }),
  )

  const keep = async (token: string | undefined, named = device() !== undefined) => {
    // a device that named itself is answered with its token; a browser's cookie is its sign-in
    if (!token && named) return setSsoError(t('noToken', { name: current.server.name }))
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
    setSsoError(null)
    const base = await at.settled()
    if (base === null) return setSsoError(t(oidcMessage(undefined), { name, provider }))
    const failed = (reason?: string) => {
      setStep({ kind: 'form' })
      setSsoError(t(oidcMessage(reason), { name, provider }))
    }
    // a browser's start, without an app, signs the page in by its cookie and comes back home
    const named = device()
    if (named === undefined) {
      const start = `${base}/api/v1/auth/oidc/start`
      if (!mock) return goTo(start)
      setStep({ kind: 'sso' })
      try {
        await mock.transport.oidc(start)
        await keep(undefined, false)
      } catch (e) {
        failed(reasonOf(e))
      }
      return
    }
    setStep({ kind: 'sso' })
    try {
      const { verifier, challenge } = await pkce()
      const start = oidcStart(base, app, challenge)
      const result = mock
        ? await mock.transport.oidc(start)
        : await openAuthSession(start, OIDC_REDIRECT)
      if (result.type !== 'success') return setStep({ kind: 'form' })
      const back = new URL(result.url)
      const reason = back.searchParams.get('error')
      const value = back.searchParams.get('code')
      if (reason || !value) return failed(reason ?? undefined)
      const done = await client.auth.oidcExchange({
        body: { code: value, verifier, device: named },
      })
      await after(done)
    } catch (e) {
      failed(reasonOf(e))
    }
  }

  const address = at.base ?? current.server.addresses[0]?.url ?? ''
  const settingUp = useSetupRedirect(
    info.status === 'success' ? info.data.setupComplete : undefined,
    address,
  )

  if (info.status === 'loading' || settingUp) return <Centered />

  if (info.status === 'error')
    return (
      <GateFrame title={t('signIn')} back={toServers} footer={forgetButton}>
        <Notice>{t('failed', { message: info.error.message })}</Notice>
        <Button variant="primary" icon="refresh" block onPress={info.refetch}>
          {t('tryAgain')}
        </Button>
        {prompt}
      </GateFrame>
    )

  const server = info.data
  const provider = server.auth.oidc?.name ?? ''
  const fieldError = error?.status === 401 ? error.message : undefined
  const alert = error && error.status !== 401 ? error.message : undefined
  const remote = reachedRemotely(current.server.addresses, address)
  // the web's own server is at '': the page's address stands for it
  const shown =
    hostOf(address) || hostOf((globalThis as { location?: { host: string } }).location?.host ?? '')
  const backToForm = () => {
    setStep({ kind: 'form' })
    setCode('')
    setError(null)
  }

  if (step.kind === 'sso')
    return (
      <GateFrame title={t('oidc', { provider })}>
        <View style={{ flexDirection: 'row', gap: space['2'], alignItems: 'center' }}>
          <ActivityIndicator aria-hidden size="small" color={theme.colors['text-3']} />
          <Text variant="callout" color="text-2" style={{ flex: 1 }}>
            {t('oidcWait', { provider })}
          </Text>
        </View>
      </GateFrame>
    )

  if (step.kind === 'setup')
    return (
      <GateFrame title={t('setupTitle')} back={{ label: t('otherAccount'), run: backToForm }}>
        <Text variant="body" color="text-2">
          {t('setupDetail', { name: server.name })}
        </Text>
        <Button
          variant="primary"
          icon="globe"
          block
          onPress={() => void openBrowser(`${address}/login`)}
        >
          {device() === undefined ? t('setupActionWeb') : t('setupAction')}
        </Button>
        <Button variant="ghost" block onPress={backToForm}>
          {t('otherAccount')}
        </Button>
      </GateFrame>
    )

  if (step.kind === 'code') {
    const recovery = step.recovery
    return (
      <GateFrame
        title={recovery ? t('recoveryTitle') : t('codeTitle')}
        back={{ label: t('otherAccount'), run: backToForm }}
      >
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
            style={{ letterSpacing: recovery ? space['0.5'] : space['1'] + space['0.5'] }}
          />
        </Field>
        {alert ? <Notice>{alert}</Notice> : null}
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
        <Button variant="ghost" block onPress={backToForm}>
          {t('otherAccount')}
        </Button>
      </GateFrame>
    )
  }

  return (
    <GateFrame title={t('title', { name: server.name })} back={toServers} footer={forgetButton}>
      <SaidNote />
      <View
        style={{
          flexDirection: 'row',
          gap: space['3'],
          alignItems: 'center',
          borderRadius: tokens.radius.md,
          backgroundColor: theme.colors.s2,
          paddingHorizontal: space['3'],
          paddingVertical: space['2'] + space['0.5'],
        }}
      >
        <Mark size={MARK} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" weight={600} numberOfLines={1}>
            {server.name}
          </Text>
          <Text variant="caption" color="text-3" numberOfLines={1}>
            {remote ? t('remoteAt', { address: shown }) : t('localAt', { address: shown })}
          </Text>
        </View>
      </View>
      {ssoError ? <Notice>{ssoError}</Notice> : null}
      {server.auth.local ? (
        <View style={{ gap: space['4'] }}>
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
          {alert ? <Notice>{alert}</Notice> : null}
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
      {server.auth.oidc ? (
        <>
          {server.auth.local ? (
            <Text variant="caption" color="text-3" align="center">
              {t('or')}
            </Text>
          ) : null}
          <Button icon="lock" block onPress={() => void sso(provider, server.name)}>
            {t('oidc', { provider })}
          </Button>
        </>
      ) : null}
      {prompt}
    </GateFrame>
  )
}

// ---------------------------------------------------------------- the TV

/** The TV's sign-in: by code, or the password on the on-screen keys. */
function TvSignIn() {
  // a code pairs a device; a browser drawn at the TV's rule names none, so it signs in by password
  const pairs = useDeviceInput()() !== undefined
  const [mode, setMode] = useState<'code' | 'password'>(pairs ? 'code' : 'password')
  const theme = useTheme()
  const u = theme.u
  const current = useCurrent()
  const f = useT(forgetMessages)
  const { forget, prompt } = useForget()
  const keeps = useKeepsServers()
  // Back from the password is the code; from the code, the servers, where there's a list of them
  useBack(() => {
    if (mode === 'password' && pairs) setMode('code')
    else if (keeps) router.push('/connect')
    else return false
    return true
  })
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: tokens.tv.rows.inset * u,
          paddingHorizontal: tokens.tv.safe.x * u,
          paddingVertical: tokens.tv.safe.y * u,
        }}
      >
        {mode === 'code' ? (
          <TvCode onPassword={() => setMode('password')} />
        ) : (
          <TvPassword onCancel={pairs ? () => setMode('code') : undefined} />
        )}
      </View>
      {mode === 'code' && keeps ? (
        <TvFoot>
          <Button
            variant="overlay"
            icon="delete"
            onPress={() => forget(current.server.id, current.server.name)}
          >
            {f('thisServer')}
          </Button>
        </TvFoot>
      ) : null}
      {prompt}
    </View>
  )
}

/** A quiet line of actions at the foot of the TV's screen. */
function TvFoot({ children }: { children: ReactNode }) {
  const u = useTheme().u
  return (
    <View
      style={{
        position: 'absolute',
        bottom: tokens.tv.safe.y * u,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  )
}

/** The QR's side: two posters' width, as the prototype's code beside its words. */
const QR = tokens.tv.poster.width * 2

/** The code and its QR, polled until a phone approves it. */
function TvCode({ onPassword }: { onPassword: () => void }) {
  const t = useT(tvConnectMessages)
  const keeps = useKeepsServers()
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  // the client in use, read when a request goes: it's made again as the address settles, which
  // mustn't start another code (one code a round, on the server in use)
  const inUse = useClient()
  const client = useRef(inUse)
  client.current = inUse
  const servers = useServers()
  const device = useDeviceInput()
  const current = useCurrent()
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [approved, setApproved] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // why a code couldn't be had, until one is
  const [unstarted, setUnstarted] = useState<string | null>(null)
  const [round, setRound] = useState(0)
  const keep = useRef(servers.signedIn)
  keep.current = servers.signedIn
  const named = useRef(device)
  named.current = device

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new round asks for a new code
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setApproved(false)
    const poll = (p: Pairing) => {
      timer = setTimeout(async () => {
        let r: Awaited<ReturnType<typeof inUse.auth.pollPairing>>
        try {
          r = await client.current.auth.pollPairing({ body: { pollToken: p.pollToken } })
        } catch (e) {
          // the code ran out: say so, and ask for another
          if (alive && e instanceof ApiError && e.status === 404) {
            setFailure(t('expired'))
            return setRound((n) => n + 1)
          }
          if (alive) poll(p)
          return
        }
        if (!alive) return
        if (r.status !== 'signed-in') return poll(p)
        setApproved(true)
        setFailure(null)
        try {
          if (!r.token) throw new Error('No device token')
          await keep.current(r.token)
        } catch {
          // the approval stands, but this TV couldn't keep it: a new code signs it in again
          if (!alive) return
          setApproved(false)
          setFailure(r.token ? t('keychain') : t('noToken', { name: current.server.name }))
          setRound((n) => n + 1)
        }
      }, p.interval * 1000)
    }
    // a TV always names itself (../host's useDeviceInput); a page without one has nothing to pair
    const self = named.current()
    if (!self) return
    client.current.auth
      .startPairing({ body: { device: self } })
      .then((p) => {
        if (!alive) return
        setUnstarted(null)
        setPairing(p)
        poll(p)
      })
      .catch((e) => {
        // say why, then ask again in a moment
        if (!alive) return
        setUnstarted(
          t('codeFailed', {
            name: current.server.name,
            message: e instanceof Error ? e.message : String(e),
          }),
        )
        timer = setTimeout(() => setRound((n) => n + 1), 5000)
      })
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [current.server.id, round])

  const link = pairing ? pairingLink(current.server.id, pairing.code) : null
  const notice = unstarted ?? failure
  return (
    <>
      <View style={{ flex: 1, gap: tokens.tv.poster.gap * u }}>
        <TvIdentity />
        <Text variant="heroTitle" accessibilityRole="header">
          {t('codeTitle')}
        </Text>
        <SaidNote />
        <View style={{ gap: m.gap }}>
          <Text variant="synopsis" color="text-2">
            <Spliced
              words={t('step1', { url: SLOT })}
              value={pairing ? pairingPage(pairing.url) : '…'}
            />
          </Text>
          <Text variant="synopsis" color="text-2">
            <Spliced words={t('step2', { code: SLOT })} value={pairing?.code ?? '…'} code />
          </Text>
        </View>
        {notice ? <Notice>{notice}</Notice> : null}
        <View
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: m.gap }}
        >
          {approved ? (
            <Icon name="success" size={tokens.icon.sizeTv.min} color="badge-success" />
          ) : (
            // tvOS draws its spinner past its frame; a box the icon's size keeps it off the words
            <View style={{ width: m.icon, alignItems: 'center' }}>
              <ActivityIndicator aria-hidden color={theme.colors['text-2']} />
            </View>
          )}
          <Text variant="meta" color="text-2">
            {approved ? t('approved') : t('waiting')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: m.gap }}>
          <Button variant="overlay" hasTVPreferredFocus icon="lock" onPress={onPassword}>
            {t('usePassword')}
          </Button>
          {keeps ? (
            <Button variant="overlay" icon="server" onPress={() => router.push('/connect')}>
              {t('anotherServer')}
            </Button>
          ) : null}
        </View>
      </View>
      <View style={{ width: QR * u, gap: m.gap }}>
        <View style={{ width: QR * u, height: QR * u }}>
          {link ? <QrCode value={link} label={t('qrLabel')} size={QR * u} /> : null}
        </View>
        <Text variant="pill" color="text-3" align="center">
          {t('scan')}
        </Text>
      </View>
    </>
  )
}

/** Where a value goes in its sentence, so it can be drawn in its own style. */
const SLOT = '\u0000'

/**
 * A sentence with its value in mono and the text colour, as the prototype's code and address: the
 * code also semibold and spaced, as a code is read aloud.
 */
function Spliced({ words, value, code }: { words: string; value: string; code?: boolean }) {
  const theme = useTheme()
  const [before, after] = words.split(SLOT)
  const spacing = code ? textStyle(theme, 'synopsis').fontSize * tokens.tracking.eyebrow : undefined
  return (
    <>
      {before}
      <Text
        variant="synopsis"
        mono
        color="text"
        weight={code ? 600 : undefined}
        style={spacing ? { letterSpacing: spacing } : undefined}
      >
        {value}
      </Text>
      {after ?? ''}
    </>
  )
}

const KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789.-_@'.split('')
const DIGITS = '1234567890'.split('')
/** Keys in a row of the on-screen keyboard. */
const PER_ROW = 10
/** The keyboard's width: five posters' across. */
const KEYBOARD = tokens.tv.poster.width * 5

type TvField = 'username' | 'password' | 'code'

/** The fallback: a field per line, and a key grid the remote moves over. */
function TvPassword({ onCancel }: { onCancel?: () => void }) {
  const t = useT(tvConnectMessages)
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const client = useClient()
  const servers = useServers()
  const device = useDeviceInput()
  const name = servers.current?.server.name ?? ''
  const [field, setField] = useState<TvField>('username')
  const [values, setValues] = useState({ username: '', password: '', code: '' })
  const [challenge, setChallenge] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const type = (k: string) => setValues((v) => ({ ...v, [field]: v[field] + k }))
  const del = () => setValues((v) => ({ ...v, [field]: v[field].slice(0, -1) }))

  const finish = async (result: SignInResult) => {
    if (result.status === 'two-factor') {
      setChallenge(result.challenge)
      setField('code')
      return
    }
    if (result.status === 'two-factor-setup') return setError(t('setup', { name }))
    if (!result.token && device()) return setError(t('noToken', { name }))
    try {
      await servers.signedIn(result.token)
    } catch {
      setError(t('keychain'))
    }
  }

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      if (challenge)
        await finish(await client.auth.twoFactor({ body: { challenge, code: values.code } }))
      else
        await finish(
          await client.auth.signIn({
            body: { username: values.username, password: values.password, device: device() },
          }),
        )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (challenge && reasonOf(e) === 'challenge-expired') {
        // an expired challenge can't take another code: start again from the password, as the
        // phone does
        setChallenge(null)
        setField('password')
        setValues((v) => ({ ...v, password: '', code: '' }))
      } else if (challenge) setValues((v) => ({ ...v, code: '' }))
    } finally {
      setPending(false)
    }
  }

  const keyWidth = (KEYBOARD * u - (PER_ROW - 1) * m.gap) / PER_ROW
  const fields: TvField[] = challenge ? ['code'] : ['username', 'password']
  const keys = challenge ? DIGITS : KEYS
  return (
    <View style={{ flex: 1, gap: tokens.tv.poster.gap * u }}>
      <TvIdentity />
      <Text variant="heroTitle" accessibilityRole="header">
        {t('passwordTitle', { name })}
      </Text>
      <SaidNote />
      <View style={{ width: KEYBOARD * u, gap: m.gap }}>
        {challenge ? (
          <Text variant="synopsis" color="text-2">
            {t('codeDetail')}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: m.gap }}>
          {fields.map((k) => (
            <View
              key={k}
              style={{
                // the library's field at the TV rule, focused while the on-screen keys fill it
                ...fieldBox(theme, m, field === k, false),
                flex: 1,
                paddingHorizontal: m.fieldPad,
                paddingVertical: m.gap,
              }}
            >
              <Text variant="pill" color="text-3">
                {t(k)}
              </Text>
              <Text variant="button" mono weight={500} numberOfLines={1}>
                {k === 'password' ? '•'.repeat(values.password.length) : values[k]}
                {field === k ? <Text color="text-3">|</Text> : null}
              </Text>
            </View>
          ))}
        </View>
        {error ? <Notice>{error}</Notice> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: m.gap }}>
          {keys.map((k, i) => (
            <TvKey key={k} preferred={i === 0} width={keyWidth} onPress={() => type(k)}>
              {k}
            </TvKey>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: m.gap }}>
          <Button variant="overlay" icon="arrow-left" onPress={del}>
            {t('delete')}
          </Button>
          {field === 'username' ? (
            <Button variant="primary" onPress={() => setField('password')}>
              {t('next')}
            </Button>
          ) : (
            <Button variant="primary" disabled={pending} onPress={() => void submit()}>
              {pending ? t('signingIn') : challenge ? t('verify') : t('signIn')}
            </Button>
          )}
          {onCancel ? (
            <Button variant="overlay" onPress={onCancel}>
              {t('useCode')}
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  )
}
