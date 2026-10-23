// SPDX-License-Identifier: AGPL-3.0-only
// Built-in TLS (ADR 0026) serves a certificate the owner provides: `/config/tls/cert.pem` (the
// full chain) and `/config/tls/key.pem`, as Node's tls.createSecureContext takes them. Getting
// certificates automatically (ACME) comes later; until then a reverse proxy or `certbot`,
// `tailscale cert` or similar provide them.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSecureContext } from 'node:tls'

export type Certificate = { cert: Buffer; key: Buffer }

export const tlsPaths = (configDir: string) => ({
  cert: join(configDir, 'tls', 'cert.pem'),
  key: join(configDir, 'tls', 'key.pem'),
})

/** The certificate, or why there isn't a usable one. */
export function loadCertificate(
  configDir: string,
): { ok: true; certificate: Certificate } | { ok: false; problem: string } {
  const paths = tlsPaths(configDir)
  if (!existsSync(paths.cert) || !existsSync(paths.key))
    return {
      ok: false,
      problem: `Built-in TLS needs a certificate: put cert.pem and key.pem in ${join(configDir, 'tls')}.`,
    }
  const certificate = { cert: readFileSync(paths.cert), key: readFileSync(paths.key) }
  try {
    // throws when the files aren't PEM or the key doesn't match the certificate
    createSecureContext(certificate)
  } catch (e) {
    return {
      ok: false,
      problem: `The certificate in ${join(configDir, 'tls')} can’t be used: ${(e as Error).message}`,
    }
  }
  return { ok: true, certificate }
}
