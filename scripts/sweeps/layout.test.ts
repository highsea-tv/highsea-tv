// SPDX-License-Identifier: AGPL-3.0-only
// The layout check's comparison (layout.ts): the trees in shared words, and what counts as the
// same screen, so a change to the matching or the tolerance that would let drift through fails.
import { expect, describe as group, test } from 'bun:test'
import {
  assess,
  type Capture,
  compare,
  describe,
  EXCEPTIONS,
  fieldGapFor,
  fromWeb,
  fromXCUI,
  type LayoutNode,
  normalizeName,
  notesOf,
  overlap,
  parseArgs,
  SIZES,
  TEXT_SHAPING,
  TOLERANCE,
  type XCUIRaw,
} from './layout.ts'

const node = (kind: LayoutNode['kind'], name: string, x: number, y: number, w = 100, h = 40) => ({
  kind,
  name,
  box: { x, y, w, h },
  raw: kind,
})

const capture = (
  target: Capture['target'],
  nodes: LayoutNode[],
  screen = 'connect',
  width = SIZES[target].width,
  height = SIZES[target].height,
): Capture => ({ target, screen, width, height, nodes })

const screen = [
  node('image', 'highsea tv', 165, 82, 72, 28),
  node('text', 'choose a server', 41, 155, 320, 26),
  node('action', 'harbor 192 168 1 20 3000', 29, 235, 344, 61),
]

group('names', () => {
  test('leave out case, quotes, punctuation and spacing', () => {
    expect(normalizeName('Sign in to “Harbor”')).toBe('sign in to harbor')
    expect(normalizeName('Theme, How this device looks.')).toBe('theme how this device looks')
    expect(normalizeName('  Harbor,\n192.168.1.20:3000 ')).toBe('harbor 192 168 1 20 3000')
    expect(normalizeName('Ines’s TV')).toBe('iness tv')
  })
})

group('the web tree', () => {
  test('takes roles in the shared words, a label without a role as other', () => {
    const nodes = fromWeb([
      { role: 'button', name: 'Sign in', x: 1, y: 2, w: 3, h: 4 },
      { role: 'tab', name: 'You', x: 1, y: 2, w: 3, h: 4 },
      { role: 'textbox', name: 'Username', x: 1, y: 2, w: 3, h: 4 },
      { role: 'heading', name: 'Settings', x: 1, y: 2, w: 3, h: 4 },
      { role: 'switch', name: 'Subtitles', x: 1, y: 2, w: 3, h: 4 },
      { role: '', name: 'highsea tv', x: 1, y: 2, w: 3, h: 4 },
    ])
    expect(nodes.map((n) => n.kind)).toEqual([
      'action',
      'action',
      'field',
      'text',
      'toggle',
      'other',
    ])
  })

  test('leaves out what no one reads: no box, no name, or a role that is nothing', () => {
    const nodes = fromWeb([
      { role: 'button', name: 'Hidden', x: 0, y: 0, w: 0, h: 0 },
      { role: 'text', name: '   ', x: 1, y: 1, w: 3, h: 4 },
      { role: 'presentation', name: 'x', x: 1, y: 1, w: 3, h: 4 },
    ])
    expect(nodes).toEqual([])
  })

  test('keeps a nameless node only when it is a field, as the device tree does', () => {
    const nodes = fromWeb([
      { role: 'textbox', name: '', x: 1, y: 1, w: 3, h: 4 },
      { role: 'img', name: '', x: 1, y: 1, w: 3, h: 4 },
      { role: 'button', name: '', x: 1, y: 1, w: 3, h: 4 },
    ])
    expect(nodes.map((n) => n.kind)).toEqual(['field'])
  })
})

group('the device tree', () => {
  const at = (
    type: string,
    label: string,
    parent: number,
    box = { x: 10, y: 20, w: 30, h: 40 },
  ): XCUIRaw => ({ type, label, parent, ...box })

  test('leaves out the unlabelled containers and the text Fabric exposes twice', () => {
    const nodes = fromXCUI([
      at('application', 'highsea', -1, { x: 0, y: 0, w: 402, h: 874 }),
      at('window', '', 0, { x: 0, y: 0, w: 402, h: 874 }),
      at('other', '', 1),
      at('staticText', 'Choose a server', 2),
      at('staticText', 'Choose a server', 3),
    ])
    expect(nodes).toEqual([
      {
        kind: 'text',
        name: 'choose a server',
        box: { x: 10, y: 20, w: 30, h: 40 },
        raw: 'staticText',
      },
    ])
  })

  test('reads a button as a whole, as assistive technology does', () => {
    const nodes = fromXCUI([
      at('button', 'Harbor, 192.168.1.20:3000', -1),
      at('staticText', 'Harbor', 0, { x: 12, y: 22, w: 10, h: 10 }),
      at('staticText', '192.168.1.20:3000', 0, { x: 12, y: 34, w: 10, h: 10 }),
    ])
    expect(nodes.map((n) => n.name)).toEqual(['harbor 192 168 1 20 3000'])
  })

  test('names a field by its placeholder when it has no label', () => {
    const [field] = fromXCUI([{ ...at('textField', '', -1), placeholder: 'Username' }])
    expect(field?.kind).toBe('field')
    expect(field?.name).toBe('username')
  })

  test('keeps a nameless node only when it is a field, as the web tree does', () => {
    const nodes = fromXCUI([at('textField', '', -1), at('image', '', -1), at('button', '', -1)])
    expect(nodes.map((n) => n.kind)).toEqual(['field'])
  })
})

group('the comparison', () => {
  test('the same tree is the same screen', () => {
    const c = compare(capture('compact-touch', screen), capture('iphone', screen))
    expect(c.pass).toBe(true)
    expect(c.matched).toBe(3)
    expect(c.same).toBe(3)
  })

  test(`a move within ${TOLERANCE} points passes`, () => {
    const native = screen.map((n) => ({ ...n, box: { ...n.box, y: n.box.y + TOLERANCE } }))
    expect(compare(capture('compact-touch', screen), capture('iphone', native)).pass).toBe(true)
  })

  test('a move or a size beyond the tolerance fails, with its numbers', () => {
    const native = [
      screen[0] as LayoutNode,
      { ...(screen[1] as LayoutNode), box: { x: 40, y: 150, w: 321, h: 26 } },
      { ...(screen[2] as LayoutNode), box: { x: 28, y: 230, w: 345, h: 52 } },
    ]
    const c = compare(capture('compact-touch', screen), capture('iphone', native))
    expect(c.pass).toBe(false)
    expect(c.findings.map((f) => f.type)).toEqual(['moved', 'moved'])
    expect(c.findings[0]?.type === 'moved' && c.findings[0].delta.dy).toBe(-5)
    expect(describe(c.findings[1] as never)).toContain('h -9')
  })

  test('shared shifts are grouped, so the first node that moved stands out', () => {
    const native = screen.map((n, i) =>
      i === 0 ? n : { ...n, box: { ...n.box, x: n.box.x - 1, y: n.box.y - 5 } },
    )
    const c = compare(capture('compact-touch', screen), capture('iphone', native))
    expect(c.shifts).toEqual([{ dx: -1, dy: -5, count: 2 }])
  })

  test('a node on one side only fails', () => {
    const c = compare(capture('compact-touch', screen), capture('iphone', screen.slice(0, 2)))
    expect(c.pass).toBe(false)
    expect(c.findings).toEqual([{ type: 'only-web', node: screen[2] as LayoutNode }])
  })

  test('a node a platform has by its nature is excused, with its reason', () => {
    const bar = node('other', 'vertical scroll bar 1 page', 396, 62, 3, 778)
    const c = compare(capture('compact-touch', screen), capture('iphone', [...screen, bar]))
    expect(c.pass).toBe(true)
    expect(c.excused[0]?.reason).toContain('scroll indicators')
  })

  test('the exception holds only on its own side', () => {
    const bar = node('other', 'vertical scroll bar 1 page', 396, 62, 3, 778)
    const c = compare(capture('compact-touch', [...screen, bar]), capture('iphone', screen))
    expect(c.pass).toBe(false)
  })

  test('a text that differs in the same place is paired and fails', () => {
    const native = [
      ...screen.slice(0, 1),
      node('text', 'pick a server', 41, 155, 320, 26),
      screen[2] as LayoutNode,
    ]
    const c = compare(capture('compact-touch', screen), capture('iphone', native))
    expect(c.findings.map((f) => f.type)).toEqual(['text'])
    expect(describe(c.findings[0] as never)).toContain('“pick a server”')
  })

  test('a text that changes by design is excused, unless it also moved', () => {
    const code = (x: number) => node('text', 'k7m q2p', x, 400, 300, 80)
    const other = { ...code(600), name: 'x4z 9ab' }
    const web = capture('tv', [code(600)], 'sign-in', 1920)
    expect(compare(web, capture('appletv', [other], 'sign-in', 1920)).pass).toBe(true)
    const moved = { ...other, box: { ...other.box, x: 640 } }
    expect(compare(web, capture('appletv', [moved], 'sign-in', 1920)).pass).toBe(false)
  })

  test('several nodes of one name pair nearest first', () => {
    const web = [node('action', 'play', 0, 100), node('action', 'play', 0, 300)]
    const native = [node('action', 'play', 0, 302), node('action', 'play', 0, 101)]
    const c = compare(capture('compact-touch', web), capture('iphone', native))
    expect(c.pass).toBe(true)
    expect(c.matched).toBe(2)
  })

  test('a labelled view with no role pairs with a text, an image or a group', () => {
    for (const kind of ['text', 'image', 'group'] as const) {
      const web = [node(kind, 'highsea tv', 165, 82, 72, 28)]
      const native = [node('other', 'highsea tv', 165, 82, 72, 28)]
      expect(compare(capture('compact-touch', web), capture('iphone', native)).pass).toBe(true)
    }
  })

  test('a control that is a view with no role on one side has lost its role, and fails', () => {
    for (const kind of ['action', 'toggle', 'field'] as const) {
      const web = [node(kind, 'you', 300, 800, 60, 50)]
      const native = [node('other', 'you', 300, 800, 60, 50)]
      const c = compare(capture('compact-touch', web), capture('iphone', native))
      expect(c.pass).toBe(false)
      expect(c.findings.map((f) => f.type)).toEqual(['kind'])
      expect(describe(c.findings[0] as never)).toContain('kind differs')
    }
  })

  test('different kinds of one name pair as a kind that differs', () => {
    const web = [node('action', 'settings', 0, 0)]
    const native = [node('text', 'settings', 0, 0)]
    const c = compare(capture('compact-touch', web), capture('iphone', native))
    expect(c.pass).toBe(false)
    expect(c.findings.map((f) => f.type)).toEqual(['kind'])
  })

  test('a pair found by place with equal names is checked for movement', () => {
    // nameless fields on both sides pair by place, then count as the same node
    const web = [node('field', '', 41, 302, 320, 36)]
    const near = [node('field', '', 41, 304, 320, 34)]
    const c = compare(capture('compact-touch', web), capture('iphone', near))
    expect(c.pass).toBe(true)
    expect(c.matched).toBe(1)
    const lower = [node('field', '', 41, 320, 320, 36)]
    const moved = compare(capture('compact-touch', web), capture('iphone', lower))
    expect(moved.findings.map((f) => f.type)).toEqual(['moved'])
  })

  test('an exception held to a screen excuses nothing on another', () => {
    const web = [node('text', '3 answered', 74, 713, 300, 22)]
    const native = [node('text', '2 answered', 74, 713, 300, 22)]
    expect(
      compare(capture('compact-touch', web, 'connect'), capture('iphone', native, 'connect')).pass,
    ).toBe(true)
    expect(
      compare(capture('compact-touch', web, 'settings'), capture('iphone', native, 'settings'))
        .pass,
    ).toBe(false)
  })

  test("the live count's exception is anchored to the start of the text", () => {
    const count = EXCEPTIONS.find((e) => e.screen === 'connect')?.name as RegExp
    expect(count.test('3 answered add one by address')).toBe(true)
    expect(count.test('looking')).toBe(true)
    expect(count.test('nobody 3 answered')).toBe(false)
    expect(count.test('looking for harbor')).toBe(false)
  })

  test('two empty captures compare as the same, which assess never lets stand', () => {
    expect(compare(capture('compact-touch', []), capture('iphone', [])).pass).toBe(true)
  })
})

group('units', () => {
  test('overlap is the share of the smaller box', () => {
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 5, h: 5 })).toBe(1)
    expect(overlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBe(0)
  })
})

group('engines', () => {
  test(`a text is held to the tolerance like any node (TEXT_SHAPING is ${TEXT_SHAPING})`, () => {
    expect(TEXT_SHAPING).toBe(0)
    const web = [node('text', 'three answered', 74, 713, 578, 22)]
    // the measured spread: 1.33 points wider and 1 taller pass
    const near = [node('text', 'three answered', 74, 713, 579.33, 23)]
    expect(compare(capture('tv', web), capture('appletv', near)).pass).toBe(true)
    // 11 points wider is 2% of the text, which no longer passes
    const wider = [node('text', 'three answered', 74, 713, 589, 23)]
    expect(compare(capture('tv', web), capture('appletv', wider)).pass).toBe(false)
    const lower = [node('text', 'three answered', 74, 719, 578, 22)]
    expect(compare(capture('tv', web), capture('appletv', lower)).pass).toBe(false)
  })

  test('a control is held to the tolerance, however wide', () => {
    const web = [node('action', 'harbor', 46, 445, 730, 77)]
    const wider = [node('action', 'harbor', 46, 445, 741, 77)]
    expect(compare(capture('tv', web), capture('appletv', wider)).pass).toBe(false)
  })

  test("the web's group named by the one text inside it is a wrapper and left out", () => {
    const nodes = fromWeb([
      { role: 'status', name: '3 answered', x: 46, y: 713, w: 730, h: 22 },
      { role: 'text', name: '3 answered', x: 74, y: 713, w: 578, h: 22 },
      { role: 'tablist', name: 'Tabs', x: 0, y: 800, w: 402, h: 74 },
    ])
    expect(nodes.map((n) => n.raw)).toEqual(['text', 'tablist'])
  })
})

group('fields', () => {
  const gap = fieldGapFor('touch')
  const field = node('field', 'username', 41, 306, 320, 36)
  const device = [node('field', 'username', 41, 303, 320, 34)]
  const label = (x: number, y: number, w = 320) => node('text', 'username', x, y, w, 19)
  const run = (web: LayoutNode[], native = device) =>
    compare(capture('compact-touch', web, 'sign-in'), capture('iphone', native, 'sign-in'), {
      fieldGap: gap,
    })

  test("the control spec's gap is 8 points on touch and 14 on the TV at 1080p", () => {
    expect(gap).toBe(8)
    expect(fieldGapFor('tv')).toBeCloseTo(14)
  })

  test("a field's label drawn where the Field draws it is excused on the web", () => {
    // as the last run measured it: the label at 279, 19 high, the field at 306
    const c = run([label(41, 306 - gap - 19), field])
    expect(c.pass).toBe(true)
    expect(c.excused).toHaveLength(1)
  })

  test('a label moved sideways is a difference', () => {
    expect(run([label(41 + TOLERANCE + 1, 279), field]).pass).toBe(false)
    expect(run([label(200, 279), field]).pass).toBe(false)
  })

  test('a label off the gap, or wider than its field, is a difference', () => {
    expect(run([label(41, 279 - 3), field]).pass).toBe(false)
    expect(run([label(41, 600), field]).pass).toBe(false)
    expect(run([label(41, 279, 400), field]).pass).toBe(false)
  })

  test('a label is excused only while its field is paired on the device', () => {
    const c = run([label(41, 279), field], [])
    expect(c.findings.map((f) => f.type).sort()).toEqual(['only-web', 'only-web'])
  })

  test('without the gap no label is excused', () => {
    const c = compare(
      capture('compact-touch', [label(41, 279), field], 'sign-in'),
      capture('iphone', device, 'sign-in'),
    )
    expect(c.pass).toBe(false)
  })
})

group('what a run must have', () => {
  const connect = (target: Capture['target']) =>
    capture(target, [node('action', 'harbor 192 168 1 20 3000', 29, 235, 344, 61)])
  const all = ['compact-touch', 'regular-pointer', 'tv', 'iphone', 'appletv'] as const
  const plan = { screens: ['connect' as const], targets: ['web', 'phone', 'tv'] as const }

  test('every capture there, with its anchor and size: compared and no problems', () => {
    const r = assess({ ...plan, targets: [...plan.targets] }, all.map(connect))
    expect(r.problems).toEqual([])
    expect(r.comparisons.map((c) => `${c.web}:${c.native}`)).toEqual([
      'compact-touch:iphone',
      'tv:appletv',
    ])
  })

  test('a missing capture is a problem', () => {
    const r = assess(
      { ...plan, targets: [...plan.targets] },
      all.filter((t) => t !== 'appletv').map(connect),
    )
    expect(r.problems).toEqual(['appletv connect: not captured'])
    expect(r.comparisons).toHaveLength(1)
  })

  test('an empty capture is a problem, and not compared', () => {
    const caps = all.map((t) => (t === 'iphone' ? capture(t, []) : connect(t)))
    const r = assess({ ...plan, targets: [...plan.targets] }, caps)
    expect(r.problems).toEqual(['iphone connect: the capture has no nodes'])
    expect(r.comparisons.map((c) => c.native)).toEqual(['appletv'])
  })

  test('a capture without its anchor is another screen', () => {
    const caps = all.map((t) =>
      t === 'iphone' ? capture(t, [node('text', 'something else', 0, 0)]) : connect(t),
    )
    const r = assess({ ...plan, targets: [...plan.targets] }, caps)
    expect(r.problems[0]).toContain("Harbor’s row isn't there")
  })

  test("a device that isn't the size the web is compared at is a problem, not scaled away", () => {
    const caps = all.map((t) =>
      t === 'appletv' ? { ...connect(t), width: 960, height: 540 } : connect(t),
    )
    const r = assess({ ...plan, targets: [...plan.targets] }, caps)
    expect(r.problems).toEqual(["appletv connect: 960 × 540, not the 1920 × 1080 it's compared at"])
  })

  test('nothing compared fails a run that asked for a pair', () => {
    const r = assess({ screens: ['connect'], targets: ['web', 'phone'] }, [])
    expect(r.comparisons).toEqual([])
    expect(r.problems).toContain('nothing was compared: no pair had both sides captured and usable')
  })

  test('a run that only captures the web compares nothing and passes', () => {
    const r = assess(
      { screens: ['connect'], targets: ['web'] },
      ['compact-touch', 'regular-pointer', 'tv'].map((t) => connect(t as Capture['target'])),
    )
    expect(r).toEqual({ comparisons: [], problems: [] })
  })

  test("each screen's anchor follows the target: the TV signs in by code", () => {
    const code = capture('tv', [node('text', 'sign in with your phone', 0, 0)], 'sign-in')
    const field = capture('compact-touch', [node('field', 'password', 0, 0)], 'sign-in')
    const r = assess({ screens: ['sign-in'], targets: ['web'] }, [
      code,
      field,
      capture('regular-pointer', [node('field', 'password', 0, 0)], 'sign-in'),
    ])
    expect(r.problems).toEqual([])
    const wrong = assess({ screens: ['sign-in'], targets: ['web'] }, [
      { ...code, target: 'compact-touch', width: 402, height: 874 },
      field,
    ])
    expect(wrong.problems).toHaveLength(2)
  })
})

group('the command line', () => {
  test('defaults to every target and screen, in order', () => {
    expect(parseArgs([])).toEqual({
      folder: undefined,
      preflight: false,
      plan: {
        screens: ['connect', 'sign-in', 'shell', 'settings'],
        targets: ['web', 'phone', 'tv'],
      },
    })
  })

  test('keeps the folder wherever it is, --preflight included', () => {
    expect(parseArgs(['--preflight', '/tmp/x']).folder).toBe('/tmp/x')
    expect(parseArgs(['--preflight', '/tmp/x']).plan.screens).toEqual(['connect'])
    expect(parseArgs(['--targets', 'web', '/tmp/x']).folder).toBe('/tmp/x')
    expect(parseArgs(['/tmp/x', '--targets', 'web']).plan.targets).toEqual(['web'])
  })

  test('refuses unknown screens and targets, repeats, and screens out of order', () => {
    expect(() => parseArgs(['--screens', 'home'])).toThrow("isn't a screen")
    expect(() => parseArgs(['--targets', 'android'])).toThrow("isn't a target")
    expect(() => parseArgs(['--targets', 'web,web'])).toThrow('twice')
    expect(() => parseArgs(['--screens', 'shell,connect'])).toThrow('order')
    expect(() => parseArgs(['--screens', 'connect,connect'])).toThrow('order')
    expect(() => parseArgs(['--screens'])).toThrow('needs a value')
    expect(() => parseArgs(['--target', 'web'])).toThrow("isn't an option")
    expect(() => parseArgs(['a', 'b'])).toThrow('one folder')
  })
})

group('notes', () => {
  test("a device run's LAYOUT note lines become the run's notes", () => {
    expect(
      notesOf('iphone', [
        'LAYOUT connect: 40 elements',
        't =  12.3s LAYOUT note: Settings opened on press 2',
        'something else',
      ]),
    ).toEqual(['iphone: Settings opened on press 2'])
  })
})
