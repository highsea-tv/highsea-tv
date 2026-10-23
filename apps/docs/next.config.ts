// SPDX-License-Identifier: AGPL-3.0-only
// highsea's public documentation, served at docs.highsea.tv (phase-3-checkpoint-9.md › Docs).
// Exported as static files, so Vercel serves files and nothing runs per request
// (https://fumadocs.dev/docs/deploying/static, https://nextjs.org/docs/app/guides/static-exports).
import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'export',
  // `/install/docker/index.html`, so any static host serves the folder as it is
  trailingSlash: true,
  // workspace packages export raw TypeScript (ADR 0002)
  transpilePackages: ['@highsea-tv/brand', '@highsea-tv/tokens', '@highsea-tv/ui-web'],
  // static export has no image optimizer (https://nextjs.org/docs/app/guides/static-exports#image-optimization)
  images: { unoptimized: true },
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
}

export default createMDX()(config)
