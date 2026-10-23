// SPDX-License-Identifier: AGPL-3.0-only
// The one place highsea runs `ip`, `wg` and `wireguard-go` (docs/plans/phase-3-checkpoint-6.md ›
// highsea connects, judgement call 18). Each operation is a function from typed values to a
// program and its arguments; every value is checked before a command is built, and a value that
// doesn't fit is refused with `CommandRefused` before anything runs. Programs run as separate
// processes with an argument array, never through a shell (Node: child_process.spawn with
// `shell: false`, https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processspawncommand-args-options).
// Keys never reach an argument list, which any process can read in /proc/{pid}/cmdline: wg(8)'s
// `private-key` and `preshared-key` take a file path. A command names it /dev/stdin and carries the
// key in `stdin`; `spawnRunner` writes the key to a file only highsea can read and passes that path
// instead. /dev/stdin itself can't work: Node's stdio pipes are socketpairs (libuv's
// uv__process_init_stdio calls uv_socketpair), and opening a socket through /dev/stdin fails with
// ENXIO (open(2): "The file is a UNIX domain socket"). wg-quick hands wg a real pipe, `<(echo …)`,
// which Node can't make.
//
// The commands, from the manual pages:
// - ip-link(8): `ip link add dev hswg0 type wireguard`, `ip link set dev hswg0 mtu N up`,
//   `ip link del dev hswg0`;
// - ip-address(8): `ip -4|-6 address add CIDR dev hswg0`;
// - ip-route(8): `ip -4|-6 route add CIDR dev hswg0 table T`,
//   `ip -4|-6 route add unreachable default table T metric M`, `ip -4|-6 route flush table T`,
//   `ip -4|-6 route show table T`;
// - ip-rule(8): `ip -4|-6 rule add from ADDRESS table T priority P`,
//   `ip -4|-6 rule del priority P`, `ip -4|-6 rule show`;
// - wg(8): `wg set hswg0 private-key FILE`, `wg set hswg0 peer KEY [preshared-key FILE]
//   [endpoint HOST:PORT] allowed-ips LIST persistent-keepalive N`, `wg show hswg0 latest-handshakes`;
// - wireguard-go: `wireguard-go hswg0`, which creates the interface on /dev/net/tun and runs in the
//   background (https://git.zx2c4.com/wireguard-go/about/).
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isWireGuardKey } from './wireguard.ts'

/** highsea's own interface: under IFNAMSIZ, and named apart from wg-quick's `wg0`. */
export const TUNNEL_INTERFACE = 'hswg0'
/** The routing table holding only the tunnel (WireGuard › Rule-based routing). */
export const TUNNEL_TABLE = 51821
/** The rule's priority: before the main table's 32766 (ip-rule(8)). */
export const TUNNEL_RULE_PRIORITY = 10821
/** The unreachable default's metric: after any route through the tunnel. */
export const UNREACHABLE_METRIC = 4_278_198_272
/** wg(8)'s keepalive, which keeps the handshake fresh (the plan: 25 seconds). */
export const KEEPALIVE_SECONDS = 25

export type Program = 'ip' | 'wg' | 'wireguard-go'
export type Family = 4 | 6

export type Command = {
  program: Program
  args: string[]
  /** A key for the argument /dev/stdin, which the runner hands over in a private file. */
  stdin?: string
  /** What it does, for the log. Never carries a key. */
  op: string
}

export type RunResult = { code: number; stdout: string; stderr: string }

/** Runs one command. The default spawns it; tests pass a fake that records it. */
export type Runner = (command: Command) => Promise<RunResult>

/** A value that can't go into a command. Nothing has run. */
export class CommandRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommandRefused'
  }
}

export type FailureKind =
  | 'permission'
  | 'unsupported'
  | 'exists'
  | 'missing'
  | 'not-installed'
  | 'platform'
  | 'other'

/** A command that ran and failed, or couldn't start. */
export class CommandFailed extends Error {
  readonly kind: FailureKind
  readonly op: string
  readonly stderr: string
  constructor(op: string, kind: FailureKind, stderr: string) {
    super(`${op} failed${stderr ? `: ${stderr.trim().split('\n')[0]}` : ''}`)
    this.name = 'CommandFailed'
    this.op = op
    this.kind = kind
    this.stderr = stderr
  }
}

/** What a failure means, from iproute2's and wg's messages (they print errno's text). */
export function failureKind(stderr: string): FailureKind {
  if (/Operation not permitted|Permission denied/i.test(stderr)) return 'permission'
  if (
    /Unknown device type|Operation not supported|Not supported|Protocol not supported/i.test(stderr)
  )
    return 'unsupported'
  if (/File exists/i.test(stderr)) return 'exists'
  if (/Cannot find device|No such device|No such file or directory|No such process/i.test(stderr))
    return 'missing'
  return 'other'
}

// ---------------------------------------------------------------- checking values

const refuse = (what: string, value: unknown): never => {
  throw new CommandRefused(`${what} isn’t valid: ${JSON.stringify(String(value)).slice(0, 80)}`)
}

/** An address with its prefix, of the family it claims. */
export function cidrArg(value: string): { cidr: string; family: Family; address: string } {
  const [address, prefix, ...rest] = value.split('/')
  const family = isIP(address ?? '')
  if ((family !== 4 && family !== 6) || rest.length || prefix === undefined)
    return refuse('An address', value)
  if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128))
    return refuse('An address', value)
  return { cidr: `${address}/${Number(prefix)}`, family, address: address as string }
}

function addressArg(value: string): { address: string; family: Family } {
  const family = isIP(value)
  if (family !== 4 && family !== 6) return refuse('An address', value)
  return { address: value, family }
}

function keyArg(value: string): string {
  if (!isWireGuardKey(value)) return refuse('A key', '…')
  return value
}

/** An IP address or a hostname (RFC 1123 labels): never something that reads as an option. */
const HOSTNAME =
  /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/

function endpointArg(host: string, port: number): string {
  const family = isIP(host)
  if (!family && !HOSTNAME.test(host)) return refuse('An endpoint', host)
  return `${family === 6 ? `[${host}]` : host}:${intArg('A port', port, 1, 65_535)}`
}

function intArg(what: string, value: number, min: number, max: number): string {
  if (!Number.isInteger(value) || value < min || value > max) return refuse(what, value)
  return String(value)
}

const familyFlag = (family: Family) => (family === 4 ? '-4' : '-6')

/** Whether a string holds a C0 control character or DEL (NUL and newlines among them). */
function hasControl(s: string) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return true
  }
  return false
}

/** The last guard: no argument may hold a control character or start with a dash unless meant. */
function command(program: Program, args: string[], op: string, stdin?: string): Command {
  for (const a of args)
    if (!a || hasControl(a) || (a.startsWith('-') && !/^-[46]$/.test(a))) refuse('An argument', a)
  return stdin === undefined ? { program, args, op } : { program, args, op, stdin }
}

// ---------------------------------------------------------------- the operations

const DEV = ['dev', TUNNEL_INTERFACE]
const TABLE = ['table', String(TUNNEL_TABLE)]

export const ops = {
  /** Kernel WireGuard (Linux 5.6 and later, WireGuard › Installation). */
  linkAddKernel: () =>
    command('ip', ['link', 'add', ...DEV, 'type', 'wireguard'], 'add the WireGuard interface'),
  /** The userspace fallback, on /dev/net/tun. */
  linkAddUserspace: () => command('wireguard-go', [TUNNEL_INTERFACE], 'start wireguard-go'),
  linkDelete: () => command('ip', ['link', 'del', ...DEV], 'remove the WireGuard interface'),
  addressAdd(value: string) {
    const { cidr, family } = cidrArg(value)
    return command('ip', [familyFlag(family), 'address', 'add', cidr, ...DEV], 'add an address')
  },
  linkUp(mtu: number) {
    return command(
      'ip',
      ['link', 'set', ...DEV, 'mtu', intArg('The MTU', mtu, 576, 65_535), 'up'],
      'bring the interface up',
    )
  },
  privateKey(key: string) {
    return command(
      'wg',
      ['set', TUNNEL_INTERFACE, 'private-key', '/dev/stdin'],
      'set the private key',
      `${keyArg(key)}\n`,
    )
  },
  peer(peer: {
    publicKey: string
    presharedKey: string | null
    endpoint: { host: string; port: number } | null
    allowedIps: string[]
    keepalive: number
  }) {
    const allowed = peer.allowedIps.map((a) => cidrArg(a).cidr)
    if (!allowed.length) refuse('Allowed IPs', '')
    const args = ['set', TUNNEL_INTERFACE, 'peer', keyArg(peer.publicKey)]
    if (peer.presharedKey !== null) {
      keyArg(peer.presharedKey)
      args.push('preshared-key', '/dev/stdin')
    }
    if (peer.endpoint) args.push('endpoint', endpointArg(peer.endpoint.host, peer.endpoint.port))
    args.push(
      'allowed-ips',
      allowed.join(','),
      'persistent-keepalive',
      intArg('The keepalive', peer.keepalive, 1, 65_535),
    )
    return command(
      'wg',
      args,
      'add a peer',
      peer.presharedKey !== null ? `${peer.presharedKey}\n` : undefined,
    )
  },
  routeAdd(value: string) {
    const { cidr, family } = cidrArg(value)
    return command(
      'ip',
      [familyFlag(family), 'route', 'add', cidr, ...DEV, ...TABLE],
      'route through the tunnel',
    )
  },
  /** The table's last route: with the tunnel gone, a send fails instead of using the main table. */
  routeUnreachable(family: Family) {
    return command(
      'ip',
      [
        familyFlag(family),
        'route',
        'add',
        'unreachable',
        'default',
        ...TABLE,
        'metric',
        String(UNREACHABLE_METRIC),
      ],
      'add the unreachable default',
    )
  },
  routeFlush: (family: Family) =>
    command('ip', [familyFlag(family), 'route', 'flush', ...TABLE], 'clear the tunnel’s table'),
  routeShow: (family: Family) =>
    command('ip', [familyFlag(family), 'route', 'show', ...TABLE], 'read the tunnel’s table'),
  ruleAdd(value: string) {
    const { address, family } = addressArg(value)
    return command(
      'ip',
      [
        familyFlag(family),
        'rule',
        'add',
        'from',
        address,
        ...TABLE,
        'priority',
        String(TUNNEL_RULE_PRIORITY),
      ],
      'add the routing rule',
    )
  },
  ruleDelete: (family: Family) =>
    command(
      'ip',
      [familyFlag(family), 'rule', 'del', 'priority', String(TUNNEL_RULE_PRIORITY)],
      'remove the routing rule',
    ),
  ruleShow: (family: Family) =>
    command('ip', [familyFlag(family), 'rule', 'show'], 'read the routing rules'),
  handshakes: () =>
    command('wg', ['show', TUNNEL_INTERFACE, 'latest-handshakes'], 'read the handshakes'),
}

// ---------------------------------------------------------------- running

/**
 * Spawns each command without a shell. Only on Linux: anywhere else highsea connects isn't
 * available, and nothing is run (so a Mac's Homebrew `ip` is never touched).
 */
/**
 * Writes a key where only highsea can read it, for the moment one command runs: a folder made by
 * mkdtemp (mode 0700) on tmpfs when there is one (/dev/shm), so the key stays in memory, and a file
 * of mode 0600 inside it. The returned function removes both.
 */
function keyFile(key: string): { path: string; remove: () => void } {
  const dir = mkdtempSync(join(existsSync('/dev/shm') ? '/dev/shm' : tmpdir(), 'highsea-wg-'))
  const path = join(dir, 'key')
  writeFileSync(path, key, { mode: 0o600, flag: 'wx' })
  return { path, remove: () => rmSync(dir, { recursive: true, force: true }) }
}

export function spawnRunner(timeoutMs = 15_000): Runner {
  return (cmd) =>
    new Promise((resolve, reject) => {
      if (process.platform !== 'linux')
        return reject(new CommandFailed(cmd.op, 'platform', 'highsea connects runs on Linux.'))
      const key = cmd.stdin === undefined ? null : keyFile(cmd.stdin)
      const args = key ? cmd.args.map((a) => (a === '/dev/stdin' ? key.path : a)) : cmd.args
      // a clean environment: only PATH, and the C locale so stderr is the English we match on.
      // Partial, because Next's types make NODE_ENV a required key of ProcessEnv
      const env: Partial<NodeJS.ProcessEnv> = {
        PATH: process.env.PATH ?? '/usr/sbin:/usr/bin:/sbin:/bin',
        LC_ALL: 'C',
      }
      const child = spawn(cmd.program, args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: timeoutMs,
        env: env as NodeJS.ProcessEnv,
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (c: Buffer) => {
        stdout += c.toString('utf8')
      })
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString('utf8')
      })
      child.on('error', (e: NodeJS.ErrnoException) => {
        key?.remove()
        reject(
          new CommandFailed(cmd.op, e.code === 'ENOENT' ? 'not-installed' : 'other', e.message),
        )
      })
      child.on('close', (code) => {
        key?.remove()
        resolve({ code: code ?? 1, stdout, stderr })
      })
      child.stdin.end()
    })
}

/** Runs a command and throws `CommandFailed` when it exits with an error. */
export async function run(runner: Runner, cmd: Command): Promise<string> {
  const result = await runner(cmd)
  if (result.code !== 0) throw new CommandFailed(cmd.op, failureKind(result.stderr), result.stderr)
  return result.stdout
}
