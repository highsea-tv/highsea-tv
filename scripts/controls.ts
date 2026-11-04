// SPDX-License-Identifier: AGPL-3.0-only
// The source check for design system 1.1 (docs/plans/design-system-1-1.md, part B): every app and
// prototype draws its controls with @highsea-tv/ui, which takes their sizes, corners and colours
// from the control spec (docs/design-language/controls.md). It finds
// - hand-rolled controls: a raw <button>, <input>, <select> or <textarea> on the web, and a raw
//   Pressable or Touchable in React Native;
// - a library control given a size, corner, padding, text size or colour of its own, as Tailwind
//   classes on the web or style numbers in React Native.
// An exception names its file, the tag and a reason in scripts/control-exceptions.json, as the
// licence audit's do. `bun scripts/controls.ts [path ...]` prints the findings; the test fails on any.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export const ROOT = join(import.meta.dir, '..')

/** Where screens live. The library itself (packages/ui) is where controls are drawn, so it's not. */
export const WEB_DIRS = [
  'apps/server/src',
  'apps/server/app',
  'apps/web/src',
  'apps/desktop/src',
  'apps/docs/app',
  'apps/docs/components',
  'design/prototypes/src',
]
// apps/client is the one client (one-client-platform.md), on the phone, the TV and the web
export const NATIVE_DIRS = ['apps/client/src']

/** The library's controls (tokens' CONTROLS, and the names screens use for them). */
const LIBRARY_CONTROLS = [
  'Button',
  'Input',
  'Textarea',
  'Select',
  'SearchField',
  'SegmentedControl',
  'Tabs',
  'Chip',
  'Checkbox',
  'Radio',
  'Switch',
  'MultiSelect',
]
const RAW_WEB = ['button', 'input', 'select', 'textarea']
const RAW_NATIVE = [
  'Pressable',
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
]

// what a screen may not set on a library control: sizes, corners, padding, text size and colour.
// Width, margins and placement are layout, which a screen owns.
const WEB_STYLE =
  /(?:^|\s|:)(?:h|min-h|max-h|size)-(?:\d|\[|\()|(?:^|\s|:)rounded(?:-[\w[\]().-]+)?(?=\s|$)|(?:^|\s|:)p[xytblr]?-(?:\d|\[|\()|(?:^|\s|:)text-(?:\[|xs|sm|base|lg|xl|\d|form|ui|body|caption)|(?:^|\s|:)(?:bg|border|text)-(?:s\d|accent|danger|line|text|on-|white|black|transparent|\[)/
const NATIVE_STYLE =
  /\b(?:height|minHeight|borderRadius|padding|paddingHorizontal|paddingVertical|fontSize|backgroundColor|borderColor)\s*:/

export type Finding = { file: string; line: number; tag: string; why: string }
type Exception = { file: string; tag: string; contains?: string; reason: string }

function files(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(join(ROOT, dir))
  } catch {
    return out
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'local-logos') continue
    const path = join(dir, name)
    if (statSync(join(ROOT, path)).isDirectory()) out = out.concat(files(path))
    else if (/\.tsx$/.test(name) && !/\.(test|stories|jest)\.tsx$/.test(name)) out.push(path)
  }
  return out
}

/** Each opening JSX tag named `tag` in `text`: its attributes and line, braces balanced. */
function openings(text: string, tag: string) {
  const found: { attrs: string; line: number }[] = []
  const re = new RegExp(`<${tag}(?=[\\s/>])`, 'g')
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 0
    let i = m.index + m[0].length
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    found.push({ attrs: text.slice(m.index, i), line: text.slice(0, m.index).split('\n').length })
  }
  return found
}

/** The tag's own className, read at the top level only, so a prop's JSX (an `end` slot) isn't its. */
function classesOf(attrs: string) {
  let depth = 0
  let out = ''
  for (let i = 0; i < attrs.length; i++) {
    const c = attrs[i]
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && attrs.startsWith('className=', i)) {
      const start = i + 'className='.length
      if (attrs[start] === '"') out += ` ${attrs.slice(start + 1, attrs.indexOf('"', start + 1))}`
      else if (attrs[start] === '{') {
        let d = 0
        let j = start
        for (; j < attrs.length; j++) {
          if (attrs[j] === '{') d++
          else if (attrs[j] === '}' && --d === 0) break
        }
        out += ` ${attrs.slice(start + 1, j)}`
        i = j
      }
    }
  }
  return out
}

export function scan(paths?: string[]): Finding[] {
  const exceptions = JSON.parse(
    readFileSync(join(ROOT, 'scripts/control-exceptions.json'), 'utf8'),
  ) as Exception[]
  const excused = (f: Finding, attrs: string) =>
    exceptions.some(
      (e) => e.file === f.file && e.tag === f.tag && (!e.contains || attrs.includes(e.contains)),
    )
  const within = (file: string) => !paths?.length || paths.some((p) => file.startsWith(p))
  const findings: Finding[] = []
  const check = (file: string, kind: 'web' | 'native') => {
    if (!within(file)) return
    const text = readFileSync(join(ROOT, file), 'utf8')
    const raw = kind === 'web' ? RAW_WEB : RAW_NATIVE
    for (const tag of raw)
      for (const { attrs, line } of openings(text, tag)) {
        // a hidden or file input carries no control's look
        if (tag === 'input' && /type="(?:hidden|file)"/.test(attrs)) continue
        const f = { file, line, tag, why: 'hand-rolled: use the library’s control' }
        if (!excused(f, attrs)) findings.push(f)
      }
    for (const tag of LIBRARY_CONTROLS)
      for (const { attrs, line } of openings(text, tag)) {
        const own =
          kind === 'web'
            ? classesOf(attrs)
                .split(/[\s'"`]+/)
                .find((c) => c !== 'min-h-0' && WEB_STYLE.test(` ${c}`))
            : NATIVE_STYLE.exec(attrs.match(/style=\{([\s\S]*)\}/)?.[1] ?? '')?.[0]
        if (!own) continue
        const f = { file, line, tag, why: `sets its own ${own.replace(/[:\s]+$/, '')}` }
        if (!excused(f, attrs)) findings.push(f)
      }
  }
  for (const dir of WEB_DIRS)
    for (const f of files(dir)) check(relative(ROOT, join(ROOT, f)), 'web')
  for (const dir of NATIVE_DIRS)
    for (const f of files(dir)) check(relative(ROOT, join(ROOT, f)), 'native')
  return findings
}

if (import.meta.main) {
  const found = scan(process.argv.slice(2))
  for (const f of found) console.log(`${f.file}:${f.line} <${f.tag}> ${f.why}`)
  console.log(found.length ? `${found.length} findings` : 'clean')
  process.exit(found.length ? 1 : 0)
}
