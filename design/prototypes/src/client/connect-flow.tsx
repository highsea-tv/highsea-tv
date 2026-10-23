// SPDX-License-Identifier: AGPL-3.0-only
// C1 on web and mobile (docs/product/connectivity.md#web-and-mobile): your servers, the servers
// answering on this network as they appear, an address field, and highsea cloud as an option;
// then sign-in, with two-factor when the account has it. One column, so it fits a phone and sits
// in a centered card on a desktop.

import { relative } from '@highsea-tv/core/format'
import { Button, cn, Field, Icon, Input, Lockup, Mark } from '@highsea-tv/ui-web'
import { type FormEvent, useState } from 'react'
import { useNow } from '../mock/hooks.tsx'
import type { ProbeResult } from '../mock/types.ts'
import { useDiscovery, useSignIn } from './connect.ts'
import { useKnownServers } from './data.ts'

function Alert({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-sm bg-badge-danger-bg px-3 py-2 text-badge-danger text-caption"
    >
      <Icon name="alert" size={16} className="mt-px shrink-0" />
      {children}
    </p>
  )
}

const row =
  'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 text-start outline-none transition-tint hover:bg-s2 focus-visible:ring-focus disabled:cursor-default disabled:opacity-60'

function Choose({
  onChoose,
  pending,
  error,
}: {
  onChoose: (address: string) => void
  pending: string | null
  error: string | null
}) {
  const known = useKnownServers()
  const { servers, scanning, rescan } = useDiscovery()
  const now = useNow()
  const [address, setAddress] = useState('')
  const [cloud, setCloud] = useState(false)
  const knownIds = new Set((known.data ?? []).map((k) => k.id))
  const nearby = servers.filter((s) => !knownIds.has(s.id))

  return (
    <div className="grid gap-6">
      {(known.data ?? []).length > 0 && (
        <section aria-labelledby="your-servers" className="grid gap-1">
          <h2 id="your-servers" className="px-3 font-mono text-label text-text-3 uppercase">
            Your servers
          </h2>
          {(known.data ?? []).map((k) => (
            <button
              key={k.id}
              type="button"
              className={row}
              disabled={pending !== null}
              onClick={() => onChoose(k.addresses.local)}
            >
              <Mark size={28} />
              <span className="grid min-w-0">
                <span className="truncate font-semibold text-text text-ui">{k.name}</span>
                <span className="truncate text-caption text-text-3">
                  {k.owner}’s server · {k.signedIn ? 'signed in' : 'signed out'} ·{' '}
                  {now - Date.parse(k.lastSeen) < 60_000 ? 'just now' : relative(k.lastSeen, now)}
                </span>
              </span>
              {pending === k.addresses.local ? (
                <Icon name="loading" size={16} className="animate-spin text-text-3" />
              ) : (
                <Icon name="chevron-right" size={16} className="text-text-3" />
              )}
            </button>
          ))}
        </section>
      )}

      <section aria-labelledby="nearby" className="grid gap-1">
        <div className="flex items-center gap-2 px-3">
          <h2 id="nearby" className="font-mono text-label text-text-3 uppercase">
            On this network
          </h2>
          <span
            role="status"
            className="ms-auto flex items-center gap-1.5 text-caption text-text-3"
          >
            {scanning ? (
              <>
                <Icon name="loading" size={14} className="animate-spin" />
                Looking…
              </>
            ) : (
              <button
                type="button"
                onClick={rescan}
                className="cursor-pointer underline-offset-2 hover:underline"
              >
                Look again
              </button>
            )}
          </span>
        </div>
        {nearby.map((s) => (
          <button
            key={s.id}
            type="button"
            className={row}
            disabled={pending !== null}
            onClick={() => onChoose(s.address)}
          >
            <Mark size={28} paint="mono" />
            <span className="grid min-w-0">
              <span className="truncate font-semibold text-text text-ui">{s.name}</span>
              <span className="truncate text-caption text-text-3">
                {s.owner}’s server · <span className="font-mono">{s.address}</span>
              </span>
            </span>
            <Icon name="chevron-right" size={16} className="text-text-3" />
          </button>
        ))}
        {!scanning && nearby.length === 0 && (
          <p className="px-3 py-2 text-caption text-text-3">
            {servers.length > 0
              ? 'Only servers you already use answered.'
              : 'No servers answered. They may be on another network, or discovery may be off: add one by address.'}
          </p>
        )}
      </section>

      <form
        className="grid gap-3 px-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          onChoose(address)
        }}
      >
        <Field
          label="Add a server by address"
          hint="Its name or IP, with the port if it isn’t 443: harbor.example.net, 192.168.1.20:3000."
          error={error ?? undefined}
        >
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="harbor.example.net"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            className="font-mono"
          />
        </Field>
        <Button
          type="submit"
          loading={pending === address && address !== ''}
          className="justify-self-start"
        >
          Connect
        </Button>
      </form>

      <div className="grid gap-2 border-line border-t px-3 pt-4">
        <button
          type="button"
          aria-expanded={cloud}
          onClick={() => setCloud((c) => !c)}
          className="flex cursor-pointer items-center gap-2 text-start text-text-2 text-ui outline-none hover:text-text focus-visible:ring-focus"
        >
          <Icon name="globe" size={16} />
          Find my servers with a highsea account
          <Icon name={cloud ? 'chevron-up' : 'chevron-down'} size={14} className="ms-auto" />
        </button>
        {cloud && (
          <p className="text-caption text-text-3">
            Optional. If your server’s owner turned on highsea cloud, signing in with your highsea
            account lists every server shared with you, and connects through the relay when there’s
            no other way in. Your media never passes through it unless that’s the only route.
          </p>
        )}
      </div>
    </div>
  )
}

function SignIn({
  server,
  onSubmit,
  pending,
  error,
}: {
  server: ProbeResult
  onSubmit: (username: string, password: string) => void
  pending: boolean
  error: string | null
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(username, password)
      }}
    >
      <div className="flex items-center gap-3 rounded-md bg-s2 px-3 py-2.5">
        <Mark size={28} />
        <span className="grid min-w-0">
          <span className="truncate font-semibold text-text text-ui">{server.name}</span>
          <span className="truncate text-caption text-text-3">
            {server.reachability === 'remote' ? 'Remotely, through ' : 'On this network, at '}
            <span className="font-mono">{server.address}</span>
          </span>
        </span>
      </div>
      {error && <Alert>{error}</Alert>}
      <Field label="Username">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>
        Sign in
      </Button>
      {server.auth.oidc && (
        <Button type="button" icon="external">
          Sign in with {server.auth.oidc.name}
        </Button>
      )}
    </form>
  )
}

function TwoFactor({
  onSubmit,
  pending,
  error,
}: {
  onSubmit: (code: string) => void
  pending: boolean
  error: string | null
}) {
  const [code, setCode] = useState('')
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(code)
      }}
    >
      <p className="text-body text-text-2">Enter the 6-digit code from your authenticator app.</p>
      <Field label="Code" error={error ?? undefined}>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="font-mono tracking-[0.3em]"
          required
        />
      </Field>
      <Button type="submit" variant="primary" loading={pending}>
        Verify
      </Button>
    </form>
  )
}

export function ConnectFlow({
  onSignedIn,
  className,
}: {
  onSignedIn: () => void
  className?: string
}) {
  const flow = useSignIn(onSignedIn)
  const [chosen, setChosen] = useState<string | null>(null)
  const s = flow.state
  const title =
    s.step === 'choose'
      ? 'Choose a server'
      : s.step === 'sign-in'
        ? `Sign in to ${s.server.name}`
        : 'Two-step verification'
  return (
    <main className={cn('grid min-h-full place-items-center bg-bg p-4 text-text', className)}>
      <div className="grid w-full max-w-[28rem] gap-6">
        <Lockup size={20} className="justify-self-center" />
        <section
          aria-labelledby="connect-title"
          className="grid gap-5 rounded-lg border border-line bg-s1 p-3 py-5 shadow-2 medium:p-5"
        >
          <div className="flex items-center gap-2 px-3">
            {s.step !== 'choose' && (
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon="arrow-left"
                aria-label="Back"
                onClick={flow.back}
                className="-ms-2"
              />
            )}
            <h1 id="connect-title" className="text-title">
              {title}
            </h1>
          </div>
          <div className={s.step === 'choose' ? '' : 'px-3'}>
            {s.step === 'choose' && (
              <Choose
                pending={flow.probe.pending ? chosen : null}
                error={flow.probe.error?.message ?? null}
                onChoose={(address) => {
                  setChosen(address)
                  flow.choose(address).catch(() => {})
                }}
              />
            )}
            {s.step === 'sign-in' && (
              <SignIn
                server={s.server}
                pending={flow.signIn.pending}
                error={flow.signIn.error?.message ?? null}
                onSubmit={(u, p) => flow.submit(u, p).catch(() => {})}
              />
            )}
            {s.step === 'two-factor' && (
              <TwoFactor
                pending={flow.verify.pending}
                error={flow.verify.error?.message ?? null}
                onSubmit={(code) => flow.submitCode(code).catch(() => {})}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
