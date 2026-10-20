// SPDX-License-Identifier: AGPL-3.0-only
import {
  type EditableItem,
  Icon,
  SortableList,
  Sparkline,
  WidgetEditor,
  WidgetFrame,
} from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const meta = { title: 'Components/Customize' } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

type Widget = EditableItem & { title: string; width: [number, number]; height: [number, number] }

const widgets: Widget[] = [
  { id: 'network', title: 'Network', span: 2, rows: 2, width: [1, 2], height: [2, 4] },
  { id: 'storage', title: 'Storage', span: 1, rows: 2, width: [1, 4], height: [2, 4] },
  { id: 'indexers', title: 'Indexers', span: 1, rows: 2, width: [1, 4], height: [2, 6] },
  { id: 'queue', title: 'Queue', span: 4, rows: 3, width: [1, 4], height: [3, 8] },
]

/**
 * Customize mode: drag a widget by its handle, or its corner to resize it. From the keyboard,
 * Space on the handle picks it up, the arrows move it, Shift and an arrow resize it.
 */
export const WidgetEditing: Story = {
  render: function Render() {
    const [items, setItems] = useState(widgets)
    return (
      <WidgetEditor
        items={items}
        editing
        onChange={setItems}
        range={(w) => ({ width: w.width, height: w.height })}
        label={(w) => w.title}
        render={(w, frame) => (
          <WidgetFrame key={w.id} title={w.title} {...frame}>
            <p className="text-caption text-text-2">
              {w.span} × {w.rows}
            </p>
          </WidgetFrame>
        )}
      />
    )
  },
}

/** A list reordered the same way: Up and Down from the keyboard. */
export const SortableRows: Story = {
  render: function Render() {
    const [rows, setRows] = useState(['Continue watching', 'New this week', 'Staff picks'])
    return (
      <SortableList
        items={rows}
        id={(r) => r}
        label={(r) => r}
        onChange={setRows}
        aria-label="Home rows"
        className="w-80 gap-2"
        itemClassName="rounded-md border border-line bg-s1"
      >
        {(row, handle) => (
          <div className="flex items-center gap-2 px-2 py-1.5 text-body">
            {handle}
            <Icon name="list" size={16} className="text-text-3" />
            {row}
          </div>
        )}
      </SortableList>
    )
  },
}

/** Live rates: the figures beside it carry the values, so the graph is decorative. */
export const NetworkSparkline: Story = {
  render: () => (
    <div className="w-72">
      <Sparkline
        series={[
          { values: [2, 4, 3, 8, 12, 9, 14, 11, 16, 13], className: 'text-accent', fill: true },
          { values: [1, 1, 2, 1, 3, 2, 2, 4, 3, 2], className: 'text-text-3' },
        ]}
      />
    </div>
  ),
}
