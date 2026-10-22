// SPDX-License-Identifier: AGPL-3.0-only
import '../src/storybook.css'
import { builtInThemes } from '@highsea-tv/tokens'
import { UIProvider } from '@highsea-tv/ui-web'
import { withThemeByDataAttribute } from '@storybook/addon-themes'
import type { Decorator, Preview } from '@storybook/react-vite'
import { theme } from './theme.ts'

/** Platform and sound come from the toolbar and apply to every story. */
const withHighsea: Decorator = (Story, { globals }) => {
  const root = document.documentElement
  if (globals.platform === 'tv') root.dataset.platform = 'tv'
  else delete root.dataset.platform
  return (
    <UIProvider sound={{ enabled: globals.sound === 'on' }}>
      <Story />
    </UIProvider>
  )
}

const preview: Preview = {
  decorators: [
    withHighsea,
    withThemeByDataAttribute({
      themes: Object.fromEntries(Object.values(builtInThemes).map((t) => [t.name, t.id])),
      defaultTheme: builtInThemes.default.name,
      attributeName: 'data-theme',
    }),
  ],
  globalTypes: {
    platform: {
      description: 'TV builds use the 10-foot focus scales',
      toolbar: {
        title: 'Platform',
        icon: 'tablet',
        items: [
          { value: 'web', title: 'Web and desktop' },
          { value: 'tv', title: 'TV' },
        ],
        dynamicTitle: true,
      },
    },
    sound: {
      description: 'UI sound (off by default outside TV)',
      toolbar: {
        title: 'Sound',
        icon: 'speaker',
        items: [
          { value: 'off', title: 'Sound off' },
          { value: 'on', title: 'Sound on' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { platform: 'web', sound: 'off' },
  parameters: {
    layout: 'padded',
    backgrounds: { disable: true },
    controls: { expanded: true, sort: 'requiredFirst' },
    docs: { theme, codePanel: true },
    // violations fail story tests; the panel shows them while browsing
    a11y: { test: 'error' },
    options: {
      storySort: {
        order: ['Introduction', 'Foundations', 'Components', 'Media', 'Shell', 'TV'],
      },
    },
  },
}

export default preview
