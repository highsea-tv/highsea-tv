// SPDX-License-Identifier: AGPL-3.0-only
// The search index, written once at build: static export has no server, so the browser downloads
// the index and searches it (https://fumadocs.dev/docs/headless/search/orama#static-export).
import { createFromSource } from 'fumadocs-core/search/server'
import { source } from '@/lib/source.ts'

export const revalidate = false
export const { staticGET: GET } = createFromSource(source)
