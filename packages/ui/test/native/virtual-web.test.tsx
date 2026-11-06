// SPDX-License-Identifier: AGPL-3.0-only
// The library's virtualizer (src/native/virtual.tsx) in a browser, drawn through react-native-web
// in happy-dom: a long list draws only the items near its scroller's screen, with spacers holding
// the rest of its length; a scroll reported by the scroller moves the window; a jump scrolls the
// scroller to the item; and a long table body draws spacer rows around its drawn rows, while a
// short one, or one outside a scroller, draws every row. happy-dom lays nothing out, so the
// scroller's reports are made by hand, as ScrollView's events would make them.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { act, cleanup, screen } = testing
const { Text, View } = await import('react-native')
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const virtual = await import('../../src/native/virtual.tsx')
const { ScrollSourceProvider, useScrollSource, Virtual, INITIAL_VIEWPORT } = virtual
const table = await import('../../src/native/table.tsx')
const { Table, TableBody, TableRow, TableCell, VIRTUAL_FROM } = table

type Source = ReturnType<typeof useScrollSource>['source']
type List = import('../../src/native/virtual.tsx').VirtualList

/** A scroller of its own: its source, whose reports the test makes, and what it scrolled to. */
function harness() {
  const scrolled: number[] = []
  let source: Source | null = null
  function Scroller({ children }: { children: ReactNode }) {
    const own = useScrollSource(false)
    own.source.node = { scrollTo: ({ y }: { y?: number }) => scrolled.push(y ?? 0) } as never
    source = own.source
    return <ScrollSourceProvider value={own.source}>{children}</ScrollSourceProvider>
  }
  const report = (patch: Partial<Pick<Source, 'offset' | 'viewport' | 'content'>>) =>
    act(() => {
      if (!source) throw new Error('no scroller')
      Object.assign(source, patch)
      source.emit()
    })
  return { Scroller, report, scrolled }
}

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

const ROW = 40
const COUNT = 5_000
const drawn = () => screen.queryAllByText(/^Item \d+$/).map((n) => Number(n.textContent?.slice(5)))

function Items({ list }: { list?: { current: List | null } }) {
  return (
    <Virtual
      ref={list}
      count={COUNT}
      estimateSize={() => ROW}
      overscan={5}
      render={(i, onLayout) => (
        <View onLayout={onLayout} style={{ height: ROW }}>
          <Text>{`Item ${i}`}</Text>
        </View>
      )}
    />
  )
}

afterEach(() => cleanup())

describe('Virtual', () => {
  test('draws the first screen and a few past it, with the rest of the length after them', () => {
    const { Scroller } = harness()
    const { container } = render(
      <Scroller>
        <Items />
      </Scroller>,
    )
    const items = drawn()
    // the viewport before the scroller lays out, and five past it
    expect(items).toEqual(Array.from({ length: INITIAL_VIEWPORT.height / ROW + 5 }, (_, i) => i))
    const spacers = [...container.querySelectorAll('[aria-hidden="true"]')] as HTMLElement[]
    expect(spacers.map((s) => s.style.height)).toEqual(['0px', `${(COUNT - items.length) * ROW}px`])
  })

  test('a scroll moves the window, and the spacers keep the list its length', async () => {
    const { Scroller, report } = harness()
    const { container } = render(
      <Scroller>
        <Items />
      </Scroller>,
    )
    await report({
      viewport: { width: 800, height: 400 },
      content: { width: 800, height: COUNT * ROW },
    })
    await report({ offset: 2_000 * ROW })
    const items = drawn()
    expect(items[0]).toBe(2_000 - 5)
    expect(items.at(-1)).toBe(2_000 + 400 / ROW - 1 + 5)
    const [before, after] = [...container.querySelectorAll('[aria-hidden="true"]')] as HTMLElement[]
    expect(
      Number.parseFloat(before?.style.height ?? '') +
        items.length * ROW +
        Number.parseFloat(after?.style.height ?? ''),
    ).toBe(COUNT * ROW)
  })

  test('a jump scrolls the scroller to the item, less the offset asked for', async () => {
    const { Scroller, report, scrolled } = harness()
    const list: { current: List | null } = { current: null }
    render(
      <Scroller>
        <Items list={list} />
      </Scroller>,
    )
    await report({
      viewport: { width: 800, height: 400 },
      content: { width: 800, height: COUNT * ROW },
    })
    expect(list.current?.offsetOf(4_000)).toBe(4_000 * ROW)
    await act(() => list.current?.scrollToIndex(4_000, { offset: 24 }))
    expect(scrolled.at(-1)).toBe(4_000 * ROW - 24)
  })
})

describe('TableBody', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => (
      <TableRow key={String(i)}>
        <TableCell>{`Row ${i}`}</TableCell>
      </TableRow>
    ))
  const shown = () => screen.queryAllByRole('row').filter((r) => r.textContent?.startsWith('Row'))

  test('a long body in a scroller draws the rows near the screen between two spacer rows', () => {
    const { Scroller } = harness()
    const { container } = render(
      <Scroller>
        <Table label="Releases">
          <TableBody>{rows(1_000)}</TableBody>
        </Table>
      </Scroller>,
    )
    expect(shown().length).toBeGreaterThan(0)
    expect(shown().length).toBeLessThan(100)
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  test('a short body, or one outside a scroller, draws every row', () => {
    const { Scroller } = harness()
    render(
      <Scroller>
        <Table label="Short">
          <TableBody>{rows(VIRTUAL_FROM)}</TableBody>
        </Table>
      </Scroller>,
    )
    expect(shown()).toHaveLength(VIRTUAL_FROM)
    cleanup()
    render(
      <Table label="Loose">
        <TableBody>{rows(300)}</TableBody>
      </Table>,
    )
    expect(shown()).toHaveLength(300)
  })
})
