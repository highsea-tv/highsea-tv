// SPDX-License-Identifier: AGPL-3.0-only
// The link card, its grid and the picture figure (src/native/link-card.tsx, image-figure.tsx) in a
// browser, drawn through react-native-web in happy-dom, as the guides draw them: the card is one
// link, the host's when it gives one, undecorated and marked for Fumadocs' prose; it lights on
// hover; the grid is CSS Grid; and the figure keeps the picture's proportions, with its label.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { cleanup, fireEvent, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { LinkCard, LinkCards } = await import('../../src/native/link-card.tsx')
const { ImageFigure } = await import('../../src/native/image-figure.tsx')
const { createElement } = await import('react')

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
    {children}
  </ThemeProvider>
)
const render = (ui: ReactNode) => testing.render(ui, { wrapper })

/** A host's link, as Next's `Link` draws one: an `<a>` with the props it's given. */
const HostLink = ({ style, ...props }: Record<string, unknown>) =>
  createElement('a', { ...props, style, 'data-host': '' })

afterEach(cleanup)

describe('LinkCard', () => {
  test('with the host’s link, the whole card is that link, undecorated and marked', () => {
    render(
      <LinkCard
        title="Unraid"
        description="A template for the Docker page."
        href="/install/unraid/"
        link={HostLink}
      />,
    )
    const link = screen.getByRole('link')
    expect(link.hasAttribute('data-host')).toBe(true)
    expect(link.getAttribute('href')).toBe('/install/unraid/')
    expect(link.hasAttribute('data-card')).toBe(true)
    expect(link.style.textDecoration).toBe('none')
    expect(link.textContent).toBe('UnraidA template for the Docker page.')
    // the title isn't a heading, so prose's heading styles stay out of the card
    expect(screen.queryByRole('heading')).toBeNull()
  })

  test('it lights on hover, and loses it after', () => {
    render(<LinkCard title="Unraid" href="/install/unraid/" link={HostLink} />)
    const link = screen.getByRole('link')
    const face = link.firstElementChild as HTMLElement
    const resting = getComputedStyle(face).backgroundColor
    fireEvent.mouseEnter(link)
    const hovered = getComputedStyle(face).backgroundColor
    expect(hovered).not.toBe(resting)
    fireEvent.mouseLeave(link)
    expect(getComputedStyle(face).backgroundColor).toBe(resting)
  })

  test('without one, it is the library’s own link', () => {
    render(<LinkCard title="Unraid" href="/install/unraid/" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/install/unraid/')
  })
})

describe('LinkCards', () => {
  test('lays its cards out in a grid on the web', () => {
    const { container } = render(
      <LinkCards>
        <LinkCard title="One" href="/one/" link={HostLink} />
        <LinkCard title="Two" href="/two/" link={HostLink} />
      </LinkCards>,
    )
    const grid = screen.getAllByRole('link')[0]?.parentElement as HTMLElement
    expect(container.contains(grid)).toBe(true)
    expect(getComputedStyle(grid).display).toBe('grid')
    expect(getComputedStyle(grid).gridTemplateColumns).toContain('auto-fit')
  })
})

describe('ImageFigure', () => {
  // expo-image is stood in here (src/testing/react-native-web.ts), so that its picture is in the
  // server's render is the guides' sweep's to prove, on the export
  test('the picture keeps its proportions, no wider than itself, with its label', () => {
    render(
      <ImageFigure
        source={{ uri: '/shot.png', width: 1600, height: 1000 }}
        width={1600}
        height={1000}
        label="The Backups tab"
      />,
    )
    const picture = screen.getByLabelText('The Backups tab')
    const frame = picture.parentElement as HTMLElement
    expect(frame.style.maxWidth).toBe('1600px')
    expect(frame.style.aspectRatio).toMatch(/^1\.6\b/)
  })
})
