// SPDX-License-Identifier: AGPL-3.0-only
/// <reference path="./vendor.d.ts" />
// The torrent engine (ADR 0005, ADR 0037).
export { Bitfield } from './bitfield.ts'
export type { Dht } from './dht.ts'
export { DEFAULT_BOOTSTRAP } from './dht.ts'
export type {
  AddInput,
  EngineEvent,
  EngineStatus,
  Limits,
  TorrentEngine,
  TorrentSnapshot,
} from './engine.ts'
export { createTorrentEngine, DEFAULT_LIMITS, DEFAULT_PORT } from './engine.ts'
export type { Magnet, Metainfo, MetainfoFile } from './metainfo.ts'
export {
  parseMagnet,
  parseTorrentFile,
  safeComponent,
  sha1Hex,
  toMagnet,
  torrentFileOf,
} from './metainfo.ts'
export type { Binding, SocketRecord } from './sockets.ts'
export type { Priority } from './storage.ts'
export type { EngineState, PeerInfo, SeedRule, SessionStats } from './torrent.ts'
export { clientOf } from './torrent.ts'
export type { TrackerStatus } from './trackers.ts'

/** The hash worker's module, for the runtime's worker pool: `{ module: HASH_WORKER, fn: 'sha1' }`. */
export const HASH_WORKER = new URL('./hash-worker.ts', import.meta.url).href
