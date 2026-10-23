// SPDX-License-Identifier: AGPL-3.0-only
// JSON APIs and HTML pages: rows found by a JSON path or a CSS selector, each field read from the
// row by path, selector and attribute, or composed by a template over fields already read, then
// passed through the definition's filters (ADR 0033). HTML is parsed with cheerio's htmlparser2
// entry (`cheerio/slim`, https://cheerio.js.org/blog/cheerio-1.0/), which never
// runs a page's scripts.
import {
  type Definition,
  type FieldMapping,
  renderTemplate,
  type TemplateInputs,
} from '@highsea-tv/schemas/indexers'
import { load } from 'cheerio/slim'
import { IndexerError } from './http.ts'
import { type IndexerRelease, toRelease } from './release.ts'
import { applyFilters } from './values.ts'

type ScrapeDefinition = Extract<Definition, { kind: 'json' | 'html' }>

/** `info.size`, `files.0.name`; an empty path is the value itself. */
export function getPath(value: unknown, path: string): unknown {
  if (path === '') return value
  let v = value
  for (const key of path.split('.')) {
    if (v == null || typeof v !== 'object') return undefined
    v = (v as Record<string, unknown>)[key]
  }
  return v
}

const scalar = (v: unknown): string | null =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : null

/** Fields that name an address, resolved against the page they came from. */
const URL_FIELDS = new Set(['download', 'details'])

export type ScrapeContext = {
  definition: ScrapeDefinition
  config: TemplateInputs['Config']
  /** The address the answer came from, for relative links. */
  pageUrl: string
  /** The site's category id or name to a standard id. */
  mapCategory: (text: string) => number | null
  now: number
}

/**
 * Reads one row's fields in the definition's order. Returns null when a required field is
 * missing, which skips the row.
 */
function readRow(
  ctx: ScrapeContext,
  read: (mapping: FieldMapping) => string | null,
): Record<string, string | null> | null {
  const fields: Record<string, string | null> = {}
  for (const [name, mapping] of Object.entries(ctx.definition.search.fields)) {
    let value =
      mapping.text !== undefined
        ? renderTemplate(mapping.text, { Config: ctx.config, Result: fields })
        : read(mapping)
    value = applyFilters(value, mapping.filters, ctx.now)
    if (value !== null && URL_FIELDS.has(name) && !/^magnet:/i.test(value)) {
      try {
        value = new URL(value, ctx.pageUrl).href
      } catch {
        value = null
      }
    }
    if ((value === null || value === '') && !mapping.optional) return null
    fields[name] = value
  }
  return fields
}

function finish(ctx: ScrapeContext, fields: Record<string, string | null>): IndexerRelease | null {
  const category = fields.category ? ctx.mapCategory(fields.category.trim()) : null
  return toRelease(fields, category === null ? [] : [category], ctx.now)
}

const layoutChanged = (what: string) =>
  new IndexerError('parse', `The site’s answer has no ${what}. Its layout may have changed.`)

export function scrapeJson(ctx: ScrapeContext, body: string): IndexerRelease[] {
  let doc: unknown
  try {
    doc = JSON.parse(body)
  } catch {
    throw new IndexerError('parse', 'The indexer’s answer isn’t valid JSON.')
  }
  for (const rule of ctx.definition.errors) {
    if (!rule.path) continue
    const message = scalar(getPath(doc, rule.path))
    if (message)
      throw new IndexerError(
        rule.auth ? 'auth' : 'unavailable',
        `The indexer answered with an error: ${message}`,
      )
  }
  const rowsRule = ctx.definition.search.rows
  if (!('path' in rowsRule)) throw layoutChanged('results list')
  const rows = getPath(doc, rowsRule.path)
  if (!Array.isArray(rows)) throw layoutChanged(`results list at “${rowsRule.path}”`)
  const out: IndexerRelease[] = []
  for (const row of rows) {
    const fields = readRow(ctx, (m) =>
      m.path === undefined ? scalar(row) : scalar(getPath(row, m.path)),
    )
    const release = fields && finish(ctx, fields)
    if (release) out.push(release)
  }
  return out
}

export type HtmlPage = ReturnType<typeof load>

export function loadHtml(body: string): HtmlPage {
  return load(body)
}

export function scrapeHtml(ctx: ScrapeContext, $: HtmlPage): IndexerRelease[] {
  for (const rule of ctx.definition.errors) {
    if (!rule.selector) continue
    const el = $(rule.selector).first()
    if (el.length)
      throw new IndexerError(
        rule.auth ? 'auth' : 'unavailable',
        `The site answered with an error: ${el.text().replace(/\s+/g, ' ').trim() || 'no message'}`,
      )
  }
  const rowsRule = ctx.definition.search.rows
  if (!('selector' in rowsRule)) throw layoutChanged('results table')
  const rows = $(rowsRule.selector).slice(rowsRule.skip)
  const out: IndexerRelease[] = []
  rows.each((_, element) => {
    const row = $(element)
    const fields = readRow(ctx, (m) => {
      const el = m.selector ? row.find(m.selector).first() : row
      if (!el.length) return null
      return m.attribute ? (el.attr(m.attribute) ?? null) : el.text().replace(/\s+/g, ' ').trim()
    })
    const release = fields && finish(ctx, fields)
    if (release) out.push(release)
  })
  return out
}
