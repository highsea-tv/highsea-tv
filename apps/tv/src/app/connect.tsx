// SPDX-License-Identifier: AGPL-3.0-only
// C1 Connect, TV (connectivity.md#tv, the prototype's tv/connect.tsx). Typing on a remote is slow,
// so the TV signs in by code first: it shows a short code and a QR code, a phone or computer
// that's signed in approves it, and the TV is in (RFC 8628's device flow: `startPairing`, then
// `pollPairing` every `interval` seconds until it's approved or the code runs out, when a new one
// is asked for). A password on the on-screen keyboard is the fallback, and another server can be
// picked from the ones answering on this network. With no server yet, the list comes first, and
// when exactly one server answers and none is known, it's taken without asking.
import type { Pairing } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import { deviceInput } from '@highsea-tv/native/device'
import { useNearby } from '@highsea-tv/native/nearby'
import { useServers } from '@highsea-tv/native/servers'
import { ApiError } from '@highsea-tv/sdk'
import { useClient } from '@highsea-tv/sdk/react'
import { Icon, Mark, QrCode, Text, tokens, useTheme } from '@highsea-tv/ui-native'
import { alpha, Focusable, TvButton, TvKey } from '@highsea-tv/ui-native/tv'
import { router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useBack } from '../back.ts'
import { useForget } from '../forget.ts'
import { Foot } from '../kit.tsx'
import { forget as forgetMessages, connect as messages } from '../messages.ts'

const tv = tokens.tv

type Mode = 'code' | 'password' | 'servers'

export default function Connect() {
  const { current, known } = useServers()
  const signedIn = !!current?.token
  // signed in already: this is Another server; with no server, the list
  const [mode, setMode] = useState<Mode>(current && !signedIn ? 'code' : 'servers')
  const u = useTheme().u
  useBack(() => {
    if (mode !== 'servers' && mode !== 'code') return setMode('code')
    if (mode === 'servers' && current && !signedIn) return setMode('code')
    if (signedIn) router.back()
  })
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4 * u,
        paddingHorizontal: tv.safe.x * u,
        paddingVertical: tv.safe.y * u,
      }}
    >
      {mode === 'servers' || !current || signedIn ? (
        <Servers knownCount={known.length} />
      ) : mode === 'code' ? (
        <Code onPassword={() => setMode('password')} onServers={() => setMode('servers')} />
      ) : (
        <Password onCancel={() => setMode('code')} />
      )}
    </View>
  )
}

function Identity() {
  const u = useTheme().u
  const name = useServers().current?.server.name ?? ''
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0.8 * u }}>
      <Mark size={2.4} />
      <Text variant="serverName">{name}</Text>
    </View>
  )
}

function Title({ children, size = 3 }: { children: string; size?: number }) {
  return (
    <Text variant="heroTitle" size={size} accessibilityRole="header">
      {children}
    </Text>
  )
}

/** The code and its QR, polled until a phone approves it. */
function Code({ onPassword, onServers }: { onPassword: () => void; onServers: () => void }) {
  const t = useT(messages)
  const f = useT(forgetMessages)
  const theme = useTheme()
  const u = theme.u
  const client = useClient()
  const servers = useServers()
  const forget = useForget()
  const current = servers.current
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [approved, setApproved] = useState(false)
  const [round, setRound] = useState(0)
  const keep = useRef(servers.signedIn)
  keep.current = servers.signedIn

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new round asks for a new code
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = (p: Pairing) => {
      timer = setTimeout(async () => {
        try {
          const r = await client.auth.pollPairing({ body: { pollToken: p.pollToken } })
          if (!alive) return
          if (r.status === 'signed-in') {
            setApproved(true)
            await keep.current(r.token)
            return
          }
        } catch (e) {
          // the code ran out: ask for another
          if (alive && e instanceof ApiError && e.status === 404) return setRound((n) => n + 1)
        }
        if (alive) poll(p)
      }, p.interval * 1000)
    }
    client.auth
      .startPairing({ body: { device: deviceInput() } })
      .then((p) => {
        if (!alive) return
        setPairing(p)
        poll(p)
      })
      .catch(() => {
        if (alive) timer = setTimeout(() => setRound((n) => n + 1), 5000)
      })
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [client, round])

  // the QR opens the phone app straight at the question (connectivity.md › Sign in a TV)
  const link = pairing
    ? `highsea://link?server=${encodeURIComponent(current?.server.id ?? '')}&code=${pairing.code}`
    : null
  return (
    <>
      <View style={{ flex: 1, gap: 1.6 * u }}>
        <Identity />
        <Title size={3.6}>{t('codeTitle')}</Title>
        <View style={{ gap: 0.8 * u }}>
          <Text variant="synopsis" color="text-2">
            {/* typed by hand, the page asks for the code itself; the QR carries it */}
            {t('step1', { url: pairing?.url.split('?')[0] ?? '…' })}
          </Text>
          <Text variant="synopsis" color="text-2">
            {t('step2', { code: pairing?.code ?? '…' })}
          </Text>
        </View>
        <View
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 0.6 * u }}
        >
          {approved ? (
            <Icon name="success" size={1.2} color="badge-success" />
          ) : (
            // tvOS draws its spinner past its frame; a box the icon's size keeps it off the words
            <View style={{ width: 1.6 * u, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors['text-2']} />
            </View>
          )}
          <Text variant="meta" color="text-2">
            {approved ? t('approved') : t('waiting')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 1 * u }}>
          <TvButton preferred icon="lock" onPress={onPassword}>
            {t('usePassword')}
          </TvButton>
          <TvButton icon="server" onPress={onServers}>
            {t('anotherServer')}
          </TvButton>
        </View>
      </View>
      <View style={{ width: 22 * u, gap: 1 * u }}>
        <View style={{ width: 22 * u, height: 22 * u }}>
          {link ? <QrCode value={link} label={t('qrLabel')} size={22 * u} /> : null}
        </View>
        <Text variant="pill" color="text-3" align="center">
          {t('scan')}
        </Text>
      </View>
      {current ? (
        <Foot>
          <TvButton icon="delete" onPress={() => forget(current.server.id, current.server.name)}>
            {f('thisServer')}
          </TvButton>
        </Foot>
      ) : null}
    </>
  )
}

const KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789.-_@'.split('')
const DIGITS = '1234567890'.split('')

type Field = 'username' | 'password' | 'code'

/** The fallback: a field per line, and a key grid the remote moves over. */
function Password({ onCancel }: { onCancel: () => void }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const client = useClient()
  const servers = useServers()
  const name = servers.current?.server.name ?? ''
  const [field, setField] = useState<Field>('username')
  const [values, setValues] = useState({ username: '', password: '', code: '' })
  const [challenge, setChallenge] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const type = (k: string) => setValues((v) => ({ ...v, [field]: v[field] + k }))
  const del = () => setValues((v) => ({ ...v, [field]: v[field].slice(0, -1) }))

  const finish = async (
    result: { status: 'signed-in'; token?: string } | { status: string; challenge?: string },
  ) => {
    if (result.status === 'two-factor' && 'challenge' in result && result.challenge) {
      setChallenge(result.challenge)
      setField('code')
      return
    }
    if (result.status === 'two-factor-setup') return setError(t('setup', { name }))
    if ('token' in result && result.token) {
      try {
        await servers.signedIn(result.token)
      } catch {
        setError(t('keychain'))
      }
    }
  }

  const submit = async () => {
    setPending(true)
    setError(null)
    try {
      if (challenge) {
        await finish(await client.auth.twoFactor({ body: { challenge, code: values.code } }))
      } else {
        await finish(
          await client.auth.signIn({
            body: { username: values.username, password: values.password, device: deviceInput() },
          }),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (challenge) setValues((v) => ({ ...v, code: '' }))
    } finally {
      setPending(false)
    }
  }

  const keyWidth = (56 * u - 9 * 0.5 * u) / 10
  const fields: Field[] = challenge ? ['code'] : ['username', 'password']
  const keys = challenge ? DIGITS : KEYS
  return (
    <View style={{ flex: 1, gap: 1.6 * u }}>
      <Identity />
      <Title>{t('passwordTitle', { name })}</Title>
      <View style={{ width: 56 * u, gap: 1.4 * u }}>
        {challenge ? (
          <Text variant="synopsis" color="text-2">
            {t('codeDetail')}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 1 * u }}>
          {fields.map((f) => (
            <View
              key={f}
              style={{
                flex: 1,
                gap: 0.3 * u,
                borderRadius: 0.5 * u,
                borderWidth: 0.15 * u,
                borderColor: field === f ? theme.colors.text : theme.colors.line,
                paddingHorizontal: 1 * u,
                paddingVertical: 0.6 * u,
              }}
            >
              <Text variant="pill" color="text-3">
                {t(f)}
              </Text>
              <Text variant="button" mono weight={500} numberOfLines={1}>
                {f === 'password' ? '•'.repeat(values.password.length) : values[f]}
                {field === f ? <Text color="text-3">|</Text> : null}
              </Text>
            </View>
          ))}
        </View>
        {error ? (
          <Text variant="pill" color="badge-danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 0.5 * u }}>
          {keys.map((k, i) => (
            <TvKey key={k} preferred={i === 0} width={keyWidth} onPress={() => type(k)}>
              {k}
            </TvKey>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 1 * u }}>
          <TvButton icon="arrow-left" onPress={del}>
            {t('delete')}
          </TvButton>
          {field === 'username' ? (
            <TvButton primary onPress={() => setField('password')}>
              {t('next')}
            </TvButton>
          ) : (
            <TvButton primary disabled={pending} onPress={submit}>
              {pending ? t('signingIn') : challenge ? t('verify') : t('signIn')}
            </TvButton>
          )}
          <TvButton onPress={onCancel}>{t('useCode')}</TvButton>
        </View>
      </View>
    </View>
  )
}

/** The servers this TV knows, then the ones answering on this network. */
function Servers({ knownCount }: { knownCount: number }) {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const servers = useServers()
  const nearby = useNearby()
  const signedIn = !!servers.current?.token

  const choose = async (info: (typeof nearby.found)[number]) => {
    const k = servers.known.find((s) => s.id === info.info.id)
    if (k) await servers.use(k.id)
    else await servers.add(info.info, info.base)
  }

  // zero configuration: the only server answering, with none known yet, is the one
  const took = useRef(false)
  useEffect(() => {
    if (took.current || knownCount > 0 || nearby.scanning || nearby.found.length !== 1) return
    took.current = true
    void choose(nearby.found[0] as (typeof nearby.found)[number])
  })

  const others = nearby.found.filter((n) => !servers.known.some((k) => k.id === n.info.id))
  const rows = [
    ...servers.known.map((k) => ({
      id: k.id,
      name: k.name,
      line: k.addresses[0]?.url.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '',
      pick: () => servers.use(k.id),
    })),
    ...others.map((n) => ({
      id: n.info.id,
      name: n.info.name,
      line: n.base.replace(/^https?:\/\//, ''),
      pick: () => choose(n),
    })),
  ]
  return (
    <View style={{ flex: 1, gap: 1.6 * u }}>
      {servers.current ? <Identity /> : <Mark size={2.4} />}
      <Title>{t('serversTitle')}</Title>
      <View style={{ width: 44 * u, gap: 0.6 * u }}>
        {rows.map((r, i) => (
          <Focusable
            key={r.id}
            preferred={i === 0}
            lift="row"
            label={`${r.name}, ${r.line}`}
            radius={0.6 * u}
            onPress={() => {
              void r.pick().then(() => {
                if (signedIn) router.back()
              })
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1 * u,
              borderRadius: 0.6 * u,
              paddingHorizontal: 1.2 * u,
              paddingVertical: 0.8 * u,
              backgroundColor: alpha(theme.colors.text, 0.08),
            }}
          >
            <Mark size={2} />
            <View style={{ flexShrink: 1 }}>
              <Text variant="button" numberOfLines={1}>
                {r.name}
              </Text>
              <Text variant="pill" color="text-2" numberOfLines={1}>
                {t('serverLine', { address: r.line })}
              </Text>
            </View>
          </Focusable>
        ))}
        <View
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0.6 * u,
            paddingHorizontal: 1.2 * u,
          }}
        >
          {nearby.scanning ? <ActivityIndicator color={theme.colors['text-3']} /> : null}
          <Text variant="pill" color="text-3">
            {nearby.scanning ? t('looking') : t('answered', { count: rows.length })}
          </Text>
        </View>
      </View>
    </View>
  )
}
