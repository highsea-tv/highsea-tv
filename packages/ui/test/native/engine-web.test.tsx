// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of the TV focus engine (src/native/tv/engine.web.tsx) drawn through
// react-native-web in happy-dom, as the client's web export draws it: Enter presses a stop once
// whatever its role, the focus guides' props become the navigator's markup, the remote's `select`
// reaches useRemote while a stop has focus (react-native-web stops Enter's keydown there), a text
// field keeps Backspace, and a focused stop that unmounts hands focus on. Reanimated is stood in
// for, as the theme reads only its useReducedMotion. react-native-web is the
// client's (apps/client's dependency, resolved from there rather than added here), and its React
// is pointed at this package's, so there's one copy, as the client's Metro config makes it.
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
const web = await import(rnw)
mock.module('react-native', () => web)
// the theme's useMotionReduced asks Reanimated for the OS's setting, which needs a native runtime
// Bun doesn't have; only the hook is read
mock.module('react-native-reanimated', () => ({ useReducedMotion: () => false }))

const testing = await import('@testing-library/react')
const { act, cleanup } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
/** Draws as the client does, inside a ThemeProvider on the TV's input. */
const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor="tv" reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })
const { default: userEvent } = await import('@testing-library/user-event')
const { useRef, useState } = await import('react')
const { Pressable, TextInput, View } = web as typeof import('react-native')
const { FocusGuide, useRemote, useStop } = await import('../../src/native/tv/engine.web.tsx')

/** A stop as Focusable makes one: a Pressable with the engine's ref, props and style. */
function Stop({
  label,
  role,
  preferred,
  onPress,
}: {
  label: string
  role: 'link' | 'button'
  preferred?: boolean
  onPress?: () => void
}) {
  const ref = useRef(null)
  const stop = useStop(ref, { preferred })
  return (
    <Pressable
      {...stop.props}
      ref={stop.ref as never}
      role={role}
      aria-label={label}
      onPress={onPress}
      style={stop.style}
    />
  )
}

/** The remote's presses, as a part hears them. */
function Remote({ heard, children }: { heard: string[]; children?: ReactNode }) {
  useRemote((e) => heard.push(e.eventType))
  return <>{children}</>
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

afterEach(() => cleanup())

describe('the TV focus engine in a browser', () => {
  test('Enter presses a link’s stop once, and a button’s once', async () => {
    const user = userEvent.setup()
    const pressed: string[] = []
    const { getByLabelText } = render(
      <View>
        <Stop label="Tile" role="link" onPress={() => pressed.push('link')} />
        <Stop label="Play" role="button" onPress={() => pressed.push('button')} />
      </View>,
    )
    const link = getByLabelText('Tile')
    // react-native-web draws a link without an address as a <div>, which no browser clicks
    expect(link.tagName).toBe('DIV')
    act(() => link.focus())
    await user.keyboard('{Enter}')
    expect(pressed).toEqual(['link'])
    act(() => getByLabelText('Play').focus())
    await user.keyboard('{Enter}')
    expect(pressed).toEqual(['link', 'button'])
  })

  test('a remounted stop is pressed by Enter too', async () => {
    const user = userEvent.setup()
    const pressed: number[] = []
    function Swap() {
      const [n, setN] = useState(0)
      return (
        <View>
          <Stop key={n} label="Tile" role="link" onPress={() => pressed.push(n)} />
          <Pressable aria-label="Swap" onPress={() => setN(n + 1)} />
        </View>
      )
    }
    const { getByLabelText } = render(<Swap />)
    await user.click(getByLabelText('Swap'))
    act(() => getByLabelText('Tile').focus())
    await user.keyboard('{Enter}')
    expect(pressed).toEqual([1])
  })

  test('the focus guides’ props become the navigator’s markup', () => {
    const destination = document.createElement('div')
    document.body.append(destination)
    const { getByTestId } = render(
      <View>
        <FocusGuide testID="trap" trapFocusLeft trapFocusRight autoFocus />
        <FocusGuide testID="guide" destinations={[destination as never]} />
        <FocusGuide testID="plain" />
      </View>,
    )
    const trap = getByTestId('trap')
    expect(trap.dataset.trap).toBe('left right')
    expect(trap.dataset.group).toBeTruthy()
    expect(getByTestId('guide').dataset.guide).toBe('')
    const plain = getByTestId('plain')
    expect([plain.dataset.trap, plain.dataset.guide, plain.dataset.group]).toEqual([
      undefined,
      undefined,
      undefined,
    ])
    destination.remove()
  })

  test('a guide with autoFocus gives back the stop focused last in it, not the one in line', () => {
    // Search on the TV: the keyboard beside its results, and Left from a result back to the last key
    const { getByLabelText } = render(
      <View>
        <FocusGuide autoFocus>
          <Stop label="A" role="button" />
          <Stop label="B" role="button" />
        </FocusGuide>
        <Stop label="Sintel" role="link" />
        <Stop label="Tears of Steel" role="link" />
      </View>,
    )
    // happy-dom lays nothing out: the keys in a column, the results beside them
    const box = (label: string, left: number, top: number) => {
      const rect = { left, top, width: 100, height: 100, right: left + 100, bottom: top + 100 }
      getByLabelText(label).getBoundingClientRect = () =>
        ({ ...rect, x: left, y: top, toJSON: () => rect }) as DOMRect
    }
    box('A', 0, 0)
    box('B', 0, 120)
    box('Sintel', 200, 0)
    box('Tears of Steel', 200, 120)
    window.dispatchEvent(new Event('resize'))
    const press = (key: string) =>
      act(() => {
        ;(document.activeElement ?? document.body).dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        )
      })
    act(() => getByLabelText('B').focus())
    press('ArrowRight')
    expect(document.activeElement).toBe(getByLabelText('Tears of Steel'))
    press('ArrowUp')
    expect(document.activeElement).toBe(getByLabelText('Sintel'))
    // A is in line with Sintel; the guide hands back B, the key used last
    press('ArrowLeft')
    expect(document.activeElement).toBe(getByLabelText('B'))
  })

  test('select reaches the remote while a stop has focus, and the stop is pressed once', async () => {
    const user = userEvent.setup()
    const heard: string[] = []
    let presses = 0
    const { getByLabelText } = render(
      <Remote heard={heard}>
        <Stop label="Play" role="button" onPress={() => presses++} />
      </Remote>,
    )
    act(() => getByLabelText('Play').focus())
    await user.keyboard('{Enter}')
    expect(heard).toEqual(['select'])
    expect(presses).toBe(1)
    await user.keyboard('{ArrowRight}{Escape}{Shift>}{ArrowLeft}{/Shift}')
    expect(heard).toEqual(['select', 'right', 'menu'])
  })

  test('a text field keeps Backspace, and Escape still goes Back', async () => {
    const user = userEvent.setup()
    const heard: string[] = []
    const { getByLabelText } = render(
      <Remote heard={heard}>
        <TextInput aria-label="Search" defaultValue="Sintel" />
      </Remote>,
    )
    await user.click(getByLabelText('Search'))
    await user.keyboard('{Backspace}{ArrowLeft}{ArrowRight}')
    expect(heard).toEqual([])
    expect((getByLabelText('Search') as HTMLInputElement).value).toBe('Sinte')
    await user.keyboard('{Escape}')
    expect(heard).toEqual(['menu'])
  })

  test('a focused stop that unmounts hands focus to the preferred stop', async () => {
    function Screen() {
      const [shown, setShown] = useState(true)
      return (
        <View>
          <Stop label="Home" role="link" preferred />
          {shown ? <Stop label="Film" role="link" onPress={() => setShown(false)} /> : null}
        </View>
      )
    }
    const user = userEvent.setup()
    const { getByLabelText } = render(<Screen />)
    expect(document.activeElement).toBe(getByLabelText('Home'))
    act(() => getByLabelText('Film').focus())
    await user.keyboard('{Enter}')
    await act(frame)
    expect(document.activeElement).toBe(getByLabelText('Home'))
  })
})
