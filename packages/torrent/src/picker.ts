// SPDX-License-Identifier: AGPL-3.0-only
// Which blocks to ask each peer for. As clients implement BEP 3's advice: finish pieces already
// started before starting new ones; the first few pieces at random so there's something to trade
// soon; then rarest first, with random ties; high-priority files before normal ones; and endgame
// once every missing block is asked for, when the last ones are asked of several peers and the
// slower copies cancelled. The sequential mode (ADR 0005) asks in order, for streaming.
import type { Bitfield } from './bitfield.ts'
import type { Metainfo } from './metainfo.ts'
import { pieceSize } from './metainfo.ts'

/** 16 KiB: the block size every client uses; larger requests are refused by many. */
export const BLOCK = 16 * 1024

/** Random first pieces until this many are verified. */
const RANDOM_FIRST = 4

export type BlockRef = { piece: number; offset: number; length: number }

/** A peer as the picker sees it. */
export type PickerPeer = { key: string; has(piece: number): boolean }

type Active = {
  size: number
  /** 0 free, 1 asked for, 2 arrived. */
  state: Uint8Array
  /** Who each block is asked of. */
  askedOf: Map<number, Set<string>>
  /** Who sent each block that arrived. */
  sentBy: (string | null)[]
  buffer: Uint8Array
  arrived: number
}

export type Picker = ReturnType<typeof createPicker>

export function createPicker(
  m: Pick<Metainfo, 'pieceCount' | 'pieceLength' | 'length'>,
  options: {
    have: Bitfield
    /** 0 not wanted, 1 normal, 2 high: from the files' priorities. */
    priority(piece: number): number
    sequential(): boolean
    random?: () => number
  },
) {
  const random = options.random ?? Math.random
  const availability = new Uint16Array(m.pieceCount)
  const active = new Map<number, Active>()

  const blocksIn = (piece: number) => Math.ceil(pieceSize(m, piece) / BLOCK)
  const ref = (piece: number, block: number): BlockRef => {
    const size = pieceSize(m, piece)
    const offset = block * BLOCK
    return { piece, offset, length: Math.min(BLOCK, size - offset) }
  }
  const missing = (p: number) => !options.have.get(p) && options.priority(p) > 0

  const activate = (piece: number): Active => {
    const size = pieceSize(m, piece)
    const n = blocksIn(piece)
    const a: Active = {
      size,
      state: new Uint8Array(n),
      askedOf: new Map(),
      sentBy: new Array(n).fill(null),
      buffer: new Uint8Array(size),
      arrived: 0,
    }
    active.set(piece, a)
    return a
  }

  const take = (piece: number, a: Active, peer: string, max: number, out: BlockRef[]) => {
    for (let b = 0; b < a.state.length && out.length < max; b++) {
      if (a.state[b] !== 0) continue
      a.state[b] = 1
      a.askedOf.set(b, new Set([peer]))
      out.push(ref(piece, b))
    }
  }

  /** A piece to start for this peer, or -1. */
  const choose = (peer: PickerPeer): number => {
    let best = -1
    let bestPriority = 0
    let bestAvail = Number.POSITIVE_INFINITY
    let ties = 0
    const sequential = options.sequential()
    const randomPhase = options.have.count() < RANDOM_FIRST
    for (let p = 0; p < m.pieceCount; p++) {
      if (active.has(p) || !missing(p) || !peer.has(p)) continue
      const priority = options.priority(p)
      if (priority < bestPriority) continue
      if (priority > bestPriority) {
        best = p
        bestPriority = priority
        bestAvail = availability[p] as number
        ties = 1
        continue
      }
      if (sequential) continue
      if (randomPhase) {
        // reservoir sampling: each candidate equally likely
        ties++
        if (random() * ties < 1) best = p
        continue
      }
      const avail = availability[p] as number
      if (avail < bestAvail) {
        best = p
        bestAvail = avail
        ties = 1
      } else if (avail === bestAvail) {
        ties++
        if (random() * ties < 1) best = p
      }
    }
    return best
  }

  const picker = {
    availability,

    /** A peer's bitfield arrived (or `haveAll`). */
    addPeer(has: (piece: number) => boolean) {
      for (let p = 0; p < m.pieceCount; p++)
        if (has(p)) availability[p] = (availability[p] ?? 0) + 1
    },
    removePeer(has: (piece: number) => boolean) {
      for (let p = 0; p < m.pieceCount; p++)
        if (has(p) && (availability[p] as number) > 0)
          availability[p] = (availability[p] as number) - 1
    },
    peerHas(piece: number) {
      if (piece >= 0 && piece < m.pieceCount) availability[piece] = (availability[piece] ?? 0) + 1
    },

    /** Whether this peer has anything we still need: whether to be interested in it. */
    wants(peer: PickerPeer): boolean {
      for (let p = 0; p < m.pieceCount; p++) if (missing(p) && peer.has(p)) return true
      return false
    },

    /** Up to `max` blocks to ask this peer for. */
    next(peer: PickerPeer, max: number): BlockRef[] {
      const out: BlockRef[] = []
      if (max <= 0) return out
      // pieces already started, highest priority first
      const started = [...active.keys()]
        .filter((p) => missing(p) && peer.has(p))
        .sort((a, b) => options.priority(b) - options.priority(a) || a - b)
      for (const p of started) {
        take(p, active.get(p) as Active, peer.key, max, out)
        if (out.length >= max) return out
      }
      while (out.length < max) {
        const p = choose(peer)
        if (p < 0) break
        take(p, activate(p), peer.key, max, out)
      }
      if (out.length < max && picker.endgame())
        // endgame: blocks still in flight, asked of this peer too
        for (const p of started) {
          const a = active.get(p) as Active
          for (let b = 0; b < a.state.length && out.length < max; b++) {
            const askedOf = a.askedOf.get(b)
            if (a.state[b] !== 1 || !askedOf || askedOf.has(peer.key)) continue
            askedOf.add(peer.key)
            out.push(ref(p, b))
          }
        }
      return out
    },

    /** Every missing piece is started and none has a block nobody's been asked for. */
    endgame(): boolean {
      for (let p = 0; p < m.pieceCount; p++) {
        if (!missing(p)) continue
        const a = active.get(p)
        if (!a || a.state.includes(0)) return false
      }
      return true
    },

    /**
     * A block arrived. Returns the whole piece once its last block is in, and who else was asked
     * for this block, to cancel.
     */
    arrived(
      peer: string,
      piece: number,
      offset: number,
      data: Uint8Array,
    ): { piece: Uint8Array | null; cancel: string[] } | null {
      const a = active.get(piece)
      if (!a || offset % BLOCK !== 0) return null
      const b = offset / BLOCK
      if (b >= a.state.length || data.length !== ref(piece, b).length) return null
      const askedOf = a.askedOf.get(b) ?? new Set<string>()
      if (a.state[b] === 2) return { piece: null, cancel: [] }
      a.buffer.set(data, offset)
      a.state[b] = 2
      a.sentBy[b] = peer
      a.arrived++
      a.askedOf.delete(b)
      const cancel = [...askedOf].filter((k) => k !== peer)
      return { piece: a.arrived === a.state.length ? a.buffer : null, cancel }
    },

    /** A request ended without data (choked, rejected, timed out): the block is free again. */
    release(peer: string, block: BlockRef) {
      const a = active.get(block.piece)
      if (!a) return
      const b = block.offset / BLOCK
      const askedOf = a.askedOf.get(b)
      if (!askedOf || a.state[b] !== 1) return
      askedOf.delete(peer)
      if (askedOf.size === 0) {
        a.askedOf.delete(b)
        a.state[b] = 0
      }
    },

    /** A peer went: everything asked of it is free again. */
    dropPeer(peer: string) {
      for (const [p, a] of active)
        for (const [b] of a.askedOf)
          picker.release(peer, { piece: p, offset: b * BLOCK, length: 0 })
    },

    /**
     * The piece's hash was checked. On a failure the piece starts over, and the result says what
     * share of it each peer sent, for banning.
     */
    checked(piece: number, ok: boolean): Map<string, number> {
      const a = active.get(piece)
      active.delete(piece)
      const shares = new Map<string, number>()
      if (!a || ok) return shares
      for (const by of a.sentBy) if (by) shares.set(by, (shares.get(by) ?? 0) + 1 / a.state.length)
      return shares
    },

    /** Pieces being downloaded, for fast resume to leave out. */
    activePieces: () => [...active.keys()],

    /** A file was skipped: its pieces no longer wanted are dropped from the active set. */
    prune() {
      for (const p of [...active.keys()]) if (!missing(p)) active.delete(p)
    },
  }
  return picker
}
