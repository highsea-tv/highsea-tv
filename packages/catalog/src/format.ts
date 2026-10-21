// SPDX-License-Identifier: AGPL-3.0-only
// What a catalog publishes on each channel (ADR 0034):
//
//   {channel}/manifest.json        the signed envelope: the manifest's exact text, its signature
//                                  and the id of the key that made it
//   {channel}/{bundle.path}        the bundle the manifest names by SHA-256
//
// The signature covers the manifest's bytes as published, so nothing is re-serialized before it's
// checked. The manifest names the bundle's hash, so one signature covers both.
import { z } from 'zod'

export const CATALOG_FORMAT = 1
export const CHANNELS = ['stable', 'beta'] as const
export type Channel = (typeof CHANNELS)[number]
/**
 * Indexers, and since checkpoint 6b the VPN providers highsea connects to (ADR 0042); presets and
 * sound packs can ride the same format later (owner's answer 8).
 */
export const CATALOG_KINDS = ['indexers', 'vpn-providers'] as const
export type CatalogKind = (typeof CATALOG_KINDS)[number]

/** `2026.10.21`, or `2026.10.21.2` for a second release that day. */
const CATALOG_VERSION = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\.(\d{1,3}))?$/

export function isCatalogVersion(value: string): boolean {
  return CATALOG_VERSION.test(value)
}

/** Negative when `a` is older than `b`. */
export function compareCatalogVersions(a: string, b: string): number {
  const pa = CATALOG_VERSION.exec(a)
  const pb = CATALOG_VERSION.exec(b)
  if (!pa || !pb) throw new Error(`"${pa ? b : a}" isn’t a catalog version like 2026.10.21.`)
  for (let i = 1; i <= 4; i++) {
    const d = Number(pa[i] ?? 1) - Number(pb[i] ?? 1)
    if (d) return d
  }
  return 0
}

const version = z.string().refine(isCatalogVersion, 'Use a version like 2026.10.21.')

export const changeSchema = z.object({
  version,
  /** ISO date. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.array(z.string().min(1).max(300)).min(1).max(50),
})
export type CatalogChange = z.infer<typeof changeSchema>

export const manifestSchema = z.object({
  format: z.literal(CATALOG_FORMAT),
  kind: z.enum(CATALOG_KINDS),
  channel: z.enum(CHANNELS),
  version,
  /** The oldest engine any definition in the bundle needs. */
  minEngineVersion: z.string(),
  bundle: z.object({
    path: z.string().regex(/^[a-z0-9.-]+\.json$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().positive(),
  }),
  /** The most recent versions' notes, newest first, for What changed. */
  changes: z.array(changeSchema).max(20),
})
export type Manifest = z.infer<typeof manifestSchema>

export const envelopeSchema = z.object({
  keyId: z.string().regex(/^[a-z0-9-]{1,40}$/),
  /** The manifest's exact JSON text. */
  manifest: z.string().max(256 * 1024),
  /** Base64 ed25519 signature over the manifest's UTF-8 bytes. */
  signature: z.string().regex(/^[A-Za-z0-9+/]+=*$/),
})
export type Envelope = z.infer<typeof envelopeSchema>

export const bundleSchema = z.object({
  format: z.literal(CATALOG_FORMAT),
  kind: z.enum(CATALOG_KINDS),
  version,
  /** Each definition as its author wrote it; the server validates every one on load. */
  definitions: z.array(z.unknown()).max(5000),
  /** Logos by file name, as data URLs. */
  logos: z.record(z.string(), z.string()).default({}),
})
export type Bundle = z.infer<typeof bundleSchema>
