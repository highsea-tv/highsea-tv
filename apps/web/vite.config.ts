// SPDX-License-Identifier: AGPL-3.0-only
// The web client (ADR 0053): a static build the server serves at /web from its image. In
// development Vite serves it and passes the API and the streams to `bun run server`, so the
// session cookie and every request stay on one origin (https://vite.dev/config/server-options.html#server-proxy).
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const server = process.env.HIGHSEA_DEV_SERVER ?? 'http://localhost:3000'

export default defineConfig({
  // every address and asset sits under /web (https://vite.dev/config/shared-options.html#base)
  base: '/web/',
  // the brand's web icons (favicon, touch icon) are served and copied as they are
  publicDir: fileURLToPath(new URL('../../packages/brand/assets/icons/web', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: server, changeOrigin: false },
      '/stream': { target: server, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      // dependencies ship "use client" for React Server Components; it means nothing here
      onwarn(warning, warn) {
        if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning)
      },
    },
  },
})
