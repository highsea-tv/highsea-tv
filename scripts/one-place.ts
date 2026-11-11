// SPDX-License-Identifier: AGPL-3.0-only
// One place for everything (one-client-platform.md › Checks that fail on drift): fails when a
// component, a screen or a page part is defined in more than one place, or when a colour, size or
// corner is written outside the tokens, so nothing is ever changed in two places.
// - renderers: a component drawn per platform in the library's platform files (`x.web.tsx` beside
//   `x.tsx`) is drawn twice. It passes only if parity.ts's BOTH gives its reason: that's the one
//   list of renderer exceptions, never repeated here. Since D3 of one-client-platform-d.md the
//   native renderer is the library's only one.
// - screens: client screens live in apps/client/src/app, one file per destination. A client file
//   anywhere else passes only as a listed exception, and a destination that has moved into
//   apps/client leaves no copy in the prototypes (the `moved` list, which nothing excuses). The
//   admin's screens live once in @highsea-tv/admin (packages/admin/src); its hosts, the server's
//   Next.js routes and the prototype's admin folder, draw nothing of their own: no react-native,
//   and from the library only its providers (one-client-platform.md, the admin's exception).
// - parts: a component exported under the same name by more than one module of the client code and
//   the library (apps/client/src, ui's native renderer, @highsea-tv/client and @highsea-tv/native).
// - values: in the one drawing (apps/client/src, ui's native renderer, the admin's screens in
//   packages/admin/src and the guides' components in apps/docs/components), a literal colour, or a
//   literal number for a size, space or corner where the tokens should be, written in place or in
//   a constant of the file. 0 and percentages pass.
// The code is read with Babel's parser (@babel/parser, the one Metro reads it with), so comments,
// strings and types are never mistaken for code.
// Exceptions are in one-place-exceptions.json, each with a reason that never expires, `"until":
// null`: since part E (one-client-platform-e.md › E1) one naming the part that would remove it
// fails, so a part can't end with one open. A screens or values exception says how many it
// excuses, so a new one still fails. One that matches nothing fails too, so the list can't rot.
// `bun run one-place` prints what fails by rule and exits 1 if anything does.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as babel } from '@babel/parser'

export const ROOT = join(import.meta.dir, '..')
const EXCEPTIONS = 'scripts/one-place-exceptions.json'
const PARITY = 'packages/ui/src/shared/parity.ts'

export type Rule = 'renderers' | 'screens' | 'parts' | 'values'
export type Finding = {
  rule: Rule | 'exceptions' | 'parse'
  file: string
  line: number
  what: string
}

const LIBRARY = 'packages/ui/src/native'
/** Where the client's screens live, one file per destination (Expo Router's routes). */
const SCREENS = 'apps/client/src/app'
/** Where client files are drawn today besides apps/client. Each passes only as a listed exception. */
const OTHER_SCREENS = [
  'design/prototypes/src/web',
  'design/prototypes/src/mobile',
  'design/prototypes/src/tv',
  'design/prototypes/src/client',
]
/** The admin's hosts (D3): they route to @highsea-tv/admin's screens and draw nothing themselves. */
const ADMIN_HOSTS = ['apps/server/app', 'design/prototypes/src/admin']
/** What a host may take from the library: its providers, never a drawing. */
const HOST_PARTS = new Set(['ThemeProvider'])
/** The prototypes' client folders, where a destination that has moved must leave no copy. */
const PROTOTYPES = [
  'design/prototypes/src/web',
  'design/prototypes/src/mobile',
  'design/prototypes/src/tv',
  'design/prototypes/src/client',
]
/** The library and the client code, where a page part is defined once: the library's first. */
const PARTS = [
  'packages/ui/src/native',
  'packages/client/src',
  'packages/native/src',
  'apps/client/src',
]
/** The one drawing, where colours, sizes and corners come from the tokens: the admin and the guides too. */
const VALUES = [
  'apps/client/src',
  'packages/ui/src/native',
  'packages/ui/src/shared',
  'packages/admin/src',
  'apps/docs/components',
]

/**
 * Platform extensions, which Metro picks a module by
 * (https://reactnative.dev/docs/platform-specific-code#platform-specific-extensions; `.web` is
 * Expo's for react-native-web, https://docs.expo.dev/router/advanced/platform-specific-modules/).
 */
const PLATFORMS = new Set(['ios', 'android', 'native', 'web'])

/**
 * Style properties that take a size, a space or a corner (React Native's layout, view and text
 * style props, https://reactnative.dev/docs/layout-props, /view-style-props, /text-style-props,
 * /transforms), read in style objects only.
 */
const STYLE_SIZE =
  /^(?:(?:min|max)?(?:Width|Height)|width|height|flexBasis|fontSize|lineHeight|letterSpacing|padding\w*|margin\w*|gap|rowGap|columnGap|border\w*Radius|border\w*Width|shadowRadius|outline\w*|inset\w*|top|right|bottom|left|start|end|translateX|translateY)$/
/**
 * Style properties and props that take a scale (a transform's, https://reactnative.dev/docs/transforms,
 * and the TV's Focusable `lift`), where only 1, no scale at all, is no literal.
 */
const SCALE = /^(?:scale[XY]?|lift)$/
/**
 * Functions that hand back a size given as their argument, so a number passed to them is a literal
 * size: `Math.max(16, inset)`, `PixelRatio.roundToNearestPixel(2.8 * u)`. Any other function's
 * numbers are its inputs, not sizes: `place(v, 0, 1)` is an index and two offsets.
 */
const PASS_THROUGH = new Set(['max', 'min', 'round', 'floor', 'ceil', 'roundToNearestPixel'])
/** Props that take a size, on any element and as a component's defaults. */
const PROP_SIZE =
  /^(?:size|iconSize|radius|strokeWidth|hitSlop|(?:min|max)?(?:Width|Height)|width|height|gap|padding\w*|margin\w*)$/
/** Style properties and props that take a colour. */
const COLOUR = /^(?:fill|stroke)$|(?:^c|C)olors?$/
/** Props and object keys that hold a style. */
const STYLE_KEY = /^(?:style|\w+Style)$/
/** Types a style is written as: `ViewStyle`, `TextStyle`, `StyleProp<…>`. */
const STYLE_TYPE = /Style$|^StyleProp$/
/** A colour written in a string, every one of them: `#0b0b0c`, `rgba(0, 0, 0, 0.6)`. */
const HEX = /(?:^|[^\w&])(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4}))(?![0-9a-z])/gi
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^)]*\)?/gi
/** CSS's named colours (CSS Color 4 › Named colors); `transparent` and `currentColor` aren't. */
const NAMED_COLOURS = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet
  brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
  darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen
  darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey
  darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite
  forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue
  lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon
  lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
  limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple
  mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue
  mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
  seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal
  thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/),
)
/** What wraps a component to make another: React's, and Reanimated's and Animated's. */
const WRAPPERS = new Set(['memo', 'forwardRef', 'lazy', 'createAnimatedComponent'])
/** Hooks whose function returns a style: `useMemo(() => ({ … }))`, Reanimated's. */
const STYLE_HOOKS = new Set(['useMemo', 'useAnimatedStyle'])

/** Every .ts and .tsx file under `dir`, relative to the root, without tests, stories or types. */
export function sources(root: string, dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(join(root, dir)).sort()
  } catch {
    // a folder that isn't there has nothing in it
    return []
  }
  return names.flatMap((name) => {
    const rel = `${dir}/${name}`
    if (name === 'node_modules' || name.startsWith('.')) return []
    if (statSync(join(root, rel)).isDirectory()) return sources(root, rel)
    return /\.tsx?$/.test(name) && !/\.(?:test|stories|jest)\.tsx?$|\.d\.ts$/.test(name)
      ? [rel]
      : []
  })
}

/**
 * A node of Babel's AST (https://github.com/babel/babel/blob/main/packages/babel-parser/ast/spec.md),
 * read by its documented shape: each kind's fields are looked up by name.
 */
type Node = {
  type: string
  start: number
  end: number
  loc: { start: { line: number; column: number } }
  [field: string]: unknown
}
type Source = { file: string; text: string; program: Node }

const isNode = (v: unknown): v is Node =>
  !!v && typeof v === 'object' && typeof (v as { type?: unknown }).type === 'string'
const get = (n: Node | undefined, field: string): Node | undefined => {
  const v = n?.[field]
  return isNode(v) ? v : undefined
}
const all = (n: Node | undefined, field: string): Node[] => {
  const v = n?.[field]
  return Array.isArray(v) ? v.filter(isNode) : []
}
/** An identifier's name, in code or JSX. */
const nameOf = (n: Node | undefined) =>
  n && (n.type === 'Identifier' || n.type === 'JSXIdentifier') ? String(n.name) : undefined
/** A key's or an export's name: `padding`, `'padding'`. */
const keyOf = (n: Node | undefined) => (n?.type === 'StringLiteral' ? String(n.value) : nameOf(n))
const lineOf = (n: Node) => n.loc.start.line
const textOf = (source: Source, n: Node) => source.text.slice(n.start, n.end)

/** Fields that aren't children. */
const NOT_CHILDREN = new Set([
  'loc',
  'start',
  'end',
  'extra',
  'leadingComments',
  'trailingComments',
  'innerComments',
])
/** The TypeScript nodes that are expressions; every other TS node is a type, never read for values. */
const TS_EXPRESSIONS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
])

function* childrenOf(n: Node): Generator<Node> {
  for (const [field, v] of Object.entries(n)) {
    if (NOT_CHILDREN.has(field)) continue
    if (isNode(v)) yield v
    else if (Array.isArray(v)) for (const item of v) if (isNode(item)) yield item
  }
}

/** Visits every node, its parent beside it. Returning false skips a node's children. */
function walk(
  n: Node,
  visit: (n: Node, parent: Node | undefined) => boolean | undefined,
  parent?: Node,
) {
  if (visit(n, parent) === false) return
  for (const child of childrenOf(n)) walk(child, visit, n)
}

/** A file's syntax tree, or the reason it has none. */
function parse(root: string, file: string): Source | Finding {
  const text = readFileSync(join(root, file), 'utf8')
  try {
    const ast = babel(text, {
      sourceType: 'module',
      // JSX only in .tsx, where TypeScript allows it, so a .ts file's `<T>x` stays a type assertion
      plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
    })
    return { file, text, program: ast.program as unknown as Node }
  } catch (error) {
    const loc = (error as { loc?: { line: number } }).loc
    return {
      rule: 'parse',
      file,
      line: loc?.line ?? 1,
      what: `doesn't parse: ${(error as Error).message}`,
    }
  }
}

/** A component's name: PascalCase, where constants in capitals (`KEEP`) aren't. */
const isComponentName = (name: string) => /^[A-Z]/.test(name) && name !== name.toUpperCase()

/** An expression without the assertions, `satisfies` and parentheses around it. */
function bare(e: Node | undefined): Node | undefined {
  while (e && (TS_EXPRESSIONS.has(e.type) || e.type === 'ParenthesizedExpression'))
    e = get(e, 'expression')
  return e
}

/** The name a call is made by: `memo`, `React.memo`, `StyleSheet.create`'s `create`. */
function calleeName(call: Node): string | undefined {
  const callee = bare(get(call, 'callee'))
  return callee?.type === 'MemberExpression' && !callee.computed
    ? nameOf(get(callee, 'property'))
    : nameOf(callee)
}

/** Whether a `const`'s value draws: a function, a wrapped component or another's alias. */
function drawsOf(value: Node | undefined): boolean {
  const e = bare(value)
  if (!e) return false
  if (e.type === 'ArrowFunctionExpression' || e.type === 'FunctionExpression') return true
  if (e.type === 'CallExpression') return WRAPPERS.has(calleeName(e) ?? '')
  // `const Dialog = DialogPrimitive.Root`, `const Text = BaseText`
  if (e.type === 'MemberExpression' && !e.computed)
    return isComponentName(nameOf(get(e, 'property')) ?? '')
  return isComponentName(nameOf(e) ?? '')
}

type Def = { file: string; line: number }
type Export = { local: string } | { from: string; name: string }
type Module = {
  /** Components declared at the top level, by their local name. Classes aren't read as ones. */
  components: Map<string, Def>
  /** Every top-level declaration's line, by name, default exports' too. */
  declared: Map<string, number>
  imports: Map<string, { from: string; name: string }>
  exports: Map<string, Export>
  /** `export * from` specifiers. */
  stars: string[]
}

/** A module's top-level declarations, imports and exports. Types and default exports aren't read. */
function analyse({ file, program }: Source): Module {
  const mod: Module = {
    components: new Map(),
    declared: new Map(),
    imports: new Map(),
    exports: new Map(),
    stars: [],
  }
  const declare = (id: Node | undefined, draws: boolean, exported: boolean) => {
    const name = nameOf(id)
    if (!name || !id) return
    mod.declared.set(name, lineOf(id))
    if (draws && isComponentName(name)) mod.components.set(name, { file, line: lineOf(id) })
    if (exported) mod.exports.set(name, { local: name })
  }
  const statement = (s: Node, exported: boolean) => {
    if (s.type === 'FunctionDeclaration') declare(get(s, 'id'), true, exported)
    else if (s.type === 'ClassDeclaration') declare(get(s, 'id'), false, exported)
    else if (s.type === 'VariableDeclaration')
      for (const d of all(s, 'declarations'))
        declare(get(d, 'id'), drawsOf(get(d, 'init')), exported)
    else if (s.type === 'TSInterfaceDeclaration' || s.type === 'TSTypeAliasDeclaration')
      declare(get(s, 'id'), false, false)
  }
  for (const s of all(program, 'body')) {
    const from = keyOf(get(s, 'source'))
    if (s.exportKind === 'type' || s.importKind === 'type') continue
    if (s.type === 'ExportNamedDeclaration') {
      const declaration = get(s, 'declaration')
      if (declaration) statement(declaration, true)
      for (const spec of all(s, 'specifiers')) {
        const name = keyOf(get(spec, 'exported'))
        const local = keyOf(get(spec, 'local'))
        if (spec.type !== 'ExportSpecifier' || spec.exportKind === 'type' || !name || !local)
          continue
        mod.exports.set(name, from ? { from, name: local } : { local })
      }
    } else if (s.type === 'ExportAllDeclaration') {
      if (from) mod.stars.push(from)
    } else if (s.type === 'ExportDefaultDeclaration') {
      const declaration = get(s, 'declaration')
      const id = get(declaration, 'id')
      if (id) mod.declared.set(nameOf(id) ?? '', lineOf(id))
    } else if (s.type === 'ImportDeclaration' && from) {
      for (const spec of all(s, 'specifiers')) {
        const local = nameOf(get(spec, 'local'))
        if (!local || spec.importKind === 'type') continue
        if (spec.type === 'ImportDefaultSpecifier')
          mod.imports.set(local, { from, name: 'default' })
        else if (spec.type === 'ImportNamespaceSpecifier')
          mod.imports.set(local, { from, name: '*' })
        else mod.imports.set(local, { from, name: keyOf(get(spec, 'imported')) ?? local })
      }
    } else statement(s, false)
  }
  return mod
}

type Graph = Map<string, Module>

/** The components a module declares and exports, by their exported name. */
function ownComponents(mod: Module | undefined): Map<string, Def> {
  const out = new Map<string, Def>()
  for (const [name, entry] of mod?.exports ?? []) {
    const def = 'local' in entry ? mod?.components.get(entry.local) : undefined
    if (def && isComponentName(name)) out.set(name, def)
  }
  return out
}

/** A module's name without its platform extensions: `player.web.tsx` and `player.tsx` share one. */
function stem(file: string): string {
  const parts = file.replace(/\.tsx?$/, '').split('.')
  while (parts.length > 1 && PLATFORMS.has(parts[parts.length - 1] ?? '')) parts.pop()
  return parts.join('.')
}

/** Files that are one module per platform, in groups, the file without a platform first. */
function platformFiles(files: string[]): string[][] {
  const groups = new Map<string, string[]>()
  for (const file of files) groups.set(stem(file), [...(groups.get(stem(file)) ?? []), file])
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.sort((a, b) => a.split('.').length - b.split('.').length))
}

/** The plan's parts (one-client-platform.md › The size of this, and its parts). */
type Part = 'A' | 'B' | 'C' | 'D' | 'E'
const PARTS_OF_PLAN = new Set<string>(['A', 'B', 'C', 'D', 'E'])
type Exception = {
  rule: Exclude<Rule, 'renderers'>
  /** A file, or a glob of files (Bun.Glob's). */
  path: string
  /** The component a parts exception excuses. */
  name?: string
  /** How many files or literals a screens or values exception excuses, so a new one still fails. */
  count?: number
  reason: string
  /** Always null: it stays, its reason saying why. A part (A to E) that would remove it fails. */
  until: null
  line: number
  used: number
}
type Moved = {
  destination: string
  part: Part
  /** A file that is a copy, or the names of the copies, looked for in every prototype file. */
  copies: { path: string; names?: string[] }[]
  line: number
}

/** The line each item of the file's top-level arrays starts on, by the array's key. */
function entryLines(text: string): Record<string, number[]> {
  const lines: Record<string, number[]> = {}
  let depth = 0
  let line = 1
  let key = ''
  let expecting = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? ''
    if (c === '\n') {
      line++
      continue
    }
    if (expecting && depth === 2 && !/\s/.test(c) && c !== ']') {
      lines[key]?.push(line)
      expecting = false
    }
    if (c === '"') {
      let end = i + 1
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      if (depth === 1) key = text.slice(i + 1, end)
      i = end
    } else if (c === '{' || c === '[') {
      if (c === '[' && depth === 1) {
        lines[key] = []
        expecting = true
      }
      depth++
    } else if (c === '}' || c === ']') depth--
    else if (c === ',' && depth === 2) expecting = true
  }
  return lines
}

/** Where JSON (RFC 8259) first goes wrong in `text`, by its index: JavaScriptCore's errors don't say. */
function jsonError(text: string): number | undefined {
  let i = 0
  const fail = (): never => {
    throw i
  }
  const space = () => {
    while (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r') i++
  }
  const string = () => {
    i++
    while (i < text.length && text[i] !== '"') {
      if ((text[i] ?? '') < ' ') fail()
      i += text[i] === '\\' ? 2 : 1
    }
    if (text[i] !== '"') fail()
    i++
  }
  const value = (): void => {
    space()
    const open = text[i]
    if (open === '{' || open === '[') {
      const close = open === '{' ? '}' : ']'
      i++
      space()
      if (text[i] === close) {
        i++
        return
      }
      for (;;) {
        if (open === '{') {
          space()
          if (text[i] !== '"') fail()
          string()
          space()
          if (text[i] !== ':') fail()
          i++
        }
        value()
        space()
        if (text[i] === close) {
          i++
          return
        }
        if (text[i] !== ',') fail()
        i++
      }
    }
    if (open === '"') {
      string()
      return
    }
    const literal = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(
      text.slice(i),
    )
    if (!literal) fail()
    i += literal?.[0].length ?? 0
  }
  try {
    value()
    space()
    if (i < text.length) fail()
    return undefined
  } catch {
    return i
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** The exceptions file, read and checked: an entry that isn't well formed is a finding. */
export function readExceptions(root: string, findings: Finding[]) {
  const exceptions: Exception[] = []
  const moved: Moved[] = []
  if (!existsSync(join(root, EXCEPTIONS))) return { exceptions, moved }
  const text = readFileSync(join(root, EXCEPTIONS), 'utf8')
  const bad = (line: number, what: string) =>
    findings.push({ rule: 'exceptions', file: EXCEPTIONS, line, what })
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    const index = jsonError(text) ?? 0
    const before = text.slice(0, index).split('\n')
    const line = before.length
    const column = (before.at(-1)?.length ?? 0) + 1
    bad(
      line,
      `${EXCEPTIONS} isn't JSON at line ${line}, column ${column}: ${(error as Error).message}`,
    )
    return { exceptions, moved }
  }
  if (
    !isObject(data) ||
    (data.moved !== undefined && !Array.isArray(data.moved)) ||
    (data.exceptions !== undefined && !Array.isArray(data.exceptions))
  ) {
    bad(1, `${EXCEPTIONS} is an object with a "moved" and an "exceptions" list`)
    return { exceptions, moved }
  }
  const lines = entryLines(text)
  const string = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
  for (const [i, e] of ((data.exceptions as unknown[]) ?? []).entries()) {
    const line = lines.exceptions?.[i] ?? 1
    if (!isObject(e)) bad(line, 'an exception is an object')
    else if (e.rule === 'renderers')
      bad(line, 'renderer exceptions are listed in parity.ts, with reasons')
    else if (e.rule !== 'screens' && e.rule !== 'parts' && e.rule !== 'values')
      bad(line, `${String(e.rule)} isn't a rule: screens, parts or values`)
    else if (!string(e.path)) bad(line, 'an exception names its path or glob')
    else if (!string(e.reason)) bad(line, `${e.path} has no reason`)
    else if (!('until' in e) || e.until !== null)
      bad(
        line,
        PARTS_OF_PLAN.has(String(e.until))
          ? `${e.path} is open until part ${String(e.until)}: move its values onto the tokens, or give it a reason that never expires and "until": null`
          : `${e.path}'s until is null, for an exception that stays`,
      )
    else if (e.rule === 'parts' && !string(e.name)) bad(line, `${e.path} names no component`)
    else if (
      e.rule === 'parts'
        ? e.count !== undefined
        : !Number.isInteger(e.count) || (e.count as number) < 1
    )
      bad(
        line,
        `${e.path}'s count is how many it excuses, which screens and values exceptions give`,
      )
    else exceptions.push({ ...(e as Omit<Exception, 'line' | 'used'>), line, used: 0 })
  }
  for (const [i, m] of ((data.moved as unknown[]) ?? []).entries()) {
    const line = lines.moved?.[i] ?? 1
    const copies = isObject(m) && Array.isArray(m.copies) ? (m.copies as unknown[]) : []
    if (!isObject(m) || !string(m.destination)) bad(line, 'a moved destination is named')
    else if (!PARTS_OF_PLAN.has(String(m.part))) bad(line, `${m.destination}'s part isn't A to E`)
    else if (
      !copies.length ||
      copies.some(
        (c) =>
          !isObject(c) ||
          !string(c.path) ||
          (c.names !== undefined && (!Array.isArray(c.names) || !c.names.every(string))),
      )
    )
      bad(line, `${m.destination} lists its copies, each a path with the names in it, if any`)
    else moved.push({ ...(m as Omit<Moved, 'line'>), line })
  }
  return { exceptions, moved }
}

/**
 * parity.ts's BOTH, read from its syntax: its names, with their reasons if it gives them (a
 * `{ Name: 'reason' }` record), the line of each, and the names it spreads from elsewhere.
 */
function readParity(source: Source | undefined) {
  const reasons = new Map<string, string>()
  const lines = new Map<string, number>()
  const spreads: string[] = []
  let line = 1
  walk(source?.program ?? ({ type: 'Empty' } as Node), (n) => {
    if (n.type !== 'VariableDeclarator' || nameOf(get(n, 'id')) !== 'BOTH') return
    line = lineOf(n)
    const value = bare(get(n, 'init'))
    for (const el of value?.type === 'ArrayExpression' ? all(value, 'elements') : []) {
      if (el.type === 'StringLiteral') {
        reasons.set(String(el.value), '')
        lines.set(String(el.value), lineOf(el))
      } else if (el.type === 'SpreadElement' && source) spreads.push(textOf(source, el))
    }
    for (const p of value?.type === 'ObjectExpression' ? all(value, 'properties') : []) {
      const name = p.type === 'ObjectProperty' && !p.computed ? keyOf(get(p, 'key')) : undefined
      if (!name) continue
      const reason = get(p, 'value')
      reasons.set(name, reason?.type === 'StringLiteral' ? String(reason.value) : '')
      lines.set(name, lineOf(p))
    }
    return false
  })
  return { reasons, lines, line, spreads }
}

const at = (def: Def) => `${def.file}:${def.line}`
const matches = (pattern: string, file: string) =>
  pattern === file || new Bun.Glob(pattern).match(file)

/** Whether a type names a style: `ViewStyle`, `StyleProp<TextStyle>`, `ViewStyle | undefined`. */
function isStyleType(type: Node | undefined): boolean {
  let style = false
  if (type)
    walk(type, (n) => {
      if (
        n.type === 'TSTypeReference' &&
        STYLE_TYPE.test(
          nameOf(get(n, 'typeName')) ?? nameOf(get(get(n, 'typeName'), 'right')) ?? '',
        )
      )
        style = true
      return undefined
    })
  return style
}

/** What a function returns: its expression body, or each `return` outside its inner functions. */
function returned(fn: Node): Node[] {
  const body = get(fn, 'body')
  if (!body) return []
  if (body.type !== 'BlockStatement') return [body]
  const out: Node[] = []
  walk(body, (n) => {
    if (n.type.includes('Function') && n !== body) return false
    const argument = n.type === 'ReturnStatement' ? get(n, 'argument') : undefined
    if (argument) out.push(argument)
    return undefined
  })
  return out
}

const isFunction = (n: Node | undefined) =>
  n?.type === 'ArrowFunctionExpression' ||
  n?.type === 'FunctionExpression' ||
  n?.type === 'FunctionDeclaration'

/** The name a JSX element is drawn by: `Mask`, `Svg.Mask`. */
function tagOf(element: Node): string | undefined {
  const name = get(get(element, 'openingElement'), 'name')
  return name?.type === 'JSXMemberExpression' ? nameOf(get(name, 'property')) : nameOf(name)
}

/** A literal size the drawing writes, and the constant it's written through, if one. */
type Literal = { node: Node; via?: string }

/**
 * Literal colours, sizes and corners in a file of the one drawing.
 * - Sizes are read where a style is: a `style` prop and other `…Style` props and keys, React
 *   Native's `StyleSheet.create`, an object typed as a style or a function returning one,
 *   Pressable's style function, `useMemo`'s and Reanimated's styles; and in size props on any
 *   element and as a component's defaults. Any other object (`useQuery({ size: 50 })`) isn't one.
 * - An identifier is followed to the one `const` of that name in the file, and a member to the key
 *   of a `const` object, so `const PAD = 12` with `{ padding: PAD }` is the literal 12.
 * - A literal colour (#hex, rgb() and the other functions) is read in any string; a named colour
 *   in a colour key or prop.
 * What's drawn inside an SVG mask shows or hides by its luminance, not its colour (CSS Masking 1 ›
 * The mask element, https://drafts.fxtf.org/css-masking/#MaskElement, where `mask-type` is
 * `luminance` unless set), so a mask's white and black aren't colours on screen and aren't read.
 */
function literals(source: Source): Finding[] {
  const { file, program } = source
  // the file's bindings, each with the scope it's declared in: a `const`'s value, a function, or a
  // parameter, which has none and hides an outer name
  type Binding = { scope: Node; value?: Node }
  const bindings = new Map<string, Binding[]>()
  const bind = (id: Node | undefined, scope: Node, value?: Node) => {
    const name = nameOf(id)
    if (name) bindings.set(name, [...(bindings.get(name) ?? []), { scope, value }])
  }
  /** The names a parameter's pattern binds: `size`, `{ size = 20 }`, `[a, b]`, `...rest`. */
  const patternNames = (p: Node | undefined, scope: Node) => {
    if (!p) return
    if (p.type === 'Identifier') bind(p, scope)
    else if (p.type === 'AssignmentPattern') patternNames(get(p, 'left'), scope)
    else if (p.type === 'RestElement') patternNames(get(p, 'argument'), scope)
    else if (p.type === 'ObjectPattern')
      for (const x of all(p, 'properties'))
        patternNames(x.type === 'RestElement' ? x : get(x, 'value'), scope)
    else if (p.type === 'ArrayPattern') for (const x of all(p, 'elements')) patternNames(x, scope)
  }
  const scopes = (n: Node, scope: Node) => {
    const inner = n.type === 'BlockStatement' || isFunction(n) ? n : scope
    if (n.type === 'VariableDeclarator') {
      const id = get(n, 'id')
      if (id?.type === 'Identifier') bind(id, scope, get(n, 'init'))
      else patternNames(id, scope)
    } else if (n.type === 'FunctionDeclaration') bind(get(n, 'id'), scope, n)
    if (isFunction(n)) for (const p of all(n, 'params')) patternNames(p, n)
    for (const child of childrenOf(n)) scopes(child, inner)
  }
  scopes(program, program)
  /** What a name stands for where it's read: the innermost declaration around it, if it has a value. */
  const constant = (name: string, at: number) => {
    const around = (bindings.get(name) ?? []).filter(
      (b) => b.scope.start <= at && at <= b.scope.end,
    )
    const [first, second] = around.sort((a, b) => b.scope.start - a.scope.start)
    // two in one scope are a `var` declared again, or one in each branch; neither is read
    if (!first || (second && second.scope === first.scope)) return undefined
    return bare(first.value)
  }
  /** What an identifier or a constant's key stands for, through the file's constants. */
  const resolve = (value: Node | undefined, seen = new Set<string>()): Node | undefined => {
    const e = bare(value)
    const name = nameOf(e)
    if (e?.type === 'Identifier' && name && !seen.has(name)) {
      seen.add(name)
      const init = constant(name, e.start)
      return init && !isFunction(init) ? resolve(init, seen) : e
    }
    if (e?.type === 'MemberExpression') {
      const object = resolve(get(e, 'object'), seen)
      const property = get(e, 'property')
      const key = e.computed
        ? property?.type === 'StringLiteral' || property?.type === 'NumericLiteral'
          ? String(property.value)
          : undefined
        : nameOf(property)
      const p =
        object?.type === 'ObjectExpression'
          ? all(object, 'properties').find(
              (x) => x.type === 'ObjectProperty' && keyOf(get(x, 'key')) === key,
            )
          : undefined
      return p ? resolve(get(p, 'value'), seen) : e
    }
    return e
  }

  /** The literal sizes an expression can come out as: `12`, `-6`, `2.8 * u`, `'16px'`, not 0. */
  const sizes = (value: Node | undefined, via?: string, seen = new Set<Node>()): Literal[] => {
    const e = bare(value)
    if (!e || seen.has(e)) return []
    seen.add(e)
    switch (e.type) {
      case 'Identifier':
      case 'MemberExpression': {
        const r = resolve(e)
        return r && r !== e ? sizes(r, via ?? textOf(source, e), seen) : []
      }
      case 'NumericLiteral':
        return Number(e.value) ? [{ node: e, via }] : []
      case 'UnaryExpression': {
        const argument = bare(get(e, 'argument'))
        if (e.operator !== '-' && e.operator !== '+') return []
        return argument?.type === 'NumericLiteral'
          ? Number(argument.value)
            ? [{ node: e, via }]
            : []
          : sizes(argument, via, seen)
      }
      case 'StringLiteral': {
        const text = String(e.value).trim()
        return /^-?(?:\d*\.)?\d+(?:px)?$/.test(text) && Number.parseFloat(text)
          ? [{ node: e, via }]
          : []
      }
      case 'TemplateLiteral': {
        const quasis = all(e, 'quasis').map((q) =>
          String((q.value as { cooked?: string })?.cooked ?? ''),
        )
        const own = /(?:^|[^\w.])(?:\d*\.)?\d*[1-9]\d*(?:\.\d+)?px\b/.test(quasis.join(' '))
          ? [{ node: e, via }]
          : []
        // a substitution followed by `%` is a percentage, which passes: `${v}%`
        const substituted = all(e, 'expressions').filter((_, i) => !quasis[i + 1]?.startsWith('%'))
        return [...own, ...substituted.flatMap((x) => sizes(x, via, seen))]
      }
      case 'ConditionalExpression':
        return [...sizes(get(e, 'consequent'), via, seen), ...sizes(get(e, 'alternate'), via, seen)]
      case 'LogicalExpression':
        return [...sizes(get(e, 'left'), via, seen), ...sizes(get(e, 'right'), via, seen)]
      case 'BinaryExpression': {
        // either side of a sum; a number of units is a literal size; any other product is a scale
        if (e.operator === '+' || e.operator === '-')
          return [...sizes(get(e, 'left'), via, seen), ...sizes(get(e, 'right'), via, seen)]
        if (e.operator !== '*') return []
        const isUnit = (x: Node | undefined) => {
          const b = bare(x)
          const name = b?.type === 'MemberExpression' ? nameOf(get(b, 'property')) : nameOf(b)
          return name === 'u' || name === 'unit'
        }
        if (isUnit(get(e, 'right'))) return sizes(get(e, 'left'), via, seen)
        return isUnit(get(e, 'left')) ? sizes(get(e, 'right'), via, seen) : []
      }
      // `Math.max(16, inset)`, `PixelRatio.roundToNearestPixel(2.8 * u)`, and in any call a
      // size worked out in its arguments (`pad(12 * u)`), but not another call's bare numbers
      case 'CallExpression': {
        const through = PASS_THROUGH.has(calleeName(e) ?? '')
        return all(e, 'arguments').flatMap((x) => {
          const b = bare(x)
          const number =
            b?.type === 'NumericLiteral' ||
            (b?.type === 'UnaryExpression' && bare(get(b, 'argument'))?.type === 'NumericLiteral')
          return number && !through ? [] : sizes(x, via, seen)
        })
      }
      default:
        return []
    }
  }
  /** The strings an expression can come out as, through the file's constants. */
  const strings = (
    value: Node | undefined,
    seen = new Set<Node>(),
  ): { text: string; node: Node }[] => {
    const e = resolve(value)
    if (!e || seen.has(e)) return []
    seen.add(e)
    if (e.type === 'StringLiteral') return [{ text: String(e.value), node: e }]
    if (e.type === 'ConditionalExpression')
      return [...strings(get(e, 'consequent'), seen), ...strings(get(e, 'alternate'), seen)]
    if (e.type === 'LogicalExpression')
      return [...strings(get(e, 'left'), seen), ...strings(get(e, 'right'), seen)]
    if (e.type === 'ArrayExpression') return all(e, 'elements').flatMap((x) => strings(x, seen))
    return []
  }

  // where a style is
  const styles = new Set<Node>()
  const style = (value: Node | undefined, seen = new Set<Node>()) => {
    const e = bare(value)
    if (!e || seen.has(e)) return
    seen.add(e)
    if (e.type === 'ObjectExpression') {
      styles.add(e)
      for (const p of all(e, 'properties'))
        if (p.type === 'ObjectProperty') style(get(p, 'value'), seen)
        else if (p.type === 'SpreadElement') style(get(p, 'argument'), seen)
    } else if (e.type === 'ArrayExpression') for (const x of all(e, 'elements')) style(x, seen)
    else if (e.type === 'ConditionalExpression') {
      style(get(e, 'consequent'), seen)
      style(get(e, 'alternate'), seen)
    } else if (e.type === 'LogicalExpression') {
      style(get(e, 'left'), seen)
      style(get(e, 'right'), seen)
    } else if (e.type === 'Identifier' || e.type === 'MemberExpression') {
      const r = resolve(e)
      if (r && r !== e) style(r, seen)
    } else if (e.type === 'ArrowFunctionExpression' || e.type === 'FunctionExpression') {
      // Pressable's `style={({ pressed }) => …}`
      for (const r of returned(e)) style(r, seen)
    } else if (e.type === 'CallExpression') {
      const name = calleeName(e)
      const [first] = all(e, 'arguments')
      if (STYLE_HOOKS.has(name ?? '') && isFunction(first) && first)
        for (const r of returned(first)) style(r, seen)
      // StyleSheet.flatten and compose take styles
      else if (name === 'flatten' || name === 'compose')
        for (const x of all(e, 'arguments')) style(x, seen)
      else if (name === 'create')
        for (const p of all(bare(first), 'properties')) style(get(p, 'value'), seen)
      else {
        // the file's own function that makes the style: `style={markBox(theme, m, on)}`
        const callee = bare(get(e, 'callee'))
        const fn =
          callee?.type === 'Identifier' ? constant(String(callee.name), callee.start) : undefined
        if (fn && isFunction(fn)) for (const r of returned(fn)) style(r, seen)
      }
    }
  }
  walk(program, (n) => {
    if (n.type === 'JSXAttribute') {
      const name = nameOf(get(n, 'name')) ?? ''
      if (STYLE_KEY.test(name) || name === 'hitSlop') style(get(get(n, 'value'), 'expression'))
    } else if (n.type === 'ObjectProperty' && STYLE_KEY.test(keyOf(get(n, 'key')) ?? ''))
      style(get(n, 'value'))
    else if (
      n.type === 'CallExpression' &&
      calleeName(n) === 'create' &&
      nameOf(get(get(n, 'callee'), 'object')) === 'StyleSheet'
    )
      style(n)
    else if (n.type === 'VariableDeclarator' && isStyleType(get(get(n, 'id'), 'typeAnnotation')))
      style(get(n, 'init'))
    else if (
      (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression') &&
      isStyleType(get(n, 'typeAnnotation'))
    )
      style(get(n, 'expression'))
    else if (isFunction(n) && isStyleType(get(n, 'returnType')))
      for (const r of returned(n)) style(r)
    return undefined
  })

  const found: Finding[] = []
  const seen = new Set<string>()
  const add = (node: Node, key: string, what: string) => {
    if (seen.has(key)) return
    seen.add(key)
    found.push({ rule: 'values', file, line: lineOf(node), what })
  }
  const size = (key: string, value: Node | undefined) => {
    for (const { node, via } of sizes(value))
      add(
        node,
        `${node.start}`,
        `${key}: ${textOf(source, node)}${via ? ` (from ${via})` : ''}, a literal size`,
      )
  }
  const scale = (key: string, value: Node | undefined) => {
    for (const { node, via } of sizes(value)) {
      const n = bare(node)
      if (n?.type === 'NumericLiteral' && Number(n.value) === 1) continue
      add(
        node,
        `${node.start}`,
        `${key}: ${textOf(source, node)}${via ? ` (from ${via})` : ''}, a literal scale`,
      )
    }
  }
  const named = (key: string, value: Node | undefined) => {
    for (const s of strings(value))
      if (NAMED_COLOURS.has(s.text.toLowerCase()))
        add(s.node, `${s.node.start}`, `${key}: '${s.text}', a literal colour`)
  }
  /** A component's function: a PascalCase declaration or const, or what a wrapper wraps. */
  const isComponent = (fn: Node, parent: Node | undefined) =>
    isComponentName(nameOf(get(fn, 'id')) ?? '') ||
    (parent?.type === 'VariableDeclarator' && isComponentName(nameOf(get(parent, 'id')) ?? '')) ||
    (parent?.type === 'CallExpression' && WRAPPERS.has(calleeName(parent) ?? ''))

  const visit = (n: Node, parent: Node | undefined, mask: boolean) => {
    // types, and the modules imported, aren't values
    if (n.type.startsWith('TS') && !TS_EXPRESSIONS.has(n.type)) return
    if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration') return
    const inMask = mask || (n.type === 'JSXElement' && tagOf(n) === 'Mask')
    if (n.type === 'ObjectProperty' && parent && styles.has(parent)) {
      const key = keyOf(get(n, 'key')) ?? ''
      if (STYLE_SIZE.test(key)) size(key, get(n, 'value'))
      if (SCALE.test(key)) scale(key, get(n, 'value'))
      if (COLOUR.test(key) && !inMask) named(key, get(n, 'value'))
    } else if (n.type === 'JSXAttribute') {
      const key = nameOf(get(n, 'name')) ?? ''
      const raw = get(n, 'value')
      const value = raw?.type === 'JSXExpressionContainer' ? get(raw, 'expression') : raw
      if (PROP_SIZE.test(key) || (STYLE_SIZE.test(key) && key !== 'start' && key !== 'end'))
        size(key, value)
      if (SCALE.test(key)) scale(key, value)
      if (COLOUR.test(key) && !inMask) named(key, value)
    } else if (isFunction(n) && isComponent(n, parent)) {
      // a component's defaults: `{ size = 20 }`
      const [props] = all(n, 'params')
      for (const p of props?.type === 'ObjectPattern' ? all(props, 'properties') : []) {
        const key = keyOf(get(p, 'key')) ?? ''
        const pattern = get(p, 'value')
        const fallback = pattern?.type === 'AssignmentPattern' ? get(pattern, 'right') : undefined
        if (!fallback) continue
        if (PROP_SIZE.test(key)) size(key, fallback)
        if (COLOUR.test(key)) named(key, fallback)
      }
    } else if (!inMask && (n.type === 'StringLiteral' || n.type === 'TemplateLiteral')) {
      // a gradient has a colour at each stop
      const text =
        n.type === 'StringLiteral'
          ? String(n.value)
          : all(n, 'quasis')
              .map((q) => String((q.value as { cooked?: string })?.cooked ?? ''))
              .join('…')
      for (const m of text.matchAll(HEX))
        add(n, `${n.start}:${m.index}`, `${m[1]}, a literal colour`)
      for (const m of text.matchAll(COLOUR_FUNCTION))
        add(n, `${n.start}:${m.index}f`, `${m[0]}, a literal colour`)
    }
    for (const [field, child] of Object.entries(n)) {
      if (NOT_CHILDREN.has(field)) continue
      // `export … from`'s and `require()`'s module, and a dynamic import's
      if (field === 'source' && n.type === 'ExportNamedDeclaration') continue
      if (
        field === 'arguments' &&
        n.type === 'CallExpression' &&
        (get(n, 'callee')?.type === 'Import' || nameOf(get(n, 'callee')) === 'require')
      )
        continue
      for (const c of Array.isArray(child) ? child : [child]) if (isNode(c)) visit(c, n, inMask)
    }
  }
  visit(program, undefined, false)
  return found.sort((a, b) => a.line - b.line)
}

/** Every finding in the repository at `root`, and how many the exceptions excuse, by rule. */
export async function check(root = ROOT) {
  const findings: Finding[] = []
  const excused: Record<Rule, number> = { renderers: 0, screens: 0, parts: 0, values: 0 }
  const { exceptions, moved } = readExceptions(root, findings)
  const listed = (rule: Rule, file: string, name?: string) => {
    const e = exceptions.find(
      (x) => x.rule === rule && matches(x.path, file) && (name === undefined || x.name === name),
    )
    if (e) e.used++
    return e
  }

  const library = sources(root, LIBRARY)
  const partFiles = PARTS.flatMap((dir) => sources(root, dir))
  const valueFiles = VALUES.flatMap((dir) => sources(root, dir))
  const prototypeFiles = PROTOTYPES.flatMap((dir) => sources(root, dir))
  const trees = new Map<string, Source>()
  for (const file of new Set([
    ...sources(root, 'packages/ui/src/shared'),
    ...library,
    ...partFiles,
    ...valueFiles,
    ...prototypeFiles,
  ])) {
    const parsed = parse(root, file)
    if ('program' in parsed) trees.set(file, parsed)
    else findings.push(parsed)
  }
  const graph: Graph = new Map([...trees].map(([file, source]) => [file, analyse(source)]))

  // renderers: what both draw, and what's drawn per platform
  const twice = new Map<string, Def[]>()
  for (const group of platformFiles(library))
    for (const file of group)
      for (const [name, def] of ownComponents(graph.get(file)))
        twice.set(name, [...(twice.get(name) ?? []), def])
  const parity = readParity(trees.get(PARITY))
  for (const [name, defs] of twice) {
    if (defs.length < 2) continue
    if (parity.reasons.get(name)?.trim()) {
      excused.renderers++
      continue
    }
    const [first, ...rest] = defs as [Def, ...Def[]]
    const listing = parity.reasons.has(name)
      ? 'lists it without a reason'
      : parity.spreads.length
        ? `gives no reason for it (it spreads ${parity.spreads.join(', ')}, which can't carry reasons)`
        : "doesn't list it"
    findings.push({
      rule: 'renderers',
      file: first.file,
      line: first.line,
      what: `${name} is drawn ${defs.length === 2 ? 'twice' : `${defs.length} times`}, also at ${rest.map(at).join(', ')}; parity.ts's BOTH ${listing}`,
    })
  }
  for (const name of parity.reasons.keys())
    if ((twice.get(name)?.length ?? 0) < 2)
      findings.push({
        rule: 'exceptions',
        file: PARITY,
        line: parity.lines.get(name) ?? parity.line,
        what: `parity.ts's BOTH lists ${name}, which is drawn once`,
      })

  // screens: one file per destination, in apps/client/src/app, and nothing left where they moved from
  const counted = new Map<Exception, Finding[]>()
  const excuse = (rule: 'screens' | 'values', finding: Finding) => {
    const e = listed(rule, finding.file)
    if (!e) findings.push(finding)
    else counted.set(e, [...(counted.get(e) ?? []), finding])
  }
  for (const file of OTHER_SCREENS.flatMap((dir) => sources(root, dir)))
    if (file.endsWith('.tsx'))
      excuse('screens', {
        rule: 'screens',
        file,
        line: 1,
        what: 'a client file outside apps/client',
      })
  for (const file of ADMIN_HOSTS.flatMap((dir) => sources(root, dir))) {
    const parsed = parse(root, file)
    if (!('program' in parsed)) {
      findings.push(parsed)
      continue
    }
    for (const node of all(parsed.program, 'body')) {
      if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue
      const from = keyOf(get(node, 'source'))
      const drawn =
        from === 'react-native'
          ? ['react-native']
          : from === '@highsea-tv/ui' || from === '@highsea-tv/ui/native'
            ? all(node, 'specifiers')
                .filter((sp) => sp.type === 'ImportSpecifier' && sp.importKind !== 'type')
                .map((sp) => keyOf(get(sp, 'imported')) ?? '')
                .filter((name) => !HOST_PARTS.has(name))
            : []
      if (drawn.length)
        excuse('screens', {
          rule: 'screens',
          file,
          line: lineOf(node),
          what: `the admin's host draws ${drawn.join(', ')}, which belongs in @highsea-tv/admin`,
        })
    }
  }
  for (const [plain, ...others] of platformFiles(sources(root, SCREENS)))
    for (const file of others)
      excuse('screens', {
        rule: 'screens',
        file,
        line: 1,
        what: `a second copy of ${plain ?? 'a screen'}, for one platform`,
      })
  for (const m of moved) {
    const what = `a copy of ${m.destination}, which moved into apps/client in part ${m.part}`
    for (const copy of m.copies) {
      if (!copy.names)
        for (const file of prototypeFiles.filter((f) => matches(copy.path, f)))
          findings.push({ rule: 'screens', file, line: 1, what })
      // a name is a copy wherever it's declared, not only in the file it was found in
      for (const name of copy.names ?? [])
        for (const file of prototypeFiles) {
          const line = graph.get(file)?.declared.get(name)
          if (line) findings.push({ rule: 'screens', file, line, what: `${name}, ${what}` })
        }
    }
  }

  // parts: each component one module's, the library's platform files counting as one
  const defs = new Map<string, Def[]>()
  for (const file of partFiles)
    for (const [name, def] of ownComponents(graph.get(file))) {
      const same = defs.get(name) ?? []
      const one = file.startsWith(`${LIBRARY}/`) && same.some((d) => stem(d.file) === stem(file))
      if (!one) defs.set(name, [...same, def])
    }
  for (const [name, list] of defs) {
    if (list.length < 2) continue
    const open = list.filter((def) => !listed('parts', def.file, name))
    excused.parts += list.length - open.length
    const [first, ...rest] = open
    for (const def of first ? rest : [])
      findings.push({
        rule: 'parts',
        file: def.file,
        line: def.line,
        what: `${name} is defined again, first at ${at(first as Def)}`,
      })
  }

  // values: from the tokens
  for (const file of valueFiles) {
    const source = trees.get(file)
    for (const finding of source ? literals(source) : []) excuse('values', finding)
  }

  // each screens and values exception excuses the number it gives
  for (const [e, list] of counted) {
    const count = e.count ?? 0
    const rule = e.rule as 'screens' | 'values'
    if (list.length === count) {
      excused[rule] += list.length
      continue
    }
    const things = rule === 'screens' ? 'client files' : 'literal values'
    findings.push({
      rule: 'exceptions',
      file: EXCEPTIONS,
      line: e.line,
      what: `${e.path} has ${list.length} ${things}, listed as ${count}`,
    })
    // more than listed: show them all, since which are new can't be told
    if (list.length > count) findings.push(...list)
    else excused[rule] += list.length
  }

  for (const e of exceptions)
    if (!e.used)
      findings.push({
        rule: 'exceptions',
        file: EXCEPTIONS,
        line: e.line,
        what: `${e.path}${e.name ? ` (${e.name})` : ''} matches nothing the ${e.rule} rule finds`,
      })
  return { findings, excused }
}

if (import.meta.main) {
  const { findings, excused } = await check()
  const groups = ['renderers', 'screens', 'parts', 'values', 'exceptions', 'parse'] as const
  for (const group of groups) {
    const list = findings.filter((f) => f.rule === group)
    if (!list.length) continue
    console.log(`\n${group} (${list.length})`)
    for (const f of list) console.log(`  ${f.file}:${f.line}  ${f.what}`)
  }
  const counts = groups.map((g) => `${g} ${findings.filter((f) => f.rule === g).length}`)
  const listed = `listed: ${excused.renderers} in parity.ts, and ${excused.screens} screens, ${excused.parts} parts and ${excused.values} values in ${EXCEPTIONS}`
  console.log(
    findings.length
      ? `\n${findings.length} failures (${counts.join(', ')}); ${listed}`
      : `one place: clean; ${listed}`,
  )
  process.exit(findings.length ? 1 : 0)
}
