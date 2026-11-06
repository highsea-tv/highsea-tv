// SPDX-License-Identifier: AGPL-3.0-only
// Each rule of the one-place check on a repository of a few files in a temporary folder: it fails
// on what's planted and passes once that's listed. The repository's own state is
// `bun run one-place`'s to report, not this test's.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { check, type Finding, ROOT, readExceptions } from './one-place.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A repository of these files, in a folder of its own. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'highsea-one-place-'))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const listing = (data: { moved?: unknown[]; exceptions?: unknown[] }) => ({
  'scripts/one-place-exceptions.json': JSON.stringify(data, null, 2),
})
const parity = (both: string) => ({ 'packages/ui/src/shared/parity.ts': both })
const lines = (findings: Finding[]) =>
  findings.map((f) => `${f.rule} ${f.file}:${f.line} ${f.what}`)
const run = async (files: Record<string, string>) => lines((await check(repo(files))).findings)

const component = (name: string) => `export function ${name}() {\n  return null\n}\n`

/** A Button drawn per platform, in a pair of platform files, and an Icon drawn once. */
const RENDERERS = {
  'packages/ui/src/native/index.ts':
    "export { Button } from './button'\nexport { Icon } from '../shared/icon.tsx'\n",
  'packages/ui/src/native/button.tsx': component('Button'),
  'packages/ui/src/native/button.web.tsx': 'export const Button = () => null\n',
  'packages/ui/src/shared/icon.tsx': component('Icon'),
}

describe('renderers', () => {
  test('a component drawn twice fails unless parity.ts gives the reason', async () => {
    expect(await run({ ...RENDERERS, ...parity('export const BOTH = {}\n') })).toEqual([
      "renderers packages/ui/src/native/button.tsx:1 Button is drawn twice, also at packages/ui/src/native/button.web.tsx:1; parity.ts's BOTH doesn't list it",
    ])
    expect(
      await run({ ...RENDERERS, ...parity("export const BOTH = ['Button'] as const\n") }),
    ).toEqual([
      "renderers packages/ui/src/native/button.tsx:1 Button is drawn twice, also at packages/ui/src/native/button.web.tsx:1; parity.ts's BOTH lists it without a reason",
    ])
    const listed = await check(
      repo({
        ...RENDERERS,
        ...parity("export const BOTH = {\n  Button: 'the browser’s own on the web',\n}\n"),
      }),
    )
    expect(listed.findings).toEqual([])
    expect(listed.excused.renderers).toBe(1)
  })

  test('a component drawn per platform in the library fails unless parity.ts gives the reason', async () => {
    const files = {
      'packages/ui/src/native/player.tsx': component('Player'),
      'packages/ui/src/native/player.web.tsx': component('Player'),
    }
    expect(await run({ ...files, ...parity('export const BOTH = {}\n') })).toEqual([
      "renderers packages/ui/src/native/player.tsx:1 Player is drawn twice, also at packages/ui/src/native/player.web.tsx:1; parity.ts's BOTH doesn't list it",
    ])
    const reason = parity(
      "export const BOTH = {\n  Player: 'hls.js on the web, expo-video elsewhere',\n}\n",
    )
    expect(await run({ ...files, ...reason })).toEqual([])
  })

  test('parity.ts is read from its syntax, and names it spreads carry no reason', async () => {
    // an import parity.ts can't resolve here would fail if it were run
    const both = [
      "import { CONTROLS } from '@highsea-tv/tokens'",
      "export const BOTH = [...CONTROLS, 'Icon'] as const",
      '',
    ].join('\n')
    expect(await run({ ...RENDERERS, ...parity(both) })).toEqual([
      "renderers packages/ui/src/native/button.tsx:1 Button is drawn twice, also at packages/ui/src/native/button.web.tsx:1; parity.ts's BOTH gives no reason for it (it spreads ...CONTROLS, which can't carry reasons)",
      "exceptions packages/ui/src/shared/parity.ts:2 parity.ts's BOTH lists Icon, which is drawn once",
    ])
  })

  test('parity.ts listing a component drawn once fails', async () => {
    const both =
      "export const BOTH = {\n  Button: 'the browser’s own on the web',\n  Icon: 'drawn once now',\n}\n"
    expect(await run({ ...RENDERERS, ...parity(both) })).toEqual([
      "exceptions packages/ui/src/shared/parity.ts:3 parity.ts's BOTH lists Icon, which is drawn once",
    ])
  })
})

describe('screens', () => {
  test('a client file outside apps/client fails unless it is listed', async () => {
    const files = { 'design/prototypes/src/web/home.tsx': component('Home') }
    expect(await run(files)).toEqual([
      'screens design/prototypes/src/web/home.tsx:1 a client file outside apps/client',
    ])
    const exceptions = [
      {
        rule: 'screens',
        path: 'design/prototypes/src/web/**',
        count: 1,
        until: 'B',
        reason: 'B moves it',
      },
    ]
    const listed = await check(repo({ ...files, ...listing({ exceptions }) }))
    expect(listed.findings).toEqual([])
    expect(listed.excused.screens).toBe(1)
    // a new file in the listed folder is one more than its count
    expect(
      await run({
        ...files,
        'design/prototypes/src/web/search.tsx': component('Search'),
        ...listing({ exceptions }),
      }),
    ).toEqual([
      'exceptions scripts/one-place-exceptions.json:3 design/prototypes/src/web/** has 2 client files, listed as 1',
      'screens design/prototypes/src/web/home.tsx:1 a client file outside apps/client',
      'screens design/prototypes/src/web/search.tsx:1 a client file outside apps/client',
    ])
  })

  test("the admin's hosts draw nothing of their own (D3)", async () => {
    const files = {
      'apps/server/app/page.tsx': [
        "import { Dashboard } from '@highsea-tv/admin/dashboard.tsx'",
        "import { ThemeProvider, type TextProps } from '@highsea-tv/ui/native'",
        'export default () => <ThemeProvider><Dashboard /></ThemeProvider>',
        '',
      ].join('\n'),
      'design/prototypes/src/admin/shared.tsx': [
        "import { View } from 'react-native'",
        "import { Button, ThemeProvider } from '@highsea-tv/ui/native'",
        'export const Host = () => <ThemeProvider><View /><Button /></ThemeProvider>',
        '',
      ].join('\n'),
    }
    expect(await run(files)).toEqual([
      "screens design/prototypes/src/admin/shared.tsx:1 the admin's host draws react-native, which belongs in @highsea-tv/admin",
      "screens design/prototypes/src/admin/shared.tsx:2 the admin's host draws Button, which belongs in @highsea-tv/admin",
    ])
  })

  test('a second copy of a screen for one platform fails', async () => {
    expect(
      await run({
        'apps/client/src/app/settings.tsx':
          'export default function Settings() {\n  return null\n}\n',
        'apps/client/src/app/settings.web.tsx':
          'export default function Settings() {\n  return null\n}\n',
      }),
    ).toEqual([
      'screens apps/client/src/app/settings.web.tsx:1 a second copy of apps/client/src/app/settings.tsx, for one platform',
    ])
  })

  test('a copy of a destination that moved fails, even in a listed folder', async () => {
    const lists = listing({
      moved: [
        {
          destination: 'Choose a server',
          part: 'A',
          copies: [{ path: 'design/prototypes/src/tv/connect.tsx' }],
        },
        {
          destination: 'Settings',
          part: 'A',
          copies: [{ path: 'design/prototypes/src/web/settings.tsx', names: ['WebSettings'] }],
        },
      ],
      exceptions: [
        {
          rule: 'screens',
          path: 'design/prototypes/src/*/**',
          count: 2,
          until: 'B',
          reason: 'B moves them',
        },
      ],
    })
    expect(
      await run({
        'design/prototypes/src/tv/connect.tsx': component('TvConnect'),
        'design/prototypes/src/web/settings.tsx': `${component('WebProfile')}\n${component('WebSettings')}`,
        ...lists,
      }),
    ).toEqual([
      'screens design/prototypes/src/tv/connect.tsx:1 a copy of Choose a server, which moved into apps/client in part A',
      'screens design/prototypes/src/web/settings.tsx:5 WebSettings, a copy of Settings, which moved into apps/client in part A',
    ])
    // a listed name is a copy in any file of the prototypes, a default export too
    expect(
      await run({
        'design/prototypes/src/web/settings.tsx': component('WebProfile'),
        'design/prototypes/src/web/account.tsx':
          'export default function WebSettings() {\n  return null\n}\n',
        ...lists,
      }),
    ).toEqual([
      'screens design/prototypes/src/web/account.tsx:1 WebSettings, a copy of Settings, which moved into apps/client in part A',
    ])
    // once the copies are gone, what's left passes
    expect(
      await run({
        'design/prototypes/src/web/settings.tsx': component('WebProfile'),
        'design/prototypes/src/web/account.tsx': component('WebAccount'),
        ...lists,
      }),
    ).toEqual([])
  })
})

describe('parts', () => {
  const files = {
    'packages/ui/src/native/person.tsx': component('PersonTile'),
    'apps/client/src/parts/person.tsx':
      "import { memo } from 'react'\n\nexport const PersonTile = memo(function PersonTile() {\n  return null\n})\n",
  }

  test('a component two modules define fails unless it is listed', async () => {
    expect(await run(files)).toEqual([
      'parts apps/client/src/parts/person.tsx:3 PersonTile is defined again, first at packages/ui/src/native/person.tsx:1',
    ])
    const exceptions = [
      {
        rule: 'parts',
        path: 'apps/client/src/parts/person.tsx',
        name: 'PersonTile',
        until: 'B',
        reason: 'B makes it a form of the library’s',
      },
    ]
    const listed = await check(repo({ ...files, ...listing({ exceptions }) }))
    expect(listed.findings).toEqual([])
    expect(listed.excused.parts).toBe(1)
  })

  test('hooks, constants, contexts, classes and types are not components', async () => {
    const shared = [
      "import { createContext } from 'react'",
      'export class PlayerError extends Error {}',
      'export function usePoster() {}',
      'export const KEEP = 1',
      'export const SessionContext = createContext(null)',
      'export type Poster = { id: string }',
      'export interface Row { id: string }',
      '',
    ].join('\n')
    expect(
      await run({ 'packages/client/src/a.ts': shared, 'packages/native/src/b.ts': shared }),
    ).toEqual([])
  })

  test('the library’s files for each platform are one module', async () => {
    expect(
      await run({
        'packages/ui/src/native/player.tsx': component('Player'),
        'packages/ui/src/native/player.web.tsx': component('Player'),
        ...parity(
          "export const BOTH = {\n  Player: 'hls.js on the web, expo-video elsewhere',\n}\n",
        ),
      }),
    ).toEqual([])
  })
})

describe('values', () => {
  const card = [
    "import { Icon, tokens, useTheme } from './theme.tsx'",
    '',
    'export function Card({ size = 20, u }: { size?: number; u: number }) {',
    '  const theme = useTheme()',
    '  return (',
    '    <View',
    '      style={{',
    '        padding: 12,',
    '        marginTop: -6,',
    '        gap: 2 * u,',
    '        borderRadius: tokens.radius.sm,',
    "        backgroundColor: 'red',",
    "        borderColor: '#0b0b0c',",
    "        shadowColor: 'rgba(0, 0, 0, 0.3)',",
    "        width: '50%',",
    '        margin: 0,',
    '        opacity: 0.5,',
    "        color: 'transparent',",
    '      }}',
    '    >',
    '      <Icon name="star" size={16} color={theme.colors.text} />',
    '    </View>',
    '  )',
    '}',
    '',
  ].join('\n')
  const file = 'packages/ui/src/native/card.tsx'
  const found = [
    `values ${file}:3 size: 20, a literal size`,
    `values ${file}:8 padding: 12, a literal size`,
    `values ${file}:9 marginTop: -6, a literal size`,
    `values ${file}:10 gap: 2, a literal size`,
    `values ${file}:12 backgroundColor: 'red', a literal colour`,
    `values ${file}:13 #0b0b0c, a literal colour`,
    `values ${file}:14 rgba(0, 0, 0, 0.3), a literal colour`,
    `values ${file}:21 size: 16, a literal size`,
  ]

  test('a literal colour, size, space or corner fails', async () => {
    expect(await run({ [file]: card })).toEqual(found)
  })

  test('the tokens, 0, percentages, comments, types and a mask’s white pass', async () => {
    const plain = [
      '// a comment may say #fff or padding: 12',
      "import { Mask, Rect } from 'react-native-svg'",
      "import { tokens } from './theme.tsx'",
      '',
      "type Hex = '#ffffff'",
      '',
      'export function Plain({ scale }: { scale: number }) {',
      '  return (',
      "    <View style={{ padding: tokens.space['3'], width: '50%', margin: 0, flex: 1, fontSize: scale * 1.15 }}>",
      '      <Mask id="m">',
      '        <Rect width="100%" height="100%" fill="#fff" />',
      '      </Mask>',
      '    </View>',
      '  )',
      '}',
      '',
    ].join('\n')
    expect(await run({ 'apps/client/src/parts/plain.tsx': plain })).toEqual([])
  })

  test('a literal in a constant, a call or a style function fails as if written in place', async () => {
    const constants = [
      "import { StyleSheet } from 'react-native'",
      'const PAD = 12',
      'const SIZE = 18',
      'const BOX = { radius: 6 }',
      'const pad = (n: number) => n',
      'function ring(on: boolean) {',
      '  return { borderWidth: on ? 2 : 0 }',
      '}',
      'const styles = StyleSheet.create({ row: { letterSpacing: 0.5, transform: [{ translateX: 4 }] } })',
      '',
      'export function Row() {',
      '  const padding = 8',
      '  return (',
      '    <View style={[styles.row, { padding, margin: PAD, borderRadius: BOX.radius, gap: Math.max(10, 0), rowGap: pad(3) }, ring(true)]}>',
      '      <Icon size={SIZE} />',
      '    </View>',
      '  )',
      '}',
      '',
    ].join('\n')
    expect(await run({ [file]: constants })).toEqual([
      `values ${file}:2 margin: 12 (from PAD), a literal size`,
      `values ${file}:3 size: 18 (from SIZE), a literal size`,
      `values ${file}:4 borderRadius: 6 (from BOX.radius), a literal size`,
      `values ${file}:7 borderWidth: 2, a literal size`,
      `values ${file}:9 letterSpacing: 0.5, a literal size`,
      `values ${file}:9 translateX: 4, a literal size`,
      `values ${file}:12 padding: 8 (from padding), a literal size`,
      `values ${file}:14 gap: 10, a literal size`,
    ])
  })

  test('a name is followed to the declaration in its own scope', async () => {
    const scoped = [
      'export function A({ u }: { u: number }) {',
      '  const radius = 1.4 * u',
      '  return <View style={{ borderRadius: radius }} />',
      '}',
      'export function B({ u, radius }: { u: number; radius: number }) {',
      '  return <View style={{ borderRadius: radius }} />',
      '}',
      '',
    ].join('\n')
    expect(await run({ [file]: scoped })).toEqual([
      `values ${file}:2 borderRadius: 1.4 (from radius), a literal size`,
    ])
  })

  test('only styles and size props are read: another object’s numbers pass', async () => {
    const plain = [
      "import { useQuery } from '@highsea-tv/client/data'",
      '',
      'export function Grid({ value }: { value: number }) {',
      '  const page = useQuery({ size: 50, width: 300 })',
      '  const v = Math.max(0, Math.min(100, value))',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the fixture's own template literal
      '  return <View style={{ width: `${v}%` }}>{page.width}</View>',
      '}',
      '',
    ].join('\n')
    expect(await run({ 'apps/client/src/grid.tsx': plain })).toEqual([])
  })

  test('a file’s values pass when the exceptions give their number, and fail on another', async () => {
    const values = (count: number) =>
      listing({
        exceptions: [{ rule: 'values', path: file, count, until: 'E', reason: 'before the check' }],
      })
    const listed = await check(repo({ [file]: card, ...values(8) }))
    expect(listed.findings).toEqual([])
    expect(listed.excused.values).toBe(8)
    // one more than listed: which is new can't be told, so all are shown
    expect(await run({ [file]: card, ...values(7) })).toEqual([
      `exceptions scripts/one-place-exceptions.json:3 ${file} has 8 literal values, listed as 7`,
      ...found,
    ])
    // fewer: the count is lowered
    expect(await run({ [file]: card, ...values(9) })).toEqual([
      `exceptions scripts/one-place-exceptions.json:3 ${file} has 8 literal values, listed as 9`,
    ])
  })
})

describe('the exceptions', () => {
  test('one that matches nothing fails', async () => {
    const exceptions = [
      {
        rule: 'screens',
        path: 'design/prototypes/src/web/**',
        count: 3,
        until: 'B',
        reason: 'B moves them',
      },
      {
        rule: 'parts',
        path: 'apps/client/src/poster.tsx',
        name: 'Poster',
        until: 'B',
        reason: 'B',
      },
      { rule: 'values', path: 'apps/client/src/plain.tsx', count: 1, until: null, reason: 'stays' },
    ]
    expect(
      await run({
        'apps/client/src/plain.tsx': component('Plain'),
        ...listing({ exceptions }),
      }),
    ).toEqual([
      'exceptions scripts/one-place-exceptions.json:3 design/prototypes/src/web/** matches nothing the screens rule finds',
      'exceptions scripts/one-place-exceptions.json:10 apps/client/src/poster.tsx (Poster) matches nothing the parts rule finds',
      'exceptions scripts/one-place-exceptions.json:17 apps/client/src/plain.tsx matches nothing the values rule finds',
    ])
  })

  test('one that isn’t well formed fails', async () => {
    const exceptions = [
      {
        rule: 'renderers',
        path: 'packages/ui/src/web/button.tsx',
        until: 'D',
        reason: 'the admin',
      },
      { rule: 'colours', path: 'a', until: 'B', reason: 'r' },
      { rule: 'screens', path: 'b', until: 'B' },
      { rule: 'screens', path: 'c', until: 'F', reason: 'r' },
      { rule: 'screens', path: 'd', reason: 'r' },
      { rule: 'parts', path: 'e', until: 'B', reason: 'r' },
      { rule: 'values', path: 'f', until: 'E', reason: 'r' },
      { rule: 'screens', path: 'g', until: null, count: 0, reason: 'r' },
      { rule: 'parts', path: 'h', name: 'H', count: 1, until: 'B', reason: 'r' },
      'i',
    ]
    const moved = [{ destination: 'Settings', part: 'A', copies: [] }]
    const findings = (await check(repo(listing({ moved, exceptions })))).findings
    const count = "'s count is how many it excuses, which screens and values exceptions give"
    expect(findings.map((f) => f.what)).toEqual([
      'renderer exceptions are listed in parity.ts, with reasons',
      "colours isn't a rule: screens, parts or values",
      'b has no reason',
      "c's until is the part that removes it, A to E, or null if it stays",
      "d's until is the part that removes it, A to E, or null if it stays",
      'e names no component',
      `f${count}`,
      `g${count}`,
      `h${count}`,
      'an exception is an object',
      'Settings lists its copies, each a path with the names in it, if any',
    ])
    expect(new Set(findings.map((f) => f.rule))).toEqual(new Set(['exceptions']))
  })

  test('a file that isn’t JSON, or isn’t its shape, fails with where', async () => {
    const broken = '{\n  "exceptions": [\n    { "rule": "values", },\n  ]\n}\n'
    expect(await run({ 'scripts/one-place-exceptions.json': broken, ...parity('') })).toEqual([
      expect.stringMatching(
        /^exceptions scripts\/one-place-exceptions\.json:3 scripts\/one-place-exceptions\.json isn't JSON at line 3, column 25: /,
      ),
    ])
    expect(await run({ 'scripts/one-place-exceptions.json': '[]' })).toEqual([
      'exceptions scripts/one-place-exceptions.json:1 scripts/one-place-exceptions.json is an object with a "moved" and an "exceptions" list',
    ])
  })

  test('a source file that doesn’t parse is a finding, not a crash', async () => {
    expect(
      await run({ 'apps/client/src/broken.tsx': 'export function A() {\n  return <View\n}\n' }),
    ).toEqual([expect.stringMatching(/^parse apps\/client\/src\/broken\.tsx:3 doesn't parse: /)])
  })

  test('a folder that isn’t there has nothing to find', async () => {
    const empty = await check(repo({}))
    expect(empty.findings).toEqual([])
    expect(empty.excused).toEqual({ renderers: 0, screens: 0, parts: 0, values: 0 })
  })

  test('the repository’s own exceptions are well formed', () => {
    const findings: Finding[] = []
    const { exceptions, moved } = readExceptions(ROOT, findings)
    expect(lines(findings)).toEqual([])
    expect(exceptions.length).toBeGreaterThan(0)
    expect(moved.length).toBeGreaterThan(0)
    for (const e of exceptions) expect(e.reason.length).toBeGreaterThan(10)
  })
})
