// SPDX-License-Identifier: AGPL-3.0-only
// Each event's facts for a notification email's details (docs/product/emails.md), from its payload:
// only what the payload carries. The details stand in for the body where there are any; the other
// events keep their sentence.
import { bytes } from '@highsea/core/format'
import type { EventPayload, EventPayloads, MessageEvent } from '../shared/index.ts'
import type { Detail } from './templates.ts'

const DETAILS: { [E in MessageEvent]?: (p: EventPayloads[E]) => Detail[] } = {
  grabbed: (p) => [
    { label: 'release', value: p.release },
    { label: 'indexer', value: p.indexer },
    { label: 'size', value: bytes(p.size) },
  ],
  imported: (p) => [
    { label: 'quality', value: p.quality },
    { label: 'size', value: bytes(p.size) },
    ...(p.upgradedFrom ? [{ label: 'replaced' as const, value: p.upgradedFrom }] : []),
  ],
  upgraded: (p) => [
    { label: 'quality', value: p.quality },
    { label: 'size', value: bytes(p.size) },
    { label: 'replaced', value: p.upgradedFrom },
  ],
}

export function emailDetails(event: MessageEvent, payload: EventPayload): Detail[] {
  const details = DETAILS[event] as ((p: EventPayload) => Detail[]) | undefined
  return details ? details(payload) : []
}
