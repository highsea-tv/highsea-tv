// SPDX-License-Identifier: AGPL-3.0-only
// Email over SMTP through Nodemailer (MIT-0, https://nodemailer.com/smtp/): implicit TLS on 465
// (`secure`), STARTTLS required on 587 (`requireTLS`), or plain for a relay on the local network
// (`ignoreTLS`). The same connection, marked as the server's mail, sends invites and password resets
// (`sendMail`).
//
// Each message is plain text with an HTML part, from the templates in ../mail (docs/product/emails.md)
// compiled with `mjml` as it's sent. Its images, the logo and a movie's poster, travel with it as
// attachments the HTML names by Content-ID (Nodemailer's embedded images,
// https://nodemailer.com/message/embedded-images/, which make the message multipart/related), so an
// email loads nothing remote and shows them without an external URL.
//
// SMTP's reply codes say what to do (RFC 5321 § 4.2.1): a 4yz is transient and may be tried again,
// a 5yz is permanent. Nodemailer gives the code as `responseCode`, and a failure to connect as
// ECONNECTION, ETIMEDOUT or ESOCKET, which are tried again too; EAUTH is a wrong password.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createTransport } from 'nodemailer'
import { z } from 'zod'
import { compileEmail } from '../mail/compile.ts'
import {
  type Brand,
  emailDetails,
  type LinkEmail,
  renderLinkEmail,
  renderNotificationEmail,
} from '../mail/index.ts'
import { DeliveryError, type EventPayloads, type Message, type MovieRef } from '../shared/index.ts'
import { defineChannel, optionalText } from './channel.ts'

export const emailSettings = z.object({
  host: z.string().trim().min(1, { error: 'The SMTP server’s name or address.' }),
  port: z.number().int().min(1).max(65535).default(587),
  security: z.enum(['starttls', 'tls', 'none']).default('starttls'),
  username: optionalText,
  password: optionalText,
  from: z
    .string()
    .trim()
    .min(3, { error: 'The address mail comes from: highsea <media@example.org>.' }),
  /** Where notifications go. The server's mail goes to each person's own address. */
  to: z.string().trim().min(3, { error: 'The address notifications go to.' }),
})

export type EmailSettings = z.infer<typeof emailSettings>

/** An image the email carries, referred to from its HTML as `cid:{cid}`. */
export type MailAttachment = {
  filename: string
  content: Uint8Array
  contentType: string
  cid: string
}

export type Mail = {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: MailAttachment[]
}

/** An image for an email, as the runtime hands it over: a PNG or a JPEG. */
export type MailImage = { content: Uint8Array; contentType: string; filename: string }

/**
 * Who the server's emails are from (docs/product/emails.md): its name, its external URL when set,
 * its language and time zone, and its images. The runtime builds it, so this package imports
 * neither personalization nor metadata (ADR 0036).
 */
export type MailBrand = {
  server: string
  externalUrl: string | null
  locale?: string
  timeZone?: string
  /** The server's own logo (Settings › Appearance) as a PNG, or null for highsea's icon. */
  logo(): MailImage | null
  /** A movie's poster, small, from the metadata cache; null when there's none. */
  poster(tmdbId: number): Promise<MailImage | null>
}

/** A server that hasn't said otherwise: highsea, with highsea's icon and no posters. */
export const DEFAULT_BRAND: MailBrand = {
  server: 'highsea',
  externalUrl: null,
  logo: () => null,
  poster: async () => null,
}

/**
 * highsea's app icon, the logo when the server has none of its own: read from @highsea-tv/brand where
 * the module resolver finds it (`import.meta.resolve`, https://nodejs.org/api/esm.html), which is
 * the workspace in development and in the Docker image alike.
 */
let appIcon: MailImage | undefined
function highseaIcon(): MailImage {
  appIcon ??= {
    content: readFileSync(
      fileURLToPath(import.meta.resolve('@highsea-tv/brand/icons/web/icon-192.png')),
    ),
    contentType: 'image/png',
    filename: 'highsea.png',
  }
  return appIcon
}

/** A Content-ID for one image of one message (RFC 2392: unique to it). */
const contentId = (name: string) => `${name}.${randomUUID()}@highsea`

const attach = (image: MailImage, cid: string): MailAttachment => ({ ...image, cid })

/** The logo as an attachment, and the brand as the templates take it. */
function brandFor(b: MailBrand): { brand: Brand; logo: MailAttachment } {
  const logo = attach(b.logo() ?? highseaIcon(), contentId('logo'))
  return {
    brand: {
      server: b.server,
      externalUrl: b.externalUrl,
      logo: `cid:${logo.cid}`,
      locale: b.locale,
      timeZone: b.timeZone,
    },
    logo,
  }
}

/** An invite or a password reset, compiled, with its logo attached. */
export async function linkMail(to: string, b: MailBrand, m: LinkEmail): Promise<Mail> {
  const { brand, logo } = brandFor(b)
  const email = renderLinkEmail(brand, m)
  return {
    to,
    subject: email.subject,
    text: email.text,
    html: await compileEmail(email),
    attachments: [logo],
  }
}

/** The movie whose poster the email shows: the event's, or a list's first. */
function movieOf(m: Message): MovieRef | null {
  const p = m.payload as Partial<EventPayloads['grabbed'] & EventPayloads['movie-added']>
  return p.movie ?? p.movies?.[0] ?? null
}

/** A notification, compiled, with the logo and the movie's poster attached. */
export async function notificationMail(
  to: string,
  m: Message,
  b: MailBrand,
  connection: string | null,
): Promise<Mail> {
  const { brand, logo } = brandFor(b)
  const movie = movieOf(m)
  const poster = movie ? await b.poster(movie.tmdbId).catch(() => null) : null
  const posterAttachment = poster ? attach(poster, contentId('poster')) : null
  const email = renderNotificationEmail(brand, {
    event: m.event,
    level: m.level,
    title: m.title,
    body: m.body,
    connection,
    // Open only goes somewhere when there's an address outside the network
    url: b.externalUrl ? m.url : null,
    image: posterAttachment ? `cid:${posterAttachment.cid}` : null,
    details: emailDetails(m.event, m.payload),
  })
  return {
    to,
    subject: email.subject,
    text: email.text,
    html: await compileEmail(email),
    attachments: posterAttachment ? [logo, posterAttachment] : [logo],
  }
}

const RETRY_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'])

/** Sends one email, throwing a DeliveryError that says whether it's worth trying again. */
export async function sendMail(settings: EmailSettings, mail: Mail): Promise<void> {
  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === 'tls',
    requireTLS: settings.security === 'starttls',
    ignoreTLS: settings.security === 'none',
    auth:
      settings.username && settings.password
        ? { user: settings.username, pass: settings.password }
        : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  try {
    await transport.sendMail({
      from: settings.from,
      ...mail,
      attachments: mail.attachments?.map((a) => ({ ...a, content: Buffer.from(a.content) })),
    })
  } catch (e) {
    const err = e as Error & { code?: string; responseCode?: number }
    const code = err.responseCode
    const retryable =
      code !== undefined ? code >= 400 && code < 500 : RETRY_CODES.has(err.code ?? '')
    throw new DeliveryError(`The mail server refused it: ${err.message}`, {
      retryable,
      status: code ?? null,
    })
  } finally {
    transport.close()
  }
}

export const email = defineChannel({
  kind: 'email',
  settings: emailSettings,
  secrets: ['password'],
  async send(m, s, ctx) {
    const mail = ctx.mail ?? { brand: DEFAULT_BRAND, connection: null }
    await sendMail(s, await notificationMail(s.to, m, mail.brand, mail.connection))
  },
})
