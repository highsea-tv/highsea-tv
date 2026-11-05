// SPDX-License-Identifier: AGPL-3.0-only
// `bun run web` against a real server (one-client-platform-c.md, answer 5): Expo's dev server for
// the web at http://localhost:3200/ (at the root: Expo's baseUrl "is production-only",
// https://docs.expo.dev/more/expo-cli/#hosting-with-sub-paths, and expo-router strips /web only
// outside development) hands `/api` and `/stream` to the server named by
// HIGHSEA_WEB_PROXY (the root script's http://localhost:3000, `bun run server`), so the page and
// the server share an origin and the session cookie signs every call, as in production and as
// apps/web's Vite proxy did. Metro takes this as `server.enhanceMiddleware`, which wraps its own
// middleware (https://metrobundler.dev/docs/configuration/#enhancemiddleware). Bodies are piped
// both ways, so the event stream stays open and the player's byte ranges pass through. Without
// HIGHSEA_WEB_PROXY (the mock, the phone, the TV, every export) nothing changes.
const http = require('node:http')

const PROXIED = /^\/(api|stream)(\/|$)/

/** Metro's middleware, with `/api` and `/stream` sent to `target` first. */
function withProxy(middleware, target) {
  const to = new URL(target)
  return (req, res, next) => {
    if (!PROXIED.test(req.url ?? '')) return middleware(req, res, next)
    const out = http.request(
      {
        protocol: to.protocol,
        hostname: to.hostname,
        port: to.port,
        method: req.method,
        path: req.url,
        // the server sees its own host, as a browser at its address would send
        headers: { ...req.headers, host: to.host },
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(res)
      },
    )
    out.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`highsea's dev proxy couldn't reach ${target}: is \`bun run server\` running?`)
    })
    req.pipe(out)
  }
}

/** The config with the proxy on when HIGHSEA_WEB_PROXY names a server. */
function devProxy(config, target = process.env.HIGHSEA_WEB_PROXY) {
  if (!target) return config
  const enhance = config.server?.enhanceMiddleware
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware, server) =>
      withProxy(enhance ? enhance(middleware, server) : middleware, target),
  }
  return config
}

module.exports = { devProxy, withProxy }
