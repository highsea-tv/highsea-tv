// SPDX-License-Identifier: AGPL-3.0-only
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'
import { baseOptions } from '@/lib/layout.tsx'
import { source } from '@/lib/source.ts'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions}>
      {children}
    </DocsLayout>
  )
}
