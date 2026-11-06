// SPDX-License-Identifier: AGPL-3.0-only
// What every admin screen is drawn inside, whichever host draws it (the server's providers and the
// prototype's frame): the admin's dense form labels (the library's DenseFields, the owner's answer
// of 2026-11-06 at HT-4).
import { DenseFields } from '@highsea-tv/ui/native'
import type { ReactNode } from 'react'

export function AdminFrame({ children }: { children: ReactNode }) {
  return <DenseFields>{children}</DenseFields>
}
