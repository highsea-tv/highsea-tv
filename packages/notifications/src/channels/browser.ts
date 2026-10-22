// SPDX-License-Identifier: AGPL-3.0-only
// Browser notifications through the Web Push protocol (RFC 8030): each browser that turned them on
// gave an endpoint on its push service and its keys. The payload is encrypted for that browser with
// the aes128gcm content coding (RFC 8291, RFC 8188), and the request carries the server's VAPID
// signature (RFC 8292): `Authorization: vapid t=<ES256 JWT>, k=<public key>`. `web-push` builds
// the request (https://github.com/web-push-libs/web-push#generaterequestdetailspushsubscription-payload-options);
// highsea sends it through the fetch seam like every other channel.
//
// A push service answers 201 Created. 404 means the subscription expired (RFC 8030 § 7.3), and the
// browsers' push services answer 410 Gone for one that was unsubscribed; either way it's forgotten.
// 429 and 5xx are tried again, after the Retry-After a push service under load sends (§ 8.4), and
// anything else is the request's fault.
import { retryAfterMs } from '@highsea/core'
import webPush from 'web-push'
import { z } from 'zod'
import { DeliveryError, unreachable } from '../shared/index.ts'
import { defineChannel } from './channel.ts'

/** How long a push service keeps a message for a browser that's offline: a day, as the drop. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60

export const browser = defineChannel({
  kind: 'browser',
  settings: z.object({
    /** The people whose browsers hear this connection. */
    userIds: z.array(z.string().min(1)).min(1, { error: 'At least one person.' }),
  }),
  secrets: [],
  async send(m, s, ctx) {
    const push = ctx.push
    if (!push)
      throw new DeliveryError('Web push isn’t set up on this server.', { retryable: false })
    const targets = push.subscriptions(s.userIds)
    if (!targets.length)
      throw new DeliveryError('No browser has turned on notifications for these people yet.', {
        retryable: false,
      })
    const payload = JSON.stringify({
      title: m.title,
      body: m.body,
      url: m.url,
      image: m.image,
      tag: `${m.event}:${ctx.messageId}`,
    })
    let retry: DeliveryError | null = null
    let failed: DeliveryError | null = null
    let delivered = 0
    for (const target of targets) {
      const details = webPush.generateRequestDetails(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        payload,
        {
          vapidDetails: push.vapid,
          TTL: PUSH_TTL_SECONDS,
          contentEncoding: 'aes128gcm',
          urgency: m.level === 'error' ? 'high' : 'normal',
        },
      )
      // fetch sets Content-Length itself from the body
      const headers = Object.fromEntries(
        Object.entries(details.headers)
          .filter(([k]) => k.toLowerCase() !== 'content-length')
          .map(([k, v]) => [k, String(v)]),
      )
      let res: Response
      try {
        res = await ctx.fetch(details.endpoint, {
          method: details.method,
          headers,
          body: details.body ? new Uint8Array(details.body) : undefined,
          signal: ctx.signal,
        })
      } catch (e) {
        retry = unreachable('A push service', e)
        continue
      }
      if (res.ok) {
        delivered++
        continue
      }
      if (res.status === 404 || res.status === 410) {
        push.gone(target.id)
        continue
      }
      const text = (await res.text().catch(() => '')).trim().slice(0, 200)
      const error = new DeliveryError(
        `A push service answered ${res.status}${text ? `: ${text}` : ''}`,
        {
          retryable: res.status === 429 || res.status >= 500,
          retryAfterMs: retryAfterMs(res.headers.get('retry-after'), ctx.now()),
          status: res.status,
        },
      )
      if (error.retryable) retry = error
      else failed = error
    }
    // one browser that will take it later is worth a retry, which may repeat it on the others
    if (retry) throw retry
    if (failed && !delivered) throw failed
    if (!delivered)
      throw new DeliveryError('Every browser for these people has turned notifications off.', {
        retryable: false,
      })
  },
})

/** A new pair of VAPID keys (P-256), base64url: the public key is what browsers subscribe with. */
export const generateVapidKeys = (): { publicKey: string; privateKey: string } =>
  webPush.generateVAPIDKeys()
