// SPDX-License-Identifier: AGPL-3.0-only
// What both halves of the widget editor share (./widget-editor.tsx draws the grid off the web,
// ./widget-editor.web.tsx edits it in a browser; a platform pair imported as `./widget-editor`):
// the props, what it passes each widget's frame, and what it announces, in English unless the app
// passes its catalog's words (as the web renderer's web/components/widget-editor.tsx).
import type { ReactNode } from 'react'
import type { WidgetFrameProps } from './widget.tsx'

export type WidgetSpan = 1 | 2 | 3 | 4

export type EditableItem = { id: string; span: WidgetSpan; rows: number }

/** The sizes a widget allows: [narrowest, widest] in columns, [shortest, tallest] in rows. */
export type SizeRange = { width: [number, number]; height: [number, number] }

/** What the editor passes to each widget's frame. Spread it onto a `WidgetFrame`. */
export type WidgetEditorFrameProps = Pick<
  WidgetFrameProps,
  'span' | 'rows' | 'editing' | 'handle' | 'resize' | 'style' | 'ref' | 'dataSet'
>

export type WidgetEditorProps<T extends EditableItem> = {
  items: T[]
  editing: boolean
  onChange: (items: T[]) => void
  range: (item: T) => SizeRange
  label: (item: T) => string
  render: (item: T, frame: WidgetEditorFrameProps) => ReactNode
  messages?: Partial<WidgetEditorMessages>
}

/** Where a widget is: its 1-based `index` of `count`. */
export type Place = { name: string; index: number; count: number }
/** A widget's size in columns and rows. */
export type Size = { name: string; span: number; rows: number }

/** What the editor announces and labels. Apps pass their own catalog's strings. */
export type WidgetEditorMessages = {
  /** The handle's name: "Move Network". */
  move: (name: string) => string
  /** How to use the handle from the keyboard. */
  help: string
  /** Picked up from the keyboard, with how to move it. */
  pickedUp: (at: Place & Size) => string
  /** Picked up with the pointer. */
  dragged: (at: Place) => string
  dropped: (at: Place) => string
  moved: (at: Place) => string
  cancelled: (name: string) => string
  /** Already at an end: first or last, or as wide, narrow, tall or short as it goes. */
  limit: (name: string, edge: 'first' | 'last' | 'wide' | 'narrow' | 'tall' | 'short') => string
  /** A resize step. */
  resized: (size: Size) => string
  /** A pointer resize let go. */
  settled: (size: Size) => string
  resizeCancelled: string
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const sizeLabel = (s: Size) => `${plural(s.span, 'column')} wide and ${plural(s.rows, 'row')} tall`
const position = (p: Place) => `position ${p.index} of ${p.count}`

export const widgetEditorMessages: WidgetEditorMessages = {
  move: (name) => `Move ${name}`,
  help: 'Press Space to pick up. Then the arrow keys move it, Shift and an arrow key resize it, Space drops it, and Escape cancels.',
  pickedUp: (at) =>
    `${at.name} picked up, ${position(at)}, ${sizeLabel(at)}. Arrow keys move it. Shift and an arrow key resize it. Space drops it, Escape cancels.`,
  dragged: (at) => `${at.name} picked up, ${position(at)}.`,
  dropped: (at) => `${at.name} dropped at ${position(at)}.`,
  moved: (at) => `${at.name} moved to ${position(at)}.`,
  cancelled: (name) => `Move cancelled. ${name} is back where it was.`,
  limit: (name, edge) =>
    edge === 'first' || edge === 'last'
      ? `${name} is already ${edge}.`
      : `${name} is already as ${edge} as it goes.`,
  resized: (s) => `${s.name} is now ${sizeLabel(s)}.`,
  settled: (s) => `${s.name} resized to ${sizeLabel(s)}.`,
  resizeCancelled: 'Resize cancelled.',
}
