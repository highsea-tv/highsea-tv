// SPDX-License-Identifier: AGPL-3.0-only
// Secrets at rest (provider API keys, indexer credentials, TOTP seeds) are sealed with AES-256-GCM
// under the server's key, `/config/secret.key`. A sealed value is `v1.<iv>.<tag>.<data>` in
// base64url, so a column can tell a sealed value from a plain one.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AppError } from './errors.ts'

export type Sealer = {
  seal(plain: string): string
  open(sealed: string): string
}

export const SECRET_KEY_BYTES = 32

export const generateSecretKey = () => randomBytes(SECRET_KEY_BYTES)

export function createSealer(key: Uint8Array): Sealer {
  if (key.length !== SECRET_KEY_BYTES)
    throw new AppError('internal', `The secret key must be ${SECRET_KEY_BYTES} bytes.`)
  return {
    seal(plain) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return ['v1', iv, tag, data]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
        .join('.')
    },
    open(sealed) {
      const [v, iv, tag, data] = sealed.split('.')
      if (v !== 'v1' || !iv || !tag || data === undefined)
        throw new AppError('internal', 'That secret isn’t sealed by this server.')
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
        decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        return Buffer.concat([
          decipher.update(Buffer.from(data, 'base64url')),
          decipher.final(),
        ]).toString('utf8')
      } catch {
        throw new AppError('internal', 'A secret couldn’t be opened. Was secret.key replaced?')
      }
    },
  }
}
