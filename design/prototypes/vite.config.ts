// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * The static build opens from disk (file://), where browsers refuse module scripts and
 * CORS-mode requests. The bundle is one classic IIFE, so its tag drops `type="module"` and
 * `crossorigin`; fonts are inlined below for the same reason.
 */
function openFromDisk(): Plugin {
  return {
    name: 'highsea:open-from-disk',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/ crossorigin(?=[ >])/g, '')
    },
  }
}

export default defineConfig({
  base: './',
  // the brand's web icons (favicon, touch icon) are served and copied as they are
  publicDir: fileURLToPath(new URL('../../packages/brand/assets/icons/web', import.meta.url)),
  plugins: [react(), tailwindcss(), openFromDisk()],
  build: {
    outDir: 'dist',
    // the Geist woff2 files (about 70 kB each) become data URIs, so fonts load from disk too
    assetsInlineLimit: 100_000,
    // a design reference, not a site: one bundle is simpler than chunks that file:// can't load
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: { format: 'iife' },
      // dependencies ship "use client" for React Server Components; it means nothing here
      onwarn(warning, warn) {
        if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning)
      },
    },
  },
})
