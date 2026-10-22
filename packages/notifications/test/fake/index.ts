// SPDX-License-Identifier: AGPL-3.0-only
// Fakes for the notification channels, so tests and the dev server never reach the network:
// - a recording fetch that answers every channel's service as its documentation says a success
//   looks, and can be told to answer a 429 with Retry-After, a 5xx or a 4xx instead;
// - a browser's side of web push: a subscription with real P-256 keys, which decrypts what the
//   server sent (RFC 8291's aes128gcm), and a check of the VAPID header (RFC 8292);
// - an SMTP server on 127.0.0.1 (node:net), speaking enough of RFC 5321 for Nodemailer: EHLO,
//   AUTH PLAIN, MAIL, RCPT, DATA, RSET and QUIT, and recording each message, with a reader for
//   its MIME parts (RFC 2045, 2046).
import {
  createDecipheriv,
  createECDH,
  createPublicKey,
  hkdfSync,
  randomBytes,
  verify,
} from 'node:crypto'
import { createServer, type Socket } from 'node:net'
import type { Fetch } from '@highsea/core'

export type FakeRequest = {
  method: string
  url: string
  /** Lower-cased names. */
  headers: Record<string, string>
  body: Uint8Array
  text: string
  json(): unknown
}

export type FakeAnswer = { status: number; retryAfter?: string; body?: unknown }

/** The push service's address the fake subscriptions use. */
export const FAKE_PUSH_ORIGIN = 'https://push.example.net'

function success(url: URL): { status: number; body: unknown } {
  if (url.origin === FAKE_PUSH_ORIGIN) return { status: 201, body: '' }
  if (url.host === 'discord.com') return { status: 204, body: '' }
  if (url.host === 'hooks.slack.com') return { status: 200, body: 'ok' }
  if (url.host === 'api.telegram.org')
    return { status: 200, body: { ok: true, result: { message_id: 1 } } }
  if (url.host === 'api.pushover.net') return { status: 200, body: { status: 1, request: 'fake' } }
  if (url.pathname.includes('/_matrix/client/')) return { status: 200, body: { event_id: '$fake' } }
  if (url.pathname.endsWith('/message')) return { status: 200, body: { id: 1, appid: 1 } }
  return { status: 200, body: {} }
}

export function createFakeNotifications() {
  const requests: FakeRequest[] = []
  const queued: { match: (r: FakeRequest) => boolean; answer: FakeAnswer }[] = []

  const fetch: Fetch = async (input, init) => {
    const request =
      input instanceof Request ? new Request(input, init) : new Request(String(input), init)
    const body = new Uint8Array(await request.arrayBuffer())
    const headers: Record<string, string> = {}
    request.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v
    })
    const text = new TextDecoder().decode(body)
    const recorded: FakeRequest = {
      method: request.method,
      url: request.url,
      headers,
      body,
      text,
      json: () => JSON.parse(text),
    }
    requests.push(recorded)
    const i = queued.findIndex((q) => q.match(recorded))
    const answer = i >= 0 ? queued.splice(i, 1)[0]?.answer : undefined
    const { status, body: out } = answer ?? success(new URL(request.url))
    const respHeaders: Record<string, string> = {}
    if (answer?.retryAfter !== undefined) respHeaders['retry-after'] = answer.retryAfter
    if (typeof out !== 'string') respHeaders['content-type'] = 'application/json'
    return new Response(
      status === 204 ? null : typeof out === 'string' ? out : JSON.stringify(out ?? {}),
      { status, headers: respHeaders },
    )
  }

  return {
    fetch,
    requests,
    /** The next request whose URL contains `match` gets this answer instead of a success. */
    answer(match: string, ...answers: FakeAnswer[]) {
      for (const answer of answers) queued.push({ match: (r) => r.url.includes(match), answer })
    },
    /** Forgets the answers not yet given: every service succeeds again. */
    clearAnswers() {
      queued.length = 0
    },
    /** Requests whose URL contains `match`. */
    to: (match: string) => requests.filter((r) => r.url.includes(match)),
  }
}

export type FakeNotifications = ReturnType<typeof createFakeNotifications>

const concat = (...parts: Uint8Array[]) => Buffer.concat(parts)
const hkdf = (ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, info, length))

/**
 * A browser's push subscription with real keys. `decrypt` undoes RFC 8291's encryption of a
 * request body in the aes128gcm coding (RFC 8188 § 2): salt, record size and the server's key in
 * the header, one record, ending in the 0x02 padding delimiter.
 */
export function createPushSubscriber(path = `/p/${randomBytes(8).toString('hex')}`) {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const uaPublic = ecdh.getPublicKey()
  const authSecret = randomBytes(16)
  return {
    subscription: {
      endpoint: `${FAKE_PUSH_ORIGIN}${path}`,
      keys: { p256dh: uaPublic.toString('base64url'), auth: authSecret.toString('base64url') },
    },
    decrypt(body: Uint8Array): string {
      const salt = body.subarray(0, 16)
      const idlen = body[20] ?? 0
      const asPublic = body.subarray(21, 21 + idlen)
      const record = body.subarray(21 + idlen)
      const ecdhSecret = ecdh.computeSecret(asPublic)
      const keyInfo = concat(Buffer.from('WebPush: info\0'), uaPublic, asPublic)
      const ikm = hkdf(ecdhSecret, authSecret, keyInfo, 32)
      const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
      const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12)
      const decipher = createDecipheriv('aes-128-gcm', cek, nonce)
      decipher.setAuthTag(record.subarray(record.length - 16))
      const plain = concat(
        decipher.update(record.subarray(0, record.length - 16)),
        decipher.final(),
      )
      let end = plain.length - 1
      while (end >= 0 && plain[end] === 0) end--
      if (plain[end] !== 2) throw new Error('The last record doesn’t end with the 0x02 delimiter.')
      return plain.subarray(0, end).toString('utf8')
    },
  }
}

export type VapidCheck = {
  header: Record<string, unknown>
  claims: { aud?: string; exp?: number; sub?: string }
  publicKey: string
}

/**
 * Checks a `vapid t=…, k=…` Authorization header as a push service does (RFC 8292 § 2 and § 3):
 * an ES256 JWT signed by the key in `k`, for `audience` (the push service's origin), expiring
 * within 24 hours of `now`, with a `sub` contact. Throws with the reason when it isn't valid.
 */
export function verifyVapid(
  authorization: string,
  { audience, now }: { audience: string; now: number },
): VapidCheck {
  const m = /^vapid\s+t=([^,\s]+)\s*,\s*k=([A-Za-z0-9_-]+)$/.exec(authorization.trim())
  if (!m?.[1] || !m[2]) throw new Error('Not a vapid Authorization header.')
  const [token, k] = [m[1], m[2]]
  const [h, c, s] = token.split('.')
  if (!h || !c || !s) throw new Error('Not a JWT.')
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as Record<string, unknown>
  if (header.alg !== 'ES256') throw new Error('The JWT isn’t signed with ES256.')
  const point = Buffer.from(k, 'base64url')
  if (point.length !== 65 || point[0] !== 4) throw new Error('k isn’t an uncompressed P-256 key.')
  const key = createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33).toString('base64url'),
    },
    format: 'jwk',
  })
  const ok = verify(
    'sha256',
    Buffer.from(`${h}.${c}`),
    { key, dsaEncoding: 'ieee-p1363' },
    Buffer.from(s, 'base64url'),
  )
  if (!ok) throw new Error('The signature doesn’t match the key.')
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as VapidCheck['claims']
  if (claims.aud !== audience) throw new Error(`The audience is ${claims.aud}, not ${audience}.`)
  const seconds = now / 1000
  if (typeof claims.exp !== 'number' || claims.exp <= seconds)
    throw new Error('The JWT has expired.')
  if (claims.exp > seconds + 24 * 60 * 60) throw new Error('The JWT is valid for over 24 hours.')
  if (!claims.sub || !/^(mailto:|https:)/.test(claims.sub))
    throw new Error('The JWT has no mailto: or https: contact.')
  return { header, claims, publicKey: k }
}

export type FakeMail = { from: string; to: string[]; data: string; user: string | null }

/**
 * An SMTP server on 127.0.0.1 and a free port. With `auth`, AUTH PLAIN must match it. `reply`
 * replaces the answer to the next RCPT or DATA, to test a 4xx or a 5xx.
 */
export async function createFakeSmtp({ auth }: { auth?: { user: string; pass: string } } = {}) {
  const messages: FakeMail[] = []
  const reply: { rcpt?: string; data?: string } = {}
  const sockets = new Set<Socket>()

  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    const send = (line: string) => socket.write(`${line}\r\n`)
    let buffer = ''
    let mode: 'command' | 'data' | 'auth' = 'command'
    let mail: FakeMail = { from: '', to: [], data: '', user: null }
    let user: string | null = null
    const lines: string[] = []

    const plain = (b64: string) => {
      const [, u, p] = Buffer.from(b64, 'base64').toString('utf8').split('\0')
      if (!auth || (u === auth.user && p === auth.pass)) {
        user = u ?? null
        send('235 2.7.0 Authentication successful')
      } else send('535 5.7.8 Authentication credentials invalid')
    }

    const command = (line: string) => {
      const verb = line.split(' ')[0]?.toUpperCase()
      switch (verb) {
        case 'EHLO':
          send('250-fake.smtp')
          send('250-AUTH PLAIN')
          send('250 8BITMIME')
          return
        case 'HELO':
          return send('250 fake.smtp')
        case 'AUTH': {
          const [, mech, initial] = line.split(' ')
          if (mech?.toUpperCase() !== 'PLAIN') return send('504 5.5.4 Unrecognized authentication')
          if (initial) return plain(initial)
          mode = 'auth'
          return send('334 ')
        }
        case 'MAIL':
          if (auth && !user) return send('530 5.7.0 Authentication required')
          mail = { from: /<([^>]*)>/.exec(line)?.[1] ?? '', to: [], data: '', user }
          return send('250 2.1.0 Ok')
        case 'RCPT': {
          if (reply.rcpt) {
            const r = reply.rcpt
            reply.rcpt = undefined
            return send(r)
          }
          mail.to.push(/<([^>]*)>/.exec(line)?.[1] ?? '')
          return send('250 2.1.5 Ok')
        }
        case 'DATA':
          mode = 'data'
          lines.length = 0
          return send('354 End data with <CR><LF>.<CR><LF>')
        case 'RSET':
          mail = { from: '', to: [], data: '', user }
          return send('250 2.0.0 Ok')
        case 'NOOP':
          return send('250 2.0.0 Ok')
        case 'QUIT':
          send('221 2.0.0 Bye')
          socket.end()
          return
        default:
          return send('502 5.5.2 Command not recognized')
      }
    }

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let at = buffer.indexOf('\r\n')
      while (at >= 0) {
        const line = buffer.slice(0, at)
        buffer = buffer.slice(at + 2)
        if (mode === 'auth') {
          mode = 'command'
          plain(line)
        } else if (mode === 'data') {
          if (line === '.') {
            mode = 'command'
            if (reply.data) {
              const r = reply.data
              reply.data = undefined
              send(r)
            } else {
              messages.push({ ...mail, data: lines.join('\r\n') })
              send('250 2.0.0 Ok: queued')
            }
          } else lines.push(line.startsWith('..') ? line.slice(1) : line)
        } else command(line)
        at = buffer.indexOf('\r\n')
      }
    })
    send('220 fake.smtp ESMTP')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    host: '127.0.0.1',
    port,
    messages,
    reply,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy()
        server.close(() => resolve())
      }),
  }
}

export type FakeSmtp = Awaited<ReturnType<typeof createFakeSmtp>>

/** One leaf of a message: its type, its Content-ID without the brackets, and its body decoded. */
export type MailPart = {
  type: string
  contentId: string | null
  disposition: string | null
  body: Buffer
  text: string
}

/** A recorded message's headers, the multipart types it nests, and its leaves. */
export type ReadMail = { headers: Record<string, string>; multiparts: string[]; parts: MailPart[] }

function headersOf(head: string): Record<string, string> {
  const headers: Record<string, string> = {}
  // folded lines continue with whitespace (RFC 5322 § 2.2.3)
  for (const line of head.replace(/\r\n[ \t]+/g, ' ').split('\r\n')) {
    const at = line.indexOf(':')
    if (at > 0) headers[line.slice(0, at).trim().toLowerCase()] = line.slice(at + 1).trim()
  }
  return headers
}

function decode(body: string, encoding: string | undefined): Buffer {
  switch (encoding?.toLowerCase()) {
    case 'base64':
      return Buffer.from(body.replace(/\s+/g, ''), 'base64')
    case 'quoted-printable': {
      const soft = body.replace(/=\r\n/g, '')
      const bytes: number[] = []
      for (let i = 0; i < soft.length; i++) {
        const hex = soft[i] === '=' ? soft.slice(i + 1, i + 3) : ''
        if (/^[0-9A-F]{2}$/i.test(hex)) {
          bytes.push(Number.parseInt(hex, 16))
          i += 2
        } else bytes.push(...Buffer.from(soft[i] ?? '', 'utf8'))
      }
      return Buffer.from(bytes)
    }
    default:
      return Buffer.from(body, 'utf8')
  }
}

/** Splits a recorded message into its MIME parts, as a mail client would read it. */
export function readMail(data: string): ReadMail {
  const multiparts: string[] = []
  const parts: MailPart[] = []
  const walk = (entity: string): Record<string, string> => {
    const split = entity.indexOf('\r\n\r\n')
    const headers = headersOf(split < 0 ? entity : entity.slice(0, split))
    const body = split < 0 ? '' : entity.slice(split + 4)
    const type = headers['content-type'] ?? 'text/plain'
    const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1]
    if (type.toLowerCase().startsWith('multipart/') && boundary) {
      multiparts.push(type.split(';')[0]?.trim().toLowerCase() ?? '')
      const sections = body.split(`--${boundary}`).slice(1)
      for (const section of sections) {
        if (section.startsWith('--')) break
        walk(section.replace(/^\r\n/, '').replace(/\r\n$/, ''))
      }
    } else {
      const decoded = decode(body, headers['content-transfer-encoding'])
      parts.push({
        type: type.split(';')[0]?.trim().toLowerCase() ?? '',
        contentId: headers['content-id']?.replace(/^<|>$/g, '') ?? null,
        disposition: headers['content-disposition']?.split(';')[0]?.trim() ?? null,
        body: decoded,
        text: decoded.toString('utf8'),
      })
    }
    return headers
  }
  const headers = walk(data)
  return { headers, multiparts, parts }
}
