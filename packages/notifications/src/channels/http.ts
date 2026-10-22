// SPDX-License-Identifier: AGPL-3.0-only
// The channels that are one HTTP request each, every one written from its service's documentation.
import { z } from 'zod'
import { expectOk, type Message, unreachable } from '../shared/index.ts'
import {
  baseUrl,
  basic,
  defineChannel,
  escapeHtml,
  httpUrl,
  json,
  LEVEL_COLOURS,
  optionalText,
  type SendContext,
} from './channel.ts'

/** The request, with a fetch that never answered turned into a retryable DeliveryError. */
async function request(
  service: string,
  url: string,
  init: RequestInit,
  ctx: SendContext,
  retryAfter?: (res: Response) => Promise<number | null>,
): Promise<Response> {
  let res: Response
  try {
    res = await ctx.fetch(url, { ...init, signal: ctx.signal })
  } catch (e) {
    throw unreachable(service, e)
  }
  const wait = !res.ok && retryAfter ? await retryAfter(res.clone() as Response) : null
  return expectOk(res, { service, now: ctx.now(), retryAfter: wait })
}

/** A JSON body's field in seconds (Discord, Telegram) or milliseconds (Matrix), as milliseconds. */
const field =
  (read: (body: Record<string, unknown>) => unknown, scale: number) =>
  async (res: Response): Promise<number | null> => {
    if (res.status !== 429) return null
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const value = body ? read(body) : null
    return typeof value === 'number' && Number.isFinite(value) ? Math.ceil(value * scale) : null
  }

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

// Discord: Execute Webhook (https://discord.com/developers/docs/resources/webhook#execute-webhook),
// an embed (https://discord.com/developers/docs/resources/message#embed-object) with its limits:
// title 256, description 4096. A 429 says how long to wait in `Retry-After` and in the body's
// `retry_after`, in seconds (https://discord.com/developers/docs/topics/rate-limits).
export const discord = defineChannel({
  kind: 'discord',
  settings: z.object({
    webhookUrl: httpUrl.refine((u) => /\/api\/webhooks\/\d+\/[\w-]+/.test(u), {
      error: 'A Discord webhook address: https://discord.com/api/webhooks/…',
    }),
    username: optionalText,
  }),
  secrets: ['webhookUrl'],
  async send(m, s, ctx) {
    await request(
      'Discord',
      s.webhookUrl,
      json({
        username: s.username ?? 'highsea',
        embeds: [
          {
            title: cut(m.title, 256),
            description: cut(m.body, 4096),
            ...(m.url ? { url: m.url } : {}),
            color: LEVEL_COLOURS[m.level],
            timestamp: new Date(m.at).toISOString(),
            ...(m.image ? { thumbnail: { url: m.image } } : {}),
          },
        ],
        allowed_mentions: { parse: [] },
      }),
      ctx,
      field((b) => b.retry_after, 1000),
    )
  },
})

/** Slack's mrkdwn needs &, < and > escaped (https://api.slack.com/reference/surfaces/formatting#escaping). */
const slackEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Slack: incoming webhooks (https://api.slack.com/messaging/webhooks) with Block Kit blocks
// (https://api.slack.com/reference/block-kit/blocks): a section with the poster as its accessory,
// and `text` as the notification's fallback. Rate limits answer 429 with Retry-After
// (https://api.slack.com/apis/rate-limits).
export const slack = defineChannel({
  kind: 'slack',
  settings: z.object({
    webhookUrl: httpUrl.refine((u) => u.startsWith('https://hooks.slack.com/'), {
      error: 'A Slack webhook address: https://hooks.slack.com/…',
    }),
  }),
  secrets: ['webhookUrl'],
  async send(m, s, ctx) {
    const blocks: unknown[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: cut(`*${slackEscape(m.title)}*\n${slackEscape(m.body)}`, 3000),
        },
        ...(m.image ? { accessory: { type: 'image', image_url: m.image, alt_text: m.title } } : {}),
      },
    ]
    if (m.url)
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<${m.url}|${slackEscape(ctx.t('open'))}>` }],
      })
    await request('Slack', s.webhookUrl, json({ text: m.text, blocks }), ctx)
  },
})

// Telegram: the Bot API's sendMessage and sendPhoto (https://core.telegram.org/bots/api#sendmessage,
// https://core.telegram.org/bots/api#sendphoto), HTML formatting (#html-style), a caption at most
// 1024 characters. An error answers `{ ok: false, error_code, description }`, and a flood limit adds
// `parameters.retry_after` in seconds (#responseparameters).
export const telegram = defineChannel({
  kind: 'telegram',
  settings: z.object({
    botToken: z
      .string()
      .trim()
      .regex(/^\d+:[\w-]+$/, { error: 'A bot token from @BotFather: 123456:ABC…' }),
    chatId: z.string().trim().min(1, { error: 'A chat id, or @channelname.' }),
    silent: z.boolean().default(false),
  }),
  secrets: ['botToken'],
  async send(m, s, ctx) {
    const link = m.url ? `\n<a href="${escapeHtml(m.url)}">${escapeHtml(ctx.t('open'))}</a>` : ''
    const html = `<b>${escapeHtml(m.title)}</b>\n${escapeHtml(m.body)}${link}`
    const base = `https://api.telegram.org/bot${s.botToken}`
    const common = { chat_id: s.chatId, parse_mode: 'HTML', disable_notification: s.silent }
    const retry = field(
      (b) => (b.parameters as { retry_after?: unknown } | undefined)?.retry_after,
      1000,
    )
    if (m.image && html.length <= 1024)
      await request(
        'Telegram',
        `${base}/sendPhoto`,
        json({ ...common, photo: m.image, caption: html }),
        ctx,
        retry,
      )
    else
      await request(
        'Telegram',
        `${base}/sendMessage`,
        json({ ...common, text: html, link_preview_options: { is_disabled: true } }),
        ctx,
        retry,
      )
  },
})

const NTFY_PRIORITY: Record<Message['level'], number | null> = {
  info: null,
  success: null,
  warning: 4,
  error: 5,
}

// ntfy: publish as JSON to the server's root (https://docs.ntfy.sh/publish/#publish-as-json), with
// a title, a priority 1 to 5, a click action and the poster as an attachment by URL; an access
// token or a username and password (https://docs.ntfy.sh/publish/#authentication).
export const ntfy = defineChannel({
  kind: 'ntfy',
  settings: z.object({
    serverUrl: baseUrl.default('https://ntfy.sh'),
    topic: z
      .string()
      .trim()
      .regex(/^[-_A-Za-z0-9]{1,64}$/, { error: 'Letters, numbers, - and _, at most 64.' }),
    token: optionalText,
    username: optionalText,
    password: optionalText,
    priority: z.number().int().min(1).max(5).default(3),
  }),
  secrets: ['token', 'password'],
  async send(m, s, ctx) {
    const auth: Record<string, string> = s.token
      ? { authorization: `Bearer ${s.token}` }
      : s.username && s.password
        ? { authorization: basic(s.username, s.password) }
        : {}
    await request(
      'ntfy',
      `${s.serverUrl}/`,
      json(
        {
          topic: s.topic,
          title: m.title,
          message: m.body,
          priority: Math.max(s.priority, NTFY_PRIORITY[m.level] ?? 0),
          tags: [
            m.level === 'error'
              ? 'rotating_light'
              : m.level === 'warning'
                ? 'warning'
                : 'film_frames',
          ],
          ...(m.url ? { click: m.url } : {}),
          ...(m.image ? { attach: m.image } : {}),
        },
        auth,
      ),
      ctx,
    )
  },
})

// Gotify: POST /message with the application's token in X-Gotify-Key
// (https://gotify.net/api-docs#/message/createMessage), and the extras its Android client reads:
// a click URL and a big image (https://gotify.net/docs/msgextras).
export const gotify = defineChannel({
  kind: 'gotify',
  settings: z.object({
    serverUrl: baseUrl,
    appToken: z.string().trim().min(1, { error: 'The application’s token.' }),
    priority: z.number().int().min(0).max(10).default(5),
  }),
  secrets: ['appToken'],
  async send(m, s, ctx) {
    const notification = {
      ...(m.url ? { click: { url: m.url } } : {}),
      ...(m.image ? { bigImageUrl: m.image } : {}),
    }
    await request(
      'Gotify',
      `${s.serverUrl}/message`,
      json(
        {
          title: m.title,
          message: m.body,
          priority: m.level === 'error' ? Math.max(s.priority, 8) : s.priority,
          extras: {
            'client::display': { contentType: 'text/plain' },
            ...(Object.keys(notification).length ? { 'client::notification': notification } : {}),
          },
        },
        { 'x-gotify-key': s.appToken },
      ),
      ctx,
    )
  },
})

// Pushover: the messages API (https://pushover.net/api), form-encoded: token, user, message, title,
// url and url_title, priority -2 to 1 (2 needs retry and expire, which notifications don't use),
// device. A message is at most 1024 characters and a title 250. A 4xx is a request it will never
// take; a 429 means the application's monthly limit (https://pushover.net/api#limits).
export const pushover = defineChannel({
  kind: 'pushover',
  settings: z.object({
    appToken: z
      .string()
      .trim()
      .regex(/^\w{30}$/, { error: 'The application’s 30-character token.' }),
    userKey: z
      .string()
      .trim()
      .regex(/^\w{30}$/, { error: 'Your 30-character user or group key.' }),
    device: optionalText,
    priority: z.number().int().min(-2).max(1).default(0),
  }),
  secrets: ['appToken', 'userKey'],
  async send(m, s, ctx) {
    const form = new URLSearchParams({
      token: s.appToken,
      user: s.userKey,
      title: cut(m.title, 250),
      message: cut(m.body, 1024),
      priority: String(m.level === 'error' ? Math.max(s.priority, 1) : s.priority),
      timestamp: String(Math.floor(m.at / 1000)),
    })
    if (s.device) form.set('device', s.device)
    if (m.url) {
      form.set('url', m.url)
      form.set('url_title', ctx.t('open'))
    }
    await request(
      'Pushover',
      'https://api.pushover.net/1/messages.json',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'highsea' },
        body: form.toString(),
      },
      ctx,
    )
  },
})

// Matrix: PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId} with the access token
// as a bearer (https://spec.matrix.org/latest/client-server-api/#put_matrixclientv3roomsroomidsendeventtypetxnid).
// The transaction id is the message's own, so a retry the server already took isn't posted twice,
// as the spec's transaction identifiers promise (#transaction-identifiers). An m.text event with an
// HTML body (#mroommessage-msgtypes). A 429 is M_LIMIT_EXCEEDED with `retry_after_ms`.
export const matrix = defineChannel({
  kind: 'matrix',
  settings: z.object({
    homeserverUrl: baseUrl,
    accessToken: z.string().trim().min(1, { error: 'An access token for highsea’s account.' }),
    roomId: z
      .string()
      .trim()
      .regex(/^[!#][^:]+:.+$/, { error: 'A room id or alias: !abc:example.org.' }),
  }),
  secrets: ['accessToken'],
  async send(m, s, ctx) {
    const link = m.url ? `<br><a href="${escapeHtml(m.url)}">${escapeHtml(ctx.t('open'))}</a>` : ''
    const url = `${s.homeserverUrl}/_matrix/client/v3/rooms/${encodeURIComponent(s.roomId)}/send/m.room.message/${encodeURIComponent(ctx.messageId)}`
    await request(
      'Matrix',
      url,
      {
        ...json(
          {
            msgtype: 'm.text',
            body: m.url ? `${m.text}\n${m.url}` : m.text,
            format: 'org.matrix.custom.html',
            formatted_body: `<strong>${escapeHtml(m.title)}</strong><br>${escapeHtml(m.body)}${link}`,
          },
          { authorization: `Bearer ${s.accessToken}` },
        ),
        method: 'PUT',
      },
      ctx,
      field((b) => b.retry_after_ms, 1),
    )
  },
})

// A webhook: a JSON POST (or PUT) of the message and the event's own payload, for anything that
// takes one. Its shape is highsea's, documented in ADR 0046.
export const webhook = defineChannel({
  kind: 'webhook',
  settings: z.object({
    url: httpUrl,
    method: z.enum(['POST', 'PUT']).default('POST'),
    username: optionalText,
    password: optionalText,
    token: optionalText,
  }),
  secrets: ['url', 'password', 'token'],
  async send(m, s, ctx) {
    const auth: Record<string, string> = s.token
      ? { authorization: `Bearer ${s.token}` }
      : s.username && s.password
        ? { authorization: basic(s.username, s.password) }
        : {}
    await request(
      'The webhook',
      s.url,
      {
        ...json(
          {
            event: m.event,
            level: m.level,
            title: m.title,
            body: m.body,
            text: m.text,
            url: m.url,
            image: m.image,
            at: new Date(m.at).toISOString(),
            payload: m.payload,
          },
          auth,
        ),
        method: s.method,
      },
      ctx,
    )
  },
})

const APPRISE_TYPE: Record<Message['level'], string> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  error: 'failure',
}

// Apprise, through an Apprise API server the owner runs (https://github.com/caronc/apprise-api#api-details):
// POST /notify/{key} for a configuration saved there, or the stateless POST /notify with the
// Apprise URLs themselves. JSON with title, body, type (info, success, warning, failure) and format.
export const apprise = defineChannel({
  kind: 'apprise',
  settings: z
    .object({
      serverUrl: baseUrl,
      key: optionalText,
      urls: optionalText,
      tag: optionalText,
    })
    .refine((s) => !!s.key !== !!s.urls, {
      error: 'Either a configuration key, or Apprise URLs.',
      path: ['key'],
    }),
  secrets: ['urls'],
  async send(m, s, ctx) {
    const body = {
      title: m.title,
      body: m.url ? `${m.body}\n${m.url}` : m.body,
      type: APPRISE_TYPE[m.level],
      format: 'text',
      ...(s.tag ? { tag: s.tag } : {}),
    }
    if (s.key)
      await request(
        'Apprise',
        `${s.serverUrl}/notify/${encodeURIComponent(s.key)}`,
        json(body),
        ctx,
      )
    else await request('Apprise', `${s.serverUrl}/notify`, json({ ...body, urls: s.urls }), ctx)
  },
})
