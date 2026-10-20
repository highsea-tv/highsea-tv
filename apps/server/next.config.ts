// SPDX-License-Identifier: AGPL-3.0-only
import type { NextConfig } from 'next'

const config: NextConfig = {
  // workspace packages export raw TypeScript (ADR 0002)
  transpilePackages: [
    '@highsea/api-contract',
    '@highsea/brand',
    '@highsea/core',
    '@highsea/i18n',
    '@highsea/sdk',
    '@highsea/tokens',
    '@highsea/ui-web',
  ],
  // native or Node-only: loaded at run time, never bundled
  serverExternalPackages: ['better-sqlite3', '@highsea/runtime', '@highsea/db', '@highsea/jobs'],
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
}

export default config
