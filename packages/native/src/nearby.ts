// SPDX-License-Identifier: AGPL-3.0-only
// The servers answering on this network, as the Bonjour browser finds them (discovery.ts),
// each asked for its public info at the address it resolved to.
//
// iOS asks the person before an app may browse, and until they answer, browsing waits as it does
// once they've refused (Apple TN3179); tvOS never asks, so a TV only ever sees `allowed`. So the first time it's refused, the app takes it for the
// question being asked; the browser goes on by itself once they choose Allow. After that first
// minute, a refusal is one, and the screen says where to allow it.
import type { PublicInfo } from '@highsea-tv/api-contract'
import { File, Paths } from 'expo-file-system'
import { useEffect, useRef, useState } from 'react'
import { browse } from './discovery.ts'
import { publicInfoAt } from './servers.tsx'

export type Nearby = { info: PublicInfo; base: string }
export type LocalNetwork = 'looking' | 'allowed' | 'asking' | 'refused'

const ASKING_FOR = 60_000
/** Bonjour answers within a second or two on a home network; then the list is what it is. */
const SETTLE_MS = 4000

const marker = () => new File(Paths.document, 'local-network-asked')

function firstAsk(): boolean {
  try {
    const f = marker()
    if (f.exists) return false
    f.create()
    return true
  } catch {
    return false
  }
}

export function useNearby() {
  const [found, setFound] = useState<Nearby[]>([])
  const [lan, setLan] = useState<LocalNetwork>('looking')
  const [settled, setSettled] = useState(false)
  const [round, setRound] = useState(0)
  const askingSince = useRef<number | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: Look again is a new round
  useEffect(() => {
    let alive = true
    setSettled(false)
    const timer = setTimeout(() => alive && setSettled(true), SETTLE_MS)
    const stop = browse({
      found: (f) => {
        const base = `http://${f.host}:${f.port}`
        void publicInfoAt(base).then((info) => {
          if (!alive || !info) return
          setFound((list) =>
            list.some((s) => s.info.id === info.id) ? list : [...list, { info, base }],
          )
        })
      },
      state: ({ state }) => {
        if (!alive) return
        if (state === 'browsing') {
          askingSince.current = null
          setLan('allowed')
        } else if (state === 'refused') {
          if (askingSince.current === null && firstAsk()) askingSince.current = Date.now()
          const asking =
            askingSince.current !== null && Date.now() - askingSince.current < ASKING_FOR
          setLan(asking ? 'asking' : 'refused')
        }
      },
    })
    return () => {
      alive = false
      clearTimeout(timer)
      stop()
    }
  }, [round])

  // no answer within the minute: it's a refusal after all
  useEffect(() => {
    if (lan !== 'asking') return
    const t = setTimeout(() => setLan((l) => (l === 'asking' ? 'refused' : l)), ASKING_FOR)
    return () => clearTimeout(t)
  }, [lan])

  return {
    found,
    lan,
    scanning: lan === 'asking' || lan === 'looking' || (lan === 'allowed' && !settled),
    rescan: () => {
      setFound([])
      setRound((r) => r + 1)
    },
  }
}
