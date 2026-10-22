// SPDX-License-Identifier: AGPL-3.0-only
// highsea's emails (docs/product/emails.md): the templates as MJML with a plain-text part, their
// words and the palette they're painted in. Browser-safe: the prototypes' preview imports this
// entry, so nothing here reaches Node, the database or `mjml` (the server compiles in compile.ts).
export { emailDetails } from './details.ts'
export { emailMessages } from './messages.ts'
export {
  type Brand,
  compileOptions,
  type Detail,
  type EventKind,
  type Level,
  type LinkEmail,
  type NotificationEmail,
  type RenderedEmail,
  renderLinkEmail,
  renderNotificationEmail,
} from './templates.ts'
export { fonts, palette, shape, type } from './tokens.ts'
