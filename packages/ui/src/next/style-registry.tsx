'use client'
import { useServerInsertedHTML } from 'next/navigation'
import { type ReactNode, useRef } from 'react'
// SPDX-License-Identifier: AGPL-3.0-only
// The library's styles in a Next.js host's HTML (one-client-platform-d.md › D1; in the library since
// D3, so the admin and the guides share it). react-native-web writes each style it draws into one
// sheet as atomic classes (https://necolas.github.io/react-native-web/docs/styling/),
// and documents a server render handing that sheet to the page (Rendering › Server API:
// https://necolas.github.io/react-native-web/docs/rendering/). In the App Router, Next documents a
// library's styles reaching the HTML through `useServerInsertedHTML`, which runs as each part of the
// stream is flushed (https://nextjs.org/docs/app/guides/css-in-js). So the first flush writes the
// sheet under the id react-native-web takes over in the browser, and a later flush whose sheet has
// grown writes it whole again without the id: the sheet orders its rules by precedence, so a later
// part alone could come out of order, and a whole copy's rules are the same rules in the same order.
import { styleSheetText } from './style-sheet.ts'

export function StyleRegistry({ children }: { children: ReactNode }) {
  const sent = useRef<string | null>(null)
  useServerInsertedHTML(() => {
    const sheet = styleSheetText()
    if (sheet.textContent === sent.current) return null
    const first = sent.current === null
    sent.current = sheet.textContent
    return (
      <style
        id={first ? sheet.id : undefined}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: react-native-web's own sheet, as its server render writes it (text would escape its `>`)
        dangerouslySetInnerHTML={{ __html: sheet.textContent }}
      />
    )
  })
  return children
}
