// SPDX-License-Identifier: AGPL-3.0-only
// NAT-PMP, RFC 6886 (https://www.rfc-editor.org/rfc/rfc6886), for providers that forward a port
// this way (Proton VPN: https://protonvpn.com/support/port-forwarding-manual-setup, gateway
// 10.2.0.1). Written here rather than taken from a library (judgement call 15): the request must
// leave from the tunnel's address so the kernel's rule sends it through the tunnel, and the library
// that fits otherwise (@achingbrain/nat-port-mapper) binds its socket to every address.
//
// From the RFC:
// - requests go to the gateway's UDP port 5351 (§ 3.1);
// - a mapping request is version 0, opcode 1 (UDP) or 2 (TCP), two reserved bytes, the internal
//   port, the suggested external port and the lifetime in seconds (§ 3.3);
// - the answer is version 0, opcode 128 plus the request's, a result code, the seconds since the
//   gateway's epoch, the internal port, the mapped external port and the lifetime (§ 3.3);
// - result codes: 0 success, 1 unsupported version, 2 refused, 3 network failure, 4 out of
//   resources, 5 unsupported opcode (§ 3.5);
// - the client sends again after 250 ms, doubling the wait each time, up to 9 tries (§ 3.1);
// - a mapping is renewed before it expires; the RFC suggests half its lifetime (§ 3.3).
import dgram from 'node:dgram'

export const NATPMP_PORT = 5351

export const natPmpResults: Record<number, string> = {
  1: 'it doesn’t speak this version of NAT-PMP',
  2: 'it refused',
  3: 'its network failed',
  4: 'it has no ports left',
  5: 'it doesn’t support that request',
}

export class NatPmpError extends Error {
  readonly result: number | null
  constructor(message: string, result: number | null = null) {
    super(message)
    this.name = 'NatPmpError'
    this.result = result
  }
}

export type NatPmpOptions = {
  gateway: string
  /** The tunnel's address: the request leaves from it, so it goes through the tunnel. */
  localAddress: string
  /** 5351; tests point it at a fake. */
  port?: number
  /** The first wait before sending again (the RFC's 250 ms). */
  initialMs?: number
  /** How many times to send (the RFC's 9). */
  tries?: number
}

export type Mapping = { externalPort: number; lifetime: number; epoch: number }

/** Sends one request and waits for the answer to that opcode, sending again as § 3.1 says. */
function exchange(options: NatPmpOptions, request: Buffer, op: number): Promise<Buffer> {
  const port = options.port ?? NATPMP_PORT
  const tries = options.tries ?? 9
  let wait = options.initialMs ?? 250
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    let timer: ReturnType<typeof setTimeout> | null = null
    let sent = 0
    const done = (error: Error | null, answer?: Buffer) => {
      if (timer) clearTimeout(timer)
      socket.close()
      if (error) reject(error)
      else resolve(answer as Buffer)
    }
    const send = () => {
      if (sent >= tries)
        return done(new NatPmpError(`The gateway at ${options.gateway} didn’t answer.`))
      sent++
      socket.send(request, port, options.gateway)
      timer = setTimeout(send, wait)
      wait *= 2
    }
    socket.on('error', (e) => done(e))
    socket.on('message', (msg, from) => {
      // only the gateway's answer to this request counts (§ 3.1: from the gateway's address and port)
      if (from.address !== options.gateway || from.port !== port) return
      if (msg.length < 8 || msg[0] !== 0 || msg[1] !== 128 + op) return
      const result = msg.readUInt16BE(2)
      if (result !== 0)
        return done(
          new NatPmpError(
            `The gateway at ${options.gateway} didn’t map the port: ${natPmpResults[result] ?? `result ${result}`}.`,
            result,
          ),
        )
      done(null, msg)
    })
    socket.bind({ address: options.localAddress, port: 0 }, send)
  })
}

/** The gateway's external address (§ 3.2). */
export async function natPmpExternalAddress(options: NatPmpOptions): Promise<string> {
  const answer = await exchange(options, Buffer.from([0, 0]), 0)
  if (answer.length < 12) throw new NatPmpError('The gateway’s answer was too short.')
  return [...answer.subarray(8, 12)].join('.')
}

/** Asks for a mapping, or renews one by suggesting its external port again (§ 3.3). */
export async function natPmpMap(
  options: NatPmpOptions,
  mapping: {
    protocol: 'udp' | 'tcp'
    internalPort: number
    externalPort: number
    lifetime: number
  },
): Promise<Mapping> {
  const op = mapping.protocol === 'udp' ? 1 : 2
  const request = Buffer.alloc(12)
  request.writeUInt8(0, 0)
  request.writeUInt8(op, 1)
  request.writeUInt16BE(0, 2)
  request.writeUInt16BE(mapping.internalPort, 4)
  request.writeUInt16BE(mapping.externalPort, 6)
  request.writeUInt32BE(mapping.lifetime, 8)
  const answer = await exchange(options, request, op)
  if (answer.length < 16) throw new NatPmpError('The gateway’s answer was too short.')
  const externalPort = answer.readUInt16BE(10)
  if (externalPort === 0) throw new NatPmpError('The gateway mapped no port.')
  return { epoch: answer.readUInt32BE(4), externalPort, lifetime: answer.readUInt32BE(12) }
}

/**
 * Proton's documented mapping: UDP and TCP, internal port 1 and no suggestion, so the gateway picks
 * the public port, which the client then listens on (`natpmpc -a 1 0 udp 60` and `… tcp 60`).
 * Renewing passes the port it got.
 */
export async function forwardWithNatPmp(
  options: NatPmpOptions,
  lifetime: number,
  current: number | null,
): Promise<Mapping> {
  const udp = await natPmpMap(options, {
    protocol: 'udp',
    internalPort: 1,
    externalPort: current ?? 0,
    lifetime,
  })
  await natPmpMap(options, {
    protocol: 'tcp',
    internalPort: 1,
    externalPort: udp.externalPort,
    lifetime,
  })
  return udp
}
