// SPDX-License-Identifier: AGPL-3.0-only
// The web client (ADR 0053): a static build the server serves at /web from its image. In
// development Vite serves it and passes the API and the streams to `bun run server`, so the
// session cookie and every request stay on one origin (https://vite.dev/config/server-options.html#server-proxy).
//
// `--mode desktop` builds the same app for the desktop app's window (ADR 0058), as Tauri's Vite
// guide sets it up (https://v2.tauri.app/start/frontend/vite/): at `/` in `dist-desktop/`, on a
// fixed port Tauri waits for, for the webview each OS has (WebView2 on Windows is Chromium;
// WKWebView on macOS 11 is Safari 14's). The page reaches the server through the app (src/host.ts),
// so there's no proxy.
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const server = process.env.HIGHSEA_DEV_SERVER ?? 'http://localhost:3000'

export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop'
  return {
    // every address and asset sits under /web (https://vite.dev/config/shared-options.html#base)
    base: desktop ? '/' : '/web/',
    // Tauri's own variables (its Vite guide)
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    clearScreen: !desktop,
    // the brand's web icons (favicon, touch icon) are served and copied as they are
    publicDir: fileURLToPath(new URL('../../packages/brand/assets/icons/web', import.meta.url)),
    plugins: [react(), tailwindcss()],
    server: desktop
      ? { port: 3201, strictPort: true }
      : {
          proxy: {
            '/api': { target: server, changeOrigin: false },
            '/stream': { target: server, changeOrigin: false },
          },
        },
    build: {
      outDir: desktop ? 'dist-desktop' : 'dist',
      ...(desktop
        ? { target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari14' }
        : {}),
      rollupOptions: {
        // dependencies ship "use client" for React Server Components; it means nothing here
        onwarn(warning, warn) {
          if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning)
        },
      },
    },
  }
})
