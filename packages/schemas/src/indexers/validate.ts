// SPDX-License-Identifier: AGPL-3.0-only
// Validation the pipeline, the server and the tests share. The schema checks shape; this adds
// what a shape can’t say: every template parses and names only inputs it's allowed to read, every
// pattern compiles, fields fit their kind, and the keys are unique.
import { STANDARD_CATEGORIES } from './categories.ts'
import {
  type Definition,
  definitionSchema,
  type FieldMapping,
  RELEASE_FIELDS,
  RESERVED_HEADERS,
  type RequestTemplate,
} from './definition.ts'
import { parseTemplate, QUERY_KEYS, TemplateError, type TemplateRoot } from './template.ts'

export type ValidationIssue = { path: string; message: string }
export type ValidationResult =
  | { ok: true; definition: Definition }
  | { ok: false; errors: ValidationIssue[] }

const RELEASE = new Set<string>(RELEASE_FIELDS)
const QUERY = new Set<string>(QUERY_KEYS)
const FETCHABLE = ['download', 'magnet', 'infohash']

/** Checks a parsed definition; returns every problem rather than the first. */
function check(def: Definition): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const issue = (path: string, message: string) => issues.push({ path, message })
  const settings = new Set(def.settings.map((s) => s.key))

  const seen = new Set<string>()
  def.settings.forEach((s, i) => {
    if (seen.has(s.key)) issue(`settings.${i}.key`, `"${s.key}" is used twice.`)
    seen.add(s.key)
    if (s.type === 'select' && !s.options) issue(`settings.${i}.options`, 'A select needs options.')
    if (s.options && s.type !== 'select') {
      issue(`settings.${i}.options`, 'Only a select has options.')
    }
  })

  const templ = (
    path: string,
    source: string | undefined,
    roots: TemplateRoot[],
    results = new Set<string>(),
  ) => {
    if (source === undefined) return
    try {
      for (const p of parseTemplate(source).paths) {
        if (!roots.includes(p.root)) {
          issue(
            path,
            `.${p.root} isn’t available here; use ${roots.map((r) => `.${r}`).join(' or ')}.`,
          )
        } else if (p.root === 'Config' && !settings.has(p.key)) {
          issue(path, `.Config.${p.key} isn’t one of the settings.`)
        } else if (p.root === 'Query' && !QUERY.has(p.key)) {
          issue(path, `.Query.${p.key} isn’t a search input. Inputs: ${QUERY_KEYS.join(', ')}.`)
        } else if (p.root === 'Result' && !results.has(p.key)) {
          issue(path, `.Result.${p.key} must be a field read by path or selector.`)
        }
      }
    } catch (e) {
      issue(path, e instanceof TemplateError ? e.message : String(e))
    }
  }

  const request = (path: string, r: RequestTemplate, roots: TemplateRoot[]) => {
    templ(`${path}.path`, r.path, roots)
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(r.path)) {
      issue(`${path}.path`, 'A path is relative to the base URL; it can’t name another host.')
    }
    for (const [k, v] of Object.entries(r.query)) templ(`${path}.query.${k}`, v, roots)
    for (const [k, v] of Object.entries(r.form ?? {})) templ(`${path}.form.${k}`, v, roots)
    if (r.form && r.method !== 'POST') issue(`${path}.form`, 'A form body needs method POST.')
    for (const [k, v] of Object.entries(r.headers ?? {})) {
      if (RESERVED_HEADERS.includes(k.toLowerCase())) {
        issue(`${path}.headers.${k}`, `"${k}" is set by the engine.`)
      }
      templ(`${path}.headers.${k}`, v, roots)
    }
  }

  const pattern = (path: string, source: string, ignoreCase: boolean) => {
    try {
      new RegExp(source, ignoreCase ? 'i' : '')
    } catch {
      issue(path, `"${source}" isn’t a valid regular expression.`)
    }
  }

  templ('baseUrl', def.baseUrl, ['Config'])
  if (!def.baseUrl && !def.links.length)
    issue('links', 'Give the site’s address in links, or a baseUrl.')

  if (def.login.method === 'cookie') templ('login.cookie', def.login.cookie, ['Config'])
  if (def.login.method === 'form') request('login.request', def.login.request, ['Config'])
  if (
    def.login.method === 'apikey' &&
    !def.settings.some((s) => s.type === 'password' || s.secret)
  ) {
    issue('login', 'An API key sign-in needs a secret setting to hold the key.')
  }

  const ids = new Set<string>()
  def.categories.forEach((c, i) => {
    if (ids.has(c.id)) issue(`categories.${i}.id`, `"${c.id}" is mapped twice.`)
    ids.add(c.id)
    if (c.standard <= 99_999 && !(c.standard in STANDARD_CATEGORIES)) {
      issue(`categories.${i}.standard`, `${c.standard} isn’t a standard category.`)
    }
  })

  if (def.starter && def.privacy !== 'public') {
    issue('starter', 'Only public indexers can be in the starter pack.')
  }

  if (def.kind === 'torznab' || def.kind === 'newznab') {
    templ('api.path', def.api.path, ['Config'])
    templ('api.apiKey', def.api.apiKey, ['Config'])
  } else {
    request('search.request', def.search.request, ['Config', 'Query'])
  }

  if (def.kind === 'json' || def.kind === 'html') {
    const json = def.kind === 'json'
    if (json !== 'path' in def.search.rows) {
      issue(
        'search.rows',
        json ? 'JSON rows are found by path.' : 'HTML rows are found by selector.',
      )
    }
    const read = new Set<string>()
    const entries = Object.entries(def.search.fields) as [string, FieldMapping][]
    for (const [key, f] of entries) {
      const at = `search.fields.${key}`
      if (!RELEASE.has(key) && !key.startsWith('_')) {
        issue(at, `"${key}" isn’t a release field; helper fields start with "_".`)
      }
      if (f.text !== undefined && (f.path !== undefined || f.selector !== undefined)) {
        issue(at, 'A field is read by template, or by path or selector, not both.')
      }
      if (json && (f.selector !== undefined || f.attribute !== undefined)) {
        issue(at, 'JSON fields are read by path.')
      }
      if (!json && f.path !== undefined) issue(at, 'HTML fields are read by selector.')
      if (f.text === undefined) read.add(key)
      f.filters.forEach((flt, i) => {
        if (flt.filter === 'replace' || flt.filter === 'match') {
          pattern(`${at}.filters.${i}.pattern`, flt.pattern, flt.ignoreCase)
        }
      })
    }
    for (const [key, f] of entries)
      templ(`search.fields.${key}.text`, f.text, ['Result', 'Config'], read)
    if (!def.search.fields.title) issue('search.fields', 'Every result needs a title.')
    if (!FETCHABLE.some((k) => def.search.fields[k])) {
      issue('search.fields', 'Every result needs a download, magnet or infohash.')
    }
  }

  def.errors.forEach((e, i) => {
    if (e.selector && def.kind !== 'html')
      issue(`errors.${i}`, 'Only HTML definitions use selectors.')
    if (e.path && def.kind !== 'json') issue(`errors.${i}`, 'Only JSON definitions use paths.')
  })

  return issues
}

/** Parses and checks a definition from its YAML or JSON data. */
export function validateDefinition(input: unknown): ValidationResult {
  const parsed = definitionSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }
  }
  const errors = check(parsed.data)
  return errors.length ? { ok: false, errors } : { ok: true, definition: parsed.data }
}

/** One line per problem, for logs and the pipeline's output. */
export function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('\n')
}
