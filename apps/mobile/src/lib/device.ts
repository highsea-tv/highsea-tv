// SPDX-License-Identifier: AGPL-3.0-only
// What the app tells a server about itself when it signs in (DeviceInput): its name in You ›
// Devices, `ios`, and the app's version. Single sign-on's PKCE pair (RFC 7636 § 4.1–4.2): a
// verifier of 32 random bytes in base64url and its S256 challenge, from expo-crypto
// (https://docs.expo.dev/versions/latest/sdk/crypto/).
import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import * as Device from 'expo-device'

export const appVersion = Constants.expoConfig?.version ?? '0.0.0'

export function deviceInput() {
  return {
    name: (Device.deviceName ?? Device.modelName ?? 'iPhone').slice(0, 100),
    client: 'ios' as const,
    appVersion,
  }
}

const base64url = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function bytesToBase64(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export async function pkce() {
  const verifier = base64url(bytesToBase64(Crypto.getRandomBytes(32)))
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  })
  return { verifier, challenge: base64url(digest) }
}
