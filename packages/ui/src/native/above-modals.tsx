// SPDX-License-Identifier: AGPL-3.0-only
// What must show above every sheet and dialog (the toast stack, ./toaster.tsx): the web's side is
// ./above-modals.web.tsx, a platform pair (apps/client/README.md › Platform files) imported as
// `./above-modals`. On the phone and the TV it draws its children where they stand: React Native's
// Modal is a view controller of its own (https://reactnative.dev/docs/modal), which nothing in the
// page can draw over, and those clients show a Toast inside the screen or sheet that raised it
// (./toast.tsx) rather than a stack.
import type { ReactNode } from 'react'

/** Draws `children` above every Modal, where the platform allows it. */
export function AboveModals({ children }: { children: ReactNode }): ReactNode {
  return <>{children}</>
}
