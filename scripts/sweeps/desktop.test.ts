// SPDX-License-Identifier: AGPL-3.0-only
// The desktop check's copy of Tauri's policy (desktop.ts): nonces where Tauri adds them, none
// where tauri.conf.json turns that off, so the check serves the page as the app does.
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { asTauriServes } from './desktop.ts'
import { ROOT } from './lib.ts'

const PAGE =
  '<html><head><style id="r">#root{}</style></head><body><script src="/_expo/a.js" defer></script></body></html>'
const CSP = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self' 'unsafe-inline'",
}

test('by default a nonce goes on each <style> and into style-src, which turns unsafe-inline off', () => {
  const { html, csp } = asTauriServes(PAGE, { csp: CSP })
  const nonce = html.match(/<style nonce="(\d+)"/)?.[1]
  expect(nonce).toBeDefined()
  expect(csp).toContain(`style-src 'self' 'unsafe-inline' 'nonce-${nonce}'`)
  // a script from the app's own origin gets no nonce: Tauri marks only http(s) ones
  expect(csp).toContain("script-src 'self';")
  expect(html).toContain('<script src="/_expo/a.js"')
})

test('an inline script is allowed by its hash', () => {
  const { csp } = asTauriServes('<script>go()</script>', { csp: CSP })
  expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/)
})

test('a directive named in dangerousDisableAssetCspModification is left as written', () => {
  const { html, csp } = asTauriServes(PAGE, {
    csp: CSP,
    dangerousDisableAssetCspModification: ['style-src'],
  })
  expect(html).toContain('<style id="r">')
  expect(csp).toMatch(/style-src 'self' 'unsafe-inline'$/)
})

test("the app's own config leaves style-src to unsafe-inline", () => {
  const conf = JSON.parse(
    readFileSync(join(ROOT, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
  )
  const { csp } = asTauriServes(PAGE, conf.app.security)
  expect(csp).toMatch(/style-src 'self' 'unsafe-inline';/)
  expect(csp).not.toMatch(/style-src[^;]*nonce/)
})
