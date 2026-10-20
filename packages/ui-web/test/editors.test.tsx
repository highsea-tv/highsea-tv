// SPDX-License-Identifier: AGPL-3.0-only
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import {
  type EditableItem,
  SortableList,
  Sparkline,
  useClip,
  useWidth,
  WidgetEditor,
  WidgetFrame,
} from '../src/index.ts'

afterEach(cleanup)

// testing-library's `screen` is bound before ./dom.ts installs the document, so query the body
const screen = {
  getByRole: (role: string, options?: { name?: string | RegExp }) =>
    within(document.body).getByRole(role, options),
}

type W = EditableItem & { title: string }

const start: W[] = [
  { id: 'a', title: 'Network', span: 2, rows: 2 },
  { id: 'b', title: 'Storage', span: 1, rows: 2 },
  { id: 'c', title: 'Queue', span: 4, rows: 5 },
]

let latest: W[] = []

function Editor({ messages }: { messages?: Parameters<typeof WidgetEditor>[0]['messages'] }) {
  const [items, setItems] = useState(start)
  latest = items
  return (
    <WidgetEditor
      items={items}
      editing
      onChange={setItems}
      range={(w) =>
        w.id === 'b' ? { width: [1, 1], height: [2, 2] } : { width: [1, 4], height: [2, 6] }
      }
      label={(w) => w.title}
      messages={messages}
      render={(w, frame) => (
        <WidgetFrame key={w.id} title={w.title} {...frame}>
          {w.title} body
        </WidgetFrame>
      )}
    />
  )
}

const live = () => document.querySelector('[aria-live]')?.textContent

describe('WidgetEditor', () => {
  test('the keyboard picks up, moves, resizes and drops, announcing each step', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    const handle = screen.getByRole('button', { name: 'Move Network' })
    handle.focus()
    await user.keyboard(' ')
    expect(live()).toContain('Network picked up, position 1 of 3, 2 columns wide and 2 rows tall.')
    await user.keyboard('{ArrowRight}')
    expect(latest.map((w) => w.id)).toEqual(['b', 'a', 'c'])
    expect(live()).toBe('Network moved to position 2 of 3.')
    // focus follows the moved widget
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move Network' }))
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(latest[1]).toMatchObject({ span: 2, rows: 3 })
    expect(live()).toBe('Network is now 2 columns wide and 3 rows tall.')
    await user.keyboard(' ')
    expect(live()).toBe('Network dropped at position 2 of 3.')
  })

  test('Escape puts it back; a fixed size says so', async () => {
    const user = userEvent.setup()
    render(<Editor />)
    screen.getByRole('button', { name: 'Move Storage' }).focus()
    await user.keyboard(' {Shift>}{ArrowRight}{/Shift}')
    expect(live()).toBe('Storage is already as wide as it goes.')
    await user.keyboard('{ArrowLeft}')
    expect(latest.map((w) => w.id)).toEqual(['b', 'a', 'c'])
    await user.keyboard('{Escape}')
    expect(latest.map((w) => w.id)).toEqual(['a', 'b', 'c'])
    expect(live()).toBe('Move cancelled. Storage is back where it was.')
  })

  test('only resizable widgets get the corner', () => {
    render(<Editor />)
    expect(document.querySelectorAll('.cursor-nwse-resize')).toHaveLength(2)
  })

  test('apps pass their own strings', async () => {
    const user = userEvent.setup()
    render(
      <Editor
        messages={{
          move: (n) => `Déplacer ${n}`,
          dropped: (at) => `${at.name} posé, ${at.index}/${at.count}`,
        }}
      />,
    )
    screen.getByRole('button', { name: 'Déplacer Queue' }).focus()
    await user.keyboard('  ')
    expect(live()).toBe('Queue posé, 3/3')
  })
})

describe('SortableList', () => {
  function List() {
    const [items, setItems] = useState(['Sintel', 'Big Buck Bunny', 'Tears of Steel'])
    return (
      <SortableList
        items={items}
        id={(x) => x}
        label={(x) => x}
        onChange={setItems}
        aria-label="Rows"
      >
        {(item, handle) => (
          <span>
            {handle}
            {item}
          </span>
        )}
      </SortableList>
    )
  }

  test('Up and Down move a row; the ends are announced', async () => {
    const user = userEvent.setup()
    render(<List />)
    screen.getByRole('button', { name: 'Move Sintel' }).focus()
    await user.keyboard(' ')
    expect(live()).toContain('Sintel picked up, position 1 of 3. Up and Down move it.')
    await user.keyboard('{ArrowUp}')
    expect(live()).toBe('Sintel is already first.')
    await user.keyboard('{ArrowDown} ')
    expect(live()).toBe('Sintel dropped at position 2 of 3.')
    const rows = screen.getByRole('list', { name: 'Rows' }).querySelectorAll('li')
    expect([...rows].map((r) => r.textContent)).toEqual([
      'Big Buck Bunny',
      'Sintel',
      'Tears of Steel',
    ])
  })
})

describe('Sparkline', () => {
  test('draws each series, hidden from assistive technology', () => {
    const { container } = render(
      <Sparkline
        series={[
          { values: [0, 5, 10], className: 'text-accent', fill: true },
          { values: [2, 2], className: 'text-text-3' },
        ]}
      />,
    )
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    // a line for each series, and a fill under the first
    expect(container.querySelectorAll('path')).toHaveLength(3)
    expect(container.querySelector('path[fill="none"]')?.getAttribute('d')).toStartWith(
      'M0.00 31.00',
    )
  })
})

describe('measuring hooks', () => {
  test('without layout, nothing is hidden and the width is the fallback', () => {
    let seen = { hidden: -1, width: -1 }
    function Probe() {
      const clip = useClip<HTMLUListElement>('li')
      const size = useWidth<HTMLDivElement>(640)
      seen = { hidden: clip.hidden, width: size.width }
      return (
        <div ref={size.ref}>
          <ul ref={clip.ref}>
            <li>One</li>
          </ul>
        </div>
      )
    }
    act(() => {
      render(<Probe />)
    })
    expect(seen.hidden).toBe(0)
    expect(seen.width).toBe(640)
  })
})
