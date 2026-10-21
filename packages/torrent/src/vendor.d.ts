// SPDX-License-Identifier: AGPL-3.0-only
// The WebTorrent project's primitives ship no types: these declare what the engine uses, from each
// module's README and source at the pinned version.

declare module 'bencode' {
  type Value = number | Uint8Array | Value[] | { [key: string]: Value }
  const bencode: {
    encode(value: unknown): Uint8Array
    decode(data: Uint8Array, encoding?: string): Value
  }
  export default bencode
}

declare module 'magnet-uri' {
  export type MagnetData = {
    infoHash?: string
    name?: string
    dn?: string | string[]
    announce?: string[]
    tr?: string | string[]
    peerAddresses?: string[]
  }
  export default function magnet(uri: string): MagnetData
  export function encode(data: { infoHash: string; name?: string; announce?: string[] }): string
}

declare module 'bittorrent-protocol' {
  import { Duplex } from 'node:stream'

  type BitField = { get(index: number): boolean; buffer: Uint8Array }
  export type Extension = { name: string; new (wire: Wire): unknown }
  // a streamx Duplex at run time; node's Duplex is the nearest declared shape
  export default class Wire extends Duplex {
    constructor(type?: string, peEnabled?: number)
    peerId: string | null
    peerChoking: boolean
    peerInterested: boolean
    amChoking: boolean
    amInterested: boolean
    peerPieces: BitField
    peerExtensions: { dht?: boolean; extended?: boolean; fast?: boolean }
    peerExtendedHandshake: Record<string, unknown>
    hasFast: boolean
    requests: unknown[]
    ut_metadata?: {
      fetch(): void
      cancel(): void
      setMetadata(metadata: Uint8Array): Promise<boolean>
      on(event: 'metadata', fn: (torrent: Uint8Array) => void): void
      on(event: 'warning', fn: (e: Error) => void): void
    }
    ut_pex?: {
      start(): void
      reset(): void
      addPeer(peer: string): void
      dropPeer(peer: string): void
      on(event: 'peer', fn: (peer: string) => void): void
      on(event: 'peer6', fn: (peer: string) => void): void
    }
    use(extension: Extension): void
    handshake(
      infoHash: string,
      peerId: string,
      extensions?: { dht?: boolean; fast?: boolean },
    ): void
    setKeepAlive(enable: boolean): void
    setTimeout(ms: number, unref?: boolean): void
    choke(): void
    unchoke(): void
    interested(): void
    uninterested(): void
    have(index: number): void
    bitfield(bitfield: Uint8Array | BitField): void
    haveAll(): void
    haveNone(): void
    request(
      index: number,
      offset: number,
      length: number,
      cb: (err: Error | null, block?: Uint8Array) => void,
    ): void
    cancel(index: number, offset: number, length: number): void
    reject(index: number, offset: number, length: number): void
    port(port: number): void
  }
}

declare module 'ut_metadata' {
  import type { Extension } from 'bittorrent-protocol'
  export default function utMetadata(metadata?: Uint8Array): Extension
}

declare module 'ut_pex' {
  import type { Extension } from 'bittorrent-protocol'
  export default function utPex(): Extension
}

declare module 'bittorrent-dht' {
  import type { EventEmitter } from 'node:events'
  export default class DHT extends EventEmitter {
    constructor(options?: {
      nodeId?: Uint8Array
      bootstrap?: string[] | false
      host?: string | false
      krpc?: unknown
      socket?: unknown
      timeBucketOutdated?: number
      maxAge?: number
    })
    nodeId: Uint8Array
    lookup(infoHash: string, cb?: (err: Error | null, nodes?: number) => void): () => void
    announce(infoHash: string, port: number, cb?: (err: Error | null) => void): void
    addNode(node: { host: string; port: number }): void
    destroy(cb?: () => void): void
    toJSON(): { nodes: { host: string; port: number }[] }
  }
}
