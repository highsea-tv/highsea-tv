// SPDX-License-Identifier: AGPL-3.0-only
// uTP, the uTorrent transport protocol (BEP 29, https://www.bittorrent.org/beps/bep_0029.html), on
// the engine's UDP socket (udp.ts), with LEDBAT congestion control (RFC 6817,
// https://www.rfc-editor.org/rfc/rfc6817). highsea's own: no maintained pure-JS implementation
// exists (docs/plans/phase-3-checkpoint-6.md › The approach). Each connection is a Duplex stream,
// so the peer wire protocol runs over it exactly as over a TCP socket.
//
// Where BEP 29 leaves a choice, highsea follows libtorrent (RC_2_0, src/utp_stream.cpp) and
// libutp (github.com/bittorrent/libutp, utp_internal.cpp), the two implementations every client
// interoperates with:
// - an ST_STATE carries the next sequence number its sender will use and doesn't consume one; the
//   initiator, on the ST_STATE that answers its SYN, sets `ack_nr` to that number less one;
// - ST_FIN consumes a sequence number, and the stream ends once everything before it has arrived;
// - a packet for no known connection is answered with ST_RESET (never a reset with a reset);
// - libtorrent's settings for the timeouts (reference-Settings.html: `utp_connect_timeout` 3000 ms,
//   `utp_syn_resends` 2, `utp_min_timeout` 500 ms). `utp_num_resends` is 3 there; highsea allows 6
//   transmissions of a packet before it gives up, for lossy links behind a VPN.
// The congestion window follows RFC 6817 § 2.4.2 with its constants (TARGET 100 ms, GAIN 1,
// BASE_HISTORY 10 one-minute minima, INIT_CWND and MIN_CWND 2 MSS, ALLOWED_INCREASE 1); a loss
// halves it at most once per window (BEP 29 › packet loss), a timeout sets it to one MSS (RFC 6817).
// Packets are at most 1200 bytes of UDP payload, the size QUIC chose to cross any path without
// fragmenting, IPv6 and tunnels included (RFC 9000 § 14), so no path MTU discovery is needed.
import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { Duplex } from 'node:stream'
import type { UdpInfo, UdpSend } from './udp.ts'

export const ST_DATA = 0
export const ST_FIN = 1
export const ST_STATE = 2
export const ST_RESET = 3
export const ST_SYN = 4

const VERSION = 1
const HEADER = 20
const EXT_SACK = 1

export const PACKET_SIZE = 1200
/** Payload bytes in one packet. */
export const MSS = PACKET_SIZE - HEADER

const TARGET_US = 100_000
const GAIN = 1
const BASE_HISTORY = 10
const CURRENT_FILTER = 4
const INIT_CWND = 2
const MIN_CWND = 2
const ALLOWED_INCREASE = 1

const INITIAL_TIMEOUT_MS = 1000
const MIN_TIMEOUT_MS = 500
const MAX_TIMEOUT_MS = 60_000
const CONNECT_TIMEOUT_MS = 3000
const SYN_RESENDS = 2
const MAX_TRANSMISSIONS = 6

/** The receive buffer the window advertises. */
const RECV_WINDOW = 1024 * 1024
/** Data waiting to be packetised before `write` holds the writer back. */
const SEND_BUFFER = 256 * 1024
/** Packets ahead of the next expected one that are buffered; later ones are dropped. */
const MAX_AHEAD = 2048
const TICK_MS = 25

export type Packet = {
  type: number
  connId: number
  timestamp: number
  timestampDiff: number
  wnd: number
  seq: number
  ack: number
  /** The selective ACK bitmask, or null. */
  sack: Uint8Array | null
  payload: Uint8Array
}

/** BEP 29's header, with the selective ACK extension when there is one. */
export function encodePacket(p: Packet): Buffer {
  const ext = p.sack ? 2 + p.sack.length : 0
  const buf = Buffer.alloc(HEADER + ext + p.payload.length)
  buf[0] = (p.type << 4) | VERSION
  buf[1] = p.sack ? EXT_SACK : 0
  buf.writeUInt16BE(p.connId & 0xffff, 2)
  buf.writeUInt32BE(p.timestamp >>> 0, 4)
  buf.writeUInt32BE(p.timestampDiff >>> 0, 8)
  buf.writeUInt32BE(Math.max(0, Math.floor(p.wnd)) >>> 0, 12)
  buf.writeUInt16BE(p.seq & 0xffff, 16)
  buf.writeUInt16BE(p.ack & 0xffff, 18)
  if (p.sack) {
    buf[20] = 0
    buf[21] = p.sack.length
    buf.set(p.sack, 22)
  }
  buf.set(p.payload, HEADER + ext)
  return buf
}

/** Reads a packet, or null when it isn't one: unknown extensions are skipped, as BEP 29 says. */
export function decodePacket(buf: Uint8Array): Packet | null {
  if (buf.length < HEADER) return null
  const first = buf[0] as number
  if ((first & 0x0f) !== VERSION || first >> 4 > ST_SYN) return null
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let ext = buf[1] as number
  let off = HEADER
  let sack: Uint8Array | null = null
  for (let n = 0; ext !== 0; n++) {
    if (n > 8 || off + 2 > buf.length) return null
    const next = buf[off] as number
    const len = buf[off + 1] as number
    if (off + 2 + len > buf.length) return null
    if (ext === EXT_SACK && len >= 4 && len % 4 === 0) sack = buf.subarray(off + 2, off + 2 + len)
    off += 2 + len
    ext = next
  }
  return {
    type: first >> 4,
    connId: view.getUint16(2),
    timestamp: view.getUint32(4),
    timestampDiff: view.getUint32(8),
    wnd: view.getUint32(12),
    seq: view.getUint16(16),
    ack: view.getUint16(18),
    sack,
    payload: buf.subarray(off),
  }
}

const seqAdd = (a: number, n: number) => (a + n) & 0xffff
/** How far `a` is after `b`, in the 16-bit sequence space. */
const seqDiff = (a: number, b: number) => (a - b) & 0xffff
const seqAfter = (a: number, b: number) => {
  const d = seqDiff(a, b)
  return d !== 0 && d < 0x8000
}
/** The smaller of two wrapping 32-bit microsecond values. */
const minWrap = (a: number, b: number) => (((a - b) | 0) < 0 ? a : b)

const nowMs = () => performance.now()
const nowUs = () => Math.floor(performance.now() * 1000) >>> 0
const random16 = () => randomBytes(2).readUInt16BE(0)

type Outgoing = {
  seq: number
  type: number
  payload: Buffer
  sentAt: number
  transmissions: number
  needResend: boolean
}

type Link = {
  send(packet: Buffer): void
  forget(stream: UtpStream): void
}

type State = 'syn-sent' | 'syn-recv' | 'connected' | 'closed'

/** One uTP connection, as a Duplex stream with a TCP socket's `remoteAddress` and `remotePort`. */
export class UtpStream extends Duplex {
  readonly remoteAddress: string
  readonly remotePort: number
  readonly remoteFamily: 'IPv4' | 'IPv6'
  readonly recvId: number
  readonly sendId: number
  state: State
  readonly link: Link

  // sending
  seqNr: number
  lastAck: number
  readonly outbuf = new Map<number, Outgoing>()
  /** Payload bytes in flight: sent, not acked, and not waiting to be sent again. */
  curWindow = 0
  cwnd = INIT_CWND * MSS
  peerWnd = RECV_WINDOW
  dupAcks = 0
  lossBoundary: number
  pending: Buffer[] = []
  pendingBytes = 0
  pendingCb: ((err?: Error | null) => void) | null = null
  finQueued = false
  finSeq = -1
  synTries = 0

  // timing
  rtt = 0
  rttVar = 0
  rto: number
  deadline = 0
  replyMicro = 0
  readonly baseDelays: number[] = []
  baseMinute = -1
  readonly currentDelays: number[] = []

  // receiving
  ackNr: number
  readonly ooo = new Map<number, Buffer>()
  oooBytes = 0
  eofSeq = -1
  gotEof = false
  ackPending = false
  lowWindow = false

  constructor(init: {
    link: Link
    host: string
    port: number
    recvId: number
    sendId: number
    seqNr: number
    ackNr: number
    state: State
  }) {
    super({ allowHalfOpen: false })
    this.link = init.link
    this.remoteAddress = init.host
    this.remotePort = init.port
    this.remoteFamily = isIP(init.host) === 6 ? 'IPv6' : 'IPv4'
    this.recvId = init.recvId
    this.sendId = init.sendId
    this.seqNr = init.seqNr
    this.lastAck = seqAdd(init.seqNr, -1)
    this.lossBoundary = this.lastAck
    this.ackNr = init.ackNr
    this.state = init.state
    this.rto = init.state === 'syn-sent' ? CONNECT_TIMEOUT_MS : INITIAL_TIMEOUT_MS
  }

  // --- packets out ---------------------------------------------------------------------------

  window(): number {
    return Math.max(0, RECV_WINDOW - this.readableLength - this.oooBytes)
  }

  packet(type: number, seq: number, payload: Uint8Array, sack: Uint8Array | null = null) {
    const wnd = this.window()
    this.lowWindow = wnd < 2 * MSS
    this.link.send(
      encodePacket({
        type,
        connId: type === ST_SYN ? this.recvId : this.sendId,
        timestamp: nowUs(),
        timestampDiff: this.replyMicro,
        wnd,
        seq,
        ack: this.ackNr,
        sack,
        payload,
      }),
    )
  }

  transmit(o: Outgoing) {
    o.sentAt = nowMs()
    o.transmissions++
    this.packet(o.type, o.seq, o.payload)
    if (!this.deadline) this.deadline = o.sentAt + this.rto
  }

  /** Starts an outgoing connection: the SYN takes sequence number 1 (BEP 29 › connection setup). */
  syn() {
    const o: Outgoing = {
      seq: this.seqNr,
      type: ST_SYN,
      payload: Buffer.alloc(0),
      sentAt: 0,
      transmissions: 0,
      needResend: false,
    }
    this.seqNr = seqAdd(this.seqNr, 1)
    this.outbuf.set(o.seq, o)
    this.synTries++
    this.transmit(o)
  }

  /** Which packets after `ack_nr + 1` have arrived: the selective ACK extension's bitmask. */
  sackMask(): Uint8Array | null {
    if (!this.ooo.size) return null
    let top = 0
    for (const s of this.ooo.keys()) top = Math.max(top, seqDiff(s, this.ackNr) - 2)
    const bytes = Math.min(128, Math.ceil((top + 1) / 32) * 4)
    const mask = new Uint8Array(bytes)
    for (const s of this.ooo.keys()) {
      const i = seqDiff(s, this.ackNr) - 2
      if (i >= 0 && i < bytes * 8) mask[i >> 3] = (mask[i >> 3] as number) | (1 << (i & 7))
    }
    return mask
  }

  sendState() {
    if (this.state === 'closed') return
    this.packet(ST_STATE, this.seqNr, new Uint8Array(0), this.sackMask())
  }

  /** Acks once for every datagram that arrived in the same turn of the event loop. */
  scheduleAck() {
    if (this.ackPending) return
    this.ackPending = true
    setImmediate(() => {
      this.ackPending = false
      this.sendState()
    })
  }

  fits(size: number) {
    return this.curWindow === 0 || this.curWindow + size <= Math.min(this.cwnd, this.peerWnd)
  }

  private dequeue(size: number): Buffer {
    const out = Buffer.allocUnsafe(size)
    let at = 0
    while (at < size) {
      const head = this.pending[0] as Buffer
      const n = Math.min(head.length, size - at)
      head.copy(out, at, 0, n)
      at += n
      if (n === head.length) this.pending.shift()
      else this.pending[0] = head.subarray(n)
    }
    this.pendingBytes -= size
    return out
  }

  /** Sends what the window allows: packets to send again first, then new data, then the FIN. */
  flush() {
    if (this.state !== 'connected') return
    for (const o of this.outbuf.values()) {
      if (!o.needResend) continue
      if (!this.fits(o.payload.length)) return
      o.needResend = false
      this.curWindow += o.payload.length
      this.transmit(o)
    }
    while (this.pendingBytes > 0 && this.outbuf.size < 0x4000) {
      const size = Math.min(MSS, this.pendingBytes)
      if (!this.fits(size)) break
      const o: Outgoing = {
        seq: this.seqNr,
        type: ST_DATA,
        payload: this.dequeue(size),
        sentAt: 0,
        transmissions: 0,
        needResend: false,
      }
      this.seqNr = seqAdd(this.seqNr, 1)
      this.outbuf.set(o.seq, o)
      this.curWindow += size
      this.transmit(o)
    }
    if (this.pendingBytes === 0 && this.finQueued && this.finSeq < 0) {
      const o: Outgoing = {
        seq: this.seqNr,
        type: ST_FIN,
        payload: Buffer.alloc(0),
        sentAt: 0,
        transmissions: 0,
        needResend: false,
      }
      this.finSeq = o.seq
      this.seqNr = seqAdd(this.seqNr, 1)
      this.outbuf.set(o.seq, o)
      this.transmit(o)
    }
    if (this.pendingCb && this.pendingBytes < SEND_BUFFER) {
      const cb = this.pendingCb
      this.pendingCb = null
      cb()
    }
  }

  // --- packets in ----------------------------------------------------------------------------

  /** A packet for this connection, already matched by its connection id. */
  incoming(p: Packet) {
    if (this.state === 'closed') return
    if (p.type === ST_RESET) {
      this.state = 'closed'
      const err = new Error('The peer reset the uTP connection.') as NodeJS.ErrnoException
      err.code = 'ECONNRESET'
      this.destroy(err)
      return
    }
    this.replyMicro = (nowUs() - p.timestamp) >>> 0
    this.peerWnd = p.wnd
    let connected = false
    if (this.state === 'syn-sent') {
      // only an answer to our SYN moves us on (libtorrent's syn_sent state)
      if (p.type === ST_SYN || p.ack !== seqAdd(this.seqNr, -1)) return
      this.state = 'connected'
      this.ackNr = seqAdd(p.seq, -1)
      connected = true
    } else if (this.state === 'syn-recv' && p.type !== ST_SYN) this.state = 'connected'
    if (p.type === ST_SYN) {
      // the SYN again: our ST_STATE was lost
      this.sendState()
      return
    }
    if (this.state === 'connected') this.processAck(p)
    if (connected) this.emit('connect')
    if (p.type === ST_DATA || p.type === ST_FIN) this.receive(p)
    this.flush()
  }

  ackOne(o: Outgoing): number {
    this.outbuf.delete(o.seq)
    if (!o.needResend) this.curWindow -= o.payload.length
    if (o.transmissions === 1) this.rttSample(nowMs() - o.sentAt)
    return o.payload.length
  }

  processAck(p: Packet) {
    const ack = p.ack
    const flight = this.curWindow
    let acked = 0
    let bytes = 0
    const sent = seqDiff(seqAdd(this.seqNr, -1), this.lastAck)
    if (seqAfter(ack, this.lastAck) && seqDiff(ack, this.lastAck) <= sent) {
      for (let s = seqAdd(this.lastAck, 1); ; s = seqAdd(s, 1)) {
        const o = this.outbuf.get(s)
        if (o) {
          bytes += this.ackOne(o)
          acked++
        }
        if (s === ack) break
      }
      this.lastAck = ack
      this.dupAcks = 0
    } else if (ack === this.lastAck && p.type === ST_STATE && this.outbuf.size && !p.sack) {
      // three duplicate acks: the packet after them was lost (BEP 29 › packet loss)
      if (++this.dupAcks === 3) this.lost(seqAdd(ack, 1))
    }
    if (p.sack && seqDiff(ack, this.lastAck) < 0x8000) {
      const bits = p.sack.length * 8
      const sacked: boolean[] = []
      for (let i = 0; i < bits; i++) {
        const on = (((p.sack[i >> 3] as number) >> (i & 7)) & 1) === 1
        sacked.push(on)
        const o = on ? this.outbuf.get(seqAdd(ack, 2 + i)) : undefined
        if (o) {
          bytes += this.ackOne(o)
          acked++
        }
      }
      // a packet with three or more acked after it was lost; walk down from the newest
      let after = 0
      for (let i = bits - 1; i >= -1; i--) {
        if (i >= 0 && sacked[i]) after++
        else if (after >= 3) this.lost(seqAdd(ack, 2 + i))
      }
    }
    if (acked) {
      this.deadline = this.outbuf.size ? nowMs() + this.rto : 0
      if (bytes) this.ledbat(p.timestampDiff, bytes, flight)
    }
  }

  /** A packet was lost: it's sent again, and the window halves at most once per window. */
  lost(seq: number) {
    const o = this.outbuf.get(seq)
    if (!o || o.needResend) return
    // sent again within the last round trip: its answer may still be on the way
    if (o.transmissions > 1 && nowMs() - o.sentAt < Math.max(this.rtt, 50)) return
    o.needResend = true
    this.curWindow -= o.payload.length
    if (seqAfter(seq, this.lossBoundary)) {
      this.cwnd = Math.max(this.cwnd / 2, MIN_CWND * MSS)
      this.lossBoundary = seqAdd(this.seqNr, -1)
    }
  }

  rttSample(ms: number) {
    if (this.rtt === 0) {
      this.rtt = ms
      this.rttVar = ms / 2
    } else {
      const delta = this.rtt - ms
      this.rttVar += (Math.abs(delta) - this.rttVar) / 4
      this.rtt += (ms - this.rtt) / 8
    }
    // BEP 29 › timeouts
    this.rto = Math.max(this.rtt + this.rttVar * 4, MIN_TIMEOUT_MS)
  }

  /** RFC 6817 § 2.4.2, on acknowledgement. */
  ledbat(delay: number, bytesAcked: number, flight: number) {
    if (delay !== 0) {
      const minute = Math.floor(nowMs() / 60_000)
      if (minute !== this.baseMinute || !this.baseDelays.length) {
        this.baseDelays.push(delay)
        if (this.baseDelays.length > BASE_HISTORY) this.baseDelays.shift()
        this.baseMinute = minute
      } else {
        const last = this.baseDelays.length - 1
        this.baseDelays[last] = minWrap(this.baseDelays[last] as number, delay)
      }
      this.currentDelays.push(delay)
      if (this.currentDelays.length > CURRENT_FILTER) this.currentDelays.shift()
    }
    let queuing = 0
    if (this.currentDelays.length && this.baseDelays.length) {
      const current = this.currentDelays.reduce(minWrap)
      const base = this.baseDelays.reduce(minWrap)
      queuing = Math.max(0, (current - base) | 0)
    }
    const offTarget = (TARGET_US - queuing) / TARGET_US
    this.cwnd += (GAIN * offTarget * bytesAcked * MSS) / this.cwnd
    this.cwnd = Math.min(this.cwnd, flight + ALLOWED_INCREASE * MSS)
    this.cwnd = Math.max(this.cwnd, MIN_CWND * MSS)
  }

  receive(p: Packet) {
    if (p.type === ST_FIN && this.eofSeq < 0) this.eofSeq = p.seq
    const next = seqAdd(this.ackNr, 1)
    if (p.seq === next) {
      if (p.payload.length) this.push(Buffer.from(p.payload))
      this.ackNr = p.seq
      for (;;) {
        const n = seqAdd(this.ackNr, 1)
        const buf = this.ooo.get(n)
        if (!buf) break
        this.ooo.delete(n)
        this.oooBytes -= buf.length
        if (buf.length) this.push(buf)
        this.ackNr = n
      }
    } else if (seqAfter(p.seq, this.ackNr) && seqDiff(p.seq, this.ackNr) < MAX_AHEAD) {
      if (!this.ooo.has(p.seq)) {
        const copy = Buffer.from(p.payload)
        this.ooo.set(p.seq, copy)
        this.oooBytes += copy.length
      }
    }
    this.scheduleAck()
    if (this.eofSeq >= 0 && !this.gotEof && this.ackNr === this.eofSeq) {
      this.gotEof = true
      this.push(null)
    }
  }

  /** The manager's clock: a packet unanswered for the timeout is sent again. */
  tick(now: number) {
    if (this.state === 'closed' || !this.deadline || now < this.deadline) return
    if (this.state === 'syn-sent') {
      if (this.synTries >= SYN_RESENDS) {
        const err = new Error('The peer didn’t answer over uTP.') as NodeJS.ErrnoException
        err.code = 'ETIMEDOUT'
        this.destroy(err)
        return
      }
      this.rto *= 2
      this.deadline = 0
      const synPacket = this.outbuf.get(1)
      if (synPacket) {
        this.synTries++
        this.transmit(synPacket)
      }
      return
    }
    const oldest = this.outbuf.values().next().value
    if (!oldest) {
      this.deadline = 0
      return
    }
    if (oldest.transmissions >= MAX_TRANSMISSIONS) {
      const err = new Error('The uTP connection timed out.') as NodeJS.ErrnoException
      err.code = 'ETIMEDOUT'
      this.destroy(err)
      return
    }
    // RFC 6817: no ACK within the timeout, one MSS and back off; everything in flight goes again
    this.cwnd = MSS
    this.rto = Math.min(this.rto * 2, MAX_TIMEOUT_MS)
    for (const o of this.outbuf.values()) o.needResend = true
    this.curWindow = 0
    this.deadline = 0
    this.flush()
    if (!this.deadline) this.deadline = now + this.rto
  }

  // --- the stream ----------------------------------------------------------------------------

  override _write(chunk: Buffer, _encoding: BufferEncoding, cb: (err?: Error | null) => void) {
    if (this.state === 'closed') {
      cb(new Error('The uTP connection is closed.'))
      return
    }
    this.pending.push(chunk)
    this.pendingBytes += chunk.length
    this.flush()
    if (this.pendingBytes < SEND_BUFFER) cb()
    else this.pendingCb = cb
  }

  override _final(cb: (err?: Error | null) => void) {
    this.finQueued = true
    this.flush()
    cb()
  }

  override _read() {
    // the window was nearly shut: say it's open again
    if (this.lowWindow && this.state !== 'closed') this.scheduleAck()
  }

  override _destroy(err: Error | null, cb: (err?: Error | null) => void) {
    if (this.state !== 'closed') {
      // an abort, as a TCP RST: the peer drops the connection at once
      if (!(this.finSeq >= 0 && this.gotEof)) this.packet(ST_RESET, this.seqNr, new Uint8Array(0))
      this.state = 'closed'
    }
    this.link.forget(this)
    const pending = this.pendingCb
    this.pendingCb = null
    pending?.(err ?? new Error('The uTP connection is closed.'))
    cb(err)
  }
}

export type Utp = ReturnType<typeof createUtp>

/**
 * The uTP connections on one UDP socket: incoming packets matched to their connection by address
 * and connection id, new connections out, SYNs answered or refused.
 */
export function createUtp(options: {
  send: UdpSend
  /** Whether incoming connections are taken; refused ones get ST_RESET. */
  accept(): boolean
  onConnection(stream: UtpStream): void
}) {
  const streams = new Map<string, UtpStream>()
  let closed = false
  const keyOf = (host: string, port: number, id: number) => `${host}|${port}|${id}`

  const linkFor = (host: string, port: number): Link => ({
    send: (packet) => {
      if (!closed) options.send(packet, port, host)
    },
    forget: (s) => {
      const k = keyOf(host, port, s.recvId)
      if (streams.get(k) === s) streams.delete(k)
    },
  })

  const timer = setInterval(() => {
    const now = nowMs()
    for (const s of [...streams.values()]) s.tick(now)
  }, TICK_MS)
  timer.unref?.()

  const reset = (to: UdpInfo, p: Packet) => {
    if (closed) return
    options.send(
      encodePacket({
        type: ST_RESET,
        connId: p.connId,
        timestamp: nowUs(),
        timestampDiff: 0,
        wnd: 0,
        seq: random16(),
        ack: p.seq,
        sack: null,
        payload: new Uint8Array(0),
      }),
      to.port,
      to.address,
    )
  }

  return {
    /** A datagram the mux found to be uTP. */
    handle(buf: Uint8Array, from: UdpInfo) {
      if (closed) return
      const p = decodePacket(buf)
      if (!p) return
      const host = from.address
      if (p.type === ST_SYN) {
        const existing = streams.get(keyOf(host, from.port, seqAdd(p.connId, 1)))
        if (existing) {
          existing.incoming(p)
          return
        }
        if (!options.accept()) {
          reset(from, p)
          return
        }
        const s = new UtpStream({
          link: linkFor(host, from.port),
          host,
          port: from.port,
          recvId: seqAdd(p.connId, 1),
          sendId: p.connId,
          seqNr: random16(),
          ackNr: p.seq,
          state: 'syn-recv',
        })
        s.replyMicro = (nowUs() - p.timestamp) >>> 0
        s.peerWnd = p.wnd
        streams.set(keyOf(host, from.port, s.recvId), s)
        s.sendState()
        options.onConnection(s)
        return
      }
      let s = streams.get(keyOf(host, from.port, p.connId))
      // a reset may echo the id we send with rather than the one we receive on
      if (!s && p.type === ST_RESET)
        for (const c of streams.values())
          if (c.remoteAddress === host && c.remotePort === from.port && c.sendId === p.connId) s = c
      if (s) s.incoming(p)
      else if (p.type !== ST_RESET) reset(from, p)
    },

    /** Opens a connection; it emits `connect` once the peer answers, or closes with an error. */
    connect(host: string, port: number): UtpStream {
      if (closed) throw new Error('uTP is closed.')
      let recvId = random16()
      while (streams.has(keyOf(host, port, recvId))) recvId = random16()
      const s = new UtpStream({
        link: linkFor(host, port),
        host,
        port,
        recvId,
        sendId: seqAdd(recvId, 1),
        seqNr: 1,
        ackNr: 0,
        state: 'syn-sent',
      })
      streams.set(keyOf(host, port, recvId), s)
      s.syn()
      return s
    },

    size: () => streams.size,

    /** The socket went: every connection closes. */
    close() {
      if (closed) return
      closed = true
      clearInterval(timer)
      for (const s of [...streams.values()]) {
        s.state = 'closed'
        s.destroy()
      }
      streams.clear()
    },
  }
}
