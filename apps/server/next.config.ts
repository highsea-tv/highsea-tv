// SPDX-License-Identifier: AGPL-3.0-only
import type { NextConfig } from 'next'

const config: NextConfig = {
  // workspace packages export raw TypeScript (ADR 0002)
  transpilePackages: [
    '@highsea/api-contract',
    '@highsea/brand',
    '@highsea/core',
    '@highsea/fixtures',
    '@highsea/i18n',
    '@highsea/personalization',
    '@highsea/quality',
    '@highsea/sdk',
    '@highsea/tokens',
    '@highsea/ui-web',
  ],
  // native or Node-only: loaded at run time, never bundled
  serverExternalPackages: ['better-sqlite3', '@highsea/runtime', '@highsea/db', '@highsea/jobs'],
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
