// SPDX-License-Identifier: AGPL-3.0-only
// Each channel against the fakes, asserting the request its service documents (address, method,
// headers, auth and body); Discord's 429 and Retry-After; the retry rules; email against a local
// SMTP server; and web push, whose VAPID signature is checked with node:crypto (RFC 8292's own
// example first) and whose payload a fake browser decrypts (RFC 8291).
import { afterEach, describe, expect, test } from 'bun:test'
import {
  apprise,
  browser,
  CHANNELS,
  type Channel,
  discord,
  email,
  generateVapidKeys,
  gotify,
  type MailBrand,
  matrix,
  ntfy,
  pushover,
  type SendContext,
  slack,
  telegram,
  webhook,
} from '../src/channels/index.ts'
import { DeliveryError, type Message, notificationT, render } from '../src/shared/index.ts'
import {
  createFakeNotifications,
  createFakeSmtp,
  createPushSubscriber,
  FAKE_PUSH_ORIGIN,
  type FakeSmtp,
  readMail,
  verifyVapid,
} from './fake/index.ts'

const NOW = Date.UTC(2026, 9, 21, 9, 30)
const t = notificationT()

const SINTEL = {
  title: 'Sintel',
  year: 2010,
  tmdbId: 45745,
  posterUrl: 'https://media.example.org/images/sintel.jpg',
  url: 'https://media.example.org/movies/45745',
}

const imported: Message = render(
  'imported',
  { movie: SINTEL, quality: 'Bluray-1080p', size: 1_200_000_000, upgradedFrom: null },
  { t, now: NOW },
)

/** A JPEG's first bytes: enough for an attachment. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9])

const brand = (o: Partial<MailBrand> = {}): MailBrand => ({
  server: 'Harbor',
  externalUrl: 'https://media.example.org',
  timeZone: 'Europe/London',
  logo: () => null,
  poster: async () => null,
  ...o,
})

function setup() {
  const fake = createFakeNotifications()
  const ctx: SendContext = { fetch: fake.fetch, now: () => NOW, t, messageId: 'ntf_one' }
  return { fake, ctx }
}

// biome-ignore lint/suspicious/noExplicitAny: settings parsed by each channel's own schema
const send = (c: Channel<any>, settings: unknown, ctx: SendContext, m = imported) =>
  c.send(m, c.settings.parse(settings), ctx)

describe('messages', () => {
  test('are plain and calm, in the brief’s voice', () => {
    expect(imported.text).toBe('Sintel (2010) is in the library. Bluray-1080p, 1.2 GB.')
    expect(imported).toMatchObject({ level: 'success', url: SINTEL.url, image: SINTEL.posterUrl })
    const failed = render(
      'download-failed',
      {
        movie: SINTEL,
        release: 'Sintel.2010.1080p.BluRay.x264-GRP',
        reason: 'It stalled.',
        replaced: true,
      },
      { t, now: NOW },
    )
    expect(failed.text).toBe(
      'Sintel (2010) didn’t download. Sintel.2010.1080p.BluRay.x264-GRP: It stalled. Another release was grabbed in its place.',
    )
    const added = render(
      'movie-added',
      {
        count: 5,
        source: 'Blender',
        movies: [SINTEL, { ...SINTEL, title: 'Big Buck Bunny', year: 2008, tmdbId: 10378 }],
      },
      { t, now: NOW },
    )
    expect(added.text).toBe(
      '5 movies were added. From Blender: Sintel (2010), Big Buck Bunny (2008) and 3 others.',
    )
    const health = render(
      'health',
      { level: 'error', source: 'VPN', message: 'The tunnel is down.', cleared: false },
      { t, now: NOW },
    )
    expect(health).toMatchObject({ level: 'error', title: 'VPN needs attention' })
    // no exclamation marks anywhere in the catalog
    for (const m of [imported, failed, added, health]) expect(m.text).not.toContain('!')
  })
})

describe('channels', () => {
  test('Discord: an embed on the webhook, with the poster and colour', async () => {
    const { fake, ctx } = setup()
    const url = 'https://discord.com/api/webhooks/123456/abc-DEF_ghi'
    await send(discord, { webhookUrl: url }, ctx)
    const [req] = fake.requests
    expect(req?.method).toBe('POST')
    expect(req?.url).toBe(url)
    expect(req?.headers['content-type']).toBe('application/json')
    expect(req?.json()).toEqual({
      username: 'highsea',
      embeds: [
        {
          title: 'Sintel (2010) is in the library',
          description: 'Bluray-1080p, 1.2 GB.',
          url: SINTEL.url,
          color: 0x2f9e6b,
          timestamp: '2026-10-21T09:30:00.000Z',
          thumbnail: { url: SINTEL.posterUrl },
        },
      ],
      allowed_mentions: { parse: [] },
    })
    expect(() => discord.settings.parse({ webhookUrl: 'https://example.org/hook' })).toThrow()
  })

  test('Discord: a 429 says how long to wait, from Retry-After or the body', async () => {
    const { fake, ctx } = setup()
    const url = 'https://discord.com/api/webhooks/1/x'
    fake.answer('discord.com', { status: 429, retryAfter: '3', body: { retry_after: 2.5 } })
    const error = await send(discord, { webhookUrl: url }, ctx).catch((e) => e)
    expect(error).toBeInstanceOf(DeliveryError)
    // the body's figure is the more precise, and the one Discord documents
    expect(error).toMatchObject({ retryable: true, retryAfterMs: 2500, status: 429 })
    fake.answer('discord.com', { status: 429, retryAfter: '4', body: {} })
    expect(await send(discord, { webhookUrl: url }, ctx).catch((e) => e)).toMatchObject({
      retryAfterMs: 4000,
    })
    // a 404 is a deleted webhook: no retry
    fake.answer('discord.com', { status: 404, body: { message: 'Unknown Webhook', code: 10015 } })
    expect(await send(discord, { webhookUrl: url }, ctx).catch((e) => e)).toMatchObject({
      retryable: false,
      status: 404,
    })
    // a 502 is tried again
    fake.answer('discord.com', { status: 502, body: 'Bad Gateway' })
    expect(await send(discord, { webhookUrl: url }, ctx).catch((e) => e)).toMatchObject({
      retryable: true,
      retryAfterMs: null,
    })
  })

  test('Slack: blocks, with text as the fallback and mrkdwn escaped', async () => {
    const { fake, ctx } = setup()
    const url = 'https://hooks.slack.com/services/T000/B000/XXXX'
    const m = { ...imported, body: 'Bluray-1080p <&> 1.2 GB.' }
    await send(slack, { webhookUrl: url }, ctx, m)
    expect(fake.requests[0]?.json()).toEqual({
      text: imported.text,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Sintel (2010) is in the library*\nBluray-1080p &lt;&amp;&gt; 1.2 GB.',
          },
          accessory: { type: 'image', image_url: SINTEL.posterUrl, alt_text: imported.title },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `<${SINTEL.url}|Open in highsea>` }],
        },
      ],
    })
  })

  test('Telegram: sendPhoto with the poster, sendMessage without', async () => {
    const { fake, ctx } = setup()
    const settings = { botToken: '123456:ABC-def_ghi', chatId: '-100200300' }
    await send(telegram, settings, ctx)
    await send(telegram, settings, ctx, { ...imported, image: null })
    const [photo, text] = fake.requests
    expect(photo?.url).toBe('https://api.telegram.org/bot123456:ABC-def_ghi/sendPhoto')
    expect(photo?.json()).toEqual({
      chat_id: '-100200300',
      parse_mode: 'HTML',
      disable_notification: false,
      photo: SINTEL.posterUrl,
      caption: `<b>Sintel (2010) is in the library</b>\nBluray-1080p, 1.2 GB.\n<a href="${SINTEL.url}">Open in highsea</a>`,
    })
    expect(text?.url).toEndWith('/sendMessage')
    expect(text?.json()).toMatchObject({
      text: expect.stringContaining('<b>Sintel'),
      chat_id: '-100200300',
    })
    // a flood limit's retry_after is in the body's parameters
    fake.answer('api.telegram.org', {
      status: 429,
      body: {
        ok: false,
        error_code: 429,
        description: 'Too Many Requests',
        parameters: { retry_after: 7 },
      },
    })
    expect(await send(telegram, settings, ctx).catch((e) => e)).toMatchObject({
      retryable: true,
      retryAfterMs: 7000,
    })
  })

  test('ntfy: JSON to the server’s root, with a token or a password', async () => {
    const { fake, ctx } = setup()
    await send(
      ntfy,
      { serverUrl: 'https://ntfy.example.org/', topic: 'highsea', token: 'tk_abc' },
      ctx,
    )
    const [req] = fake.requests
    expect(req?.url).toBe('https://ntfy.example.org/')
    expect(req?.headers.authorization).toBe('Bearer tk_abc')
    expect(req?.json()).toEqual({
      topic: 'highsea',
      title: 'Sintel (2010) is in the library',
      message: 'Bluray-1080p, 1.2 GB.',
      priority: 3,
      tags: ['film_frames'],
      click: SINTEL.url,
      attach: SINTEL.posterUrl,
    })
    await send(ntfy, { topic: 'highsea', username: 'ines', password: 'pw' }, ctx, {
      ...imported,
      level: 'error',
    })
    const second = fake.requests[1]
    expect(second?.url).toBe('https://ntfy.sh/')
    expect(second?.headers.authorization).toBe(`Basic ${btoa('ines:pw')}`)
    expect(second?.json()).toMatchObject({ priority: 5, tags: ['rotating_light'] })
  })

  test('Gotify: POST /message with X-Gotify-Key and the client extras', async () => {
    const { fake, ctx } = setup()
    await send(gotify, { serverUrl: 'https://gotify.example.org', appToken: 'AbCdEf123' }, ctx)
    const [req] = fake.requests
    expect(req?.url).toBe('https://gotify.example.org/message')
    expect(req?.headers['x-gotify-key']).toBe('AbCdEf123')
    expect(req?.json()).toEqual({
      title: 'Sintel (2010) is in the library',
      message: 'Bluray-1080p, 1.2 GB.',
      priority: 5,
      extras: {
        'client::display': { contentType: 'text/plain' },
        'client::notification': { click: { url: SINTEL.url }, bigImageUrl: SINTEL.posterUrl },
      },
    })
  })

  test('Pushover: the messages API, form-encoded', async () => {
    const { fake, ctx } = setup()
    const settings = {
      appToken: 'azGDORePK8gMaC0QOYAMyEEuzJnyUi',
      userKey: 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG',
      device: 'pixel',
    }
    await send(pushover, settings, ctx)
    const [req] = fake.requests
    expect(req?.url).toBe('https://api.pushover.net/1/messages.json')
    expect(req?.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(new URLSearchParams(req?.text))).toEqual({
      token: settings.appToken,
      user: settings.userKey,
      title: 'Sintel (2010) is in the library',
      message: 'Bluray-1080p, 1.2 GB.',
      priority: '0',
      timestamp: String(NOW / 1000),
      device: 'pixel',
      url: SINTEL.url,
      url_title: 'Open in highsea',
    })
  })

  test('Matrix: PUT an m.text event with the message’s own transaction id', async () => {
    const { fake, ctx } = setup()
    const settings = {
      homeserverUrl: 'https://matrix.example.org',
      accessToken: 'syt_secret',
      roomId: '!room:example.org',
    }
    await send(matrix, settings, ctx)
    const [req] = fake.requests
    expect(req?.method).toBe('PUT')
    expect(req?.url).toBe(
      'https://matrix.example.org/_matrix/client/v3/rooms/!room%3Aexample.org/send/m.room.message/ntf_one',
    )
    expect(req?.headers.authorization).toBe('Bearer syt_secret')
    expect(req?.json()).toEqual({
      msgtype: 'm.text',
      body: `${imported.text}\n${SINTEL.url}`,
      format: 'org.matrix.custom.html',
      formatted_body: `<strong>Sintel (2010) is in the library</strong><br>Bluray-1080p, 1.2 GB.<br><a href="${SINTEL.url}">Open in highsea</a>`,
    })
    fake.answer('_matrix', {
      status: 429,
      body: { errcode: 'M_LIMIT_EXCEEDED', error: 'Too many requests', retry_after_ms: 1500 },
    })
    expect(await send(matrix, settings, ctx).catch((e) => e)).toMatchObject({ retryAfterMs: 1500 })
  })

  test('Webhook: the message and the event’s payload as JSON', async () => {
    const { fake, ctx } = setup()
    await send(webhook, { url: 'https://hooks.example.org/in', method: 'PUT', token: 'xyz' }, ctx)
    const [req] = fake.requests
    expect(req?.method).toBe('PUT')
    expect(req?.headers.authorization).toBe('Bearer xyz')
    expect(req?.json()).toEqual({
      event: 'imported',
      level: 'success',
      title: imported.title,
      body: imported.body,
      text: imported.text,
      url: SINTEL.url,
      image: SINTEL.posterUrl,
      at: '2026-10-21T09:30:00.000Z',
      payload: { movie: SINTEL, quality: 'Bluray-1080p', size: 1_200_000_000, upgradedFrom: null },
    })
  })

  test('Apprise: a saved configuration by key, or the stateless URLs', async () => {
    const { fake, ctx } = setup()
    await send(apprise, { serverUrl: 'http://apprise.local:8000', key: 'highsea' }, ctx)
    await send(
      apprise,
      { serverUrl: 'http://apprise.local:8000', urls: 'mailto://user:pass@example.org' },
      ctx,
      { ...imported, level: 'error', url: null },
    )
    const [byKey, stateless] = fake.requests
    expect(byKey?.url).toBe('http://apprise.local:8000/notify/highsea')
    expect(byKey?.json()).toEqual({
      title: imported.title,
      body: `${imported.body}\n${SINTEL.url}`,
      type: 'success',
      format: 'text',
    })
    expect(stateless?.url).toBe('http://apprise.local:8000/notify')
    expect(stateless?.json()).toEqual({
      title: imported.title,
      body: imported.body,
      type: 'failure',
      format: 'text',
      urls: 'mailto://user:pass@example.org',
    })
    expect(() => apprise.settings.parse({ serverUrl: 'http://a.local' })).toThrow()
  })

  test('a service that never answers is tried again', async () => {
    const { ctx } = setup()
    const down: SendContext = {
      ...ctx,
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    }
    expect(
      await send(gotify, { serverUrl: 'https://g.example.org', appToken: 'x' }, down).catch(
        (e) => e,
      ),
    ).toMatchObject({ retryable: true, message: expect.stringContaining('couldn’t be reached') })
  })

  test('every kind has a channel, and each test sends the test message', async () => {
    expect(Object.keys(CHANNELS).sort()).toEqual([
      'apprise',
      'browser',
      'discord',
      'email',
      'gotify',
      'matrix',
      'ntfy',
      'pushover',
      'slack',
      'telegram',
      'webhook',
    ])
    const { fake, ctx } = setup()
    await gotify.test(
      gotify.settings.parse({ serverUrl: 'https://g.example.org', appToken: 'x' }),
      ctx,
    )
    expect(fake.requests[0]?.json()).toMatchObject({
      title: 'A test from highsea',
      message: 'This connection works. Messages you choose will arrive here.',
    })
  })
})

describe('email', () => {
  let smtp: FakeSmtp | undefined
  afterEach(async () => {
    await smtp?.close()
    smtp = undefined
  })

  const smtpSettings = (s: FakeSmtp) => ({
    host: s.host,
    port: s.port,
    security: 'none',
    username: 'highsea',
    password: 'secret',
    from: 'highsea <media@example.org>',
    to: 'ines@example.org',
  })

  test('sends plain text with an HTML part, signed in with AUTH PLAIN', async () => {
    smtp = await createFakeSmtp({ auth: { user: 'highsea', pass: 'secret' } })
    const { ctx } = setup()
    await send(email, smtpSettings(smtp), ctx)
    const [mail] = smtp.messages
    expect(mail).toMatchObject({
      from: 'media@example.org',
      to: ['ines@example.org'],
      user: 'highsea',
    })
    expect(mail?.data).toContain('Subject: Sintel (2010) is in the library')
    const read = readMail(mail?.data ?? '')
    const text = read.parts.find((p) => p.type === 'text/plain')?.text
    // the details stand in for the body
    expect(text).toContain('Imported: Sintel (2010) is in the library')
    expect(text).toContain('Quality: Bluray-1080p')
    expect(text).toContain('Size: 1.2 GB')
    // a server that hasn't been named, with no context: highsea's
    expect(text).toContain('Sent by highsea.')
    expect(read.parts.find((p) => p.type === 'text/html')?.text).toContain('Bluray-1080p')
  })

  test('an Imported email carries its logo and poster by Content-ID, and nothing remote', async () => {
    smtp = await createFakeSmtp({ auth: { user: 'highsea', pass: 'secret' } })
    const { ctx } = setup()
    const asked: number[] = []
    await send(email, smtpSettings(smtp), {
      ...ctx,
      mail: {
        brand: brand({
          poster: async (tmdbId) => {
            asked.push(tmdbId)
            return { content: JPEG, contentType: 'image/jpeg', filename: 'poster.jpg' }
          },
        }),
        connection: 'Ines’s email',
      },
    })
    expect(asked).toEqual([45745])
    const read = readMail(smtp.messages[0]?.data ?? '')
    // the HTML and its images travel together (RFC 2387), beside the plain text
    expect(read.multiparts).toContain('multipart/related')
    expect(read.multiparts).toContain('multipart/alternative')
    const html = read.parts.find((p) => p.type === 'text/html')?.text ?? ''
    const text = read.parts.find((p) => p.type === 'text/plain')?.text ?? ''
    const srcs = [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1] ?? '')
    expect(srcs).toHaveLength(2)
    for (const src of srcs) expect(src).toStartWith('cid:')
    expect(html).not.toMatch(/src="https?:/)
    expect(html).not.toContain('<link')
    const images = read.parts.filter((p) => p.contentId)
    expect(images.map((p) => p.type).sort()).toEqual(['image/jpeg', 'image/png'])
    expect(images.map((p) => `cid:${p.contentId}`).sort()).toEqual([...srcs].sort())
    expect(images.find((p) => p.type === 'image/jpeg')?.body).toEqual(Buffer.from(JPEG))
    // the logo is highsea's icon when the server has none: a PNG
    expect([...(images.find((p) => p.type === 'image/png')?.body.subarray(1, 4) ?? [])]).toEqual([
      0x50, 0x4e, 0x47,
    ])
    // the badge, the details, Open with the external URL, and the footer naming connection and event
    expect(html).toContain('Imported')
    expect(html).toContain('Open in Harbor')
    expect(html).toContain(SINTEL.url)
    expect(text).toContain(`Open in Harbor:\r\n${SINTEL.url}`)
    expect(text).toContain('You get this because Ines’s email hears Imported.')
    expect(text).toContain('Sent by Harbor with highsea.')
  })

  test('a movie without a poster leaves the poster column out', async () => {
    smtp = await createFakeSmtp({ auth: { user: 'highsea', pass: 'secret' } })
    const { ctx } = setup()
    await send(email, smtpSettings(smtp), {
      ...ctx,
      mail: { brand: brand({ externalUrl: null }), connection: 'Mail' },
    })
    const read = readMail(smtp.messages[0]?.data ?? '')
    const html = read.parts.find((p) => p.type === 'text/html')?.text ?? ''
    expect(html).not.toMatch(/class="[^"]*\bposter\b/)
    expect([...html.matchAll(/<img/g)]).toHaveLength(1)
    expect(read.parts.filter((p) => p.contentId)).toHaveLength(1)
    // and without an external URL there's nowhere for Open to go
    expect(html).not.toContain('Open in')
  })

  test('the server’s own PNG logo replaces highsea’s icon', async () => {
    smtp = await createFakeSmtp({ auth: { user: 'highsea', pass: 'secret' } })
    const { ctx } = setup()
    const logo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    await send(email, smtpSettings(smtp), {
      ...ctx,
      mail: {
        brand: brand({
          logo: () => ({ content: logo, contentType: 'image/png', filename: 'logo.png' }),
        }),
        connection: 'Mail',
      },
    })
    const read = readMail(smtp.messages[0]?.data ?? '')
    expect(read.parts.find((p) => p.contentId)?.body).toEqual(Buffer.from(logo))
  })

  test('a 4xx is tried again, a 5xx and a wrong password aren’t', async () => {
    smtp = await createFakeSmtp({ auth: { user: 'highsea', pass: 'secret' } })
    const { ctx } = setup()
    const settings = {
      host: smtp.host,
      port: smtp.port,
      security: 'none',
      username: 'highsea',
      password: 'secret',
      from: 'media@example.org',
      to: 'ines@example.org',
    }
    smtp.reply.rcpt = '451 4.3.0 Try again later'
    expect(await send(email, settings, ctx).catch((e) => e)).toMatchObject({
      retryable: true,
      status: 451,
    })
    smtp.reply.rcpt = '550 5.1.1 No such user'
    expect(await send(email, settings, ctx).catch((e) => e)).toMatchObject({
      retryable: false,
      status: 550,
    })
    expect(
      await send(email, { ...settings, password: 'wrong' }, ctx).catch((e) => e),
    ).toMatchObject({ retryable: false, status: 535 })
    expect(smtp.messages).toHaveLength(0)
  })

  test('a server that isn’t there is tried again', async () => {
    smtp = await createFakeSmtp()
    const port = smtp.port
    await smtp.close()
    smtp = undefined
    const { ctx } = setup()
    const error = await send(
      email,
      { host: '127.0.0.1', port, security: 'none', from: 'a@example.org', to: 'b@example.org' },
      ctx,
    ).catch((e) => e)
    expect(error).toMatchObject({ retryable: true })
  })
})

describe('web push', () => {
  test('checks RFC 8292’s own example token with node:crypto', () => {
    const token =
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1haWx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_HLGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA'
    const k =
      'BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dRuU_RCPCfA5aq9ojSwk5Y2EmClBPs'
    // valid until 2016-01-23T04:36:08Z (§ 2.4)
    const before = Date.UTC(2016, 0, 23, 0, 0)
    expect(
      verifyVapid(`vapid t=${token}, k=${k}`, { audience: 'https://push.example.net', now: before })
        .claims,
    ).toEqual({ aud: 'https://push.example.net', exp: 1453523768, sub: 'mailto:push@example.com' })
    // a changed byte breaks the signature
    const forged = token.replace('.i3CY', '.i3CZ')
    expect(() =>
      verifyVapid(`vapid t=${forged}, k=${k}`, {
        audience: 'https://push.example.net',
        now: before,
      }),
    ).toThrow('signature')
    expect(() =>
      verifyVapid(`vapid t=${token}, k=${k}`, {
        audience: 'https://push.example.net',
        now: Date.UTC(2016, 0, 24),
      }),
    ).toThrow('expired')
  })

  test('signs with the server’s keys and encrypts for each browser', async () => {
    const { fake, ctx } = setup()
    const vapid = { subject: 'mailto:owner@example.org', ...generateVapidKeys() }
    const browserA = createPushSubscriber()
    const gone = createPushSubscriber()
    const forgotten: string[] = []
    const targets = [
      { id: 'wps_a', ...browserA.subscription.keys, endpoint: browserA.subscription.endpoint },
      { id: 'wps_gone', ...gone.subscription.keys, endpoint: gone.subscription.endpoint },
    ]
    fake.answer(gone.subscription.endpoint, { status: 410, body: '' })
    await send(
      browser,
      { userIds: ['usr_ines'] },
      {
        ...ctx,
        now: () => Date.now(),
        push: {
          vapid,
          subscriptions: (ids) => (ids.includes('usr_ines') ? targets : []),
          gone: (id) => forgotten.push(id),
        },
      },
    )
    const [req] = fake.to(browserA.subscription.endpoint)
    expect(req?.method).toBe('POST')
    expect(req?.headers['content-encoding']).toBe('aes128gcm')
    expect(req?.headers.ttl).toBe('86400')
    expect(req?.headers.urgency).toBe('normal')
    const check = verifyVapid(req?.headers.authorization ?? '', {
      audience: FAKE_PUSH_ORIGIN,
      now: Date.now(),
    })
    expect(check.publicKey).toBe(vapid.publicKey)
    expect(check.claims.sub).toBe('mailto:owner@example.org')
    expect(JSON.parse(browserA.decrypt(req?.body ?? new Uint8Array()))).toEqual({
      title: imported.title,
      body: imported.body,
      url: SINTEL.url,
      image: SINTEL.posterUrl,
      tag: 'imported:ntf_one',
    })
    // the unsubscribed browser is forgotten
    expect(forgotten).toEqual(['wps_gone'])
  })

  test('nobody subscribed is a failure that won’t clear by retrying', async () => {
    const { ctx } = setup()
    const vapid = { subject: 'mailto:owner@example.org', ...generateVapidKeys() }
    const error = await send(
      browser,
      { userIds: ['usr_x'] },
      {
        ...ctx,
        push: { vapid, subscriptions: () => [], gone: () => {} },
      },
    ).catch((e) => e)
    expect(error).toMatchObject({ retryable: false })
  })
})
