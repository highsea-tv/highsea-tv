'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Picking a file and taking one dropped, for the admin drawn with the library's native renderer,
// which has no file field: react-native-web draws no `<input type="file">`, and forwards no drag
// events (its forwardedProps list pointer, mouse, touch, keyboard and focus events only). The admin
// runs only in a browser, so both go to the DOM directly.
// - `pickFile` makes a file input and clicks it, from a button the keyboard reaches: the HTML
//   standard lets a script show the picker from a user's activation
//   (https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file), whose
//   activation behaviour needs transient activation);
//   the input never joins the page.
// - `useFileDrop` listens on a View's element (react-native-web hands a ref the DOM node) for
//   `dragover` and `drop`, as the web renderer's fieldset did through React's props.
import { useCallback, useRef } from 'react'

/** Shows the browser's file picker; the chosen file, or nothing when it's closed without one. */
export function pickFile(accept: string, onFile: (file: File) => void) {
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) onFile(file)
  })
  input.click()
}

/**
 * Takes a file dropped anywhere on the View the returned ref is given. A callback ref, so the
 * listeners follow the element as a dialog's body mounts and unmounts (React 19's ref cleanup,
 * https://react.dev/reference/react-dom/components/common#ref-callback).
 */
export function useFileDrop(onFile: (file: File) => void) {
  const latest = useRef(onFile)
  latest.current = onFile
  return useCallback((node: unknown) => {
    const el = node as HTMLElement | null
    if (!el || typeof el.addEventListener !== 'function') return
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      const file = e.dataTransfer?.files[0]
      if (!file) return
      e.preventDefault()
      latest.current(file)
    }
    el.addEventListener('dragover', over)
    el.addEventListener('drop', drop)
    return () => {
      el.removeEventListener('dragover', over)
      el.removeEventListener('drop', drop)
    }
  }, [])
}
