// SPDX-License-Identifier: AGPL-3.0-only
// The admin's denser parts: where the admin's signed-off screens, drawn with the web renderer,
// set a part a step smaller than a client does, the part reads this and draws the admin's. Today
// that's a Field's label (field.tsx) and an empty state's disc and spacing (empty-state.tsx).
// The admin's hosts wrap their pages in it, through @highsea-tv/admin's AdminFrame (HT-4).
import { createContext, type ReactNode, useContext } from 'react'

const DenseContext = createContext(false)

/** Draws the parts inside it at the admin's density. */
export function Dense({ children }: { children: ReactNode }) {
  return <DenseContext.Provider value>{children}</DenseContext.Provider>
}

/** Whether the part is inside the admin's Dense. */
export function useDense() {
  return useContext(DenseContext)
}
