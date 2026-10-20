// SPDX-License-Identifier: AGPL-3.0-only
// Configuration from the environment. Everything else is a setting in the database, changed in
// the admin; only what's needed before the database opens lives here.
import { LEVELS } from '@highsea/core'
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
  logLevel: z.enum(LEVELS),
  /** Development: the Next dev server and readable logs. */
  dev: z.boolean(),
  /** The main catalog's base URL; unset until publishing begins (checkpoint 5's answer 3). */
  catalogUrl: z.url().optional(),
  /**
   * Trust the development key that signs the seed until the release key exists. On unless
   * `NODE_ENV` is `production`; `HIGHSEA_CATALOG_DEV_KEY=0` or `1` overrides it.
   */
  catalogDevKey: z.boolean().optional(),
})

export type Config = z.infer<typeof configSchema>

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = configSchema.safeParse({
    configDir: env.HIGHSEA_CONFIG_DIR ?? '/config',
    dataDir: env.HIGHSEA_DATA_DIR ?? '/data',
    host: env.HOST ?? '0.0.0.0',
    port: env.PORT ?? 3000,
    discoveryPort: env.HIGHSEA_DISCOVERY_PORT ?? 7368,
    publicUrl: env.HIGHSEA_PUBLIC_URL || undefined,
    logLevel: env.HIGHSEA_LOG_LEVEL ?? 'info',
    dev: env.NODE_ENV === 'development',
    catalogUrl: env.HIGHSEA_CATALOG_URL || undefined,
    catalogDevKey:
      env.HIGHSEA_CATALOG_DEV_KEY !== undefined && env.HIGHSEA_CATALOG_DEV_KEY !== ''
        ? env.HIGHSEA_CATALOG_DEV_KEY === '1' || env.HIGHSEA_CATALOG_DEV_KEY === 'true'
        : env.NODE_ENV !== 'production',
  })
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`The server's configuration isn't valid:\n  ${problems.join('\n  ')}`)
  }
  return parsed.data
}
