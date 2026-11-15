// SPDX-License-Identifier: AGPL-3.0-only
// What every page's layout shares: the lockup as the site's title, and the link to the source.
// The link is Fumadocs' own GitHub link (what its `githubUrl` makes, from `resolveLinkItems`), given
// through `links` with its icon hidden from assistive tech: the link is named by its `label`
// (its `aria-label`, https://www.fumadocs.dev/docs/ui/navigation/links), and Fumadocs draws the icon
// as an unnamed `svg role="img"`, which axe's svg-img-alt fails
// (https://dequeuniversity.com/rules/axe/4.14/svg-img-alt). A decorative image beside its link's
// name is hidden with `aria-hidden` (https://www.w3.org/WAI/tutorials/images/decorative/,
// https://www.w3.org/TR/wai-aria-1.2/#aria-hidden), so the link is read once, as GitHub.
import {
  type BaseLayoutProps,
  type LinkItemType,
  resolveLinkItems,
} from 'fumadocs-ui/layouts/shared'
import { cloneElement, isValidElement, type SVGProps } from 'react'
import { SiteTitle } from '@/components/site-title.tsx'

const SOURCE = 'https://github.com/highsea-tv/highsea-tv'

const links: LinkItemType[] = resolveLinkItems({ githubUrl: SOURCE }).map((item) =>
  item.type === 'icon' && isValidElement<SVGProps<SVGSVGElement>>(item.icon)
    ? { ...item, icon: cloneElement(item.icon, { role: undefined, 'aria-hidden': true }) }
    : item,
)

export const baseOptions: BaseLayoutProps = {
  nav: { title: <SiteTitle />, url: '/' },
  links,
  // design system v1.0 has no light theme
  themeSwitch: { enabled: false },
}
