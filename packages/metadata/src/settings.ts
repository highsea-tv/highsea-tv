// SPDX-License-Identifier: AGPL-3.0-only
// The `metadata` settings row: the owner's TMDB credential, sealed like every provider secret
// (docs/plans/phase-3-server.md, Data › Secrets) and never returned, and the metadata language and
// region (owner's decisions 1 and 5). Since 4.3c the image carries highsea's own key, used when the
// owner hasn't set one (install-simplicity.md, answer 7: the owner chose to ship it, as Jellyfin
// does); the owner's key always wins. Since HT-74 it holds the owner's optional personal fanart.tv
// key too, sealed the same way (ADR 0070); highsea's project key comes with the image.
import { AppError } from '@highsea-tv/core'
import { readSetting, writeSetting } from '@highsea-tv/db'
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
  /** The owner's personal fanart.tv key (HT-74). */
  fanartKeySealed: string | null
  fanartKeyLast4: string | null
}

export const defaultMetadataSettings: MetadataSettings = {
  keySealed: null,
  keyLast4: null,
  fanartKeySealed: null,
  fanartKeyLast4: null,
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

  const builtIn = deps.builtInKey?.trim() || null
  const fanartProject = deps.fanartKey?.trim() || null

  const view = (s = read()): MetadataSettingsView => ({
    key: { set: !!s.keySealed, last4: s.keyLast4, builtIn: !!builtIn },
    fanart: { set: !!s.fanartKeySealed, last4: s.fanartKeyLast4, project: !!fanartProject },
    language: s.language,
    region: s.region ?? localeRegion(),
  })

  /** The owner's credential, else highsea's own, else null. */
  function credential(): Credential | null {
    const s = read()
    if (s.keySealed) return credentialOf(sealer.open(s.keySealed))
    return builtIn ? credentialOf(builtIn) : null
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

  /** fanart.tv's keys: highsea's project key and the owner's personal one, either may be absent. */
  function fanartKeys() {
    const s = read()
    return {
      project: fanartProject,
      personal: s.fanartKeySealed ? sealer.open(s.fanartKeySealed) : null,
    }
  }

  return {
    read,
    view,
    credential,
    fanartKeys,

    /**
     * Checks a personal fanart.tv key with one request, then stores it sealed. fanart.tv has no
     * call for checking a key, so `validate` asks for one film: a 401 is the owner's to fix.
     */
    async setFanartKey(raw: string, validate: (key: string) => Promise<void>) {
      const value = raw.trim()
      if (!/^[A-Za-z0-9]{8,128}$/.test(value))
        throw new AppError('invalid', 'Paste the personal API key from your fanart.tv account.', {
          reason: 'fanart-key-rejected',
        })
      await validate(value)
      return view(
        write({ ...read(), fanartKeySealed: sealer.seal(value), fanartKeyLast4: value.slice(-4) }),
      )
    },

    clearFanartKey() {
      return view(write({ ...read(), fanartKeySealed: null, fanartKeyLast4: null }))
    },
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
