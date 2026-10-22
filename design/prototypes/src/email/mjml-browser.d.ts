// SPDX-License-Identifier: AGPL-3.0-only
// mjml-browser ships no types. MJML 5's mjml2html returns a promise (documentation.mjml.io).
declare module 'mjml-browser' {
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
