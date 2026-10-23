// SPDX-License-Identifier: AGPL-3.0-only
// One UDP socket per address family carries both the DHT and uTP, on the listening port, as
// libtorrent does. Each datagram goes to uTP or to the DHT by its first bytes, the test libtorrent
// applies (src/session_impl.cpp, `on_udp_packet`, and src/utp_socket_manager.cpp,
// `incoming_packet`, at RC_2_0): a uTP packet is at least 20 bytes with version 1 in the low nibble
// of its first byte and a type from 0 to 4 in the high nibble (BEP 29's header); a DHT message is
// a bencoded dictionary (BEP 5), so it starts with `d` and ends with `e`. `d` is 0x64, whose low
// nibble is 4, so the two never overlap. Anything else is dropped.
import type dgram from 'node:dgram'
import { EventEmitter } from 'node:events'

export type UdpSend = (data: Uint8Array, port: number, host: string) => void
export type UdpInfo = { address: string; port: number }

/** BEP 29's header test: 20 bytes or more, version 1, a known type. */
export function isUtpPacket(buf: Uint8Array): boolean {
  if (buf.length < 20) return false
  const first = buf[0] as number
  return (first & 0x0f) === 1 && first >> 4 <= 4
}

/** BEP 5's messages are bencoded dictionaries. */
export function isKrpcMessage(buf: Uint8Array): boolean {
  return buf.length > 1 && buf[0] === 0x64 && buf[buf.length - 1] === 0x65
}

/**
 * What `k-rpc-socket` needs from a socket (k-rpc-socket 1.11.1, index.js: `opts.socket`, then
 * `on('message' | 'error' | 'listening')`, `send(buf, offset, length, port, host, cb)`,
 * `address()` and `close()`): the DHT's view of the shared socket. Closing it only detaches the DHT.
 */
export class KrpcSocket extends EventEmitter {
  closed = false
  readonly sendTo: UdpSend
  readonly addressOf: () => { address: string; family: string; port: number }

  constructor(sendTo: UdpSend, addressOf: () => { address: string; family: string; port: number }) {
    super()
    this.sendTo = sendTo
    this.addressOf = addressOf
  }

  send(
    buf: Uint8Array,
    offset: number,
    length: number,
    port: number,
    host: string,
    cb?: (err: Error | null) => void,
  ) {
    try {
      this.sendTo(buf.subarray(offset, offset + length), port, host)
      cb?.(null)
    } catch (e) {
      cb?.(e as Error)
    }
  }

  address() {
    return this.addressOf()
  }

  bind() {}

  close() {
    if (this.closed) return
    this.closed = true
    queueMicrotask(() => this.emit('close'))
  }
}

export type UdpMux = ReturnType<typeof createUdpMux>

/**
 * Splits one bound UDP socket between uTP and the DHT. `wrap` lets a test put a lossy link in the
 * way of every datagram sent (test/utp.test.ts); the engine passes it through untouched.
 */
export function createUdpMux(socket: dgram.Socket, wrap?: (send: UdpSend) => UdpSend) {
  let closed = false
  const raw: UdpSend = (data, port, host) => {
    if (closed) return
    socket.send(data, port, host, () => {})
  }
  const send = wrap ? wrap(raw) : raw
  let utp: ((buf: Buffer, from: UdpInfo) => void) | null = null
  let krpc: KrpcSocket | null = null
  const onClose: (() => void)[] = []

  socket.on('message', (buf, rinfo) => {
    if (!rinfo.port) return
    if (isUtpPacket(buf)) utp?.(buf, rinfo)
    else if (isKrpcMessage(buf) && krpc && !krpc.closed) krpc.emit('message', buf, rinfo)
  })
  socket.on('error', (err) => {
    // an ICMP error on one send isn't the socket's end; the DHT logs it as a warning
    if (krpc?.listenerCount('error')) krpc.emit('error', err)
  })
  socket.once('close', () => {
    closed = true
    krpc?.close()
    for (const f of onClose.splice(0)) f()
  })

  return {
    send,
    port: () => socket.address().port,
    /** The DHT's socket. */
    krpc(): KrpcSocket {
      krpc = new KrpcSocket(send, () => socket.address())
      return krpc
    },
    /** Where uTP packets go. */
    onUtp(handler: (buf: Buffer, from: UdpInfo) => void) {
      utp = handler
    },
    onClose(f: () => void) {
      if (closed) f()
      else onClose.push(f)
    },
    closed: () => closed,
  }
}
