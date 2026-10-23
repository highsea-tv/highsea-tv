// SPDX-License-Identifier: AGPL-3.0-only
// What every page's layout shares: the lockup as the site's title, and the link to the source.
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { SiteTitle } from '@/components/site-title.tsx'

export const baseOptions: BaseLayoutProps = {
  nav: { title: <SiteTitle />, url: '/' },
  githubUrl: 'https://github.com/highsea-tv/highsea-tv',
  // design system v1.0 has no light theme
  themeSwitch: { enabled: false },
}
