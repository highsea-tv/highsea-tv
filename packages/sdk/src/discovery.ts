// SPDX-License-Identifier: AGPL-3.0-only
// Finding servers on the LAN (ADR 0020), for apps that run on Node or a runtime with node:dgram:
// broadcast `highsea:discover:1` to UDP 7368 and collect the answers, each a server's public info.
// Browsers can't send UDP; the admin doesn't need to.
import { createSocket } from 'node:dgram'
import { PublicInfo } from '@highsea/api-contract'

export const DISCOVERY_MESSAGE = 'highsea:discover:1'
export const DISCOVERY_PORT = 7368

export type FoundServer = PublicInfo & {
  /** The address the answer came from: the server's LAN address. */
  address: string
}

export type DiscoverOptions = {
  /** How long to listen for answers, in milliseconds. */
  timeout?: number
  port?: number
  /** Where to send the request: the limited broadcast address by default. */
  address?: string
  signal?: AbortSignal
}

/** The servers that answered within `timeout`, one entry per server id. */
export function discover(options: DiscoverOptions = {}): Promise<FoundServer[]> {
  const { timeout = 2000, port = DISCOVERY_PORT, address = '255.255.255.255', signal } = options
  return new Promise((resolve, reject) => {
    const found = new Map<string, FoundServer>()
    const socket = createSocket({ type: 'udp4' })
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      socket.close()
      resolve([...found.values()])
    }
    socket.on('message', (msg, remote) => {
      let data: unknown
      try {
        data = JSON.parse(msg.toString('utf8'))
      } catch {
        return
      }
      // anything else on the port that answers isn't a highsea server
      const info = PublicInfo.safeParse(data)
      if (info.success && !found.has(info.data.id))
        found.set(info.data.id, { ...info.data, address: remote.address })
    })
    socket.once('error', (err) => {
      clearTimeout(timer)
      socket.close()
      reject(err)
    })
    if (signal?.aborted) return resolve([])
    signal?.addEventListener('abort', finish)
    // setBroadcast needs a bound socket (Node docs, dgram socket.setBroadcast)
    socket.bind(0, () => {
      socket.setBroadcast(true)
      socket.send(DISCOVERY_MESSAGE, port, address)
      timer = setTimeout(finish, timeout)
    })
  })
}
