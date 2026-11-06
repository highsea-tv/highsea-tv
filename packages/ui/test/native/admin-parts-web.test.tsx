// SPDX-License-Identifier: AGPL-3.0-only
// D2's admin parts in the native renderer (src/native/table.tsx, toaster.tsx, confirm-dialog.tsx
// and widget.tsx), drawn through react-native-web in happy-dom as the admin draws them: the table
// lays out as a CSS table with ARIA's roles, a row tints while a pointer is over it and shows its
// actions, the last row has no line under it, the toast stack keeps the last three and Dismiss
// takes one away, and a confirmation runs its action once and closes.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { renderToString } = await import('react-dom/server')
const { act, cleanup, fireEvent, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const parts = await import('../../src/native/index.ts')
const {
  ConfirmDialog,
  RowActions,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  Toaster,
  toast,
  WidgetFrame,
  WidgetGrid,
} = parts

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

afterEach(() => {
  cleanup()
  toast.clear()
})

const table = () => (
  <TableFrame>
    <Table label="Queue">
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead numeric>Size</TableHead>
          <TableHead hidden>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow testID="first">
          <TableCell>Sintel</TableCell>
          <TableCell numeric>1.2 GB</TableCell>
          <TableCell>
            <RowActions>
              <parts.Button accessibilityLabel="Pause Sintel" icon="pause" iconOnly />
            </RowActions>
          </TableCell>
        </TableRow>
        <TableRow testID="last">
          <TableCell>Big Buck Bunny</TableCell>
          <TableCell numeric>800 MB</TableCell>
          <TableCell />
        </TableRow>
      </TableBody>
    </Table>
  </TableFrame>
)

describe('the admin’s table', () => {
  test('lays out as a CSS table with ARIA’s roles', () => {
    render(table())
    const el = screen.getByRole('table', { name: 'Queue' })
    expect(el.style.display).toBe('table')
    expect(screen.getAllByRole('row')[0]?.style.display).toBe('table-row')
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    // happy-dom's style declaration drops `table-cell` and `table-row-group`, which browsers
    // take (https://drafts.csswg.org/css-display-3/#layout-specific-display), so the server's
    // markup carries them
    const html = renderToString(
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }}>
        {table()}
      </ThemeProvider>,
    )
    expect(html).toContain('display:table-row-group')
    expect(html).toContain('display:table-cell')
  })

  test('a row tints while a pointer is over it and shows its actions; the last has no line', () => {
    render(table())
    const row = screen.getByTestId('first')
    const actions = screen.getByLabelText('Pause Sintel').parentElement as HTMLElement
    expect(actions.style.opacity).toBe('0')
    const rest = row.style.backgroundColor
    act(() => {
      fireEvent.pointerEnter(row)
    })
    expect(row.style.backgroundColor).not.toBe(rest)
    expect(actions.style.opacity).toBe('1')
    const lastCell = screen.getByTestId('last').firstElementChild as HTMLElement
    const firstCell = row.firstElementChild as HTMLElement
    expect(firstCell.style.borderBottomWidth).toBe('1px')
    expect(lastCell.style.borderBottomWidth).toBe('0px')
  })
})

describe('the toast stack', () => {
  test('keeps the last three, and Dismiss takes one away', () => {
    render(<Toaster />)
    act(() => {
      for (const n of [1, 2, 3, 4]) toast({ title: `Saved ${n}` })
    })
    expect(screen.queryByText('Saved 1')).toBeNull()
    expect(screen.getByText('Saved 4')).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getAllByLabelText('Dismiss')[0] as HTMLElement)
    })
    expect(screen.queryByText('Saved 2')).toBeNull()
  })
})

describe('a confirmation', () => {
  test('runs its action once and closes', () => {
    let ran = 0
    let open = true
    render(
      <ConfirmDialog
        open={open}
        onClose={() => {
          open = false
        }}
        title="Remove Sintel?"
        description="Its files stay on disk."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          ran++
        }}
      />,
    )
    act(() => {
      fireEvent.click(screen.getByText('Remove'))
    })
    expect(ran).toBe(1)
    expect(open).toBe(false)
  })
})

describe('a widget', () => {
  test('spans its columns in the grid', () => {
    render(
      <WidgetGrid>
        <WidgetFrame title="Network" span={2}>
          {null}
        </WidgetFrame>
      </WidgetGrid>,
    )
    const frame = screen.getByRole('region', { name: 'Network' })
    // happy-dom's window is narrower than medium to react-native-web's Dimensions, so one column
    expect(frame.style.gridColumn).toContain('span')
    expect((frame.parentElement as HTMLElement).style.display).toBe('grid')
  })
})
