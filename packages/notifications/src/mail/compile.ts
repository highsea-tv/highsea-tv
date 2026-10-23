// SPDX-License-Identifier: AGPL-3.0-only
// The server compiles each email's MJML to HTML when it sends, with `mjml`'s documented Node API
// (https://documentation.mjml.io/#usage: `mjml2html(mjml, options)`, a promise since MJML 5). Strict
// validation throws on a template mistake rather than sending a broken email. Not part of the
// browser-safe entry (index.ts): only the email channel and the service import it.
/// <reference path="./mjml.d.ts" />
import mjml2html from 'mjml'
import { compileOptions, type RenderedEmail } from './templates.ts'

/** The email's HTML. */
export async function compileEmail(email: RenderedEmail): Promise<string> {
  const out = await mjml2html(email.mjml, compileOptions)
  return out.html
}
