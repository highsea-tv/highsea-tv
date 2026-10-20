// SPDX-License-Identifier: AGPL-3.0-only
// A software authenticator for tests: a P-256 key, "none" attestation, user presence and
// verification flags. It builds what a browser's navigator.credentials returns, per WebAuthn L3
// § 6.1 (authenticator data), § 6.5.4 (attestation object) and § 6.3.3 (assertion signature),
// with COSE keys as RFC 9053 § 7.1.1 describes them.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'

type Cbor = number | string | Uint8Array | Cbor[] | Map<Cbor, Cbor> | { [k: string]: Cbor }

/** The subset of CBOR (RFC 8949) that WebAuthn structures use. */
function cbor(value: Cbor): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 256) return Buffer.from([(major << 5) | 24, n])
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
    const b = Buffer.alloc(5)
    b[0] = (major << 5) | 26
    b.writeUInt32BE(n, 1)
    return b
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') {
    const s = Buffer.from(value, 'utf8')
    return Buffer.concat([head(3, s.length), s])
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value])
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)])
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value)
  return Buffer.concat([
    head(5, entries.length),
    ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ])
}

const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url')
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest()

const UP = 0x01
const UV = 0x04
const AT = 0x40

export function createAuthenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' })
  const credentialId = randomBytes(16)
  let counter = 0
  let userHandle: string | null = null
  const coseKey = new Map<Cbor, Cbor>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, Buffer.from(jwk.x as string, 'base64url')],
    [-3, Buffer.from(jwk.y as string, 'base64url')],
  ])

  const authData = (rpID: string, flags: number, attested?: Buffer) => {
    const count = Buffer.alloc(4)
    count.writeUInt32BE(counter)
    return Buffer.concat([
      sha256(rpID),
      Buffer.from([flags]),
      count,
      ...(attested ? [attested] : []),
    ])
  }

  return {
    id: b64url(credentialId),

    /** navigator.credentials.create(), as @simplewebauthn/browser returns it. */
    create(
      options: { challenge: string; rp: { id?: string }; user: { id: string } },
      origin: string,
      flags = UP | UV,
    ) {
      userHandle = options.user.id
      const idLen = Buffer.alloc(2)
      idLen.writeUInt16BE(credentialId.length)
      const attested = Buffer.concat([Buffer.alloc(16), idLen, credentialId, cbor(coseKey)])
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin }),
      )
      const attestationObject = cbor({
        fmt: 'none',
        attStmt: new Map(),
        authData: authData(options.rp.id as string, flags | AT, attested),
      })
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: 'public-key' as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientDataJSON),
          attestationObject: b64url(attestationObject),
          transports: ['internal' as const],
        },
      }
    },

    /** navigator.credentials.get(). */
    get(options: { challenge: string; rpId?: string }, origin: string, flags = UP | UV) {
      counter++
      const data = authData(options.rpId as string, flags)
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin }),
      )
      const signature = sign('sha256', Buffer.concat([data, sha256(clientDataJSON)]), privateKey)
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: 'public-key' as const,
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientDataJSON),
          authenticatorData: b64url(data),
          signature: b64url(signature),
          userHandle: userHandle ?? undefined,
        },
      }
    },
  }
}

export const FLAGS = { UP, UV }
