// SPDX-License-Identifier: AGPL-3.0-only
// The database schema, one module per area. It grows a checkpoint at a time; each change is a
// migration generated with `bun run generate` (docs/plans/phase-3-server.md#data).
export * from './auth.ts'
export * from './jobs.ts'
export * from './personalization.ts'
export * from './system.ts'
