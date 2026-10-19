// SPDX-License-Identifier: AGPL-3.0-only
// C1 Connect to a server (docs/product/connectivity.md), the logic every platform shares: LAN
// discovery that fills in as servers answer, adding a server by address, and signing in (with the
// two-factor step). Each platform draws it its own way; the TV signs in by code first.
import { useEffect, useState } from 'react'
import { useAction, useQuery } from '../mock/hooks.tsx'
import type { DiscoveredServer, ProbeResult } from '../mock/types.ts'

/** Servers answer discovery over a second or two, nearest first. */
export const DISCOVERY_STAGGER_MS = [600, 1200, 2000]
/** How long the scan runs before it says it's done. */
export const DISCOVERY_MS = 3200

export function useDiscovery() {
  const all = useQuery('client:discover', (c) => c.connect.discover())
  const [shown, setShown] = useState(0)
  const [scanning, setScanning] = useState(true)
  const [round, setRound] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: `round` restarts the scan on purpose
  useEffect(() => {
    setShown(0)
    setScanning(true)
    const timers = DISCOVERY_STAGGER_MS.map((ms, i) => setTimeout(() => setShown(i + 1), ms))
    timers.push(setTimeout(() => setScanning(false), DISCOVERY_MS))
    return () => timers.forEach(clearTimeout)
  }, [round])
  const servers: DiscoveredServer[] = (all.data ?? []).slice(0, shown)
  return { servers, scanning, rescan: () => setRound((r) => r + 1), status: all.status }
}

export type SignInStep =
  | { step: 'choose' }
  | { step: 'sign-in'; server: ProbeResult }
  | { step: 'two-factor'; server: ProbeResult; challenge: string }

export function useSignIn(onSignedIn: () => void) {
  const [state, setState] = useState<SignInStep>({ step: 'choose' })
  const probe = useAction((c, address: string) => c.connect.probe(address))
  const signIn = useAction((c, input: { username: string; password: string }) =>
    c.auth.signIn(input),
  )
  const verify = useAction((c, input: { challenge: string; code: string }) =>
    c.auth.verifyTwoFactor(input),
  )

  return {
    state,
    probe,
    signIn,
    verify,
    back: () => setState({ step: 'choose' }),
    /** Picks a server by address (from discovery, the switcher, or typed). */
    choose: async (address: string) => {
      const server = await probe.run(address)
      setState({ step: 'sign-in', server })
    },
    submit: async (username: string, password: string) => {
      if (state.step !== 'sign-in') return
      const r = await signIn.run({ username, password })
      if (r.status === 'two-factor')
        setState({ step: 'two-factor', server: state.server, challenge: r.challenge })
      else onSignedIn()
    },
    submitCode: async (code: string) => {
      if (state.step !== 'two-factor') return
      await verify.run({ challenge: state.challenge, code })
      onSignedIn()
    },
  }
}
