// SPDX-License-Identifier: AGPL-3.0-only
// The page parts that are one part with a form per form factor (one-client-platform-b.md › B1):
// FilmRow, Row, NamedAction, PersonTile, FactsCard, LetterIndex and Poster, each drawn by touch
// (a compact phone), with a pointer (a regular window) and on the TV, and a pointer's hover on
// Button and Poster. Drawn through react-native-web in happy-dom, as font-scale.test.tsx explains;
// a pointer's hover is react-native-web's, from a mouse's pointerenter (modules/useHover), as a
// browser sends it. Of Reanimated, shared values here are values that draw again when they change,
// so a spring's end is what's drawn, as it is once the spring settles.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, mock, test } from 'bun:test'
import { join } from 'node:path'
import type { ReactNode } from 'react'

const rnw = Bun.resolveSync(
  'react-native-web',
  join(import.meta.dir, '../../../../apps/client/package.json'),
)
for (const spec of ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']) {
  const ours = await import(spec)
  mock.module(Bun.resolveSync(spec, rnw), () => ours)
}
const React = await import('react')
const web = await import(rnw)
/** The props each FlatList was last drawn with: touch's snapping is the phone's, which the web ignores. */
const lists: Record<string, unknown>[] = []
const SpiedList = (props: Record<string, unknown>) => {
  lists.push(props)
  return React.createElement(web.FlatList, props)
}
mock.module('react-native', () => ({ ...web, FlatList: SpiedList }))
/** A layout animation's builder, which the web's View never reads. */
const builder: Record<string, unknown> = {}
for (const k of ['springify', 'stiffness', 'damping', 'mass', 'duration'])
  builder[k] = () => builder
let reducedOs = false
mock.module('react-native-reanimated', () => ({
  default: { createAnimatedComponent: <T,>(component: T) => component, View: web.View },
  FadeIn: builder,
  FadeOut: builder,
  useReducedMotion: () => reducedOs,
  useSharedValue: <T,>(initial: T) => {
    const [, draw] = React.useReducer((n: number) => n + 1, 0)
    const ref = React.useRef<{ value: T } | null>(null)
    if (!ref.current) {
      let current = initial
      ref.current = {
        get value() {
          return current
        },
        set value(next: T) {
          if (next === current) return
          current = next
          draw()
        },
      }
    }
    return ref.current
  },
  useAnimatedStyle: (style: () => object) => style(),
  withSpring: <T,>(value: T) => value,
  withTiming: <T,>(value: T) => value,
  withRepeat: <T,>(value: T) => value,
  Easing: { linear: (t: number) => t },
}))
/** The sources each Image was drawn with, in order: happy-dom needn't load them. */
const images: unknown[] = []
mock.module('expo-image', () => ({
  Image: ({ source }: { source: unknown }) => {
    images.push(source)
    return null
  },
}))
// a Sheet's insets (Menu by touch), which the web's safe area has none of here
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
const none = () => null
mock.module('react-native-svg', () => ({
  default: none,
  Circle: none,
  Defs: none,
  LinearGradient: none,
  Mask: none,
  Path: none,
  Rect: none,
  Stop: none,
}))
mock.module('expo-haptics', () => ({
  impactAsync: async () => {},
  notificationAsync: async () => {},
  ImpactFeedbackStyle: {},
  NotificationFeedbackType: {},
}))

// the icons are Lucide's through react-native-svg, which the web draws and happy-dom needn't
mock.module(join(import.meta.dir, '../../src/native/icons.ts'), () => ({
  icons: new Proxy({}, { get: () => none }),
}))

const engineWeb = await import('../../src/native/tv/engine.web.tsx')
mock.module(join(import.meta.dir, '../../src/native/tv/engine.tsx'), () => engineWeb)
// the web's focus rules and row keys, which a web bundler picks over ./dom.ts by its .web suffix
const domWeb = await import('../../src/native/dom.web.ts')
mock.module(join(import.meta.dir, '../../src/native/dom.ts'), () => domWeb)
// and the web's announcements, its status region, over React Native's AccessibilityInfo
const announceWeb = await import('../../src/native/announce.web.ts')
mock.module(join(import.meta.dir, '../../src/native/announce.ts'), () => announceWeb)

const testing = await import('@testing-library/react')
const { act, cleanup, fireEvent, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { Button } = await import('../../src/native/button.tsx')
const { FilmRow } = await import('../../src/native/film-row.tsx')
const { LetterIndex } = await import('../../src/native/letter-index.tsx')
const { FactsCard, NamedAction, PersonTile } = await import('../../src/native/page-parts.tsx')
const { Poster } = await import('../../src/native/poster.tsx')
const { Row } = await import('../../src/native/row.tsx')
const { SectionHeading } = await import('../../src/native/section-heading.tsx')
const { HiddenHeading } = await import('../../src/native/hidden-heading.tsx')
const { family } = await import('../../src/native/fonts.ts')
const tvParts = await import('../../src/native/tv/index.ts')
const { focusedPlay } = await import('../../src/native/tv/tiles.tsx')
const { KEEP } = await import('../../src/native/tv/model.ts')
const { tokens } = await import('../../src/native/theme.tsx')
const { renderToStaticMarkup } = await import('react-dom/server')
const { InlineText } = await import('../../src/native/inline-text.tsx')
const { NoticeCard } = await import('../../src/native/notice-card.tsx')
const { FeaturedCard, FeaturedCardSkeleton, Pager } = await import(
  '../../src/native/featured-card.tsx'
)
const { Menu, Popover } = await import('../../src/native/menu.tsx')
const { PosterSkeleton, Skeleton, SkeletonText } = await import('../../src/native/skeleton.tsx')
const { FilmRowSkeleton } = await import('../../src/native/film-row.tsx')
const { TvPage } = await import('../../src/native/tv/page.tsx')
const { Toast } = await import('../../src/native/toast.tsx')
const { Certification } = await import('../../src/native/badge.tsx')
const { Chip, radioState } = await import('../../src/native/chip.tsx')
const { Rating } = await import('../../src/native/rating.tsx')
const { Text } = await import('../../src/native/text.tsx')

afterEach(() => {
  cleanup()
  reducedOs = false
  lists.length = 0
  images.length = 0
  focusedPlay.current = null
})

type Form = 'touch' | 'pointer' | 'tv'
const FORMS = {
  touch: { input: 'touch', widthClass: 'compact' },
  pointer: { input: 'pointer', widthClass: 'regular' },
  tv: { input: 'tv', widthClass: 'tv' },
} as const

const draw = (form: Form, node: ReactNode, reducedMotion?: boolean) =>
  testing.render(
    <ThemeProvider formFactor={FORMS[form]} reducedMotion={reducedMotion}>
      {node}
    </ThemeProvider>,
  )

/** A mouse coming over the element, as react-native-web's useHover hears it. */
const hover = (el: Element) =>
  act(() => {
    fireEvent.pointerEnter(el, { pointerType: 'mouse' })
  })
const leave = (el: Element) =>
  act(() => {
    fireEvent.pointerLeave(el, { pointerType: 'mouse' })
  })

const styleOf = (el: Element) => (el as HTMLElement).style

/** A key on the focused element, or on the document (where the TV's remote listens). */
const key = (k: string, el: Element = document.activeElement ?? document.body) =>
  act(() => {
    fireEvent.keyDown(el, { key: k })
  })

/** Space pressed and let go on the focused element, as a keyboard sends it. */
const space = (el: Element = document.activeElement ?? document.body) =>
  act(() => {
    fireEvent.keyDown(el, { key: ' ', code: 'Space' })
    fireEvent.keyUp(el, { key: ' ', code: 'Space' })
  })

/** Focus an element, as the keyboard or the remote would. */
const focus = (el: Element) =>
  act(() => {
    ;(el as HTMLElement).focus()
  })

/** A row's paging arrows, left then right: their fade is on the view around each. */
const arrowsOf = (root: Element) =>
  [...root.querySelectorAll('[aria-hidden="true"][role="button"]')] as HTMLElement[]
const shownOf = (arrow: HTMLElement) => arrow.parentElement?.style.opacity

/** The nearest element at or above `el` whose inline style sets `prop`. */
function styled(el: Element | null, prop: string): HTMLElement | null {
  for (let at = el as HTMLElement | null; at; at = at.parentElement)
    if (at.style.getPropertyValue(prop)) return at
  return null
}

/** The element whose own text is `text`. */
const textEl = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('*')].find(
    (el) => el.textContent === text && el.children.length === 0,
  ) as HTMLElement | undefined

const films = [
  { id: 1, title: 'Sintel', synopsis: 'A girl and her dragon.', year: 2010 },
  { id: 2, title: 'Big Buck Bunny', synopsis: 'A rabbit and three rodents.', year: 2008 },
  { id: 3, title: 'Tears of Steel', synopsis: 'Robots in Amsterdam.', year: 2012 },
]
const art = () => ({ poster: undefined, backdrop: undefined })
const meta = (f: { id: number }) => `20${10 + f.id} · 15m`

describe('hover', () => {
  test('a pointer brightens primary and danger as the web renderer does, and nothing else', () => {
    const { getByRole } = draw(
      'pointer',
      <>
        <Button variant="primary">Play</Button>
        <Button variant="danger">Delete</Button>
        <Button variant="secondary">Trailer</Button>
      </>,
    )
    const filter = (name: string) => {
      const el = getByRole('button', { name })
      hover(el)
      return styleOf(el).filter
    }
    expect(filter('Play')).toBe('brightness(1.08)')
    expect(filter('Delete')).toBe('brightness(1.1)')
    expect(filter('Trailer')).toBe('')
    const play = getByRole('button', { name: 'Play' })
    leave(play)
    expect(styleOf(play).filter).toBe('')
  })

  test('a disabled button and a touch never brighten', () => {
    const pointer = draw(
      'pointer',
      <Button variant="primary" disabled>
        Play
      </Button>,
    )
    const off = pointer.getByRole('button', { name: 'Play' })
    hover(off)
    expect(styleOf(off).filter).toBe('')
    cleanup()
    const touch = draw('touch', <Button variant="primary">Play</Button>)
    const on = touch.getByRole('button', { name: 'Play' })
    hover(on)
    expect(styleOf(on).filter).toBe('')
  })

  test("a poster's art grows to 1.02 under a pointer, and back as it leaves", () => {
    const { getByRole, container } = draw('pointer', <Poster title="Sintel" onPress={() => {}} />)
    const link = getByRole('link', { name: 'Sintel' })
    const art = () => styled(textEl(container, 'Sintel') ?? null, 'transform')
    expect(art()?.style.transform ?? 'scale(1)').toBe('scale(1)')
    hover(link)
    expect(art()?.style.transform).toBe('scale(1.02)')
    leave(link)
    expect(art()?.style.transform).toBe('scale(1)')
  })

  test('reduced motion keeps the poster still, whether the app or the OS asks', () => {
    for (const app of [true, false]) {
      reducedOs = !app
      const { getByRole, container } = draw(
        'pointer',
        <Poster title="Sintel" onPress={() => {}} />,
        app || undefined,
      )
      hover(getByRole('link', { name: 'Sintel' }))
      expect(styled(textEl(container, 'Sintel') ?? null, 'transform')?.style.transform).toBe(
        'scale(1)',
      )
      cleanup()
    }
  })

  test('touch draws a poster’s art still, with no lift of its own', () => {
    const { getByRole, container } = draw('touch', <Poster title="Sintel" onPress={() => {}} />)
    const link = getByRole('link', { name: 'Sintel' })
    hover(link)
    // the nearest transform is the press's own scale on the link, not a lift around the art
    expect(styled(textEl(container, 'Sintel') ?? null, 'transform')).toBe(link)
  })
})

describe('Poster', () => {
  test('on the TV it is the TV’s tile, named by its title and caption', () => {
    draw('tv', <Poster title="Sintel" caption="2010" onPress={() => {}} />)
    expect(screen.getByLabelText('Sintel, 2010')).toBeTruthy()
  })

  test('on the TV, a tile with no caption is named by its title alone', () => {
    draw('tv', <Poster title="Sintel" onPress={() => {}} />)
    expect(screen.getByLabelText('Sintel')).toBeTruthy()
  })

  // the TV prototype's collection tiles draw the four posters and the Smart mark
  // (kit/collection-art.tsx); the B1 compare found one poster and no mark
  test('on the TV, a collection draws its mosaic and its status', () => {
    const { container } = draw(
      'tv',
      <Poster
        title="Staff picks"
        src={null}
        mosaic={['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']}
        status={<Text>Smart</Text>}
        onPress={() => {}}
      />,
    )
    expect(images).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
    expect(container.textContent).toContain('Smart')
  })

  test('on the TV, a mosaic of one is the art', () => {
    draw('tv', <Poster title="Caminandes" src={null} mosaic={['a.jpg']} onPress={() => {}} />)
    expect(images).toEqual(['a.jpg'])
  })
})

describe('backgroundImage', () => {
  // React Native's backgroundImage, which react-native-web writes as CSS's background-image; its
  // experimental_ name of before, react-native-web drops (it writes no property it doesn't know)
  const fallback = <Poster title="Sintel" />

  test('a poster’s fallback gradient comes out as CSS, drawn in the page', () => {
    const { container } = draw('pointer', fallback)
    const drawn = [...container.querySelectorAll('*')].map(
      (el) => (el as HTMLElement).style.backgroundImage,
    )
    expect(drawn.some((b) => b.startsWith('linear-gradient(160deg'))).toBe(true)
  })

  test('and in the server’s render', () => {
    const html = renderToStaticMarkup(
      <ThemeProvider formFactor={FORMS.pointer}>{fallback}</ThemeProvider>,
    )
    expect(html).toContain('background-image:linear-gradient(160deg')
    expect(html).not.toContain('experimental')
  })
})

describe('FilmRow', () => {
  const row = (onOpen: (film: (typeof films)[number]) => void = () => {}) => (
    <FilmRow title="Popular" items={films} art={art} meta={meta} onOpen={onOpen} loop />
  )

  test('by touch, a row of posters, each its own link captioned with its year only', () => {
    draw('touch', row())
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))).toEqual([
      'Sintel, 2010',
      'Big Buck Bunny, 2008',
      'Tears of Steel, 2012',
    ])
  })

  test('with a pointer, one card that Right and Left move along the row, looping', () => {
    const opened: string[] = []
    const { container } = draw(
      'pointer',
      row((f) => opened.push(f.title)),
    )
    const card = () => screen.getByRole('link')
    expect(card().getAttribute('aria-label')).toBe('Sintel, 2011 · 15m')
    act(() => {
      fireEvent.keyDown(card(), { key: 'ArrowRight' })
    })
    expect(card().getAttribute('aria-label')).toBe('Big Buck Bunny, 2012 · 15m')
    act(() => {
      fireEvent.keyDown(card(), { key: 'ArrowLeft' })
      fireEvent.keyDown(card(), { key: 'ArrowLeft' })
    })
    expect(card().getAttribute('aria-label')).toBe('Tears of Steel, 2013 · 15m')
    act(() => {
      fireEvent.click(card())
    })
    expect(opened).toEqual(['Tears of Steel'])
    // the card's film described under it
    expect(textEl(container, 'Robots in Amsterdam.')).toBeTruthy()
  })

  test('with a pointer, a key with a modifier is left to the page', () => {
    draw('pointer', row())
    act(() => {
      fireEvent.keyDown(screen.getByRole('link'), { key: 'ArrowRight', metaKey: true })
    })
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Sintel, 2011 · 15m')
  })

  test('with a pointer, clicking a poster on the strip brings its film into the card', () => {
    const { container } = draw('pointer', row())
    const strip = textEl(container, 'Tears of Steel')
    // the strip's posters are pressed with the pointer only, never focused
    const press = strip?.closest('[tabindex="-1"]') ?? strip?.parentElement
    act(() => {
      fireEvent.click(press as Element)
    })
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Tears of Steel, 2013 · 15m')
  })

  test('with a pointer, the paging arrows show only while the pointer is over the row', () => {
    const { container } = draw('pointer', row())
    const section = container.querySelector('[aria-label="Popular"]') as HTMLElement
    expect(arrowsOf(container).map(shownOf)).toEqual(['0', '0'])
    act(() => {
      fireEvent.pointerEnter(section, { pointerType: 'mouse' })
    })
    // a looping row has films both ways
    expect(arrowsOf(container).map(shownOf)).toEqual(['1', '1'])
    act(() => {
      fireEvent.click(arrowsOf(container)[1] as HTMLElement)
    })
    expect(screen.getByRole('link').getAttribute('aria-label')).toBe('Big Buck Bunny, 2012 · 15m')
  })

  test('with a pointer, a strip poster lifts and brightens under the pointer', () => {
    const { container } = draw('pointer', row())
    const strip = textEl(container, 'Tears of Steel') as HTMLElement
    // the strip's press: out of the tab order, drawn with the pointer's cursor
    const press = strip.closest('[class*="cursor"]') as HTMLElement
    hover(press)
    expect(press.style.filter).toBe('brightness(1.1)')
    // a lift between the strip's press and its poster (the poster's own, for its own press, stays)
    const lifts: string[] = []
    for (let el = strip.parentElement; el && el !== press; el = el.parentElement)
      if (el.style.transform) lifts.push(el.style.transform)
    expect(lifts).toContain('scale(1.02)')
  })

  test('the card’s title is the display type’s leading and tracking', () => {
    const { container } = draw('pointer', row())
    const title = [...container.querySelectorAll('*')].find(
      (el) => el.textContent === 'Sintel' && (el as HTMLElement).style.letterSpacing,
    ) as HTMLElement
    const size = Number.parseFloat(title.style.fontSize)
    expect(Number.parseFloat(title.style.lineHeight)).toBe(Math.round(size * 1.05))
    expect(Number.parseFloat(title.style.letterSpacing)).toBeCloseTo(size * -0.035)
  })

  test('on the TV, one card, a focus stop named by its film', () => {
    draw('tv', row())
    expect(screen.getByLabelText('Sintel, 2011 · 15m')).toBeTruthy()
    expect(screen.queryByLabelText('Big Buck Bunny, 2012 · 15m')).toBeNull()
  })

  test('on the TV, Left and Right move the focused card, and its traps switch off at the ends', () => {
    const { container } = draw(
      'tv',
      <FilmRow title="Popular" items={films} art={art} meta={meta} onOpen={() => {}} />,
    )
    const card = () => container.querySelector('[data-focusable]') as HTMLElement
    const trap = () => container.querySelector('[data-trap]')?.getAttribute('data-trap') ?? null
    // a key before the card has focus isn't its
    key('ArrowRight', document.body)
    expect(card().getAttribute('aria-label')).toBe('Sintel, 2011 · 15m')
    focus(card())
    // at the first film only Right is the row's
    expect(trap()).toBe('right')
    key('ArrowRight')
    expect(card().getAttribute('aria-label')).toBe('Big Buck Bunny, 2012 · 15m')
    expect(trap()).toBe('left right')
    key('ArrowRight')
    expect(card().getAttribute('aria-label')).toBe('Tears of Steel, 2013 · 15m')
    expect(trap()).toBe('left')
    // past the last, the key is the focus engine's: the card stays
    key('ArrowRight')
    expect(card().getAttribute('aria-label')).toBe('Tears of Steel, 2013 · 15m')
  })

  test('on the TV, a looping row comes round, its traps always on, and Play/Pause plays its film', () => {
    const played: string[] = []
    const moves: number[] = []
    const { container } = draw(
      'tv',
      <FilmRow
        title="Popular"
        items={films}
        art={art}
        meta={meta}
        onOpen={() => {}}
        onPlay={(f) => played.push(f.title)}
        onMove={() => moves.push(1)}
        loop
      />,
    )
    const card = () => container.querySelector('[data-focusable]') as HTMLElement
    focus(card())
    expect(container.querySelector('[data-trap]')?.getAttribute('data-trap')).toBe('left right')
    key('ArrowLeft')
    expect(card().getAttribute('aria-label')).toBe('Tears of Steel, 2013 · 15m')
    act(() => focusedPlay.current?.())
    key('ArrowRight')
    act(() => focusedPlay.current?.())
    expect(played).toEqual(['Tears of Steel', 'Sintel'])
    expect(moves).toEqual([1, 1])
    act(() => {
      card().blur()
    })
    expect(focusedPlay.current).toBeNull()
  })
})

describe('Row', () => {
  const row = (onMove?: () => void) => (
    <Row
      title="Cast"
      items={films}
      keyOf={(f) => f.id}
      itemWidth={100}
      onMove={onMove}
      render={(f) => <Poster title={f.title} onPress={() => {}} />}
    />
  )

  for (const form of ['touch', 'pointer', 'tv'] as const)
    test(`draws its title and every item ${form === 'tv' ? 'on the TV' : `by ${form}`}`, () => {
      draw(form, row())
      // a labelled group, not a list: its heading and arrows sit inside it with the items
      expect(screen.getByRole('group', { name: 'Cast' })).toBeTruthy()
      for (const f of films) expect(screen.getByLabelText(new RegExp(`^${f.title}`))).toBeTruthy()
    })

  test('by touch, a fling stops with an item on the gutter, and no arrows', () => {
    const { container } = draw('touch', row())
    expect(lists.at(-1)?.snapToInterval).toBe(100 + tokens.mobile.posterGap)
    expect(lists.at(-1)?.decelerationRate).toBe('fast')
    expect(arrowsOf(container)).toEqual([])
  })

  test('on the TV, a focus guide that remembers its item and traps Left and Right, its items kept 30% in', () => {
    const { container } = draw('tv', row())
    const guide = container.querySelector('[data-group]') as HTMLElement
    expect(guide.getAttribute('data-trap')).toBe('left right')
    const track = guide.querySelector('[data-scroll]') as HTMLElement
    expect(track.getAttribute('data-scroll')).toBe('x')
    expect(track.getAttribute('data-keep')).toBe(String(KEEP.row))
    expect(arrowsOf(container)).toEqual([])
  })

  test('with a pointer, one Tab stop that the arrow keys, Home and End move along', () => {
    const moves: number[] = []
    draw(
      'pointer',
      row(() => moves.push(1)),
    )
    const links = () => screen.getAllByRole('link')
    const stops = () => links().map((l) => l.tabIndex)
    expect(stops()).toEqual([0, -1, -1])
    focus(links()[0] as HTMLElement)
    key('ArrowRight')
    expect(document.activeElement).toBe(links()[1] as HTMLElement)
    expect(stops()).toEqual([-1, 0, -1])
    key('End')
    expect(document.activeElement).toBe(links()[2] as HTMLElement)
    // at the end focus stays, and nothing sounds
    key('ArrowRight')
    expect(document.activeElement).toBe(links()[2] as HTMLElement)
    key('Home')
    expect(document.activeElement).toBe(links()[0] as HTMLElement)
    expect(moves).toEqual([1, 1, 1])
    // a key with a modifier is the page's
    act(() => {
      fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight', metaKey: true })
    })
    expect(document.activeElement).toBe(links()[0] as HTMLElement)
  })

  test('with a pointer, its arrows show while it’s over the row and page by most of its width', () => {
    const { container } = draw('pointer', row())
    const list = screen.getByRole('group', { name: 'Cast' })
    const scroller = list.querySelector('[data-row-item]')?.parentElement
      ?.parentElement as HTMLElement
    const pages: number[] = []
    scroller.scroll = ((to: ScrollToOptions) => pages.push(to.left ?? 0)) as typeof scroller.scroll
    for (const [k, v] of Object.entries({ offsetWidth: 1000, scrollWidth: 3000, scrollLeft: 400 }))
      Object.defineProperty(scroller, k, { configurable: true, value: v })
    act(() => {
      fireEvent.scroll(scroller)
    })
    expect(arrowsOf(container).map(shownOf)).toEqual(['0', '0'])
    hover(list)
    expect(arrowsOf(container).map(shownOf)).toEqual(['1', '1'])
    act(() => {
      fireEvent.click(arrowsOf(container)[1] as HTMLElement)
      fireEvent.click(arrowsOf(container)[0] as HTMLElement)
    })
    expect(pages).toEqual([400 + 850, 0])
    leave(list)
    expect(arrowsOf(container).map(shownOf)).toEqual(['0', '0'])
  })
})

describe('NamedAction', () => {
  test('by touch, a circle with its name under it; a toggle says it’s on', () => {
    const { container } = draw(
      'touch',
      <NamedAction icon="check" label="Watched" pressed onPress={() => {}} />,
    )
    // a toggle on the web is a button with aria-pressed (React Native's togglebutton elsewhere)
    const toggle = screen.getByRole('button', { name: 'Watched' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(textEl(container, 'Watched')).toBeTruthy()
  })

  for (const form of ['touch', 'pointer', 'tv'] as const)
    test(`${form === 'tv' ? 'on the TV' : `by ${form}`}, a toggle says whether it’s on and presses`, () => {
      const presses: number[] = []
      const action = (pressed: boolean) => (
        <NamedAction
          icon="check"
          label="Watched"
          pressed={pressed}
          onPress={() => presses.push(1)}
        />
      )
      const { rerender } = draw(form, action(false))
      const toggle = () => screen.getByLabelText('Watched')
      expect(toggle().getAttribute('aria-pressed')).toBe('false')
      expect(toggle().getAttribute('aria-checked')).toBeNull()
      act(() => {
        fireEvent.click(toggle())
      })
      expect(presses).toEqual([1])
      rerender(<ThemeProvider formFactor={FORMS[form]}>{action(true)}</ThemeProvider>)
      expect(toggle().getAttribute('aria-pressed')).toBe('true')
    })

  test('an action that isn’t a toggle says nothing of being pressed', () => {
    draw('pointer', <NamedAction icon="trailer" label="Trailer" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Trailer' }).getAttribute('aria-pressed')).toBeNull()
  })

  test('with a pointer, an icon button whose name shows in a tooltip while hovered', () => {
    const { container } = draw(
      'pointer',
      <NamedAction icon="trailer" label="Trailer" onPress={() => {}} />,
    )
    const button = screen.getByRole('button', { name: 'Trailer' })
    expect(textEl(container, 'Trailer')).toBeUndefined()
    hover(button)
    expect(textEl(container, 'Trailer')).toBeTruthy()
    leave(button)
    expect(textEl(container, 'Trailer')).toBeUndefined()
  })

  test('on the TV, its name waits under it, hidden until focus', () => {
    const { container } = draw(
      'tv',
      <NamedAction icon="trailer" label="Trailer" onPress={() => {}} />,
    )
    const name = textEl(container, 'Trailer')
    expect(name).toBeTruthy()
    expect(styled(name ?? null, 'opacity')?.style.opacity).toBe('0')
  })
})

describe('SectionHeading', () => {
  const sizes = { touch: '17px', pointer: '19px', tv: '' } as const
  for (const form of ['touch', 'pointer', 'tv'] as const)
    test(`${form === 'tv' ? 'on the TV' : `by ${form}`}, a header with its suffix and count quieter after it`, () => {
      draw(form, <SectionHeading title="Movies" suffix="from your list" count={3} />)
      const header = screen.getByRole('heading')
      expect(header.textContent).toBe('Movies from your list 3')
      // the weight is the face's (fonts.ts)
      expect(header.style.fontFamily).toBe(family(600, 'sans'))
      // the phone's 17 (PHONE_SECTION_TITLE, the prototypes'), the web's title 19
      if (form !== 'tv') expect(header.style.fontSize).toBe(sizes[form])
      const [suffix, count] = [...header.children] as HTMLElement[]
      expect([suffix?.style.fontFamily, count?.style.fontFamily]).toEqual([
        family(400, 'sans'),
        family(400, 'sans'),
      ])
      expect(suffix?.style.color).not.toBe(count?.style.color)
      expect(count?.style.fontSize).toBe(header.style.fontSize)
    })

  test('a count of 0 is drawn, and none without one', () => {
    draw('pointer', <SectionHeading title="People" count={0} />)
    expect(screen.getByRole('heading').textContent).toBe('People 0')
    cleanup()
    draw('pointer', <SectionHeading title="People" />)
    expect(screen.getByRole('heading').textContent).toBe('People')
  })

  for (const form of ['touch', 'pointer', 'tv'] as const)
    test(`${form === 'tv' ? 'on the TV' : `by ${form}`}, a Row's title is the same heading`, () => {
      draw(form, <SectionHeading title="Cast" />)
      const alone = screen.getByRole('heading').getAttribute('style')
      cleanup()
      draw(
        form,
        <Row
          title="Cast"
          items={films}
          keyOf={(f) => f.id}
          itemWidth={100}
          render={(f) => <Poster title={f.title} onPress={() => {}} />}
        />,
      )
      expect(screen.getByRole('heading').getAttribute('style')).toBe(alone)
    })
})

describe('HiddenHeading', () => {
  for (const form of ['touch', 'pointer', 'tv'] as const)
    test(`${form === 'tv' ? 'on the TV' : `by ${form}`}, a heading at its level that takes no room`, () => {
      const { container } = draw(form, <HiddenHeading level={1}>Search</HiddenHeading>)
      const heading = screen.getByRole('heading', { name: 'Search', level: 1 })
      expect(heading.tagName).toBe('H1')
      const box = container.querySelector('h1')?.parentElement as HTMLElement
      expect([box.style.position, box.style.width, box.style.height]).toEqual([
        'absolute',
        '1px',
        '1px',
      ])
      expect(box.style.overflowX || box.style.overflow).toBe('hidden')
    })

  test('at the level it’s given', () => {
    draw('pointer', <HiddenHeading level={2}>Results</HiddenHeading>)
    expect(screen.getByRole('heading', { level: 2 }).tagName).toBe('H2')
  })
})

describe('FocusGuide', () => {
  test('the TV’s parts export it, the engine’s own', () => {
    expect(tvParts.FocusGuide).toBe(engineWeb.FocusGuide)
  })
})

describe('PersonTile', () => {
  // biome-ignore lint/a11y/useValidAriaRole: PersonTile's `role` is the person's in the film
  const tile = <PersonTile name="Ada Byron" role="Countess" photo={undefined} onPress={() => {}} />

  for (const form of ['touch', 'pointer'] as const)
    test(`by ${form}, a link named with the role, filling its row's width without one`, () => {
      draw(form, tile)
      const link = screen.getByRole('link', { name: 'Ada Byron, Countess' })
      expect(link.style.width).toBe('100%')
    })

  test('with a pointer, the circle grows under the pointer, not for focus', () => {
    const { container } = draw('pointer', tile)
    const link = screen.getByRole('link', { name: 'Ada Byron, Countess' })
    const circle = () =>
      [...container.querySelectorAll('*')].find(
        (el) => el !== link && (el as HTMLElement).style.transform,
      ) as HTMLElement
    expect(circle().style.aspectRatio).toBe('1 / 1')
    focus(link)
    expect(circle().style.transform).toBe('scale(1)')
    hover(link)
    expect(circle().style.transform).toBe('scale(1.05)')
    leave(link)
    expect(circle().style.transform).toBe('scale(1)')
  })

  test('by touch, the circle never grows', () => {
    const { container } = draw('touch', tile)
    const link = screen.getByRole('link', { name: 'Ada Byron, Countess' })
    hover(link)
    const lifted = [...container.querySelectorAll('*')].filter(
      (el) => (el as HTMLElement).style.transform === 'scale(1.05)',
    )
    expect(lifted).toEqual([])
  })

  const result = (form: Form, label?: string) =>
    draw(
      form,
      // biome-ignore lint/a11y/useValidAriaRole: PersonTile's `role` is the person's credits
      <PersonTile
        layout="result"
        name="Ada Byron"
        role="2 films"
        accessibilityLabel={label}
        photo={undefined}
        onPress={() => {}}
      />,
    )

  test('as a search result by touch, a 72 column with the name on two lines, the credits only read', () => {
    const { container } = result('touch')
    const link = screen.getByRole('link', { name: 'Ada Byron, 2 films' })
    expect(link.style.width).toBe('72px')
    expect(textEl(container, '2 films')).toBeUndefined()
    const name = textEl(container, 'Ada Byron') as HTMLElement
    // more than one line is react-native-web's box clamp (one line would be nowrap's ellipsis)
    expect(name.className).toContain('WebkitBoxOrient')
    expect(name.style.fontSize).toBe('12px')
    const circle = [...link.children][0] as HTMLElement
    expect([circle.style.width, circle.style.aspectRatio]).toEqual(['64px', '1 / 1'])
  })

  test('as a search result with a pointer, a chip of the photo, the name and the credits', () => {
    const { container } = result('pointer', 'Ada Byron, 2 films on this server')
    const chip = screen.getByRole('link', { name: 'Ada Byron, 2 films on this server' })
    expect(textEl(container, 'Ada Byron')).toBeTruthy()
    expect(textEl(container, '2 films')).toBeTruthy()
    expect(chip.style.borderTopLeftRadius).toBe(`${tokens.radius.pill}px`)
    expect(([...chip.children][0] as HTMLElement).style.width).toBe('32px')
    const rest = chip.style.backgroundColor
    hover(chip)
    expect(chip.style.backgroundColor).not.toBe(rest)
    // the chip's photo never grows
    expect(([...chip.children][0] as HTMLElement).style.transform).not.toBe('scale(1.05)')
  })

  test('as a search result on the TV, a button with the name, read with its credits', () => {
    const { container } = result('tv')
    expect(screen.getByRole('button', { name: 'Ada Byron, 2 films' })).toBeTruthy()
    expect(textEl(container, 'Ada Byron')).toBeTruthy()
    expect(textEl(container, '2 films')).toBeUndefined()
  })

  test('a photo smaller than its tile, at each form factor', () => {
    const tile = (form: Form, layout?: 'result') => {
      const { container } = draw(
        form,
        // biome-ignore lint/a11y/useValidAriaRole: PersonTile's `role` is the person's credits
        <PersonTile
          layout={layout}
          name="Ada Byron"
          role="2 films"
          width={form === 'tv' ? 8 : 72}
          photoSize={form === 'tv' ? 6 : 56}
          photo={undefined}
          onPress={() => {}}
        />,
      )
      const out = [...container.querySelectorAll('*')]
        .map((el) => (el as HTMLElement).style)
        // the circles: square by aspect ratio, or by their width and height (the TV's)
        .filter((st) => st.aspectRatio === '1 / 1' || (st.width && st.width === st.height))
        .map((st) => parseFloat(st.width))
      cleanup()
      return out
    }
    expect(tile('touch', 'result')).toEqual([56])
    expect(tile('pointer', 'result')).toEqual([56])
    expect(tile('touch')).toEqual([56])
    // on the TV in units: 6 of the tile's 8
    draw(
      'tv',
      // biome-ignore lint/a11y/useValidAriaRole: PersonTile's `role` is the person's in the film
      <PersonTile name="Ada Byron" role="" width={8} photo={undefined} onPress={() => {}} />,
    )
    const whole = parseFloat(
      (screen.getByRole('link', { name: 'Ada Byron' }) as HTMLElement).style.width,
    )
    cleanup()
    const [portrait] = tile('tv')
    expect(portrait).toBeCloseTo((whole * 6) / 8)
  })

  test('a cast tile takes the label it’s given too', () => {
    draw(
      'pointer',
      // biome-ignore lint/a11y/useValidAriaRole: PersonTile's `role` is the person's credits
      <PersonTile
        name="Ada Byron"
        role="Countess"
        accessibilityLabel="Ada Byron as the Countess"
        photo={undefined}
        onPress={() => {}}
      />,
    )
    expect(screen.getByRole('link', { name: 'Ada Byron as the Countess' })).toBeTruthy()
  })

  test('on the TV, a focus stop of 8 units, with initials where there’s no photo', () => {
    const { container } = draw('tv', tile)
    expect(screen.getByLabelText('Ada Byron, Countess')).toBeTruthy()
    expect(textEl(container, 'AB')).toBeTruthy()
  })
})

describe('FactsCard', () => {
  const facts = [
    ['Director', 'Colin Levy', '/people/1'],
    ['Runtime', '15m'],
  ] as const

  test('by touch and with a pointer, a fact with a page is a link that opens it', () => {
    for (const form of ['touch', 'pointer'] as const) {
      const opened: string[] = []
      draw(form, <FactsCard title="Information" facts={facts} onOpen={(to) => opened.push(to)} />)
      act(() => {
        fireEvent.click(screen.getByRole('link'))
      })
      expect(opened).toEqual(['/people/1'])
      expect(screen.getByText('15m')).toBeTruthy()
      cleanup()
    }
  })

  test('a step roomier with a pointer: the card’s padding, its title, its facts’ type and gap', () => {
    const measure = (form: 'touch' | 'pointer') => {
      const { container } = draw(form, <FactsCard title="Information" facts={facts} />)
      const title = textEl(container, 'Information') as HTMLElement
      const card = title.parentElement as HTMLElement
      // the visible label, not the measuring column's
      const label = [...container.querySelectorAll('*')].filter(
        (el) => el.textContent === 'Runtime' && el.children.length === 0,
      )[1] as HTMLElement
      const list = label.parentElement?.parentElement as HTMLElement
      const out = {
        padding: card.style.paddingTop,
        title: title.style.fontSize,
        type: label.style.fontSize,
        gap: list.style.rowGap || list.style.gap,
      }
      cleanup()
      return out
    }
    // callout by touch (the phone's 14) and body with a pointer (the web's 15)
    expect(measure('touch')).toEqual({ padding: '16px', title: '17px', type: '14px', gap: '4px' })
    expect(measure('pointer')).toEqual({ padding: '20px', title: '19px', type: '15px', gap: '6px' })
  })

  test('on the TV, a card of words reads them with its heading, as its one stop', () => {
    draw(
      'tv',
      <FactsCard title="About" says="A film about a llama.">
        <Text>A film about a llama.</Text>
      </FactsCard>,
    )
    expect(screen.getByLabelText('About, A film about a llama.')).toBeTruthy()
  })

  test('a label is at least the widest label wide, and never shrinks below its own words', () => {
    const { container } = draw('pointer', <FactsCard title="Information" facts={facts} />)
    // the visible label, not the measuring column's
    const label = [...container.querySelectorAll('*')].filter(
      (el) => el.textContent === 'Director' && el.children.length === 0,
    )[1] as HTMLElement
    // a width set from onLayout's whole pixels could fall short of the widest label and wrap it
    expect(label.style.width).toBe('')
    expect(label.style.flexShrink).toBe('0')
  })

  test('a fact’s link is `text`, underlined in `text-3` until a pointer is over it', () => {
    draw('pointer', <FactsCard title="Information" facts={facts} onOpen={() => {}} />)
    const words = screen.getByText('Colin Levy')
    const bare = (c: string) => c.replace(/\s/g, '')
    const line = () => bare(styleOf(words).textDecorationColor)
    const text = bare(styleOf(words).color)
    expect(line()).not.toBe(text)
    hover(screen.getByRole('link'))
    expect(line()).toBe(text)
  })

  test('without onOpen, every value is words', () => {
    draw('touch', <FactsCard title="Information" facts={facts} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('on the TV, one focus stop with its heading and facts, a step roomier than the phone', () => {
    const { container } = draw('tv', <FactsCard title="Information" facts={facts} />)
    // named by its heading, then its facts, which the stop's one name has to carry
    expect(screen.getByLabelText(/^Information, /)).toBeTruthy()
    expect(textEl(container, 'Colin Levy')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('LetterIndex', () => {
  const letters = ['A', 'B', 'C']
  const present = new Set(['A', 'C'])

  test('by touch, one adjustable control', () => {
    draw(
      'touch',
      <LetterIndex letters={letters} present={present} label="Jump" onLetter={() => {}} />,
    )
    expect(screen.getByRole('slider', { name: 'Jump' })).toBeTruthy()
  })

  test('with a pointer, a button a letter, those without titles disabled', () => {
    const picked: string[] = []
    draw(
      'pointer',
      <LetterIndex
        letters={letters}
        present={present}
        label="Jump"
        onLetter={(l) => picked.push(l)}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Jump' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'B' }).getAttribute('aria-disabled')).toBe('true')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'C' }))
    })
    expect(picked).toEqual(['C'])
  })

  test('with a pointer, the letters share the height under `top` and the page’s gap', () => {
    // the window's height as react-native-web reads it (the document's, which happy-dom may give as 0)
    const height = web.Dimensions.get('window').height
    const at = (share: number) => (
      <LetterIndex
        letters={letters}
        present={present}
        label="Jump"
        top={height - tokens.space['6'] - letters.length * share}
        onLetter={() => {}}
      />
    )
    draw('pointer', at(20))
    expect(screen.getByRole('button', { name: 'A' }).style.height).toBe('20px')
    cleanup()
    // never under touch's letter, so a short window's letters stay a target
    draw('pointer', at(10))
    expect(screen.getByRole('button', { name: 'A' }).style.height).toBe('16px')
  })

  test('on the TV, the rail of letter stops at `top`, focus entering at the focused title’s', () => {
    const picked: string[] = []
    const { container } = draw(
      'tv',
      <LetterIndex
        letters={letters}
        present={present}
        at="C"
        top={40}
        label="Jump"
        onLetter={(l) => picked.push(l)}
      />,
    )
    for (const l of letters) expect(screen.getByLabelText(l)).toBeTruthy()
    const rail = container.querySelector('[data-trap]') as HTMLElement
    expect(rail.getAttribute('data-trap')).toBe('up down')
    expect(rail.style.position).toBe('absolute')
    expect(rail.style.top).toBe('40px')
    // its guide sends focus to `at`'s letter
    expect(rail.hasAttribute('data-guide')).toBe(true)
    // a letter without titles is no stop
    const b = screen.getByLabelText('B')
    expect(b.hasAttribute('data-focusable')).toBe(false)
    focus(b)
    expect(document.activeElement).not.toBe(b)
    const c = screen.getByLabelText('C')
    expect(c.hasAttribute('data-focusable')).toBe(true)
    act(() => {
      fireEvent.click(c)
    })
    expect(picked).toEqual(['C'])
  })

  test('on the TV, without `at`, the rail sends focus nowhere of its own', () => {
    const { container } = draw(
      'tv',
      <LetterIndex letters={letters} present={present} label="Jump" onLetter={() => {}} />,
    )
    expect(container.querySelector('[data-trap]')?.hasAttribute('data-guide')).toBe(false)
  })
})

describe('InlineText', () => {
  const runs = [
    { kind: 'text', text: 'Read ' },
    { kind: 'bold', text: 'the notes' },
    { kind: 'text', text: ' at ' },
    { kind: 'link', text: 'the guide', url: 'https://docs.highsea.tv/' },
  ] as const

  test('by touch, a link is pressed as a link, giving its url', () => {
    const opened: string[] = []
    draw('touch', <InlineText runs={runs} onLink={(u) => opened.push(u)} />)
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'the guide' }))
    })
    expect(opened).toEqual(['https://docs.highsea.tv/'])
  })

  test('on the TV, a link is only its words', () => {
    const { container } = draw('tv', <InlineText runs={runs} onLink={() => {}} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).toBe('Read the notes at the guide')
  })
})

describe('NoticeCard', () => {
  const body = [{ kind: 'text', text: 'The server restarts tonight.' }] as const

  test('in a list, its title is a heading with New beside it', () => {
    draw('pointer', <NoticeCard title="Maintenance" body={body} mark="New" />)
    expect(screen.getByRole('heading', { name: 'Maintenance' })).toBeTruthy()
    expect(screen.getByText('New')).toBeTruthy()
  })

  test('on the TV, a focus stop named by its title, its mark and its words', () => {
    draw('tv', <NoticeCard title="Maintenance" body={body} mark="New" />)
    expect(
      screen
        .getByLabelText('Maintenance, New, The server restarts tonight.')
        .hasAttribute('data-focusable'),
    ).toBe(true)
  })
})

describe('FeaturedCard', () => {
  test('with a pointer, its title is an h2 and the card is one link', () => {
    draw('pointer', <FeaturedCard title="Sintel" meta="2010 · 15m" onPress={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Sintel', level: 2 }).tagName).toBe('H2')
  })

  test('by touch, one link named by its title', () => {
    let opened = 0
    draw('touch', <FeaturedCard title="Sintel" meta="2010 · 15m" onPress={() => opened++} />)
    act(() => {
      fireEvent.click(screen.getByRole('link'))
    })
    expect(opened).toBe(1)
  })
})

describe('Pager', () => {
  const pager = (count: number, onChange: (i: number) => void = () => {}) => (
    <Pager
      count={count}
      current={1}
      onChange={onChange}
      previousLabel="Previous"
      nextLabel="Next"
      pageLabel={(i: number) => `Page ${i + 1}`}
    />
  )

  test('with a pointer, the current page is aria-current, and a dot moves to its page', () => {
    const to: number[] = []
    draw(
      'pointer',
      pager(3, (i) => to.push(i)),
    )
    expect(screen.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current')).toBe('true')
    expect(screen.getByRole('button', { name: 'Page 1' }).hasAttribute('aria-current')).toBe(false)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Page 3' }))
    })
    expect(to).toEqual([2])
  })

  test('draws nothing for one page, or off a pointer', () => {
    draw('pointer', pager(1))
    expect(screen.queryByRole('button')).toBeNull()
    cleanup()
    draw('touch', pager(3))
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('Menu', () => {
  const items = (picked: string[]) => [
    { label: 'Title', current: true, onSelect: () => picked.push('title') },
    { label: 'Year', current: false, onSelect: () => picked.push('year') },
    { label: 'Added', current: false, onSelect: () => picked.push('added') },
  ]

  test('with a pointer, a menu of radio items, Down moving through them and a choice closing it', () => {
    const picked: string[] = []
    let closed = 0
    draw('pointer', <Menu title="Sort" items={items(picked)} open onClose={() => closed++} />)
    const menu = screen.getByRole('menu', { name: 'Sort' })
    const options = screen.getAllByRole('menuitemradio')
    expect(menu.contains(options[0] as Node)).toBe(true)
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    focus(options[2] as Element)
    key('ArrowDown')
    expect(document.activeElement).toBe(options[0] as Element)
    key('End')
    expect(document.activeElement).toBe(options[2] as Element)
    // one Space, down and up, chooses once: Press presses on its release (./dom.web.ts)
    space()
    expect(picked).toEqual(['added'])
    expect(closed).toBe(1)
  })

  test('with a pointer, Tab closes it', () => {
    let closed = 0
    draw('pointer', <Menu title="Sort" items={items([])} open onClose={() => closed++} />)
    focus(screen.getAllByRole('menuitemradio')[0] as Element)
    key('Tab')
    expect(closed).toBe(1)
  })

  test('closed, nothing is drawn', () => {
    draw('pointer', <Menu title="Sort" items={items([])} open={false} onClose={() => {}} />)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('on the TV, the TV’s menu', () => {
    draw('tv', <Menu title="Sort" items={items([])} open onClose={() => {}} />)
    expect(screen.getByText('Sort')).toBeTruthy()
    expect(screen.getByLabelText('Year')).toBeTruthy()
  })
})

describe('Popover', () => {
  const anchor = { current: null }
  test('with a pointer, a dialog named by its title', () => {
    draw(
      'pointer',
      <Popover title="Audio and subtitles" open onClose={() => {}} anchor={anchor}>
        <Toast title="Inside" />
      </Popover>,
    )
    expect(screen.getByRole('dialog', { name: 'Audio and subtitles' })).toBeTruthy()
  })

  test('by touch, nothing', () => {
    draw(
      'touch',
      <Popover title="Audio and subtitles" open onClose={() => {}} anchor={anchor}>
        <Toast title="Inside" />
      </Popover>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Button', () => {
  test('a menu’s trigger says it opens a menu, and whether it’s open', () => {
    draw(
      'pointer',
      <Button hasPopup="menu" accessibilityState={{ expanded: true }}>
        Sort
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Sort' })
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('Chip', () => {
  test('takes the role it’s given, a tab read as selected', () => {
    draw(
      'pointer',
      <Chip accessibilityRole="tab" selected>
        Movies
      </Chip>,
    )
    expect(screen.getByRole('tab', { name: 'Movies' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('Skeleton', () => {
  test('hidden from assistive tech, its text in three lines by default', () => {
    const { container } = draw('touch', <SkeletonText />)
    const root = container.firstElementChild as HTMLElement
    expect(root.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
    cleanup()
    const one = draw('pointer', <Skeleton height={20} />)
    expect(one.container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })
})

describe('Toast', () => {
  const announced = () => document.getElementById('highsea-announcer')
  const settle = () => act(() => new Promise((done) => setTimeout(done, 150)))

  test('announced through the page’s one status region, written after it’s emptied, on the TV too', async () => {
    for (const form of ['touch', 'tv'] as const) {
      draw(form, <Toast title="Added to your list" body="Sintel" />)
      const region = announced()
      expect(region?.getAttribute('role')).toBe('status')
      expect(region?.getAttribute('aria-live')).toBe('polite')
      expect(region?.textContent).toBe('')
      await settle()
      expect(region?.textContent).toBe('Added to your list. Sintel')
      cleanup()
    }
    // the region stays, one for every note
    expect(document.querySelectorAll('#highsea-announcer').length).toBe(1)
  })

  test('its body takes inline runs, with their links, announced as their words', async () => {
    const opened: string[] = []
    draw(
      'pointer',
      <Toast
        title="Maintenance"
        body={[
          { kind: 'text', text: 'See ' },
          { kind: 'link', text: 'the notes', url: 'https://example.test/notes' },
        ]}
        onLink={(url) => opened.push(url)}
      />,
    )
    act(() => {
      fireEvent.click(screen.getByText('the notes'))
    })
    expect(opened).toEqual(['https://example.test/notes'])
    await settle()
    expect(announced()?.textContent).toBe('Maintenance. See the notes')
  })
})

describe('Certification', () => {
  test('its words, at every form factor', () => {
    for (const form of ['touch', 'pointer', 'tv'] as const) {
      draw(form, <Certification>PG-13</Certification>)
      expect(screen.getByText('PG-13')).toBeTruthy()
      cleanup()
    }
  })
})

describe('Poster’s pointer form', () => {
  test('its label overrides the title, and its actions show while the pointer is over it', () => {
    const { container } = draw(
      'pointer',
      <Poster
        title="Sintel"
        accessibilityLabel="Sintel, 2010"
        onPress={() => {}}
        actions={<Button accessibilityLabel="Play" icon="play" iconOnly />}
      />,
    )
    expect(screen.getByRole('link', { name: 'Sintel, 2010' })).toBeTruthy()
    const play = screen.getByRole('button', { name: 'Play' })
    // the actions' row, absolute over the art's top
    const row = () => {
      let at = play as HTMLElement | null
      while (at && at.style.position !== 'absolute') at = at.parentElement
      return at
    }
    const shown = () => row()?.style.opacity
    expect(shown()).toBe('0')
    const over = container.firstElementChild as Element
    act(() => {
      fireEvent.pointerEnter(over, { pointerType: 'mouse' })
    })
    expect(shown()).toBe('1')
  })
})

describe('NamedAction’s popup', () => {
  test('with a pointer, it says it opens a dialog and whether it’s open, and keeps its tooltip', () => {
    const { container } = draw(
      'pointer',
      <NamedAction
        icon="subtitles"
        label="Audio and subtitles"
        hasPopup="dialog"
        accessibilityState={{ expanded: true }}
        onPress={() => {}}
      />,
    )
    const button = screen.getByRole('button', { name: 'Audio and subtitles' })
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('true')
    hover(button)
    expect(textEl(container, 'Audio and subtitles')).toBeTruthy()
  })

  test('by touch too', () => {
    draw(
      'touch',
      <NamedAction
        icon="subtitles"
        label="Audio and subtitles"
        hasPopup="dialog"
        accessibilityState={{ expanded: false }}
        onPress={() => {}}
      />,
    )
    const button = screen.getByRole('button', { name: 'Audio and subtitles' })
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('TV_HEAD_HEIGHT', () => {
  test('the TV’s parts export it: the safe area and the account’s stop, in units', () => {
    expect(tvParts.TV_HEAD_HEIGHT).toBe(tokens.tv.safe.y + 3)
  })
})

describe('Home’s skeletons', () => {
  const hidden = (root: HTMLElement) =>
    (root.firstElementChild as HTMLElement).getAttribute('aria-hidden')

  test('each form factor draws its own, hidden from assistive tech', () => {
    for (const form of ['touch', 'pointer', 'tv'] as const) {
      for (const node of [<FeaturedCardSkeleton key="f" />, <FilmRowSkeleton key="r" />]) {
        const { container } = draw(form, node)
        expect(hidden(container)).toBe('true')
        expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(3)
        cleanup()
      }
    }
  })

  test('the pointer’s featured card is within its clamp', () => {
    const { container } = draw('pointer', <FeaturedCardSkeleton />)
    const h = Number.parseFloat((container.firstElementChild as HTMLElement).style.height)
    expect(h).toBeGreaterThanOrEqual(288)
    expect(h).toBeLessThanOrEqual(704)
  })

  test('a poster’s skeleton: the art at its aspect, the resume bar only for Continue', () => {
    const { container } = draw('touch', <PosterSkeleton aspect="still" resume width={200} />)
    const art = container.querySelector('[style*="aspect-ratio"]') as HTMLElement
    expect(art.style.aspectRatio).toBe(`${16 / 9} / 1`)
    const withBar = container.querySelectorAll('[aria-hidden="true"]').length
    cleanup()
    const plain = draw('touch', <PosterSkeleton />)
    expect(plain.container.querySelectorAll('[aria-hidden="true"]').length).toBe(withBar - 1)
  })
})

describe('FeaturedCard by touch', () => {
  test('its kicker is uppercase and tracked as an eyebrow, and it needs no meta', () => {
    const { container } = draw(
      'touch',
      <FeaturedCard title="Sintel" kicker="New · 2010" onPress={() => {}} />,
    )
    const kicker = textEl(container, 'New · 2010') as HTMLElement
    expect(kicker.style.textTransform).toBe('uppercase')
    expect(Number.parseFloat(kicker.style.letterSpacing)).toBeGreaterThan(0)
  })
})

describe('TvPage’s scroll', () => {
  test('in a browser, each move of its track is handed to onScroll as its offset', async () => {
    const offsets: number[] = []
    const { container } = draw(
      'tv',
      <TvPage
        keep={0.4}
        onScroll={(e) => offsets.push(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        <Toast title="Inside" />
      </TvPage>,
    )
    const track = container.querySelector('[data-scroll="y"]') as HTMLElement
    track.style.transform = 'translateY(-120px)'
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(offsets).toEqual([120])
  })
})

// ---------------------------------------------------------------- the review's checks

const { Dialog, Sheet } = await import('../../src/native/sheet.tsx')
const { EmptyState } = await import('../../src/native/empty-state.tsx')
const { RowSkeleton } = await import('../../src/native/row.tsx')
const { Bloom } = await import('../../src/native/featured-card.tsx')
const { alpha } = await import('../../src/native/alpha.ts')
// axe reads `window` as it loads, so it's imported once happy-dom has registered one, as
// test/web/a11y.test.tsx does; happy-dom has no layout, so contrast is left to the token tests
const { default: axe } = await import('axe-core')

/** What axe finds in the page, by WCAG 2.2 AA's rules, contrast aside (test/web/a11y.test.tsx). */
async function violations(): Promise<string[]> {
  const result = await axe.run(
    { include: [document.body] },
    {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    },
  )
  return result.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim()}`,
    ),
  )
}

/** A Modal's close and its focus give-back run in effects: let them. */
const flush = () => act(() => new Promise((done) => setTimeout(done, 0)))

describe('axe', () => {
  const page = () => (
    <>
      <SectionHeading title="Movies" count={3} />
      <FeaturedCard title="Sintel" meta="2010 · 15m" tags={['4K', 'HDR']} onPress={() => {}} />
      <Row
        title="Cast"
        items={films}
        keyOf={(f) => f.id}
        itemWidth={100}
        render={(f) => <Poster title={f.title} caption="2010" showTitle onPress={() => {}} />}
      />
      <NoticeCard title="Maintenance" body={[{ kind: 'text', text: 'Tonight.' }]} mark="New" />
      <Chip selected>Unwatched</Chip>
      <Chip hasPopup="menu">Genre</Chip>
      <Chip current="page">Movies</Chip>
      <Pager
        count={3}
        current={0}
        onChange={() => {}}
        previousLabel="Previous featured title"
        nextLabel="Next featured title"
        pageLabel={(i) => `Show title ${i + 1}`}
      />
      <EmptyState icon="movie" title="Nothing yet" />
      <Toast title="Added to your list" />
    </>
  )

  for (const form of ['pointer', 'touch'] as const)
    test(`the parts ${form === 'pointer' ? 'with a pointer' : 'by touch'} pass WCAG 2.2 AA`, async () => {
      draw(form, page())
      expect(await violations()).toEqual([])
    })
})

describe('Menu without an anchor', () => {
  test('with a pointer, it’s drawn in the window rather than hung from nothing', () => {
    draw(
      'pointer',
      <Menu
        title="Sort"
        items={[{ label: 'Title', onSelect: () => {} }]}
        open
        onClose={() => {}}
      />,
    )
    const menu = screen.getByRole('menu', { name: 'Sort' })
    // happy-dom lays nothing out, so a measured panel is the one react-native-web hands onLayout
    act(() => {
      fireEvent(menu, new Event('layout'))
    })
    expect(menu.style.position).toBe('absolute')
    expect(screen.getByRole('menuitem', { name: 'Title' })).toBeTruthy()
  })
})

/**
 * Ends a fading Modal's CSS animation, as a browser does when it finishes. react-native-web's
 * ModalAnimation shows a modal with an animationType other than 'none' (Dialog's 'fade') only on
 * `animationend`, and only then makes it active (its role, focus trap and Escape) or, closing,
 * unmounts it; happy-dom runs no CSS animations, so it never fires on its own.
 */
function faded() {
  // the animated element sits above the focus trap's wrapper; ModalAnimation ignores an event
  // whose target isn't itself, so each ancestor gets its own
  for (const content of document.querySelectorAll('[aria-modal]'))
    for (let el = content.parentElement; el && el !== document.body; el = el.parentElement) {
      const target = el
      act(() => {
        fireEvent.animationEnd(target)
      })
    }
}

describe('Escape and focus', () => {
  /** A trigger that opens `panel`, closed by its onClose, as a screen wires one. */
  function Harness({
    panel,
    told,
  }: {
    panel: (open: boolean, close: (how?: string) => void) => ReactNode
    told?: (how?: string) => void
  }) {
    const [open, setOpen] = React.useState(false)
    return (
      <>
        <Button onPress={() => setOpen(true)}>Open</Button>
        {panel(open, (how) => {
          told?.(how)
          setOpen(false)
        })}
      </>
    )
  }
  const anchor = { current: null }

  async function opened(
    form: Form,
    panel: Parameters<typeof Harness>[0]['panel'],
    told?: (how?: string) => void,
  ) {
    draw(form, <Harness panel={panel} told={told} />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    focus(trigger)
    act(() => {
      fireEvent.click(trigger)
    })
    await flush()
    return trigger
  }
  const pressEscape = () =>
    act(() => {
      fireEvent.keyUp(document, { key: 'Escape' })
    })

  const panels = {
    Menu: (open: boolean, close: (how?: string) => void) => (
      <Menu
        title="Sort"
        items={[{ label: 'Title', onSelect: () => {} }]}
        open={open}
        onClose={close}
      />
    ),
    Popover: (open: boolean, close: () => void) => (
      <Popover title="Alerts" open={open} onClose={close} anchor={anchor}>
        <Button onPress={() => {}}>Inside</Button>
      </Popover>
    ),
    Dialog: (open: boolean, close: () => void) => (
      <Dialog title="Sign out" open={open} onClose={close}>
        <Button onPress={() => {}}>Inside</Button>
      </Dialog>
    ),
  }

  for (const [name, panel] of Object.entries(panels))
    test(`with a pointer, Escape closes ${name} and focus goes back to its trigger`, async () => {
      const hows: (string | undefined)[] = []
      const trigger = await opened('pointer', panel, (how) => hows.push(how))
      faded()
      await flush()
      expect(document.activeElement).not.toBe(trigger)
      pressEscape()
      faded()
      await flush()
      await flush()
      expect(hows.length).toBe(1)
      if (name === 'Menu') expect(hows).toEqual(['stay'])
      expect(document.activeElement).toBe(trigger)
    })

  test('a choice that leaves the screen closes the menu without giving focus back', async () => {
    const hows: (string | undefined)[] = []
    const trigger = await opened(
      'pointer',
      (open, close) => (
        <Menu
          title="More"
          items={[{ label: 'Go to the film', closes: 'leave', onSelect: () => {} }]}
          open={open}
          onClose={close}
        />
      ),
      (how) => hows.push(how),
    )
    const item = screen.getByRole('menuitem', { name: 'Go to the film' })
    focus(item)
    act(() => {
      fireEvent.click(item)
    })
    await flush()
    await flush()
    expect(hows).toEqual(['leave'])
    expect(document.activeElement).not.toBe(trigger)
    // and once the Modal has gone the trigger takes focus again as any element does
    focus(trigger)
    expect(document.activeElement).toBe(trigger)
  })
})

describe('heading levels', () => {
  test('a part’s title is the level it’s given, h2 by default', () => {
    draw(
      'pointer',
      <>
        <EmptyState icon="movie" title="Nothing yet" />
        <EmptyState icon="movie" title="Nothing at all" level={1} />
        <NoticeCard title="Maintenance" body={[]} level={3} />
      </>,
    )
    expect(screen.getByRole('heading', { name: 'Nothing yet' }).tagName).toBe('H2')
    expect(screen.getByRole('heading', { name: 'Nothing at all' }).tagName).toBe('H1')
    expect(screen.getByRole('heading', { name: 'Maintenance' }).tagName).toBe('H3')
  })

  test('a dialog’s title is its h2 and names it', () => {
    draw(
      'pointer',
      <Dialog title="Sign out" open onClose={() => {}}>
        <Button onPress={() => {}}>Inside</Button>
      </Dialog>,
    )
    faded()
    expect(screen.getByRole('heading', { name: 'Sign out' }).tagName).toBe('H2')
    expect(screen.getByRole('dialog', { name: 'Sign out' })).toBeTruthy()
  })
})

describe('Row’s arrows when it fits', () => {
  test('with a pointer, a row whose items all show draws no arrows, even under the pointer', () => {
    const { container } = draw(
      'pointer',
      <Row
        title="Cast"
        items={films}
        keyOf={(f) => f.id}
        itemWidth={100}
        render={(f) => <Poster title={f.title} onPress={() => {}} />}
      />,
    )
    const group = screen.getByRole('group', { name: 'Cast' })
    const scroller = group.querySelector('[data-row-item]')?.parentElement
      ?.parentElement as HTMLElement
    for (const [k, v] of Object.entries({ offsetWidth: 1000, scrollWidth: 1000, scrollLeft: 0 }))
      Object.defineProperty(scroller, k, { configurable: true, value: v })
    act(() => {
      fireEvent.scroll(scroller)
    })
    hover(group)
    expect(arrowsOf(container).map(shownOf)).toEqual(['0', '0'])
  })
})

describe('Chip’s semantics', () => {
  test('a toggle is aria-pressed, never aria-selected', () => {
    draw('pointer', <Chip selected>Unwatched</Chip>)
    const chip = screen.getByRole('button', { name: 'Unwatched' })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.hasAttribute('aria-selected')).toBe(false)
  })

  test('a filter that opens a menu is a button that says so, with no pressed state', () => {
    draw(
      'pointer',
      <Chip hasPopup="menu" selected>
        Genre
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'Genre' })
    expect(chip.getAttribute('aria-haspopup')).toBe('menu')
    expect(chip.hasAttribute('aria-pressed')).toBe(false)
    expect(chip.hasAttribute('aria-selected')).toBe(false)
  })

  test('a view chip that’s the page is aria-current', () => {
    draw(
      'pointer',
      <Chip current="page" selected>
        Movies
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'Movies' })
    expect(chip.getAttribute('aria-current')).toBe('page')
    expect(chip.hasAttribute('aria-pressed')).toBe(false)
  })

  test('a radio on the web is checked alone, as WAI-ARIA has it', () => {
    draw(
      'pointer',
      <Chip accessibilityRole="radio" selected>
        Dark
      </Chip>,
    )
    const radio = screen.getByRole('radio', { name: 'Dark' })
    expect(radio.getAttribute('aria-checked')).toBe('true')
    expect(radio.hasAttribute('aria-selected')).toBe(false)
    expect(radioState(true)).toEqual({ checked: true })
  })
})

describe('RowSkeleton', () => {
  test('hidden from assistive tech at every form factor, with as many items as it’s asked', () => {
    for (const form of ['touch', 'pointer', 'tv'] as const) {
      const { container } = draw(form, <RowSkeleton aspect="still" count={4} itemWidth={120} />)
      const root = container.firstElementChild as HTMLElement
      expect(root.getAttribute('aria-hidden')).toBe('true')
      expect(container.querySelectorAll('[style*="aspect-ratio"]').length).toBe(4)
      cleanup()
    }
  })
})

describe('Sheet’s footer', () => {
  test('its buttons sit after the scrolling body, outside it', () => {
    draw(
      'touch',
      <Sheet
        title="Sort and filter"
        open
        onClose={() => {}}
        footer={<Button onPress={() => {}}>Show 3 movies</Button>}
      >
        <Toast title="Inside" />
      </Sheet>,
    )
    const footer = screen.getByRole('button', { name: 'Show 3 movies' })
    const body = screen.getByText('Inside')
    // the body's scroller doesn't hold the footer, which follows it in the page
    expect(body.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const scroller = styled(body, 'overflow-y') ?? styled(body, 'overflow')
    expect(scroller?.contains(footer) ?? false).toBe(false)
  })
})

describe('Poster’s titleSize', () => {
  test('with a pointer, body by default and the admin’s 13 for ui', () => {
    const { container } = draw('pointer', <Poster title="Sintel" showTitle onPress={() => {}} />)
    expect(textEl(container, 'Sintel')?.style.fontSize).toBe(`${tokens.text.web.body.size}px`)
    cleanup()
    const ui = draw(
      'pointer',
      <Poster title="Sintel" showTitle titleSize="ui" onPress={() => {}} />,
    )
    expect(textEl(ui.container, 'Sintel')?.style.fontSize).toBe('13px')
  })
})

describe('FeaturedCard’s tags', () => {
  test('with a pointer, after the line; on the TV, read with the card', () => {
    draw(
      'pointer',
      <FeaturedCard title="Sintel" meta="2010 · 15m" tags={['4K', 'HDR']} onPress={() => {}} />,
    )
    expect(screen.getByText('4K')).toBeTruthy()
    expect(screen.getByText('HDR')).toBeTruthy()
    cleanup()
    draw('tv', <FeaturedCard title="Sintel" meta="2010" tags={['4K']} onPress={() => {}} />)
    expect(screen.getByLabelText('Sintel, 2010, 4K')).toBeTruthy()
  })
})

describe('Bloom', () => {
  const glow = (root: HTMLElement) => styled(root.firstElementChild, 'background-image')

  test('with a pointer and on the TV, a glow in the colour, hidden from assistive tech', () => {
    for (const form of ['pointer', 'tv'] as const) {
      const { container } = draw(form, <Bloom color="hsl(210 80% 50%)" />)
      const el = container.firstElementChild as HTMLElement
      expect(el.getAttribute('aria-hidden')).toBe('true')
      expect(glow(container)?.style.backgroundImage).toContain('hsla(210 80% 50% / 0.7)')
      expect(el.style.opacity).toBe('1')
      cleanup()
    }
  })

  test('not shown, it’s faded out; with no colour or by touch, nothing', () => {
    const hidden = draw('pointer', <Bloom color="#336699" shown={false} />)
    expect((hidden.container.firstElementChild as HTMLElement).style.opacity).toBe('0')
    cleanup()
    expect(draw('pointer', <Bloom color={null} />).container.firstElementChild).toBeNull()
    cleanup()
    expect(draw('touch', <Bloom color="#336699" />).container.firstElementChild).toBeNull()
  })

  test('under reduced motion it shows at once', () => {
    const { container } = draw('pointer', <Bloom color="#336699" />, true)
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe('1')
  })
})

describe('alpha', () => {
  test('a hex colour at an alpha, short or long, its own alpha replaced', () => {
    expect(alpha('#fff', 0.5)).toBe('#ffffff80')
    expect(alpha('#336699cc', 1)).toBe('#336699ff')
  })

  test('hsl() written back as hsla(… / a), clamped, the one form CSS and React Native share', () => {
    expect(alpha('hsl(210 80% 50%)', 0.3)).toBe('hsla(210 80% 50% / 0.3)')
    expect(alpha('hsl(210 80% 50% / 0.9)', 2)).toBe('hsla(210 80% 50% / 1)')
  })

  test('any other form throws', () => {
    expect(() => alpha('red', 0.5)).toThrow()
    expect(() => alpha('rgb(0 0 0)', 0.5)).toThrow()
  })
})

describe('Rating', () => {
  // the accent's row is cut to the value's width: on the web an <svg> may shrink in a flex row, so
  // each star stands in a box its own size, which keeps all five at 12 rather than squeezing them
  // into three stars' width (the B1 compare: five small stars where the prototype has three)
  test('each star keeps its size, so the value shows as a part of the five', () => {
    const { container } = draw('pointer', <Rating value={3} size={12} />)
    const cut = [...container.querySelectorAll('div')].find(
      (el) => (el as HTMLElement).style.overflowX === 'hidden',
    ) as HTMLElement
    expect(cut.style.width).toBe('36px')
    const stars = [...cut.children] as HTMLElement[]
    expect(stars).toHaveLength(5)
    for (const star of stars) {
      expect(star.style.width).toBe('12px')
      expect(star.style.height).toBe('12px')
    }
  })
})
