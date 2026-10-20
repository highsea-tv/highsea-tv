// SPDX-License-Identifier: AGPL-3.0-only
// The keys the server trusts for the main catalog and the seed snapshot (ADR 0034). Manifests name
// their key's id, so a key can be rotated by listing the new one beside the old (owner's answer 3:
// room for one rotation).
import type { TrustedKey } from './signing.ts'

/**
 * The release keys. None yet: the owner creates the first when publishing begins, and its public
 * half goes here (catalog/keys/README.md).
 */
export const RELEASE_KEYS: readonly TrustedKey[] = []

/**
 * The development key: signs the seed snapshot until publishing begins. Its private half is in
 * `catalog/keys/development.pem` on purpose, so it protects nothing; only development builds trust
 * it.
 */
export const DEVELOPMENT_KEY: TrustedKey = {
  id: 'development',
  publicKey: 'MCowBQYDK2VwAyEAG2ZI2ioGm+NG5ZbCRzrCQjR5W9zLSSFt/xe/s1CCKwU=',
}

/** The release keys, plus the development key when `development` is true. */
export function trustedKeys(development: boolean): TrustedKey[] {
  return development ? [...RELEASE_KEYS, DEVELOPMENT_KEY] : [...RELEASE_KEYS]
}
