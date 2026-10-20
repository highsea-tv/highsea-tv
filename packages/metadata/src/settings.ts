// SPDX-License-Identifier: AGPL-3.0-only
// The `metadata` settings row: the owner's TMDB credential, sealed like every provider secret
// (docs/plans/phase-3-server.md, Data › Secrets) and never returned, and the metadata language and
// region (owner's decisions 1 and 5). Each server uses its owner's own key, as TMDB's terms ask:
// they don't allow sublicensing access to the API (https://www.themoviedb.org/api-terms-of-use).
import { AppError } from '@highsea/core'
import { readSetting, writeSetting } from '@highsea/db'
import type { MetadataDeps } from './context.ts'
import { type Credential, credentialOf, TMDB_STATUS, TmdbHttpError } from './tmdb/client.ts'
import type { MetadataSettingsView } from './types.ts'

export const METADATA_SETTINGS_KEY = 'metadata'

/** What the `metadata` row stores. `region: null` follows the owner's locale. */
export type MetadataSettings = {
  keySealed: string | null
  keyLast4: string | null
  language: string
  region: string | null
}

export const defaultMetadataSettings: MetadataSettings = {
  keySealed: null,
  keyLast4: null,
  language: 'en-US',
  region: null,
}

/** The reason in an AppError's details when TMDB is needed and no key is set. */
export const NO_TMDB_KEY = 'no-tmdb-key'

/**
 * Thrown by anything that needs TMDB while no key is set: `unavailable` (503) with
 * `details.reason` `no-tmdb-key`, so the API can link to Settings › General › Metadata.
 */
export const noKeyError = () =>
  new AppError('unavailable', 'Add a TMDB key to find movies.', { reason: NO_TMDB_KEY })

export const isNoKeyError = (e: unknown) =>
  e instanceof AppError && (e.details as { reason?: string } | undefined)?.reason === NO_TMDB_KEY

/** `en-US`, `pt-BR`, `de`: TMDB's `language` takes ISO 639-1, optionally with a region. */
const LANGUAGE = /^[a-z]{2}(-[A-Z]{2})?$/
/** ISO 3166-1 alpha-2, as TMDB's `region` and `iso_3166_1`. */
const REGION = /^[A-Z]{2}$/

/** The region of the process's default locale (`en-US` → `US`), else US. */
export function localeRegion(): string {
  try {
    const region = new Intl.Locale(Intl.DateTimeFormat().resolvedOptions().locale).maximize().region
    return region && REGION.test(region) ? region : 'US'
  } catch {
    return 'US'
  }
}

export function createSettings(deps: MetadataDeps) {
  const { db, clock, sealer } = deps

  const read = () => readSetting(db, METADATA_SETTINGS_KEY, defaultMetadataSettings)
  const write = (next: MetadataSettings) =>
    writeSetting(db, METADATA_SETTINGS_KEY, next, clock.now())

  const view = (s = read()): MetadataSettingsView => ({
    key: { set: !!s.keySealed, last4: s.keyLast4 },
    language: s.language,
    region: s.region ?? localeRegion(),
  })

  /** The stored credential, or null. */
  function credential(): Credential | null {
    const s = read()
    return s.keySealed ? credentialOf(sealer.open(s.keySealed)) : null
  }

  /** Checks a credential with TMDB; returns it trimmed. A 401 (`status_code` 7) is the owner's to fix. */
  async function check(raw: string, validate: (c: Credential) => Promise<void>) {
    const value = raw.trim()
    if (!value || value.length > 1024 || /\s/.test(value))
      throw new AppError('invalid', 'Paste the API key or the API Read Access Token from TMDB.')
    try {
      await validate(credentialOf(value))
    } catch (e) {
      if (e instanceof TmdbHttpError && (e.status === 401 || e.code === TMDB_STATUS.invalidKey))
        throw new AppError(
          'invalid',
          'TMDB didn’t accept that key. Copy it again from your TMDB account.',
          { reason: 'tmdb-key-rejected' },
        )
      throw e
    }
    return value
  }

  return {
    read,
    view,
    credential,
    language: () => read().language,
    region: () => read().region ?? localeRegion(),

    /**
     * Checks the credential with `GET /3/authentication`, then stores it sealed. A 401 (TMDB's
     * `status_code` 7) is the owner's to fix.
     */
    async setKey(raw: string, validate: (c: Credential) => Promise<void>) {
      const value = await check(raw, validate)
      return view(write({ ...read(), keySealed: sealer.seal(value), keyLast4: value.slice(-4) }))
    },

    /** The same check as `setKey`, storing nothing: setup's key step checks before it's saved. */
    checkKey: async (raw: string, validate: (c: Credential) => Promise<void>) => {
      await check(raw, validate)
    },

    clearKey() {
      return view(write({ ...read(), keySealed: null, keyLast4: null }))
    },

    /** Changes the language or the region; `region: null` follows the owner's locale again. */
    update(patch: { language?: string; region?: string | null }) {
      const next = { ...read() }
      if (patch.language !== undefined) {
        if (!LANGUAGE.test(patch.language))
          throw new AppError('invalid', 'Choose a language like en-US.', { field: 'language' })
        next.language = patch.language
      }
      if (patch.region !== undefined) {
        if (patch.region !== null && !REGION.test(patch.region))
          throw new AppError('invalid', 'Choose a region like US.', { field: 'region' })
        next.region = patch.region
      }
      return view(write(next))
    },
  }
}

export type MetadataSettingsService = ReturnType<typeof createSettings>
