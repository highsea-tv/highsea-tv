// SPDX-License-Identifier: AGPL-3.0-only
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { clientExport } from './client-export.ts'

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

const require = createRequire(import.meta.url)
/** Vite's default extensions, each with its `.web` file first, as react-native-web's setup asks. */
const WEB_FIRST = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'].flatMap((e) =>
  e === '.json' ? [e] : [`.web${e}`, e],
)

export default defineConfig(({ command }) => ({
  base: './',
  // the library's React Native drawing for the admin's shared screens (@highsea-tv/admin,
  // one-client-platform-d.md › D1), set up as apps/server/next.config.ts sets up webpack:
  // react-native resolves to react-native-web through @highsea-tv/ui/next's shim, `.web` files
  // come first (https://necolas.github.io/react-native-web/docs/setup/), and `__DEV__`, `EXPO_OS`
  // and the browser's `global` are defined as Metro defines them
  // (https://vite.dev/config/shared-options#resolve-alias, #define)
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: require.resolve('@highsea-tv/ui/next/react-native') },
      {
        find: /^react-native\/Libraries\/Utilities\/codegenNativeComponent$/,
        replacement: require.resolve('@highsea-tv/ui/next/codegen-native-component'),
      },
      {
        find: /^@react-native\/assets-registry\/registry$/,
        replacement: require.resolve('@highsea-tv/ui/next/asset-registry'),
      },
    ],
    extensions: WEB_FIRST,
  },
  // expo-modules-core's `ts-declarations` re-export names that exist only as types, so their `.js`
  // files are empty; webpack and Metro let a missing export through as `undefined`, and Rolldown
  // does too with `shimMissingExports` (https://rollupjs.org/configuration-options/#shimmissingexports),
  // in the dependencies' prebundle and the build alike. The prebundle resolves files inside a
  // dependency with Rolldown's own resolver, so it's given the `.web` extensions too
  // (https://rolldown.rs/reference/InputOptions.resolve#extensions)
  optimizeDeps: {
    rolldownOptions: { shimMissingExports: true, resolve: { extensions: WEB_FIRST } },
  },
  define: {
    __DEV__: JSON.stringify(command === 'serve'),
    'process.env.EXPO_OS': JSON.stringify('web'),
    global: 'globalThis',
  },
  // the brand's web icons (favicon, touch icon) are served and copied as they are
  publicDir: fileURLToPath(new URL('../../packages/brand/assets/icons/web', import.meta.url)),
  // apps/client's mock web export at /web, which the chrome's client frames hold
  plugins: [react(), tailwindcss(), openFromDisk(), clientExport()],
  build: {
    outDir: 'dist',
    // the Geist woff2 files (about 70 kB each) become data URIs, so fonts load from disk too
    assetsInlineLimit: 100_000,
    // a design reference, not a site: one bundle is simpler than chunks that file:// can't load
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      shimMissingExports: true,
      output: { format: 'iife' },
      // dependencies ship "use client" for React Server Components; it means nothing here
      onwarn(warning, warn) {
        if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning)
      },
    },
  },
}))
