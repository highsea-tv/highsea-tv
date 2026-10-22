// SPDX-License-Identifier: AGPL-3.0-only
// The notifications service against the fakes, on a fake clock: secrets sealed in the database and
// masked on read, a repeated event sent once, a 429's Retry-After honoured, a message dropped after
// a day with a health issue, the log pruned after 30 days, the VAPID keys made once, browsers'
// subscriptions per person, and the server's mail.
import { afterEach, describe, expect, test } from 'bun:test'
import {
  AppError,
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase, readSetting, schema } from '@highsea-tv/db'
import { createJobQueue } from '@highsea-tv/jobs'
import { eq } from 'drizzle-orm'
import {
  type ConnectionInput,
  createNotifications,
  DROP_AFTER_MS,
  PRUNE_JOB,
  SEND_JOB,
  VAPID_SETTING,
} from '../src/service/index.ts'
import type { EventPayloads } from '../src/shared/index.ts'
import {
  createFakeNotifications,
  createFakeSmtp,
  createPushSubscriber,
  FAKE_PUSH_ORIGIN,
  type FakeSmtp,
  readMail,
  verifyVapid,
} from './fake/index.ts'

const HOOK = 'https://discord.com/api/webhooks/123456/secret-token-WXYZ'
const SECOND = 1000
const HOUR = 60 * 60 * SECOND
const DAY = 24 * HOUR

const SINTEL = { title: 'Sintel', year: 2010, tmdbId: 45745 }
const imported: EventPayloads['imported'] = {
  movie: SINTEL,
  quality: 'Bluray-1080p',
  size: 1_200_000_000,
  upgradedFrom: null,
}

function setup() {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const topics: string[] = []
  events.subscribe((e) => topics.push(e.topic))
  const jobs = createJobQueue({ db, clock, events })
  const fake = createFakeNotifications()
  const sealer = createSealer(generateSecretKey())
  const make = (queue = jobs) =>
    createNotifications({
      db,
      clock,
      events,
      jobs: queue,
      logger: silentLogger,
      sealer,
      fetch: fake.fetch,
    })
  const notifications = make()
  const run = async () => {
    await jobs.tick()
    await jobs.idle()
  }
  const person = (id: string) => {
    const now = clock.now()
    db.insert(schema.users)
      .values({
        id,
        username: id,
        displayName: id,
        role: 'owner',
        webauthnId: `w-${id}`,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return id
  }
  const discord = (over: Partial<ConnectionInput> = {}) =>
    notifications.add({
      kind: 'discord',
      name: 'Household Discord',
      enabled: true,
      events: ['imported', 'health'],
      settings: { webhookUrl: HOOK },
      ...over,
    })
  const logOf = (id: string) => notifications.log({ connectionId: id })
  return { db, raw, clock, jobs, fake, notifications, run, person, discord, logOf, topics, make }
}

const failure = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('it didn’t throw')
}

describe('connections', () => {
  test('secrets are sealed in the database and masked on read', async () => {
    const { db, notifications, discord, fake, topics } = setup()
    const added = discord()
    expect(added.settings).toEqual({ webhookUrl: '••••WXYZ' })
    expect(topics).toContain('connections.updated')
    const stored = db.select().from(schema.connections).get()
    const sealed = (stored?.settings as { webhookUrl?: string } | undefined)?.webhookUrl
    expect(sealed).toStartWith('v1.')
    expect(JSON.stringify(stored)).not.toContain('secret-token')

    // the masked value sent back keeps the secret; Test sends to the real address
    const renamed = notifications.update(added.id, {
      kind: 'discord',
      name: 'Discord',
      enabled: true,
      events: ['imported'],
      settings: added.settings,
    })
    expect(renamed).toMatchObject({ name: 'Discord', settings: { webhookUrl: '••••WXYZ' } })
    expect(await notifications.test(added.id)).toEqual({ ok: true })
    expect(fake.requests[0]?.url).toBe(HOOK)
    // so does a draft, edited in the dialog
    expect(
      await notifications.test({
        id: added.id,
        kind: 'discord',
        settings: { webhookUrl: '••••WXYZ' },
      }),
    ).toEqual({ ok: true })
    expect(fake.requests[1]?.url).toBe(HOOK)
    expect(fake.requests[1]?.json()).toMatchObject({ embeds: [{ title: 'A test from highsea' }] })

    // a new value replaces it
    const other = 'https://discord.com/api/webhooks/9/other-ABCD'
    notifications.update(added.id, { ...renamed, settings: { webhookUrl: other } })
    expect(notifications.get(added.id).settings).toEqual({ webhookUrl: '••••ABCD' })
  })

  test('settings are checked by the kind’s schema; a kind can’t change', () => {
    const { notifications, discord } = setup()
    const bad = failure(() => discord({ settings: { webhookUrl: 'https://example.org/x' } }))
    expect(bad).toBeInstanceOf(AppError)
    expect(bad).toMatchObject({ code: 'invalid', details: { field: 'webhookUrl' } })
    const added = discord()
    expect(
      failure(() =>
        notifications.update(added.id, {
          kind: 'slack',
          name: 'x',
          enabled: true,
          events: [],
          settings: {},
        }),
      ),
    ).toMatchObject({ code: 'invalid', details: { field: 'kind' } })
    expect(failure(() => discord({ serverMail: true }))).toMatchObject({ code: 'invalid' })
    expect(failure(() => notifications.get('con_nope'))).toMatchObject({ code: 'not-found' })
    notifications.remove(added.id)
    expect(notifications.list()).toEqual([])
  })

  test('a failing Test says why', async () => {
    const { notifications, discord, fake } = setup()
    const added = discord()
    fake.answer('discord.com', { status: 404, body: { message: 'Unknown Webhook' } })
    expect(await notifications.test(added.id)).toEqual({
      ok: false,
      message: 'Discord answered 404: {"message":"Unknown Webhook"}',
    })
  })
})

describe('delivery', () => {
  test('one message per connection that hears the event; the same event id sends nothing more', async () => {
    const { notifications, discord, fake, run, logOf } = setup()
    const hears = discord()
    discord({ name: 'Grabs only', events: ['grabbed'] })
    discord({ name: 'Off', enabled: false })
    expect(notifications.notify('imported', imported, 'evt_1')).toBe(1)
    expect(notifications.notify('imported', imported, 'evt_1')).toBe(0)
    await run()
    expect(notifications.notify('imported', imported, 'evt_1')).toBe(0)
    await run()
    expect(fake.requests).toHaveLength(1)
    expect(fake.requests[0]?.json()).toMatchObject({
      embeds: [{ title: 'Sintel (2010) is in the library', description: 'Bluray-1080p, 1.2 GB.' }],
    })
    expect(logOf(hears.id)).toMatchObject([
      { eventId: 'evt_1', event: 'imported', status: 'sent', attempts: 1, lastError: null },
    ])
    expect(notifications.get(hears.id).lastSentAt).toBeNumber()
    // another event is another message
    expect(notifications.notify('imported', imported, 'evt_2')).toBe(1)
    await run()
    expect(fake.requests).toHaveLength(2)
  })

  test('a 429 waits for its Retry-After, then sends', async () => {
    const { notifications, discord, fake, run, logOf, clock, jobs } = setup()
    const c = discord()
    fake.answer('discord.com', { status: 429, retryAfter: '120', body: {} })
    notifications.notify('imported', imported, 'evt_1')
    await run()
    expect(logOf(c.id)).toMatchObject([{ status: 'pending', attempts: 1 }])
    expect(logOf(c.id)[0]?.lastError).toContain('429')
    const [next] = jobs.list({ type: SEND_JOB }).filter((j) => j.status === 'queued')
    expect(next?.runAt).toBe(clock.now() + 120 * SECOND)
    expect(next?.dedupeKey).toBe(`${c.id}:evt_1`)
    clock.advance(119 * SECOND)
    await run()
    expect(fake.requests).toHaveLength(1)
    clock.advance(SECOND)
    await run()
    expect(fake.requests).toHaveLength(2)
    expect(logOf(c.id)).toMatchObject([{ status: 'sent', attempts: 2, lastError: null }])
  })

  test('a message still failing after a day is dropped, and Health says so until one arrives', async () => {
    const { notifications, discord, fake, run, logOf, clock } = setup()
    const c = discord()
    for (let i = 0; i < 40; i++) fake.answer('discord.com', { status: 503, body: 'down' })
    notifications.notify('imported', imported, 'evt_1')
    const start = clock.now()
    await run()
    expect(notifications.issues()).toEqual([])
    while (clock.now() - start <= DROP_AFTER_MS) {
      clock.advance(HOUR)
      await run()
    }
    const [entry] = logOf(c.id)
    expect(entry).toMatchObject({ status: 'dropped' })
    // backed off: 30 s doubling to an hour, so far fewer than 40 tries in the day
    expect(entry?.attempts).toBeLessThan(30)
    expect(entry?.attempts).toBeGreaterThan(5)
    const tries = fake.requests.length
    expect(notifications.issues()).toEqual([
      {
        id: `notifications:${c.id}`,
        level: 'warning',
        message:
          'A message to Household Discord was dropped after a day of trying: Discord answered 503: down',
        since: start,
      },
    ])
    expect(notifications.get(c.id).lastError).toContain('503')
    // nothing more is sent for it
    clock.advance(DAY)
    await run()
    expect(fake.requests.length).toBe(tries)

    // the next message gets through, and the issue clears
    fake.clearAnswers()
    notifications.notify('imported', imported, 'evt_2')
    await run()
    expect(notifications.issues()).toEqual([])
  })

  test('a 4xx fails at once, and shows in Health', async () => {
    const { notifications, discord, fake, run, logOf } = setup()
    const c = discord()
    fake.answer('discord.com', { status: 401, body: { message: '401: Unauthorized' } })
    notifications.notify(
      'health',
      { level: 'error', source: 'VPN', message: 'Down.', cleared: false },
      'h1',
    )
    await run()
    expect(logOf(c.id)).toMatchObject([{ status: 'failed', attempts: 1 }])
    expect(notifications.issues()[0]?.message).toStartWith(
      'Messages to Household Discord aren’t arriving',
    )
  })

  test('the log is pruned after 30 days, and the prune is a daily task', async () => {
    const { notifications, discord, run, logOf, clock, jobs } = setup()
    const c = discord()
    notifications.notify('imported', imported, 'old')
    await run()
    clock.advance(20 * DAY)
    notifications.notify('imported', imported, 'newer')
    await run()
    clock.advance(11 * DAY)
    expect(notifications.prune()).toBe(1)
    expect(logOf(c.id).map((e) => e.eventId)).toEqual(['newer'])
    notifications.schedule(clock.now())
    expect(jobs.tasks().map((t) => t.type)).toContain(PRUNE_JOB)
  })
})

describe('web push', () => {
  test('the VAPID keys are made once, the private key sealed', () => {
    const { db, notifications, make } = setup()
    const key = notifications.vapidPublicKey()
    expect(Buffer.from(key, 'base64url')).toHaveLength(65)
    expect(notifications.vapidPublicKey()).toBe(key)
    const stored = readSetting(db, VAPID_SETTING, { publicKey: '', privateKey: '' })
    expect(stored.publicKey).toBe(key)
    expect(stored.privateKey).toStartWith('v1.')
    // a restart reads the same keys, so browsers' subscriptions keep working
    const again = make(createJobQueue({ db, clock: createFakeClock() }))
    expect(again.vapidPublicKey()).toBe(key)
  })

  test('each person’s browsers are kept, and hear a Browser connection', async () => {
    const { db, notifications, person, fake, run } = setup()
    const ines = person('usr_ines')
    const mara = person('usr_mara')
    const laptop = createPushSubscriber()
    const phone = createPushSubscriber()
    const sub = notifications.push.subscribe(ines, {
      ...laptop.subscription,
      label: 'Firefox on macOS',
    })
    expect(sub).toMatchObject({ label: 'Firefox on macOS', service: 'push.example.net' })
    // the same browser again replaces its row
    notifications.push.subscribe(ines, { ...laptop.subscription, label: 'Firefox on macOS 15' })
    notifications.push.subscribe(ines, { ...phone.subscription, label: 'Safari on iOS' })
    expect(notifications.push.list(ines).map((s) => s.label)).toEqual([
      'Firefox on macOS 15',
      'Safari on iOS',
    ])
    expect(failure(() => notifications.push.unsubscribe(mara, sub.id))).toMatchObject({
      code: 'not-found',
    })
    expect(
      failure(() =>
        notifications.push.subscribe(ines, {
          endpoint: 'http://push.example.net/x',
          keys: laptop.subscription.keys,
          label: 'x',
        }),
      ),
    ).toMatchObject({ code: 'invalid' })

    const c = notifications.add({
      kind: 'browser',
      name: 'My browsers',
      enabled: true,
      events: ['imported'],
      settings: { userIds: [ines] },
    })
    fake.answer(phone.subscription.endpoint, { status: 410, body: '' })
    notifications.notify('imported', imported, 'evt_1')
    await run()
    const [req] = fake.to(laptop.subscription.endpoint)
    const check = verifyVapid(req?.headers.authorization ?? '', {
      audience: FAKE_PUSH_ORIGIN,
      now: Date.now(),
    })
    expect(check.publicKey).toBe(notifications.vapidPublicKey())
    expect(check.claims.sub).toBe('mailto:highsea@localhost')
    expect(JSON.parse(laptop.decrypt(req?.body ?? new Uint8Array()))).toMatchObject({
      title: 'Sintel (2010) is in the library',
    })
    // the phone unsubscribed: forgotten
    expect(notifications.push.list(ines).map((s) => s.label)).toEqual(['Firefox on macOS 15'])
    expect(notifications.log({ connectionId: c.id })[0]?.status).toBe('sent')
    // a person removed takes their browsers
    db.delete(schema.users).where(eq(schema.users.id, ines)).run()
    expect(notifications.push.list(ines)).toEqual([])
  })
})

describe('the server’s mail', () => {
  let smtp: FakeSmtp | undefined
  afterEach(async () => {
    await smtp?.close()
    smtp = undefined
  })

  test('goes through the email connection marked for it', async () => {
    const { notifications } = setup()
    const invite = {
      kind: 'invite' as const,
      name: 'Mara',
      inviter: 'Ines',
      link: 'http://192.168.1.20:3000/invite/k3V9qTzW7xYb2LmP',
      expiresAt: Date.UTC(2026, 9, 28, 18, 30),
    }
    const to = 'mara@example.org'
    expect(notifications.hasServerMail()).toBe(false)
    expect(await notifications.sendServerMail(to, invite)).toBe(false)
    smtp = await createFakeSmtp()
    const settings = {
      host: smtp.host,
      port: smtp.port,
      security: 'none',
      from: 'highsea <media@example.org>',
      to: 'owner@example.org',
    }
    const first = notifications.add({
      kind: 'email',
      name: 'Mail',
      enabled: true,
      events: [],
      settings,
      serverMail: true,
    })
    const second = notifications.add({
      kind: 'email',
      name: 'Other mail',
      enabled: true,
      events: [],
      settings,
      serverMail: true,
    })
    // only one sends the server's mail
    expect(notifications.get(first.id).serverMail).toBe(false)
    expect(notifications.get(second.id).serverMail).toBe(true)
    expect(await notifications.sendServerMail(to, invite)).toBe(true)
    expect(smtp.messages).toMatchObject([{ from: 'media@example.org', to: ['mara@example.org'] }])
    // the invite template, with highsea's icon attached by Content-ID
    const read = readMail(smtp.messages[0]?.data ?? '')
    expect(read.headers.subject).toBe('=?UTF-8?Q?You=E2=80=99re_invited_to_highsea?=')
    expect(read.multiparts).toEqual(['multipart/alternative', 'multipart/related'])
    const text = read.parts.find((p) => p.type === 'text/plain')?.text ?? ''
    const html = read.parts.find((p) => p.type === 'text/html')?.text ?? ''
    expect(text).toContain('Ines invited you to highsea. Choose a password to finish your account:')
    expect(text).toContain(invite.link)
    expect(text).toContain('Sent by highsea.')
    expect(html).toContain(`href="${invite.link}"`)
    const logo = read.parts.find((p) => p.contentId)
    expect(logo?.type).toBe('image/png')
    expect(html).toContain(`src="cid:${logo?.contentId}"`)
    expect(html).not.toMatch(/src="https?:/)
    // a refusal is said, so the invite can still show its link
    smtp.reply.rcpt = '550 5.1.1 No such user'
    expect(await notifications.sendServerMail(to, invite).catch((e) => e)).toMatchObject({
      code: 'unavailable',
    })
  })
})
