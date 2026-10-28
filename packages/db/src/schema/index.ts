// SPDX-License-Identifier: AGPL-3.0-only
// The database schema, one module per area. It grows a checkpoint at a time; each change is a
// migration generated with `bun run generate` (docs/plans/phase-3-server.md#data).
export * from './auth.ts'
export * from './collections.ts'
export * from './curation.ts'
export * from './downloads.ts'
export * from './indexers.ts'
export * from './jobs.ts'
export * from './lists.ts'
export * from './media.ts'
export * from './notifications.ts'
export * from './personalization.ts'
export * from './playback.ts'
export * from './subtitles.ts'
export * from './system.ts'
export * from './torrents.ts'
