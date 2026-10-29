// SPDX-License-Identifier: AGPL-3.0-only
// Configuration from the environment. Everything else is a setting in the database, changed in
// the admin; only what's needed before the database opens lives here.
import { readFileSync } from 'node:fs'
import { LEVELS } from '@highsea-tv/core'
import { z } from 'zod'

const port = z.coerce.number().int().min(1).max(65535)

export const configSchema = z.object({
  /** `/config`: the database, secret.key, backups, logs, the catalog cache. */
  configDir: z.string().min(1),
  /** `/data`: the single media root, so hardlinks work. */
  dataDir: z.string().min(1),
  host: z.string().min(1),
  port,
  /** LAN discovery (ADR 0020). */
  discoveryPort: port,
  /** The address people use from outside, if there is one. */
  publicUrl: z.url().optional(),
  /**
   * The address apps on the network use (`HIGHSEA_PUBLISHED_URL`, `http://192.168.1.20:3000`),
   * over what setup stored and what highsea detects (ADR 0020's 4.3c section).
   */
  publishedUrl: z.url().optional(),
  logLevel: z.enum(LEVELS),
  /** Development: the Next dev server and readable logs. */
  dev: z.boolean(),
  /**
   * The main catalog's base URL, which holds its channels (`stable/`, `beta/`). In production it's
   * highsea's own, `CATALOG_URL` (ADR 0050); `HIGHSEA_CATALOG_URL` names another, and `off` turns it
   * off. Development and tests have none unless they set one, so nothing reaches the network.
   */
  catalogUrl: z.url().optional(),
  /**
   * Trust the development key that signs the seed until the release key exists. On unless
   * `NODE_ENV` is `production`; `HIGHSEA_CATALOG_DEV_KEY=0` or `1` overrides it.
   */
  catalogDevKey: z.boolean().optional(),
  /**
   * highsea's OpenSubtitles.com consumer key (`HIGHSEA_OPENSUBTITLES_KEY`), given to release builds
   * as a secret and never kept in the repository. Without it OpenSubtitles.com can't be turned on.
   * The image reads it from a file (`HIGHSEA_OPENSUBTITLES_KEY_FILE`), the `_FILE` convention
   * Docker's documentation gives for secrets; the variable wins when both are set.
   */
  opensubtitlesKey: z.string().min(1).optional(),
  /**
   * highsea's Trakt application (`HIGHSEA_TRAKT_CLIENT_ID`, `HIGHSEA_TRAKT_CLIENT_SECRET`, each with
   * a `_FILE` form), kept the way the OpenSubtitles.com key is. Without the Client ID, Trakt lists
   * can't be added. The secret is optional: Trakt deprecated it for sign-in and no longer issues one
   * to new applications, so the device flow works with the Client ID alone.
   */
  traktClientId: z.string().min(1).optional(),
  traktClientSecret: z.string().min(1).optional(),
  /**
   * highsea's TMDB API Read Access Token (`HIGHSEA_TMDB_READ_TOKEN`, or `_FILE`), built into the
   * image from the release environment as the others are (install-simplicity.md, answer 7). The
   * owner's own key in Settings wins. A build from a checkout reads it from its environment.
   */
  tmdbKey: z.string().min(1).optional(),
})

export type Config = z.infer<typeof configSchema>

/** Where highsea publishes its catalog: GitHub Pages on the organisation's custom domain. */
export const CATALOG_URL = 'https://catalog.highsea.tv'

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = configSchema.safeParse({
    configDir: env.HIGHSEA_CONFIG_DIR ?? '/config',
    dataDir: env.HIGHSEA_DATA_DIR ?? '/data',
    host: env.HOST ?? '0.0.0.0',
    port: env.PORT ?? 3000,
    discoveryPort: env.HIGHSEA_DISCOVERY_PORT ?? 7368,
    publicUrl: env.HIGHSEA_PUBLIC_URL || undefined,
    publishedUrl: env.HIGHSEA_PUBLISHED_URL || undefined,
    logLevel: env.HIGHSEA_LOG_LEVEL ?? 'info',
    dev: env.NODE_ENV === 'development',
    catalogUrl:
      env.HIGHSEA_CATALOG_URL === 'off'
        ? undefined
        : env.HIGHSEA_CATALOG_URL || (env.NODE_ENV === 'production' ? CATALOG_URL : undefined),
    catalogDevKey:
      env.HIGHSEA_CATALOG_DEV_KEY !== undefined && env.HIGHSEA_CATALOG_DEV_KEY !== ''
        ? env.HIGHSEA_CATALOG_DEV_KEY === '1' || env.HIGHSEA_CATALOG_DEV_KEY === 'true'
        : env.NODE_ENV !== 'production',
    opensubtitlesKey:
      env.HIGHSEA_OPENSUBTITLES_KEY?.trim() || keyFile(env.HIGHSEA_OPENSUBTITLES_KEY_FILE),
    traktClientId: env.HIGHSEA_TRAKT_CLIENT_ID?.trim() || keyFile(env.HIGHSEA_TRAKT_CLIENT_ID_FILE),
    traktClientSecret:
      env.HIGHSEA_TRAKT_CLIENT_SECRET?.trim() || keyFile(env.HIGHSEA_TRAKT_CLIENT_SECRET_FILE),
    tmdbKey: env.HIGHSEA_TMDB_READ_TOKEN?.trim() || keyFile(env.HIGHSEA_TMDB_READ_TOKEN_FILE),
  })
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`The server's configuration isn't valid:\n  ${problems.join('\n  ')}`)
  }
  return parsed.data
}

/** A key kept in a file: absent or empty is no key. */
function keyFile(path: string | undefined): string | undefined {
  if (!path) return undefined
  try {
    return readFileSync(path, 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}
