// SPDX-License-Identifier: AGPL-3.0-only
// Fakes for highsea connects, so its tests run nothing and reach nothing:
// - a runner that records each `ip` and `wg` command and keeps just enough kernel state to answer
//   (the rule, the unreachable route, the interface, the handshake);
// - PIA's API, answering in the shapes pia-foss/manual-connections reads;
// - a NAT-PMP gateway on 127.0.0.1, answering as RFC 6886 § 3.3 describes.
import dgram from 'node:dgram'
import type { AddressInfo } from 'node:net'
import type { Command, Runner, RunResult } from '../../src/commands.ts'
import type { PiaRequest, PiaResponse, PiaTransport } from '../../src/pia.ts'

export type FakeKernel = {
  link: boolean
  rule: boolean
  unreachable: boolean
  /** Seconds since the epoch of the peer's latest handshake; 0 for none. */
  handshake: number
  /** The peer key `wg show` lists. */
  peerKey: string
}

/** `ip` and `wg`, faked. `fail` makes the next command matching a pattern fail with stderr. */
export function createFakeWireGuard(initial: Partial<FakeKernel> = {}) {
  const kernel: FakeKernel = {
    link: false,
    rule: false,
    unreachable: false,
    handshake: 0,
    peerKey: Buffer.alloc(32, 2).toString('base64'),
    ...initial,
  }
  let ruleFrom = ''
  const commands: Command[] = []
  const failures: { match: RegExp; stderr: string; times: number }[] = []
  const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' })
  const line = (c: Command) => `${c.program} ${c.args.join(' ')}`

  const runner: Runner = async (c) => {
    commands.push(c)
    const text = line(c)
    const f = failures.find((x) => x.match.test(text) && x.times > 0)
    if (f) {
      f.times--
      return { code: 1, stdout: '', stderr: f.stderr }
    }
    const a = c.args
    if (c.program === 'wireguard-go') {
      kernel.link = true
      return ok()
    }
    if (c.program === 'wg') {
      if (!kernel.link)
        return { code: 1, stdout: '', stderr: 'Unable to access interface: No such device' }
      if (a[0] === 'show') return ok(`${kernel.peerKey}\t${kernel.handshake}\n`)
      return ok()
    }
    if (a[0] === 'link' && a[1] === 'add') {
      if (kernel.link) return { code: 2, stdout: '', stderr: 'RTNETLINK answers: File exists' }
      kernel.link = true
      return ok()
    }
    if (a[0] === 'link' && a[1] === 'del') {
      if (!kernel.link) return { code: 1, stdout: '', stderr: 'Cannot find device "hswg0"' }
      kernel.link = false
      kernel.handshake = 0
      return ok()
    }
    const family = a[0]
    const rest = a.slice(1)
    if (rest[0] === 'rule' && rest[1] === 'add') {
      if (family === '-4') {
        kernel.rule = true
        ruleFrom = rest[3] ?? ''
      }
      return ok()
    }
    if (rest[0] === 'rule' && rest[1] === 'del') {
      if (family === '-4' && !kernel.rule)
        return { code: 2, stdout: '', stderr: 'RTNETLINK answers: No such file or directory' }
      if (family === '-4') kernel.rule = false
      return ok()
    }
    if (rest[0] === 'rule' && rest[1] === 'show')
      return ok(
        `0:\tfrom all lookup local\n${kernel.rule && family === '-4' ? `10821:\tfrom ${ruleFrom} lookup 51821\n` : ''}32766:\tfrom all lookup main\n`,
      )
    if (rest[0] === 'route' && rest[1] === 'add' && rest[2] === 'unreachable') {
      if (family === '-4') kernel.unreachable = true
      return ok()
    }
    if (rest[0] === 'route' && rest[1] === 'flush') {
      if (family === '-4') kernel.unreachable = false
      return ok()
    }
    if (rest[0] === 'route' && rest[1] === 'show')
      return ok(
        kernel.unreachable && family === '-4'
          ? `0.0.0.0/0 dev hswg0 scope link\nunreachable default metric 4278198272\n`
          : '',
      )
    return ok()
  }

  return {
    runner,
    kernel,
    commands,
    lines: () => commands.map(line),
    /** The next `times` commands matching `match` fail with `stderr`. */
    fail(match: RegExp, stderr: string, times = 1) {
      failures.push({ match, stderr, times })
    },
  }
}

export type FakePiaState = {
  username: string
  password: string
  /** The port getSignature hands out, and when it expires. */
  port: number
  expiresAt: string
  serverKey: string
  binds: number
  signatures: number
  tokens: number
  /** Answer every request by throwing, as if PIA were out of reach. */
  down: boolean
}

/** PIA's API, in the shapes manual-connections' scripts read. */
export function createFakePia(initial: Partial<FakePiaState> = {}) {
  const state: FakePiaState = {
    username: 'p1234567',
    password: 'correct horse',
    port: 47123,
    expiresAt: '2027-01-01T00:00:00.000Z',
    serverKey: Buffer.alloc(32, 9).toString('base64'),
    binds: 0,
    signatures: 0,
    tokens: 0,
    down: false,
    ...initial,
  }
  const requests: PiaRequest[] = []
  const json = (status: number, body: unknown): PiaResponse => ({
    status,
    body: JSON.stringify(body),
  })
  const transport: PiaTransport = async (r) => {
    requests.push(r)
    if (state.down) throw new Error('connect ETIMEDOUT')
    const url = new URL(r.url)
    if (url.hostname === 'www.privateinternetaccess.com') {
      if (r.form?.username !== state.username || r.form?.password !== state.password)
        return json(401, { message: 'Unauthorized' })
      state.tokens++
      return json(200, { token: `token-${state.tokens}` })
    }
    if (url.hostname === 'serverlist.piaservers.net')
      return {
        status: 200,
        body: `${JSON.stringify({
          groups: {},
          regions: [
            {
              id: 'nl_amsterdam',
              name: 'Netherlands',
              port_forward: true,
              servers: { wg: [{ ip: '203.0.113.10', cn: 'amsterdam401' }] },
            },
            {
              id: 'us_east',
              name: 'US East',
              port_forward: false,
              servers: { wg: [{ ip: '203.0.113.20', cn: 'newjersey402' }] },
            },
          ],
        })}\n\nsignature-not-checked`,
      }
    if (url.port === '1337' && url.pathname === '/addKey') {
      if (!url.searchParams.get('pt')?.startsWith('token-')) return json(200, { status: 'ERROR' })
      return json(200, {
        status: 'OK',
        server_key: state.serverKey,
        server_port: 1337,
        server_ip: r.connectTo,
        peer_ip: '10.13.128.7',
        dns_servers: ['10.0.0.243', '10.0.0.242'],
      })
    }
    if (url.port === '19999' && url.pathname === '/getSignature') {
      state.signatures++
      const payload = Buffer.from(
        JSON.stringify({ token: 'pf', port: state.port, expires_at: state.expiresAt }),
      ).toString('base64')
      return json(200, { status: 'OK', payload, signature: 'sig' })
    }
    if (url.port === '19999' && url.pathname === '/bindPort') {
      state.binds++
      return json(200, { status: 'OK', message: 'port scheduled for add' })
    }
    return json(404, {})
  }
  return { transport, state, requests }
}

/** A NAT-PMP gateway on 127.0.0.1: maps each request to `externalPort` unless told otherwise. */
export async function startFakeNatPmp(
  options: { externalPort?: number; result?: number; dropFirst?: number } = {},
) {
  const socket = dgram.createSocket('udp4')
  const requests: Buffer[] = []
  let drop = options.dropFirst ?? 0
  const started = Date.now()
  socket.on('message', (msg, from) => {
    requests.push(msg)
    if (drop > 0) {
      drop--
      return
    }
    const op = msg[1] ?? 0
    const epoch = Math.floor((Date.now() - started) / 1000)
    if (op === 0) {
      const a = Buffer.from([0, 128, 0, 0, 0, 0, 0, 0, 198, 51, 100, 9])
      a.writeUInt32BE(epoch, 4)
      return socket.send(a, from.port, from.address)
    }
    const a = Buffer.alloc(16)
    a.writeUInt8(0, 0)
    a.writeUInt8(128 + op, 1)
    a.writeUInt16BE(options.result ?? 0, 2)
    a.writeUInt32BE(epoch, 4)
    a.writeUInt16BE(msg.readUInt16BE(4), 8)
    const suggested = msg.readUInt16BE(6)
    a.writeUInt16BE(suggested || options.externalPort || 53186, 10)
    a.writeUInt32BE(msg.readUInt32BE(8), 12)
    socket.send(a, from.port, from.address)
  })
  await new Promise<void>((r) => socket.bind(0, '127.0.0.1', r))
  return {
    port: (socket.address() as AddressInfo).port,
    requests,
    close: () => new Promise<void>((r) => socket.close(() => r())),
  }
}
