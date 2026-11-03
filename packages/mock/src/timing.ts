// SPDX-License-Identifier: AGPL-3.0-only
// The mock's waits, shared by the prototype's screens and the SDK's transport so both pace alike.

/** Servers answer discovery over a second or two, nearest first. */
export const DISCOVERY_STAGGER_MS = [600, 1200, 2000]
/** How long the scan runs before it says it's done. */
export const DISCOVERY_MS = 3200
/**
 * How long a TV waits before the phone approves its code. design/prototypes/src/tv/connect.tsx's
 * APPROVAL_MS is still a copy of it until that screen imports this; change both together.
 */
export const PAIRING_APPROVAL_MS = 8000
