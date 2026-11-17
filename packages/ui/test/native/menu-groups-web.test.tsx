// SPDX-License-Identifier: AGPL-3.0-only
// The native Menu's groups, checks and items that keep it open (src/native/menu.tsx, D2), drawn
// through react-native-web in happy-dom with a pointer: a group is named by its heading, a check
// is a `menuitemcheckbox` that leaves the menu open, and an action still closes it.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

import { afterEach, expect, test } from 'bun:test'
import { useState } from 'react'
import { drawWithReactNativeWeb } from '../../src/testing/react-native-web.ts'

await drawWithReactNativeWeb()
const testing = await import('@testing-library/react')
const { act, cleanup, fireEvent, screen } = testing
const { ThemeProvider } = await import('../../src/native/theme.tsx')
const { Menu } = await import('../../src/native/menu.tsx')

afterEach(cleanup)

function Picker({ onAction }: { onAction: () => void }) {
  const [open, setOpen] = useState(true)
  const [on, setOn] = useState<string[]>([])
  const flip = (id: string) =>
    setOn((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]))
  return (
    <ThemeProvider formFactor={{ input: 'pointer', widthClass: 'regular' }} reducedMotion>
      <Menu
        title="Edit"
        open={open}
        onClose={() => setOpen(false)}
        items={[
          { label: 'Monitor', onSelect: onAction },
          ...['4K', 'Kids'].map((tag) => ({
            label: tag,
            group: 'Add a tag',
            checked: on.includes(tag),
            keepsOpen: true,
            onSelect: () => flip(tag),
          })),
        ]}
      />
    </ThemeProvider>
  )
}

test('a group is named by its heading, and a check keeps the menu open', async () => {
  let actions = 0
  testing.render(<Picker onAction={() => actions++} />)
  const group = await screen.findByRole('group', { name: 'Add a tag' })
  const check = testing.within(group).getByRole('menuitemcheckbox', { name: '4K' })
  expect(check.getAttribute('aria-checked')).toBe('false')
  await act(async () => fireEvent.click(check))
  expect(screen.getByRole('menuitemcheckbox', { name: '4K' }).getAttribute('aria-checked')).toBe(
    'true',
  )
  expect(screen.getByRole('menu', { name: 'Edit' })).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Monitor' })))
  expect(actions).toBe(1)
  expect(screen.queryByRole('menu')).toBeNull()
})
