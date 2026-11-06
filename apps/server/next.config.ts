// SPDX-License-Identifier: AGPL-3.0-only
import { libraryWebpack } from '@highsea-tv/ui/next/webpack'
import type { NextConfig } from 'next'

const config: NextConfig = {
  // workspace packages export raw TypeScript (ADR 0002)
  transpilePackages: [
    '@highsea-tv/admin',
    '@highsea-tv/api-contract',
    '@highsea-tv/brand',
    '@highsea-tv/core',
    '@highsea-tv/fixtures',
    '@highsea-tv/i18n',
    '@highsea-tv/personalization',
    '@highsea-tv/quality',
    '@highsea-tv/sdk',
    '@highsea-tv/tokens',
    '@highsea-tv/ui',
  ],
  // native or Node-only: loaded at run time, never bundled
  serverExternalPackages: [
    'better-sqlite3',
    '@highsea-tv/runtime',
    '@highsea-tv/db',
    '@highsea-tv/jobs',
  ],
  // the library's React Native drawing on the web, on webpack: @highsea-tv/ui/next/webpack says how
  webpack: (webpack, context) => {
    // serverExternalPackages matches a package by its path under node_modules, and a workspace
    // package resolves to its own folder, so the server's ones are named here too: Node loads them
    // at run time with the process's one runtime, as server.ts does
    // (https://webpack.js.org/configuration/externals/#function)
    if (context.isServer) {
      const own = /^@highsea-tv\/(runtime|db|jobs)(\/|$)/
      webpack.externals = [
        (
          { request }: { request?: string },
          done: (error?: Error | null, result?: string) => void,
        ) => (request && own.test(request) ? done(null, `commonjs ${request}`) : done()),
        ...[webpack.externals ?? []].flat(),
      ]
    }
    return libraryWebpack(webpack, context)
  },
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
  // the service worker is always fetched fresh, and loads nothing but itself (Next's PWA guide:
  // https://nextjs.org/docs/app/guides/progressive-web-apps#8-securing-your-application)
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default config
