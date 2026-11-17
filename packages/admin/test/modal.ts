// SPDX-License-Identifier: AGPL-3.0-only
// The library's native Modal on react-native-web fades in, and stays hidden from the accessibility
// tree until its animation ends, which happy-dom never runs. This ends it, as the library's own
// tests do (packages/ui/test/native/parts.test.tsx's `faded`): ModalAnimation ignores an event
// whose target isn't itself, so each ancestor of the dialog gets its own.
import { act, fireEvent } from '@testing-library/react'

export function shown() {
  for (const content of document.querySelectorAll('[aria-modal]'))
    for (let el = content.parentElement; el && el !== document.body; el = el.parentElement) {
      const target = el
      act(() => {
        fireEvent.animationEnd(target)
      })
    }
}
