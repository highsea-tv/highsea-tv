// SPDX-License-Identifier: AGPL-3.0-only
// What the app tells a server about itself when it signs in (DeviceInput): its name in You ›
// Devices, the kind of app, and the app's version. The kind and the playback profile are the only
// places the platform is named: the rest of the shared code asks `Platform.isTV`, so Android and
// Android TV (4.5c) add a case here and nothing else. Single sign-on's PKCE pair (RFC 7636 § 4.1–4.2): a
// verifier of 32 random bytes in base64url and its S256 challenge, from expo-crypto
// (https://docs.expo.dev/versions/latest/sdk/crypto/).
import Constants from 'expo-constants'
import * as Crypto from 'expo-crypto'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

export const appVersion = Constants.expoConfig?.version ?? '0.0.0'

const apple = Platform.OS === 'ios'

/** The kind of app, as the server's DeviceInput names it. */
export const deviceClient = Platform.isTV
  ? apple
    ? ('tvos' as const)
    : ('androidtv' as const)
  : apple
    ? ('ios' as const)
    : ('android' as const)

/** The built-in playback profile this app starts from (ADR 0052, `@highsea-tv/stream/profiles`). */
export const playbackProfile = Platform.isTV ? 'tvos' : 'ios'

export function deviceInput() {
  const fallback = Platform.isTV ? 'Apple TV' : 'iPhone'
  return {
    name: (Device.deviceName ?? Device.modelName ?? fallback).slice(0, 100),
    client: deviceClient,
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
