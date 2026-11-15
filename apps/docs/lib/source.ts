// SPDX-License-Identifier: AGPL-3.0-only
// The guides in content/, compiled by fumadocs-mdx's macro (https://fumadocs.dev/docs/mdx/next)
// and served from the site's root.
// Code blocks keep Fumadocs' themes, Shiki's github-light and github-dark (its rehypeCode, through
// the MDX preset, https://www.fumadocs.dev/docs/headless/mdx/rehype-code; collection-level options
// replace the preset's, so they go through `applyMdxPreset`). One colour of github-dark fails WCAG
// AA's 4.5:1 for text (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) on the block's
// background, s1: its comments' #6a737d, at 3.9:1, which axe's color-contrast found
// (https://dequeuniversity.com/rules/axe/4.14/color-contrast). Shiki's `colorReplacements`
// (https://shiki.style/guide/theme-colors#color-replacements) draws them in the tokens' text-3
// instead, 7.4:1 on s1, highsea's muted text; every other colour of the theme is 7:1 or more. The
// site draws only its dark theme (globals.css), so only github-dark's is replaced.
import { defaultTheme } from '@highsea-tv/tokens'
import { loader } from 'fumadocs-core/source'
import { applyMdxPreset } from 'fumadocs-mdx/config'
import { defineDocs } from 'fumadocs-mdx/macro'

const docs = defineDocs({
  dir: 'content',
  docs: {
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: {
        // Fumadocs' defaults, named, since the options' type asks for the themes
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: false,
        colorReplacements: { 'github-dark': { '#6a737d': defaultTheme.colors['text-3'] } },
      },
    }),
  },
})

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
})
