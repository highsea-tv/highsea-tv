// SPDX-License-Identifier: AGPL-3.0-only
// The channel interface (ADR 0046): each kind of connection is code, with a zod schema for its
// settings that names which of them are secret (sealed at rest, shown masked), and a `send` that
// turns a rendered message into the service's documented request through the fetch seam (ADR 0029).
// A channel throws a DeliveryError when the message didn't arrive; the service decides what to do.
import type { Fetch } from '@highsea-tv/core'
import { z } from 'zod'
import type { ConnectionKind, Message, NotificationT } from '../shared/index.ts'
import { notificationT, render } from '../shared/index.ts'
import type { MailBrand } from './email.ts'

/** A browser that asked for web push, as the service hands it to the Browser channel. */
export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string }

export type PushContext = {
  /** The server's VAPID keys (RFC 8292), base64url, and its contact (`mailto:` or `https:`). */
  vapid: { subject: string; publicKey: string; privateKey: string }
  /** The subscriptions of these people. */
  subscriptions(userIds: string[]): PushTarget[]
  /** The push service said this subscription is gone (404 or 410): forget it. */
  gone(id: string): void
}

/** What an email needs beyond the message: who it's from, and the connection for its footer. */
export type MailContext = { brand: MailBrand; connection: string | null }

export type SendContext = {
  fetch: Fetch
  now(): number
  t: NotificationT
  /** Stable for one message across its retries: Matrix's transaction id, so a retry isn't a repeat. */
  messageId: string
  signal?: AbortSignal
  push?: PushContext
  mail?: MailContext
}

export type Channel<S> = {
  kind: ConnectionKind
  settings: z.ZodType<S>
  /** The settings that are sealed at rest and shown masked. */
  secrets: readonly (keyof S & string)[]
  send(message: Message, settings: S, ctx: SendContext): Promise<void>
  /** Sends the test message: what Test on a connection does. */
  test(settings: S, ctx: SendContext): Promise<void>
}

export function defineChannel<S>(definition: Omit<Channel<S>, 'test'>): Channel<S> {
  return {
    ...definition,
    test: (settings, ctx) =>
      definition.send(render('test', {}, { t: ctx.t, now: ctx.now() }), settings, ctx),
  }
}

/** A connection's address: http or https, nothing else. */
export const httpUrl = z.url({ protocol: /^https?$/, error: 'An http or https address.' })

/** The base of a self-hosted service's address, without its trailing slash. */
export const baseUrl = httpUrl.transform((u) => u.replace(/\/+$/, ''))

export const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined)

/** Embed and attachment colours by level, as 0xRRGGBB. */
export const LEVEL_COLOURS: Record<Message['level'], number> = {
  info: 0x4c7bd9,
  success: 0x2f9e6b,
  warning: 0xd99a2b,
  error: 0xd2474f,
}

const DEFAULT_T = notificationT()

/** A context for one-off sends, such as a test outside the service. */
export const sendContext = (fetch: Fetch, now = () => Date.now()): SendContext => ({
  fetch,
  now,
  t: DEFAULT_T,
  messageId: `msg-${now()}`,
})

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': 'highsea', ...headers },
  body: JSON.stringify(body),
})

export const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
