// SPDX-License-Identifier: AGPL-3.0-only
// ed25519 signing and verifying with Node's crypto, no dependency
// (nodejs.org/api/crypto.html#cryptosignalgorithm-data-key-callback: for Ed25519 the algorithm is
// `null`). Public keys travel as base64 SPKI DER, private keys as PKCS #8 PEM. Signing and
// verifying live in this one module so they can't drift apart (ADR 0034).
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto'
import { type Envelope, envelopeSchema } from './format.ts'

/** A public key the server trusts, by the id manifests name. */
export type TrustedKey = { id: string; publicKey: string }

export function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** A new key pair: the private key as PEM, the public key as base64 SPKI DER. */
export function generateSigningKey(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  }
}

/** The public half of a PEM private key, as base64 SPKI DER. */
export function publicKeyOf(privateKeyPem: string): string {
  return createPublicKey(createPrivateKey(privateKeyPem))
    .export({ type: 'spki', format: 'der' })
    .toString('base64')
}

export function signManifest(manifest: string, privateKeyPem: string, keyId: string): Envelope {
  const signature = sign(null, Buffer.from(manifest, 'utf8'), createPrivateKey(privateKeyPem))
  return { keyId, manifest, signature: signature.toString('base64') }
}

export class SignatureError extends Error {
  override name = 'SignatureError'
}

/**
 * Checks an envelope against the trusted keys and returns the manifest's text. Throws
 * `SignatureError` for an unknown key or a signature that doesn't match.
 */
export function verifyEnvelope(input: unknown, trusted: readonly TrustedKey[]): string {
  const parsed = envelopeSchema.safeParse(input)
  if (!parsed.success) throw new SignatureError('The manifest isn’t a signed catalog manifest.')
  const { keyId, manifest, signature } = parsed.data
  const key = trusted.find((k) => k.id === keyId)
  if (!key)
    throw new SignatureError(
      `The manifest is signed with a key this server doesn’t trust (${keyId}).`,
    )
  let ok = false
  try {
    const publicKey = createPublicKey({
      key: Buffer.from(key.publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    })
    ok = verify(null, Buffer.from(manifest, 'utf8'), publicKey, Buffer.from(signature, 'base64'))
  } catch {
    ok = false
  }
  if (!ok) throw new SignatureError('The catalog update failed its signature check.')
  return manifest
}
