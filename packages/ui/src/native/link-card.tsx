// SPDX-License-Identifier: AGPL-3.0-only
// A card that is one link, and its grid (one-client-platform-e.md › The guides on the library):
// a title and a description on the panel's look (s1, a line round it and the large corner, as
// Panel), the whole card the link. The guides draw their `Card` and `Cards` with it, and any app
// can (the settings index and Get the apps draw much the same).
// The link is the host's when it gives one: a web host passes its router's link component as
// `link` (Next.js's `Link`, https://nextjs.org/docs/app/api-reference/components/link, which
// navigates on the client and prefetches inside a static export), as @highsea-tv/admin's
// NavigationProvider takes the admin's router. The card then draws inside that `<a>`, and follows
// its hover and focus itself: the ring where the browser would show one (`:focus-visible`, as
// Press). Without one, the card is a Press with `href`, which react-native-web writes as an
// `<a href>` (https://necolas.github.io/react-native-web/docs/view/#href), and `onPress` elsewhere.
// The grid is two columns while each keeps `wrapBasis`, one below that, by CSS Grid on the web
// (`auto-fit` with `max()`, https://developer.mozilla.org/docs/Web/CSS/repeat#auto-fit), so the
// export lays it out before any script runs; off the web, where React Native has no grid, the
// cards stack.
import { line, wrapBasis } from '@highsea-tv/tokens'
import { type ComponentType, type ReactNode, useState } from 'react'
import { Platform, View, type ViewStyle } from 'react-native'
import { focusVisible } from './dom'
import { Press } from './press.tsx'
import { Text } from './text.tsx'
import { type Theme, tokens, useTheme } from './theme.tsx'

const s = tokens.space

/** What a host's link component is given: an `<a>`'s props, as Next.js's `Link` takes them. */
export type HostLinkProps = {
  href: string
  children: ReactNode
  style?: Record<string, string | number | undefined>
  onFocus?: (event: { target: unknown }) => void
  onBlur?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  'data-card'?: boolean
}

/** A host's link component (web hosts only: it draws an `<a>`). */
export type HostLink = ComponentType<HostLinkProps>

export type LinkCardProps = {
  title: string
  description?: string
  href: string
  /** The host's link component; without it the card is the library's own link. */
  link?: HostLink
  /** Off the web, where there's no address to follow: what pressing the card does. */
  onPress?: () => void
}

function face(theme: Theme, hovered: boolean): ViewStyle {
  return {
    flexGrow: 1,
    gap: s['1'],
    padding: s['4'],
    borderWidth: line.thin,
    borderColor: theme.colors.line,
    borderRadius: tokens.radius.lg,
    backgroundColor: hovered ? theme.colors.s2 : theme.colors.s1,
  }
}

function Words({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <Text variant="body" weight={600}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="text-2">
          {description}
        </Text>
      ) : null}
    </>
  )
}

export function LinkCard({ title, description, href, link: Link, onPress }: LinkCardProps) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const [ring, setRing] = useState(false)
  if (!Link)
    return (
      <Press
        role="link"
        {...({ href } as object)}
        onPress={onPress}
        style={{ flexGrow: 1, borderRadius: tokens.radius.lg }}
      >
        {(state) => (
          <View style={face(theme, state.hovered)}>
            <Words title={title} description={description} />
          </View>
        )}
      </Press>
    )
  const ringWidth = tokens.focus.web.width * theme.focusRingScale
  return (
    <Link
      href={href}
      // Fumadocs' prose leaves a card's link undecorated by this mark (`a:not([data-card])`)
      data-card
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(event) => setRing(focusVisible(event.target))}
      onBlur={() => setRing(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        color: 'inherit',
        textDecoration: 'none',
        borderRadius: tokens.radius.lg,
        outlineStyle: ring ? 'solid' : 'none',
        outlineWidth: ringWidth,
        outlineOffset: tokens.focus.web.offset,
        outlineColor: theme.colors.focus,
      }}
    >
      <View style={face(theme, hovered)}>
        <Words title={title} description={description} />
      </View>
    </Link>
  )
}

/** LinkCards' columns on the web: two while each keeps `wrapBasis`, then one. */
const columns = `repeat(auto-fit, minmax(max(${wrapBasis}px, calc((100% - ${s['3']}px) / 2)), 1fr))`

export function LinkCards({ children }: { children: ReactNode }) {
  return (
    <View
      style={
        Platform.OS === 'web'
          ? ({ display: 'grid', gridTemplateColumns: columns, gap: s['3'] } as unknown as ViewStyle)
          : { gap: s['3'] }
      }
    >
      {children}
    </View>
  )
}
