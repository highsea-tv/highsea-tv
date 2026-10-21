// SPDX-License-Identifier: AGPL-3.0-only
// Piece hashing for the worker pool (`packages/runtime/src/workers.ts`), so SHA-1 over a piece of
// up to 16 MiB never blocks the event loop (ADR 0003). The runtime calls `sha1` by module and name.
import { createHash } from 'node:crypto'

export function sha1(data: Uint8Array): string {
  return createHash('sha1').update(data).digest('hex')
}
