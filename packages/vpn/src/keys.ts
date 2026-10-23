// SPDX-License-Identifier: AGPL-3.0-only
// WireGuard key pairs, for PIA, where highsea registers its own key (manual-connections'
// connect_to_wireguard_with_token.sh runs `wg genkey` and `wg pubkey`). WireGuard's keys are
// Curve25519 (https://www.wireguard.com/protocol/), which Node generates as X25519
// (https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptogeneratekeypairsynctype-options);
// exported as JWK, `d` and `x` are the raw 32-byte private and public keys in base64url (RFC 8037
// § 2), and wg(8) wants them in standard base64. Nothing runs a program, and the private key never
// leaves memory but sealed.
import { generateKeyPairSync } from 'node:crypto'

const toBase64 = (b64url: string) => Buffer.from(b64url, 'base64url').toString('base64')

export function generateWireGuardKeys(): { privateKey: string; publicKey: string } {
  const { privateKey } = generateKeyPairSync('x25519')
  const jwk = privateKey.export({ format: 'jwk' })
  if (!jwk.d || !jwk.x) throw new Error('Couldn’t make a WireGuard key.')
  return { privateKey: toBase64(jwk.d), publicKey: toBase64(jwk.x) }
}
