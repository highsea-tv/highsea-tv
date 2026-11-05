// SPDX-License-Identifier: AGPL-3.0-only
// The spatial focus engine's DOM side (src/native/tv/spatial/navigator.ts) in happy-dom, with each
// element's box given by hand, since happy-dom lays nothing out: the prototype's markup (groups and
// their memory, tracks), and what the library's stops add in a browser for react-native-tvos's
// focus guides (traps, destinations and a page's Kept parts).
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })

import { afterEach, describe, expect, test } from 'bun:test'
import { createSpatialNavigator } from '../../src/native/tv/spatial/navigator.ts'

type Box = { left: number; top: number; width: number; height: number }

/** Gives an element a fixed box. */
function place(el: Element, b: Box) {
  const rect = { ...b, right: b.left + b.width, bottom: b.top + b.height, x: b.left, y: b.top }
  el.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect
}

/** A stop at a box, inside `parent`. */
function stop(parent: Element, id: string, b: Box) {
  const el = document.createElement('div')
  el.id = id
  el.tabIndex = 0
  el.dataset.focusable = ''
  place(el, b)
  parent.append(el)
  return el
}

function region(parent: Element, data: Record<string, string>, b?: Box) {
  const el = document.createElement('div')
  for (const [k, v] of Object.entries(data)) el.dataset[k] = v
  if (b) place(el, b)
  parent.append(el)
  return el
}

const press = (key: string) =>
  (document.activeElement ?? document.body).dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  )
const focused = () => document.activeElement?.id

let destroy = () => {}
afterEach(() => {
  destroy()
  document.body.innerHTML = ''
})

function start(destinations?: Map<Element, HTMLElement[]>) {
  const nav = createSpatialNavigator(document.body, {
    reducedMotion: () => true,
    destinations: destinations ? (g) => destinations.get(g) ?? [] : undefined,
  })
  destroy = () => nav.destroy()
  return nav
}

/** Two rows of three, 100 wide with 20 between, the second 200 below. */
function rows() {
  const top = region(document.body, { group: 'top' })
  const bottom = region(document.body, { group: 'bottom' })
  for (let i = 0; i < 3; i++) {
    stop(top, `t${i}`, { left: i * 120, top: 0, width: 100, height: 150 })
    stop(bottom, `b${i}`, { left: i * 120, top: 200, width: 100, height: 150 })
  }
  return { top, bottom }
}

describe('the spatial focus engine', () => {
  test('the first arrow lands on [data-initial], then the arrows move by the model', () => {
    rows()
    document.getElementById('t1')?.setAttribute('data-initial', '')
    start()
    press('ArrowRight')
    expect(focused()).toBe('t1')
    press('ArrowRight')
    expect(focused()).toBe('t2')
    press('ArrowDown')
    expect(focused()).toBe('b2')
  })

  test('a row remembers where focus left it', () => {
    rows()
    start()
    document.getElementById('t2')?.focus()
    press('ArrowDown')
    press('ArrowLeft')
    press('ArrowLeft')
    expect(focused()).toBe('b0')
    // up from b0 would land on t0 by geometry; the top row gives back t2, which is ahead
    press('ArrowUp')
    expect(focused()).toBe('t2')
  })

  test('a trap keeps focus in its region for its directions only', () => {
    const { top } = rows()
    top.dataset.trap = 'down'
    start()
    document.getElementById('t0')?.focus()
    press('ArrowDown')
    expect(focused()).toBe('t0')
    press('ArrowRight')
    expect(focused()).toBe('t1')
  })

  test('a guide hands focus arriving from outside to its destination', () => {
    rows()
    // a head across the top, its guide sending Up to the stop for where the person is
    const head = region(
      document.body,
      { guide: '' },
      { left: 0, top: -200, width: 1000, height: 100 },
    )
    stop(head, 'h0', { left: 0, top: -180, width: 80, height: 60 })
    const here = stop(head, 'h1', { left: 800, top: -180, width: 80, height: 60 })
    start(new Map([[head, [here]]]))
    document.getElementById('t0')?.focus()
    press('ArrowUp')
    expect(focused()).toBe('h1')
    // inside it, focus moves freely
    press('ArrowLeft')
    expect(focused()).toBe('h0')
  })

  test('a track lands the focused stop at its keep, and a Kept part as a whole', () => {
    const view = region(document.body, {}, { left: 0, top: 0, width: 1000, height: 1000 })
    Object.defineProperty(view, 'clientHeight', { value: 1000 })
    const track = region(
      view,
      { scroll: 'y', keep: '0.5' },
      { left: 0, top: 0, width: 1000, height: 3000 },
    )
    Object.defineProperty(track, 'scrollHeight', { value: 3000 })
    const part = region(track, { kept: 'center' }, { left: 0, top: 1800, width: 1000, height: 400 })
    stop(track, 'a', { left: 0, top: 100, width: 100, height: 100 })
    stop(part, 'b', { left: 0, top: 1800, width: 100, height: 100 })
    start()
    document.getElementById('a')?.focus()
    press('ArrowDown')
    expect(focused()).toBe('b')
    // the part's centre (2000) at half the view (500), not the stop's (1850)
    expect(track.style.transform).toBe('translateY(-1500px)')
  })
})
