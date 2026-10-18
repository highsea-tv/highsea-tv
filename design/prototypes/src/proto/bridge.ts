// SPDX-License-Identifier: AGPL-3.0-only
// The chrome and the screen talk over postMessage. The screen is an iframe so each platform gets a
// real viewport (breakpoints, `h-screen`, safe areas); postMessage works even from file://, where
// the two documents count as different origins.
import type { ProtoState } from './state.ts'

/** Chrome → screen. */
export type ChromeMessage = { hs: 'state'; state: ProtoState } | { hs: 'navigate'; path: string }

/** Screen → chrome. */
export type ScreenMessage =
  | { hs: 'ready' }
  | { hs: 'route'; path: string }
  /** The mock server's simulated time, in ms since the epoch. */
  | { hs: 'clock'; now: number }

type Message = ChromeMessage | ScreenMessage

export function isMessage(data: unknown): data is Message {
  return typeof data === 'object' && data !== null && 'hs' in data
}

export function post(target: Window | null | undefined, message: Message): void {
  // '*': under file:// the origin is opaque ("null"), so it can't be named
  target?.postMessage(message, '*')
}

/** True inside the frame. Tests and directly opened screens have no parent chrome. */
export const inFrame = () => typeof window !== 'undefined' && window.parent !== window
