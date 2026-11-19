// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's page comes alive (HT-107): the client's desktop export (apps/client/dist-desktop,
// what `tauri build` embeds) served with the Content-Security-Policy Tauri sends with it, then
// opened in WebKit, the engine of the Mac's WKWebView and Linux's WebKitGTK. It fails when a
// stylesheet or script is refused, when the page isn't laid out by react-native-web, or when a
// button doesn't respond.
//
// Why it exists: 0.4.0 to 0.4.9 shipped an unstyled desktop app nobody could click. Tauri rewrites
// the policy of the assets it embeds, adding a nonce to `style-src` for the export's own `<style>`
// (tauri-utils' `inject_nonce_token`, tauri's `replace_csp_nonce`; the option
// `dangerousDisableAssetCspModification` in https://v2.tauri.app/reference/config/#securityconfig),
// and with a nonce present a browser ignores `'unsafe-inline'`
// (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src#unsafe_inline_styles),
// so every `<style>` react-native-web, Reanimated and expo-font insert at run time was refused.
// `tauri dev` loads the dev server and never adds the nonce, which is why only release builds broke.
//
//   bun scripts/sweeps/desktop.ts            # after `bun run --cwd apps/client export:desktop`
//   DESKTOP_EXPORT=/path/to/dist bun scripts/sweeps/desktop.ts
import { createHash, randomInt } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { webkit } from 'playwright-core'
import { atExit } from './ending.ts'
import { ROOT } from './lib.ts'

type Csp = Record<string, string>

interface Security {
  csp: Csp
  dangerousDisableAssetCspModification?: boolean | string[]
}

const canModify = (sec: Security, directive: string): boolean => {
  const off = sec.dangerousDisableAssetCspModification
  return off === undefined || off === false ? true : off === true ? false : !off.includes(directive)
}

/**
 * The page and its policy as Tauri 2 serves an embedded HTML asset: a nonce on every `<style>` and
 * every `<script src="http…">`, each nonce and each inline script's hash added to the directive
 * with `'self'`, unless `dangerousDisableAssetCspModification` names it (tauri-utils 2.10's
 * `html::inject_nonce_token` and tauri-codegen's `inject_script_hashes`, tauri 2.12's
 * `manager::replace_csp_nonce`).
 */
export function asTauriServes(html: string, sec: Security): { html: string; csp: string } {
  const csp: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(sec.csp)) csp[k] = v.split(/\s+/).filter(Boolean)
  const add = (directive: string, sources: string[]) => {
    if (sources.length === 0) return
    const list = csp[directive] ?? []
    if (!list.includes("'self'")) list.push("'self'")
    list.push(...sources)
    csp[directive] = list
  }
  let page = html
  if (canModify(sec, 'script-src')) {
    const nonces: string[] = []
    page = page.replace(/<script(?![^>]*\bnonce=)(?=[^>]*\bsrc=["']?http)/g, () => {
      const n = String(randomInt(2 ** 47))
      nonces.push(`'nonce-${n}'`)
      return `<script nonce="${n}"`
    })
    const hashes = [...page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1] ?? '')
      .filter((body) => body.length > 0)
      .map((body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`)
    add('script-src', [...nonces, ...hashes])
  }
  if (canModify(sec, 'style-src')) {
    const nonces: string[] = []
    page = page.replace(/<style(?![^>]*\bnonce=)/g, () => {
      const n = String(randomInt(2 ** 47))
      nonces.push(`'nonce-${n}'`)
      return `<style nonce="${n}"`
    })
    add('style-src', nonces)
  }
  return {
    html: page,
    csp: Object.entries(csp)
      .map(([k, v]) => `${k} ${v.join(' ')}`)
      .join('; '),
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

async function main() {
  const dist = process.env.DESKTOP_EXPORT ?? join(ROOT, 'apps/client/dist-desktop')
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(
      `No desktop export at ${dist}: run \`bun run --cwd apps/client export:desktop\` first.`,
    )
    process.exit(1)
  }
  const conf = JSON.parse(
    readFileSync(join(ROOT, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
  )
  const sec = conf.app.security as Security
  const index = readFileSync(join(dist, 'index.html'), 'utf8')

  // Tauri answers an unknown path with index.html, as a single-page app wants
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = normalize(decodeURIComponent(new URL(req.url).pathname)).replace(
        /^(\.\.[/\\])+/,
        '',
      )
      const file = Bun.file(join(dist, path))
      if (path !== '/' && extname(path) !== '.html' && (await file.exists())) {
        return new Response(file, {
          headers: { 'content-type': TYPES[extname(path)] ?? file.type },
        })
      }
      const { html, csp } = asTauriServes(index, sec)
      return new Response(html, {
        headers: { 'content-type': 'text/html', 'content-security-policy': csp },
      })
    },
  })
  const browser = await webkit.launch()
  atExit(() => {
    server.stop(true)
    void browser.close()
  })

  const failures: string[] = []
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', (m) => {
    if (/Content.Security.Policy|Refused to/i.test(m.text()))
      failures.push(`refused: ${m.text().slice(0, 240)}`)
  })
  page.on('requestfailed', (r) => failures.push(`failed to load: ${r.url()}`))
  const started = Date.now()
  await page.goto(`http://localhost:${server.port}/`)

  // Choose a server is what a desktop app with no server draws
  const heading = page.getByText('Choose a server', { exact: true })
  try {
    await heading.waitFor({ timeout: 30_000 })
  } catch {
    failures.push('the page never drew Choose a server: the script did not start')
  }
  if (failures.length === 0) {
    const look = await heading.evaluate((h) => {
      const sheet = document.getElementById('react-native-stylesheet') as HTMLStyleElement | null
      return {
        rules: sheet?.sheet?.cssRules.length ?? 0,
        font: getComputedStyle(h).fontFamily,
        left: h.getBoundingClientRect().left,
      }
    })
    if (look.rules === 0)
      failures.push("react-native-web's stylesheet has no rules: its styles were refused")
    if (!/geist/i.test(look.font))
      failures.push(`the heading is drawn in ${look.font || 'nothing'}, not the brand's font`)
    // the card is centred in the window, so its heading starts well right of the edge
    if (look.left < 200)
      failures.push(
        `the heading starts ${Math.round(look.left)}px from the left: nothing is laid out`,
      )

    await page.getByText('Find my servers with a highsea account', { exact: true }).click()
    try {
      await page.getByText(/^Optional\. If your server/).waitFor({ timeout: 5_000 })
    } catch {
      failures.push('Find my servers with a highsea account did not open when clicked')
    }
  }
  if (process.env.DESKTOP_SCREENSHOT)
    await page.screenshot({ path: process.env.DESKTOP_SCREENSHOT })

  const secs = ((Date.now() - started) / 1000).toFixed(1)
  if (failures.length > 0) {
    console.error(`The desktop export does not come alive under Tauri's policy (${secs} s):`)
    for (const f of [...new Set(failures)].slice(0, 12)) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log(
    `The desktop export comes alive under Tauri's policy: styled, laid out, and its buttons answer (${secs} s).`,
  )
  process.exit(0)
}

if (import.meta.main) await main()
