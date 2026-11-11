// SPDX-License-Identifier: AGPL-3.0-only
// The native Stepper (src/native/stepper.tsx, D3), drawn through react-native-web in happy-dom as
// the admin's setup draws it: below `expanded`, "Step x of y" with the step's name and a bar;
// from `expanded` up, a navigation round a list whose current step is `aria-current="step"`,
// steps reached are buttons back to themselves (a finished one saying so), later ones plain text.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { act, cleanup, fireEvent, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { Stepper } = await import('../../src/native/stepper.tsx')
const { REGULAR_WIDTH } = await import('@highsea-tv/tokens')

const render = (ui: ReactNode) =>
  testing.render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
        {children}
      </ThemeProvider>
    ),
  })

/**
 * Resizes the window as react-native-web's Dimensions reads it: happy-dom has no visualViewport,
 * so Dimensions falls back to the root's clientWidth (0 in happy-dom) and listens for `resize`.
 */
const widen = (width: number) =>
  act(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: width,
    })
    window.dispatchEvent(new Event('resize'))
  })

afterEach(() => {
  cleanup()
  widen(400)
})

const steps = [
  { id: 'owner', label: 'Owner account' },
  { id: 'folders', label: 'Folders' },
  { id: 'review', label: 'Review' },
]

const stepper = (current: number, reached: number, onSelect = (_: number) => {}) => (
  <Stepper
    steps={steps}
    current={current}
    reached={reached}
    onSelect={onSelect}
    label="Setup steps"
    stepOf={(c, t) => `Step ${c} of ${t}`}
    progressLabel="Setup progress"
    doneLabel=", done"
  />
)

describe('Stepper', () => {
  test('in a compact window: the step counted from 1, its name and a bar', () => {
    widen(REGULAR_WIDTH - 1)
    render(stepper(1, 1))
    expect(screen.getByRole('navigation', { name: 'Setup steps' })).toBeTruthy()
    expect(screen.getByText('Step 2 of 3', { exact: false }).textContent).toBe(
      'Step 2 of 3 · Folders',
    )
    expect(screen.getByRole('progressbar', { name: 'Setup progress' })).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })

  test('in a regular window: the current step, finished steps as buttons, later ones text', () => {
    widen(REGULAR_WIDTH)
    const picked: number[] = []
    render(stepper(1, 1, (i) => picked.push(i)))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[1]?.getAttribute('aria-current')).toBe('step')
    expect(items[0]?.getAttribute('aria-current')).toBeNull()
    const back = screen.getByRole('button', { name: 'Owner account, done' })
    fireEvent.click(back)
    expect(picked).toEqual([0])
    // the current step and those not reached aren't buttons
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  test('a step reached beyond the current one is a button without “done”', () => {
    widen(REGULAR_WIDTH)
    render(stepper(0, 2))
    expect(screen.getByRole('button', { name: 'Folders, done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review' })).toBeTruthy()
  })
})
