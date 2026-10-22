// SPDX-License-Identifier: AGPL-3.0-only
// highsea's emails as MJML (https://documentation.mjml.io/), with a plain-text part for each
// (docs/product/emails.md): the server's mail (an invite, a password reset) and an Email
// connection's notifications. Pure: data in, MJML and text out, with no DOM, no React and nothing
// from Node, so the prototypes' preview renders these same templates and compiles them with
// mjml-browser, and the server compiles them with `mjml` (compile.ts) when it sends.
//
// The look is the brand's Abyss palette (tokens.ts), dark-first like the product. The head
// declares that (`color-scheme: dark`, CSS Color Adjustment Level 1 § 2.1, and Apple's
// `supported-color-schemes`), so clients that honour it leave the colours alone. Clients that
// invert anyway (Gmail on iOS, Outlook on Windows; Litmus' dark mode guide) get a light
// version; the logo is a raster tile with its own dark ground, so it survives. Every colour is
// also an attribute MJML writes inline, so clients that drop <style> keep them.
//
// Images: the preview passes data URIs. The server attaches the logo and the poster to the message
// and refers to them by Content-ID (Nodemailer embedded images,
// https://nodemailer.com/message/embedded-images/), so nothing loads remotely and they show
// without an external URL.
import { createT, type T } from '@highsea/i18n'
import { emailMessages } from './messages.ts'
import { fonts, type Level, palette, shape, type } from './tokens.ts'

export type { Level }

/** Who the mail is from: the server's name and logo, its external URL when set, its language. */
export type Brand = {
  server: string
  externalUrl: string | null
  /** The logo tile's address: a `cid:` on the server, a data URI in the preview. */
  logo: string
  locale?: string
  timeZone?: string
}

export type LinkEmail = {
  kind: 'invite' | 'reset'
  name: string
  /** Who sent the invite; ignored for a reset. */
  inviter?: string
  link: string
  expiresAt: number
}

export type EventKind =
  | 'grabbed'
  | 'imported'
  | 'upgraded'
  | 'download-failed'
  | 'subtitle-added'
  | 'health'
  | 'update'
  | 'movie-added'
  | 'test'

export type Detail = {
  label: 'quality' | 'size' | 'release' | 'indexer' | 'replaced' | 'version'
  value: string
}

/** A notification as the service renders it (`Message` in @highsea/notifications), plus details. */
export type NotificationEmail = {
  event: EventKind
  level: Level
  title: string
  body: string
  /** The connection's name, for the footer; null for one not saved yet (Test on a draft). */
  connection: string | null
  /** Where "Open in …" goes: only when the server's external URL is set. */
  url: string | null
  /** The poster, for movie events. */
  image: string | null
  details: Detail[]
}

export type RenderedEmail = { subject: string; preheader: string; mjml: string; text: string }

/**
 * How every email compiles. `fonts: {}` because MJML links a Google Fonts stylesheet whenever a
 * font-family names one of its defaults (Roboto, in the system stack), and an email loads no web
 * font (documentation.mjml.io, "Options": `fonts`).
 */
export const compileOptions = { validationLevel: 'strict', fonts: {} } as const

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const tFor = (brand: Brand) => createT(emailMessages, brand.locale ?? 'en')

const sentBy = (t: T<typeof emailMessages>, server: string) =>
  server.trim().toLowerCase() === 'highsea' ? t('sentByHighsea') : t('sentBy', { server })

// ---------------------------------------------------------------- the frame

/** One full-width block of the card. */
const block = (content: string) =>
  `      <mj-section>\n        <mj-column>\n${content}\n        </mj-column>\n      </mj-section>`

/** The head, the header above the card, the card around `blocks`, and the footer below it. */
function frame(
  brand: Brand,
  o: { subject: string; preheader: string; blocks: string[]; footer: string[] },
): string {
  const gutter = 'gutter'
  return `<mjml lang="${escapeHtml(brand.locale ?? 'en')}">
  <mj-head>
    <mj-title>${escapeHtml(o.subject)}</mj-title>
    <mj-preview>${escapeHtml(o.preheader)}</mj-preview>
    <mj-breakpoint width="${shape.breakpoint}px" />
    <mj-raw>
      <meta name="color-scheme" content="dark">
      <meta name="supported-color-schemes" content="dark">
    </mj-raw>
    <mj-attributes>
      <mj-all font-family="${fonts.sans}" />
      <mj-section padding="0" />
      <mj-column padding="0" />
      <mj-text padding="0" color="${palette.text2}" font-size="${type.body.size}" line-height="${type.body.lineHeight}" />
      <mj-button padding="0" />
      <mj-image padding="0" />
      <mj-table padding="0" />
    </mj-attributes>
    <mj-style>
      :root { color-scheme: dark; supported-color-schemes: dark; }
      body { background-color: ${palette.canvas}; }
      .link a { color: ${palette.link}; }
      @media only screen and (max-width: ${shape.breakpoint - 1}px) {
        .card > table > tbody > tr > td { padding: ${shape.paddingNarrow}px !important; }
        .card { margin: 0 12px !important; }
        .${gutter} > table > tbody > tr > td { padding-left: 16px !important; padding-right: 16px !important; }
        .poster { width: 32% !important; max-width: 32% !important; }
        .info { width: 68% !important; max-width: 68% !important; }
      }
    </mj-style>
  </mj-head>
  <mj-body width="${shape.width}px" background-color="${palette.canvas}">
    <mj-section padding="32px 4px 16px" css-class="${gutter}">
      <mj-column>
        <mj-text>${header(brand)}</mj-text>
      </mj-column>
    </mj-section>
    <mj-wrapper padding="${shape.padding}px" background-color="${palette.card}" border="1px solid ${palette.border}" border-radius="${shape.cardRadius}px" css-class="card">
${o.blocks.join('\n')}
    </mj-wrapper>
    <mj-section padding="20px 4px 40px" css-class="${gutter}">
      <mj-column>
${o.footer.map((line) => `        <mj-text color="${palette.text3}" font-size="${type.caption.size}" line-height="${type.caption.lineHeight}" padding="0 0 4px">${escapeHtml(line)}</mj-text>`).join('\n')}
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
}

/** The logo tile and the server's name, as a small table so they stay on one line. */
const header = (brand: Brand) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
  `<td style="vertical-align:middle;"><img src="${escapeHtml(brand.logo)}" width="${shape.logo}" height="${shape.logo}" alt="" style="display:block;border:0;border-radius:${shape.logoRadius}px;"></td>` +
  `<td style="vertical-align:middle;padding-left:12px;font-family:${escapeHtml(fonts.sans)};font-size:15px;line-height:20px;font-weight:600;color:${palette.text};">${escapeHtml(brand.server)}</td>` +
  `</tr></table>`

const title = (s: string, bottom = 12) =>
  `          <mj-text color="${palette.text}" font-size="${type.title.size}" line-height="${type.title.lineHeight}" font-weight="${type.title.weight}" letter-spacing="${type.title.tracking}" padding="0 0 ${bottom}px">${escapeHtml(s)}</mj-text>`

const para = (s: string, bottom = 16) =>
  `          <mj-text padding="0 0 ${bottom}px">${escapeHtml(s)}</mj-text>`

const caption = (s: string, bottom = 4) =>
  `          <mj-text color="${palette.text3}" font-size="${type.caption.size}" line-height="${type.caption.lineHeight}" padding="0 0 ${bottom}px">${escapeHtml(s)}</mj-text>`

const button = (label: string, href: string, bottom = 0) =>
  `          <mj-button href="${escapeHtml(href)}" align="left" background-color="${palette.buttonFill}" color="${palette.buttonLabel}" font-size="15px" font-weight="600" line-height="20px" border-radius="${shape.buttonRadius}px" inner-padding="12px 20px" padding="0 0 ${bottom}px">${escapeHtml(label)}</mj-button>`

const divider = (top = 24, bottom = 20) =>
  `          <mj-divider border-width="1px" border-color="${palette.divider}" padding="${top}px 0 ${bottom}px" />`

/** A tinted pill with a dot in the status colour and the event's name: never colour alone. */
function badge(level: Level, label: string): string {
  const b = palette.badge[level]
  return (
    `          <mj-text padding="0 0 16px">` +
    `<span style="display:inline-block;background-color:${b.fill};border-radius:999px;padding:2px 10px 2px 8px;font-size:12px;line-height:18px;font-weight:600;color:${b.label};">` +
    `<span style="color:${b.dot};">&#9679;</span>&nbsp;${escapeHtml(label)}</span></mj-text>`
  )
}

// ---------------------------------------------------------------- the server's mail

/** An invite or a password reset: the button, the link written out, when it expires. */
export function renderLinkEmail(brand: Brand, m: LinkEmail): RenderedEmail {
  const t = tFor(brand)
  const date = new Intl.DateTimeFormat(brand.locale ?? 'en', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: brand.timeZone,
  }).format(m.expiresAt)
  const invite = m.kind === 'invite'
  const server = brand.server
  const inviter = m.inviter ?? server
  const subject = invite ? t('invite.subject', { server }) : t('reset.subject', { server })
  const preheader = invite ? t('invite.preheader', { inviter }) : t('reset.preheader')
  const greeting = invite
    ? t('invite.greeting', { name: m.name })
    : t('reset.greeting', { name: m.name })
  const body = invite ? t('invite.body', { inviter, server }) : t('reset.body', { server })
  const action = invite ? t('invite.button') : t('reset.button')
  const expires = t('expires', { date })
  const ignore = t('ignore')
  const footer = [sentBy(t, server)]

  const mjml = frame(brand, {
    subject,
    preheader,
    footer,
    blocks: [
      block(
        [
          title(subject, 20),
          para(greeting, 12),
          para(body, 24),
          button(action, m.link, 24),
          caption(t('paste'), 4),
          `          <mj-text css-class="link" font-family="${fonts.mono}" font-size="${type.mono.size}" line-height="${type.mono.lineHeight}" color="${palette.link}"><a href="${escapeHtml(m.link)}" style="color:${palette.link};text-decoration:none;word-break:break-all;">${escapeHtml(m.link)}</a></mj-text>`,
          divider(),
          caption(expires),
          caption(ignore, 0),
        ].join('\n'),
      ),
    ],
  })
  const text = [subject, '', greeting, '', body, '', m.link, '', expires, ignore, '', ...footer]
  return { subject, preheader, mjml, text: text.join('\n') }
}

// ---------------------------------------------------------------- notifications

/** One notification: its badge and title, the poster beside the details, and Open when it can. */
export function renderNotificationEmail(brand: Brand, n: NotificationEmail): RenderedEmail {
  const t = tFor(brand)
  const server = brand.server
  const event = t(`event.${n.event}`)
  const open = n.url ? t('open', { server }) : null
  const connection = n.connection ?? t('thisConnection')
  const why =
    n.event === 'test' ? t('becauseTest', { connection }) : t('because', { connection, event })
  const footer = [`${why} ${t('change')}`, sentBy(t, server)]
  const details = n.details.map((d) => ({ label: t(`detail.${d.label}`), value: d.value }))

  const detailRows = details.length
    ? `          <mj-table padding="0" cellpadding="0" width="100%">` +
      details
        .map(
          (d) =>
            `<tr><td style="padding:0 0 6px;vertical-align:top;font-family:${escapeHtml(fonts.sans)};font-size:${type.caption.size};line-height:${type.mono.lineHeight};color:${palette.text3};white-space:nowrap;width:1%;padding-right:16px;">${escapeHtml(d.label)}</td>` +
            `<td style="padding:0 0 6px;vertical-align:top;font-family:${escapeHtml(fonts.mono)};font-size:${type.mono.size};line-height:${type.mono.lineHeight};color:${palette.text2};word-break:break-word;">${escapeHtml(d.value)}</td></tr>`,
        )
        .join('') +
      `</mj-table>`
    : ''

  // the details are the body's facts set out, so they stand in for it rather than repeat it
  const info = details.length ? detailRows : para(n.body, 0)
  const poster = n.image
    ? `            <mj-image src="${escapeHtml(n.image)}" alt="" width="${shape.poster.width}px" height="${shape.poster.height}px" border-radius="${shape.poster.radius}px" align="left" container-background-color="${palette.card}"${n.url ? ` href="${escapeHtml(n.url)}"` : ''} />`
    : ''

  // the poster and the details stay side by side on a phone: mj-group never stacks its columns,
  // but it scales them by their share of the desktop width, which leaves a phone's poster ~70px
  // wide, so the frame's narrow rule widens the poster's column (`poster`, `info`). The gap is the
  // details' padding, so it holds at every width.
  const inner = shape.width - 2 * shape.padding - 2
  const middle = n.image
    ? `      <mj-section>
        <mj-group>
          <mj-column width="${shape.poster.width}px" vertical-align="top" css-class="poster">
${poster}
          </mj-column>
          <mj-column width="${inner - shape.poster.width}px" vertical-align="top" padding-left="20px" css-class="info">
${info}
          </mj-column>
        </mj-group>
      </mj-section>`
    : block(info)

  const mjml = frame(brand, {
    subject: n.title,
    preheader: n.body,
    footer,
    blocks: [
      block([badge(n.level, event), title(n.title, 16)].join('\n')),
      middle,
      open && n.url ? block(`          <mj-spacer height="24px" />\n${button(open, n.url)}`) : '',
    ].filter(Boolean),
  })
  const text = [
    `${event}: ${n.title}`,
    '',
    ...(details.length ? details.map((d) => `${d.label}: ${d.value}`) : [n.body]),
    ...(n.url && open ? ['', `${open}:`, n.url] : []),
    '',
    ...footer,
  ]
  return { subject: n.title, preheader: n.body, mjml, text: text.join('\n') }
}
