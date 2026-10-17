// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url'
import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'

const brand = (path: string) =>
  fileURLToPath(new URL(`../../../packages/brand/${path}`, import.meta.url))

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-themes'],
  staticDirs: [
    { from: brand('assets/logo'), to: '/brand' },
    { from: brand('assets/icons/web'), to: '/brand-icons' },
    { from: brand('fonts'), to: '/fonts' },
  ],
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  features: { sidebarOnboardingChecklist: false },
  async viteFinal(config) {
    const { mergeConfig } = await import('vite')
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      build: {
        // a local style guide, not a site: Storybook's own manager and docs chunks run past 500 kB
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
          // dependencies ship "use client" for React Server Components; it means nothing here
          onwarn(warning, warn) {
            if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning)
          },
        },
      },
    })
  },
}

export default config
