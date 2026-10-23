// SPDX-License-Identifier: AGPL-3.0-only
// The components a guide can use: Fumadocs' defaults, plus steps, tabs and the screenshot placeholder.
import { Step, Steps } from 'fumadocs-ui/components/steps'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import { ScreenshotToCome } from './screenshot.tsx'

export function mdxComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, Step, Steps, Tab, Tabs, ScreenshotToCome, ...components }
}
