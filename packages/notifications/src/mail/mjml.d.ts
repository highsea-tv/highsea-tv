// SPDX-License-Identifier: AGPL-3.0-only
// `mjml` ships no types (DefinitelyTyped's describe MJML 4). MJML 5's mjml2html returns a promise
// (documentation.mjml.io, "Usage"); these are the options highsea passes.
declare module 'mjml' {
  type MjmlError = { line: number; message: string; tagName: string; formattedMessage?: string }
  type Options = {
    validationLevel?: 'strict' | 'soft' | 'skip'
    minify?: boolean
    keepComments?: boolean
    fonts?: Record<string, string>
  }
  export default function mjml2html(
    mjml: string,
    options?: Options,
  ): Promise<{ html: string; errors: MjmlError[] }>
}
