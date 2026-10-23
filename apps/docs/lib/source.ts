// SPDX-License-Identifier: AGPL-3.0-only
// The guides in content/, compiled by fumadocs-mdx's macro (https://fumadocs.dev/docs/mdx/next)
// and served from the site's root.
import { loader } from 'fumadocs-core/source'
import { defineDocs } from 'fumadocs-mdx/macro'

const docs = defineDocs({ dir: 'content' })

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
})
