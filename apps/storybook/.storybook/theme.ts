// SPDX-License-Identifier: AGPL-3.0-only
// The default theme's values, hardcoded because Storybook's chrome is themed before any CSS loads.
// test/storybook.test.ts keeps them in step with @highsea-tv/tokens.
import { create } from 'storybook/theming'

export const chrome = {
  bg: '#0b0b0c',
  s1: '#121214',
  s2: '#18181b',
  s3: '#1f1f22',
  s4: '#28282c',
  /** `line` composited over `s1`, the chrome's surface */
  line: '#232324',
  text: '#ededee',
  text2: '#c7c7cb',
  text3: '#a2a2a7',
  accent: '#d6cfc2',
  onAccent: '#0b0b0c',
}

export const theme = create({
  base: 'dark',
  brandTitle: 'highsea tv · design system',
  brandUrl: '/',
  brandImage: './brand/lockup.svg',
  brandTarget: '_self',
  fontBase: '"Geist", ui-sans-serif, system-ui, sans-serif',
  fontCode: '"Geist Mono", ui-monospace, monospace',
  colorPrimary: chrome.accent,
  // active toolbar items; the selected sidebar row is restyled in manager-head.html
  colorSecondary: chrome.accent,
  appBg: chrome.s1,
  appContentBg: chrome.bg,
  appPreviewBg: chrome.bg,
  appBorderColor: chrome.line,
  appBorderRadius: 8,
  textColor: chrome.text,
  textInverseColor: chrome.onAccent,
  textMutedColor: chrome.text3,
  barBg: chrome.s1,
  barTextColor: chrome.text2,
  barSelectedColor: chrome.accent,
  barHoverColor: chrome.text,
  inputBg: chrome.s2,
  inputBorder: chrome.line,
  inputTextColor: chrome.text,
  inputBorderRadius: 8,
  buttonBg: chrome.s2,
  buttonBorder: chrome.line,
  booleanBg: chrome.s2,
  booleanSelectedBg: chrome.s3,
})
