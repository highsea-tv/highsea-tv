// SPDX-License-Identifier: AGPL-3.0-only
// The template language definitions use for URLs, query values, headers and composed fields.
// It's closed on purpose (ADR 0033): a template reads named inputs, tests them, and passes them
// through a fixed list of filters. There are no loops, no function calls, no way to name anything
// outside its roots, so a definition from a remote catalog can’t make the engine do more than it
// already does with the result.
//
//   {{ .Config.apiKey }}                 a setting
//   {{ .Query.Keywords | urlencode }}    a search input, through a filter
//   {{ if .Query.IMDBID }}…{{ else }}…{{ end }}
//   {{ .Result.id | prepend "https://example.org/dl/" }}

export type TemplateRoot = 'Config' | 'Query' | 'Result'

/** What a search can fill in. Ids are strings, so templates never format numbers. */
export const QUERY_KEYS = [
  'Keywords',
  'Title',
  'Year',
  'IMDBID',
  /** The IMDb id without its `tt`. */
  'IMDBIDShort',
  'TMDBID',
  /** The indexer's own category ids for the search, comma-separated. */
  'Categories',
  'Limit',
  'Offset',
] as const
export type QueryKey = (typeof QUERY_KEYS)[number]

type FilterSpec = { args: number; apply: (value: string, args: string[]) => string }

const FILTERS: Record<string, FilterSpec> = {
  urlencode: { args: 0, apply: (v) => encodeURIComponent(v) },
  lower: { args: 0, apply: (v) => v.toLowerCase() },
  upper: { args: 0, apply: (v) => v.toUpperCase() },
  trim: { args: 0, apply: (v) => v.trim() },
  default: { args: 1, apply: (v, [d]) => (v === '' ? (d as string) : v) },
  prepend: { args: 1, apply: (v, [p]) => `${p}${v}` },
  append: { args: 1, apply: (v, [s]) => `${v}${s}` },
  /** Plain text, not a pattern: templates have no regular expressions. */
  replace: { args: 2, apply: (v, [from, to]) => v.split(from as string).join(to as string) },
}

export const TEMPLATE_FILTERS = Object.keys(FILTERS)

export type TemplatePath = { root: TemplateRoot; key: string }
type Filter = { name: string; args: string[] }
type Node =
  | { kind: 'text'; text: string }
  | { kind: 'value'; path: TemplatePath; filters: Filter[] }
  | { kind: 'if'; path: TemplatePath; negate: boolean; yes: Node[]; no: Node[] }

export type Template = { source: string; nodes: Node[]; paths: TemplatePath[] }

export class TemplateError extends Error {
  override name = 'TemplateError'
}

const ACTION = /\{\{-?\s*(.*?)\s*-?\}\}/gs
const PATH = /^\.(Config|Query|Result)\.([A-Za-z_][A-Za-z0-9_]*)$/
const STRING = /^"((?:[^"\\]|\\.)*)"$/

/** Splits `a | b "x"` on pipes and spaces outside quotes. */
function words(input: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const c = input[i] as string
    if (quoted) {
      current += c
      if (c === '\\' && i + 1 < input.length) current += input[++i]
      else if (c === '"') quoted = false
    } else if (c === '"') {
      quoted = true
      current += c
    } else if (c === ' ' || c === '\t' || c === '\n') {
      if (current) out.push(current)
      current = ''
    } else if (c === '|') {
      if (current) out.push(current)
      out.push('|')
      current = ''
    } else current += c
  }
  if (quoted) throw new TemplateError(`An unclosed quote in "{{ ${input} }}".`)
  if (current) out.push(current)
  return out
}

function readPath(word: string | undefined, action: string): TemplatePath {
  const m = word ? PATH.exec(word) : null
  if (!m) {
    throw new TemplateError(
      `"{{ ${action} }}" must name .Config.<setting>, .Query.<input> or .Result.<field>.`,
    )
  }
  return { root: m[1] as TemplateRoot, key: m[2] as string }
}

function readString(word: string, action: string): string {
  const m = STRING.exec(word)
  if (!m) throw new TemplateError(`Filter arguments are quoted strings, in "{{ ${action} }}".`)
  return (m[1] as string).replace(/\\(.)/g, '$1')
}

function readValue(action: string): Node {
  const parts = words(action)
  const path = readPath(parts[0], action)
  const filters: Filter[] = []
  let i = 1
  while (i < parts.length) {
    if (parts[i] !== '|') throw new TemplateError(`Expected "|" in "{{ ${action} }}".`)
    const name = parts[i + 1]
    const spec = name ? FILTERS[name] : undefined
    if (!name || !spec) {
      throw new TemplateError(
        `"${name ?? ''}" isn’t a filter. Filters: ${TEMPLATE_FILTERS.join(', ')}.`,
      )
    }
    i += 2
    const args: string[] = []
    while (i < parts.length && parts[i] !== '|') args.push(readString(parts[i++] as string, action))
    if (args.length !== spec.args) {
      throw new TemplateError(`"${name}" takes ${spec.args} argument(s), in "{{ ${action} }}".`)
    }
    filters.push({ name, args })
  }
  return { kind: 'value', path, filters }
}

/** Parses a template, or throws `TemplateError` with a message a definition's author can act on. */
export function parseTemplate(source: string): Template {
  const root: Node[] = []
  const stack: { node: Extract<Node, { kind: 'if' }>; inElse: boolean }[] = []
  const paths: TemplatePath[] = []
  const push = (node: Node) => {
    const top = stack[stack.length - 1]
    if (!top) root.push(node)
    else if (top.inElse) top.node.no.push(node)
    else top.node.yes.push(node)
  }
  let last = 0
  for (const m of source.matchAll(ACTION)) {
    const index = m.index ?? 0
    if (index > last) push({ kind: 'text', text: source.slice(last, index) })
    last = index + m[0].length
    const action = (m[1] as string).trim()
    if (action === 'end') {
      if (!stack.pop()) throw new TemplateError('"{{ end }}" without an "if".')
    } else if (action === 'else') {
      const top = stack[stack.length - 1]
      if (!top || top.inElse) throw new TemplateError('"{{ else }}" without an "if".')
      top.inElse = true
    } else if (action.startsWith('if ')) {
      const parts = words(action.slice(3))
      const negate = parts[0] === 'not'
      const pathWord = negate ? parts[1] : parts[0]
      if (parts.length !== (negate ? 2 : 1)) {
        throw new TemplateError(`"{{ ${action} }}" tests one input, like "if .Query.IMDBID".`)
      }
      const path = readPath(pathWord, action)
      paths.push(path)
      const node: Extract<Node, { kind: 'if' }> = { kind: 'if', path, negate, yes: [], no: [] }
      push(node)
      stack.push({ node, inElse: false })
    } else {
      const node = readValue(action)
      if (node.kind === 'value') paths.push(node.path)
      push(node)
    }
  }
  if (stack.length) throw new TemplateError('An "if" without its "{{ end }}".')
  const rest = source.slice(last)
  if (rest.includes('{{') || rest.includes('}}')) {
    throw new TemplateError(`Unbalanced braces in "${source}".`)
  }
  if (rest) push({ kind: 'text', text: rest })
  return { source, nodes: root, paths }
}

export type TemplateInputs = {
  Config?: Readonly<Record<string, string | number | boolean | null | undefined>>
  Query?: Readonly<Partial<Record<QueryKey, string | null | undefined>>>
  Result?: Readonly<Record<string, string | null | undefined>>
}

function lookup(inputs: TemplateInputs, path: TemplatePath): string {
  const table = inputs[path.root] as Record<string, unknown> | undefined
  const value = table?.[path.key]
  if (value === undefined || value === null || value === false) return ''
  return String(value)
}

function renderNodes(nodes: Node[], inputs: TemplateInputs): string {
  let out = ''
  for (const node of nodes) {
    if (node.kind === 'text') out += node.text
    else if (node.kind === 'value') {
      let value = lookup(inputs, node.path)
      for (const f of node.filters) value = (FILTERS[f.name] as FilterSpec).apply(value, f.args)
      out += value
    } else {
      const truthy = lookup(inputs, node.path) !== ''
      out += renderNodes(truthy !== node.negate ? node.yes : node.no, inputs)
    }
  }
  return out
}

/** Renders a parsed template. A missing input renders as an empty string. */
export function renderTemplate(template: Template | string, inputs: TemplateInputs): string {
  const parsed = typeof template === 'string' ? parseTemplate(template) : template
  return renderNodes(parsed.nodes, inputs)
}
