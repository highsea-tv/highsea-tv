// SPDX-License-Identifier: AGPL-3.0-only
// The same screen everywhere (one-client-platform.md › Checks that fail on drift): each of part
// A's proof screens (Choose a server, Harbor's sign-in, the shell on Home, Settings) and each of
// B1's destinations (one-client-platform-b.md: Movies, Collections, a collection, a film, a
// person, Search empty, with results and with none, and the TV's Alerts) is captured from
// apps/client against the same mock on the web at each form factor, on the iPhone simulator and on
// the Apple TV simulator, and the layouts are compared from their accessibility trees, not by eye.
//
// - **The web:** the mock web export (apps/client's dist-mock, served at /web by the prototypes'
//   build, `servePrototypes`) in Playwright's Chromium at compact-touch (402 × 874, the iPhone 17
//   Pro's points, with its safe area emulated through CDP's Emulation.setSafeAreaInsetsOverride,
//   which react-native-safe-area-context reads as env(safe-area-inset-*)), regular-pointer
//   (1440 × 900) and tv (1920 × 1080). Each node is an element with a role, or with a label, or
//   with text of its own, as an accessibility tree has them: role, name and box in CSS px.
// - **The iPhone and the Apple TV:** apps/client/uitest's XCUITest (Layout.swift, generated with
//   XcodeGen and run by tv-uitest.ts's runUITest) launches the installed Release mock-mode build
//   afresh and dumps one XCUIElement snapshot per screen: type, label and frame in points.
//   `build` makes and installs those builds.
// - **The steps are the same everywhere:** wait for discovery to finish (Look again, or the TV's
//   count, shows), choose Harbor, sign in (as Theo by password on touch, by code on the TV, which
//   the mock approves after 8 seconds), press Got it on the owner's announcement that must be
//   acknowledged (it comes over the shell, and on the TV hides it), then open each of B1's
//   destinations by its address inside the running client (ROUTES: a history push on the web, the
//   client's `highsea-client://` link on the devices), waiting for its anchors, and last open
//   Settings from the shell (the phone's You tab, the account in the TV's head). Alerts is a page
//   only on the TV (appliesTo), so only the TV pair has it.
// - **The checks** (pure, `assess` and `compare`, tested in layout.test.ts): every capture the run
//   asked for is there, has nodes, holds its screen's anchors (ANCHORS) and is the device's size
//   (SIZES: the iPhone 17 Pro's 402 × 874 points and the Apple TV's 1920 × 1080, so both compare
//   with the web 1:1 and nothing is scaled away). Nodes pair by name, a kind that fits (a labelled
//   view with no role pairs only with a text, an image or a group, never a control) and nearness,
//   then by place. compact-touch is compared with the iPhone, tv with the Apple TV. A matched node
//   whose x, y, width or height differ by more than TOLERANCE fails (TEXT_SHAPING allows a
//   text's size more, and is 0), as do a control whose kind differs, a text that
//   differs and a node on one side only, unless EXCEPTIONS gives the reason. regular-pointer has
//   no device to compare with, so it's captured for the sheet only. A run that could compare and
//   compared nothing fails.
// - **The sheet:** index.html (images inline, so it opens anywhere on its own) and checklist.md in
//   a folder outside the repository: each screen's captures side by side, each pair's differences, and the notes the device runs left (a press that took more than once).
//   results.json has every capture's nodes, the findings, the notes and the problems.
//
// bun scripts/sweeps/layout.ts build [phone|tv|both]   the Release mock-mode builds, installed on
//     the booted simulators. Prebuilding replaces apps/client/ios (`expo prebuild --clean`), so
//     `build` holds it while it runs: nobody else may prebuild or build apps/client meanwhile. A
//     lock in the temporary folder keeps two of these from overlapping; the TV's prebuild comes
//     first and the phone's is put back after it, even when the TV's build fails.
// bun scripts/sweeps/layout.ts [folder] [--targets web,phone,tv] [--screens connect,...] [--preflight]
//     --preflight takes Choose a server only, on every target, in about a minute; --screens takes
//     any of SCREENS in their order (`--screens film,person --targets web`, say)
//
// It needs a booted iPhone 17 Pro simulator and an Apple TV (1080p) simulator (PHONE_SIMULATOR,
// TV_SIMULATOR pick them by UDID), xcodegen (brew install xcodegen), and Playwright's Chromium.
// Exits non-zero when a pair differs, a capture is missing or wrong, or nothing was compared.
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SEED } from '../../packages/mock/src/films.ts'
import { controlMetrics, TV_REFERENCE } from '../../packages/tokens/src/controls.ts'

// ---------------------------------------------------------------- the comparison (pure)

/** What a node is, in words both trees have: iOS's element types and the web's roles. */
export type Kind = 'action' | 'toggle' | 'field' | 'text' | 'image' | 'group' | 'other'

export type Box = { x: number; y: number; w: number; h: number }

/** One node of a screen's tree: its kind, its name as read out, its box, and what it was raw. */
export type LayoutNode = {
  kind: Kind
  name: string
  box: Box
  raw: string
  /** On a device, what the element reads besides its label: its value and placeholder. */
  says?: string
}

export type Target = 'compact-touch' | 'regular-pointer' | 'tv' | 'iphone' | 'appletv'

export type Capture = {
  target: Target
  screen: string
  /** The capture's own width and height: CSS px on the web, points on a device. */
  width: number
  height: number
  nodes: LayoutNode[]
}

/** How far a matched node may move or change size, in points (CSS px on the web, 1:1). */
export const TOLERANCE = 4

/**
 * How much more than the tolerance a text's own width and height may differ, as a share of itself:
 * none. With iOS kerning as the browser does (ui-native's Text leaves `letterSpacing` unset without
 * tracking) and the same font and size, the run of 2026-11-03 measured every matched text within
 * 1.33 points of the web's width (0.5% of it) and 0.33 of its height on the iPhone, and within 0.86
 * (1.2%) and 1.00 on the Apple TV (iOS rounds a text's frame up to a whole pixel, one point at the
 * TV's 1x), so a text is held to the tolerance like every other node. Kept as a knob so the sheet
 * and the tests say so if an engine ever needs it again.
 */
export const TEXT_SHAPING = 0

/**
 * Nodes one side has by its platform's nature, and texts that differ by design, each with its
 * reason. `side` says which side may have it alone; `differs` excuses a text that changes run to
 * run; `screen` holds it to one screen.
 */
export type Exception = {
  name: RegExp
  reason: string
  side?: 'web' | 'native'
  screen?: string
  kind?: Kind
  /** Excuses a pair whose text differs, rather than a node on one side only. */
  differs?: boolean
  /** Excuses a pair whose kind differs: the web's kind, then the device's. */
  kinds?: readonly [Kind, Kind]
}

export const EXCEPTIONS: Exception[] = [
  {
    name: /^(vertical|horizontal) scroll bar\b/,
    side: 'native',
    reason:
      'UIScrollView’s own scroll indicators, which iOS exposes as elements; the web draws its scrollbar as a layer with no role',
  },
  {
    name: /^(?:\d+ answered\b|looking$)/,
    screen: 'connect',
    differs: true,
    reason: 'discovery’s live count; both sides wait until it stops looking',
  },
  {
    name: /^2 enter [a-z0-9 ]+ and approve this tv$/,
    screen: 'sign-in',
    differs: true,
    reason: 'the TV’s pairing code is new on every sign-in (RFC 8628)',
  },
  {
    name: /^[a-z0-9]{3} [a-z0-9]{3}$/,
    screen: 'sign-in',
    differs: true,
    reason: 'the TV’s pairing code is new on every sign-in (RFC 8628)',
  },
  {
    name: /^jump to a letter$/,
    kinds: ['field', 'other'],
    reason:
      'the letter index is React Native’s adjustable role: a slider on the web (react-native-web’s role map), and on iOS a plain view with the adjustable trait, which XCUITest lists by its class as other while VoiceOver reads it as adjustable (XCUIElement.ElementType; UIAccessibilityTraits.adjustable)',
  },
]

/** A name as both trees can agree on it: case, quotes, punctuation and spacing left out. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’'"“”‘]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * One rule for nameless nodes, on both trees: a node with nothing to read out is left out, except a
 * field, which is found by its place (an empty input is still a stop).
 */
const keepsNameless = (kind: Kind) => kind === 'field'

const WEB_KINDS: Record<string, Kind> = {
  button: 'action',
  link: 'action',
  tab: 'action',
  menuitem: 'action',
  menuitemradio: 'action',
  menuitemcheckbox: 'action',
  option: 'action',
  radio: 'action',
  checkbox: 'toggle',
  switch: 'toggle',
  textbox: 'field',
  searchbox: 'field',
  combobox: 'field',
  spinbutton: 'field',
  adjustable: 'field',
  slider: 'field',
  heading: 'text',
  text: 'text',
  img: 'image',
  image: 'image',
  tablist: 'group',
  menubar: 'group',
  menu: 'group',
  radiogroup: 'group',
  list: 'group',
  listbox: 'group',
  dialog: 'group',
  alertdialog: 'group',
  toolbar: 'group',
  navigation: 'group',
  region: 'group',
  group: 'group',
  summary: 'group',
  status: 'group',
  alert: 'group',
  progressbar: 'group',
}

/** What the page's extraction gives for each node, before it's put in the shared words. */
export type WebRaw = { role: string; name: string; x: number; y: number; w: number; h: number }

/** The web's nodes in the shared words; a role nobody reads (presentation, none) is left out. */
export function fromWeb(raw: WebRaw[]): LayoutNode[] {
  const out: LayoutNode[] = []
  for (const r of raw) {
    if (r.w <= 0 || r.h <= 0) continue
    const kind: Kind | undefined = r.role === '' ? 'other' : WEB_KINDS[r.role]
    if (!kind) continue
    const name = normalizeName(r.name)
    if (!name && !keepsNameless(kind)) continue
    out.push({ kind, name, box: { x: r.x, y: r.y, w: r.w, h: r.h }, raw: r.role || 'labelled' })
  }
  // a group named by what's inside it (a live region around its one text, say) is a wrapper the
  // native tree doesn't expose: the text inside stands for it
  return out.filter(
    (g) =>
      g.kind !== 'group' ||
      !out.some((n) => n !== g && n.kind !== 'group' && n.name === g.name && inside(n.box, g.box)),
  )
}

const inside = (a: Box, b: Box) =>
  a.x >= b.x - 0.5 &&
  a.y >= b.y - 0.5 &&
  a.x + a.w <= b.x + b.w + 0.5 &&
  a.y + a.h <= b.y + b.h + 0.5

const NATIVE_KINDS: Record<string, Kind> = {
  button: 'action',
  link: 'action',
  menuItem: 'action',
  radioButton: 'action',
  tab: 'action',
  cell: 'action',
  key: 'action',
  switch: 'toggle',
  toggle: 'toggle',
  checkBox: 'toggle',
  textField: 'field',
  secureTextField: 'field',
  searchField: 'field',
  textView: 'field',
  slider: 'field',
  staticText: 'text',
  image: 'image',
  icon: 'image',
  tabBar: 'group',
  tabGroup: 'group',
  menuBar: 'group',
  radioGroup: 'group',
  segmentedControl: 'group',
  toolbar: 'group',
  navigationBar: 'group',
  table: 'group',
  collectionView: 'group',
  alert: 'group',
  sheet: 'group',
  progressIndicator: 'group',
  other: 'other',
  group: 'other',
}

/** An element of Layout.swift's dump. */
export type XCUIRaw = {
  type: string
  label: string
  identifier?: string
  value?: string
  placeholder?: string
  x: number
  y: number
  w: number
  h: number
  parent: number
}

/**
 * The iPhone's or the Apple TV's nodes in the shared words. Unlabelled containers (the app, its
 * windows, React Native's views) say nothing and are left out, as is a text Fabric exposes twice
 * (a paragraph and its one child with the same label and frame), and anything inside an element
 * that reads as one (a button, a field), which assistive technology reads as a whole.
 */
export function fromXCUI(raw: XCUIRaw[]): LayoutNode[] {
  const out: LayoutNode[] = []
  const leaf = new Set<number>()
  raw.forEach((r, i) => {
    const kind = NATIVE_KINDS[r.type]
    const p = r.parent >= 0 ? raw[r.parent] : undefined
    const inLeaf = r.parent >= 0 && leaf.has(r.parent)
    if (inLeaf) leaf.add(i)
    if (!kind || inLeaf || r.w <= 0 || r.h <= 0) return
    const same =
      p &&
      p.type === r.type &&
      p.label === r.label &&
      Math.abs(p.x - r.x) < 0.5 &&
      Math.abs(p.y - r.y) < 0.5 &&
      Math.abs(p.w - r.w) < 0.5 &&
      Math.abs(p.h - r.h) < 0.5
    if (same) return
    const name = normalizeName(r.label || (kind === 'field' ? (r.placeholder ?? '') : ''))
    if (!name && !keepsNameless(kind)) return
    if (kind !== 'group' && kind !== 'other') leaf.add(i)
    const says = normalizeName([r.value, r.placeholder].filter(Boolean).join(' '))
    out.push({
      kind,
      name,
      box: { x: r.x, y: r.y, w: r.w, h: r.h },
      raw: r.type,
      ...(says ? { says } : {}),
    })
  })
  return out
}

export type Delta = { dx: number; dy: number; dw: number; dh: number }

export type Finding =
  | { type: 'moved'; web: LayoutNode; native: LayoutNode; delta: Delta }
  | { type: 'text'; web: LayoutNode; native: LayoutNode; delta: Delta }
  | { type: 'kind'; web: LayoutNode; native: LayoutNode; delta: Delta }
  | { type: 'only-web'; node: LayoutNode }
  | { type: 'only-native'; node: LayoutNode }

export type Excused = { finding: Finding; reason: string }

export type Comparison = {
  screen: string
  web: Target
  native: Target
  matched: number
  /** Matched pairs within the tolerance. */
  same: number
  findings: Finding[]
  excused: Excused[]
  /** Moved pairs grouped by the shift they share, most common first: where a shift starts. */
  shifts: { dx: number; dy: number; count: number }[]
  pass: boolean
}

const deltaOf = (a: Box, b: Box): Delta => ({
  dx: b.x - a.x,
  dy: b.y - a.y,
  dw: b.w - a.w,
  dh: b.h - a.h,
})

const beyond = (d: Delta, tolerance: number, n: LayoutNode) => {
  const text = n.kind === 'text'
  const tw = text ? Math.max(tolerance, n.box.w * TEXT_SHAPING) : tolerance
  const th = text ? Math.max(tolerance, n.box.h * TEXT_SHAPING) : tolerance
  return (
    Math.abs(d.dx) > tolerance ||
    Math.abs(d.dy) > tolerance ||
    Math.abs(d.dw) > tw ||
    Math.abs(d.dh) > th
  )
}

/**
 * Whether two kinds read as the same thing. A labelled view with no role (`other`) may be a text,
 * an image or a group on the other side, but never a control: a control that's `other` on one side
 * has lost its role there.
 */
export const compatible = (a: Kind, b: Kind) => {
  if (a === b) return true
  const passive = (k: Kind) => k === 'text' || k === 'image' || k === 'group'
  return (a === 'other' && passive(b)) || (b === 'other' && passive(a))
}

const centreDistance = (a: Box, b: Box) =>
  Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2))

/** The share of the smaller box that the two boxes overlap. */
export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  return (w * h) / Math.min(a.w * a.h, b.w * b.h)
}

function excuse(f: Finding, screen: string, exceptions: Exception[]): Exception | undefined {
  if (f.type === 'moved') return undefined
  if (f.type === 'kind')
    return exceptions.find(
      (e) =>
        e.kinds !== undefined &&
        (e.screen === undefined || e.screen === screen) &&
        e.kinds[0] === f.web.kind &&
        e.kinds[1] === f.native.kind &&
        e.name.test(f.web.name),
    )
  const nodes = f.type === 'only-web' || f.type === 'only-native' ? [f.node] : [f.web, f.native]
  const side = f.type === 'only-web' ? 'web' : f.type === 'only-native' ? 'native' : undefined
  return exceptions.find(
    (e) =>
      (e.screen === undefined || e.screen === screen) &&
      (e.differs ? f.type === 'text' : f.type === 'only-web' || f.type === 'only-native') &&
      (e.side === undefined || e.side === side) &&
      nodes.every((n) => (e.kind === undefined || e.kind === n.kind) && e.name.test(n.name)),
  )
}

/**
 * A field's drawn label. ui's native Field hides its label's Text from VoiceOver
 * (accessibilityElementsHidden) and names the input by it, so the iPhone's and the Apple TV's
 * trees have only the field; react-native-web keeps the Text in the web's tree. The label is
 * excused only where it's drawn as the Field draws it: its own field's name, its left edge within
 * the tolerance of the field's, no wider than the field, and the control spec's gap above the
 * field (`fieldGap`, within a point), with the field itself paired on the device.
 */
export const FIELD_LABEL =
  'a field’s drawn label, read on the device only as the field’s name (ui’s Field hides its Text from VoiceOver); checked against the field it labels'

function isFieldLabel(
  n: LayoutNode,
  nodes: LayoutNode[],
  pairedFields: Set<LayoutNode>,
  fieldGap: number,
  tolerance: number,
) {
  if (n.kind !== 'text') return false
  return nodes.some(
    (f) =>
      f.kind === 'field' &&
      f.name === n.name &&
      pairedFields.has(f) &&
      Math.abs(f.box.x - n.box.x) <= tolerance &&
      n.box.w <= f.box.w + tolerance &&
      Math.abs(f.box.y - (n.box.y + n.box.h) - fieldGap) <= 1,
  )
}

/**
 * A container the web's tree keeps and the device's has no element for: react-native-web renders a
 * view's `role` as its ARIA role (list, region, group), which the browser's tree keeps as a node,
 * while UIKit exposes only accessibility elements, a container's kind being a property of it
 * (accessibilityContainerType) rather than an element XCUITest lists. Excused only around a node
 * that's paired, so a container that's lost its contents still fails.
 */
export const CONTAINER =
  'a list, region or group, which react-native-web keeps as an ARIA node and UIKit has no element for (a container’s accessibilityContainerType isn’t an element); checked to hold a paired node'

/**
 * A text inside a stop that reads as one: a focusable or labelled view on iOS and tvOS is one
 * accessibility element, read by its label, which carries its texts (React Native's `accessible`),
 * while the web's tree keeps each text under it. Excused only inside a paired stop whose name holds
 * the text's words.
 */
export const IN_STOP =
  'a text inside a stop that iOS reads as one element by its label (React Native’s `accessible`); checked against the paired stop, whose name holds it'

/**
 * What a field shows of its own (its placeholder, or what's typed): the web draws it as text inside
 * the field, and the device reads it as the field's value or placeholder (XCUIElement's
 * `value` and `placeholderValue`). Excused only inside a paired field, or inside a paired element whose
 * value or placeholder holds the words: tvOS reports a text field that isn't being edited as an
 * element of type `other` that carries what's typed as its value (XCUIElement.ElementType).
 */
export const FIELD_WORDS =
  'a field’s own words (its placeholder or what’s typed), which the device reads as the field’s value; checked to lie inside the paired field'

export type CompareOptions = {
  tolerance?: number
  exceptions?: Exception[]
  /** The control spec's gap between a field's label and the field; without it no label is excused. */
  fieldGap?: number
}

/**
 * Compares a web capture with a device's, both in points. Nodes pair by equal name and a kind that
 * fits, nearest first; then a name left on both sides with kinds that don't fit pairs as a kind
 * that differs; then what's left pairs by kind where the boxes overlap by half or more, as a text
 * that differs (or, with equal names, as the same node, checked for movement); the rest is on
 * one side only.
 */
export function compare(
  web: Capture,
  native: Capture,
  { tolerance = TOLERANCE, exceptions = EXCEPTIONS, fieldGap }: CompareOptions = {},
): Comparison {
  const screen = web.screen
  const leftWeb = new Set(web.nodes.map((_, i) => i))
  const leftNative = new Set(native.nodes.map((_, i) => i))
  type Pair = { w: LayoutNode; n: LayoutNode; as: 'same' | 'text' | 'kind' }
  const pairs: Pair[] = []

  const pairUp = (
    candidates: { i: number; j: number; d: number }[],
    as: (a: LayoutNode, b: LayoutNode) => Pair['as'],
  ) => {
    candidates.sort((p, q) => p.d - q.d)
    for (const { i, j } of candidates) {
      if (!leftWeb.has(i) || !leftNative.has(j)) continue
      leftWeb.delete(i)
      leftNative.delete(j)
      const a = web.nodes[i] as LayoutNode
      const b = native.nodes[j] as LayoutNode
      pairs.push({ w: a, n: b, as: as(a, b) })
    }
  }
  const byName = (fits: (a: Kind, b: Kind) => boolean) => {
    const found: { i: number; j: number; d: number }[] = []
    for (const i of leftWeb)
      for (const j of leftNative) {
        const a = web.nodes[i] as LayoutNode
        const b = native.nodes[j] as LayoutNode
        if (a.name && a.name === b.name && fits(a.kind, b.kind))
          found.push({ i, j, d: centreDistance(a.box, b.box) + (a.kind === b.kind ? 0 : 0.5) })
      }
    return found
  }

  // by name, with a kind that fits
  pairUp(byName(compatible), () => 'same')
  // by name, with a kind that doesn't: a control that lost its role
  pairUp(
    byName((a, b) => !compatible(a, b)),
    () => 'kind',
  )
  // by place: one kind, overlapping by half or more, most overlap first
  const byPlace: { i: number; j: number; d: number }[] = []
  for (const i of leftWeb)
    for (const j of leftNative) {
      const a = web.nodes[i] as LayoutNode
      const b = native.nodes[j] as LayoutNode
      const o = a.kind === b.kind ? overlap(a.box, b.box) : 0
      if (o >= 0.5) byPlace.push({ i, j, d: -o })
    }
  pairUp(byPlace, (a, b) => (a.name === b.name ? 'same' : 'text'))

  const raw: Finding[] = []
  let same = 0
  for (const p of pairs) {
    const delta = deltaOf(p.w.box, p.n.box)
    if (p.as === 'text') raw.push({ type: 'text', web: p.w, native: p.n, delta })
    else if (p.as === 'kind') raw.push({ type: 'kind', web: p.w, native: p.n, delta })
    else if (beyond(delta, tolerance, p.w))
      raw.push({ type: 'moved', web: p.w, native: p.n, delta })
    else same++
  }
  for (const i of leftWeb) raw.push({ type: 'only-web', node: web.nodes[i] as LayoutNode })
  for (const j of leftNative) raw.push({ type: 'only-native', node: native.nodes[j] as LayoutNode })

  const pairedFields = new Set(
    pairs.filter((p) => p.w.kind === 'field' && p.n.kind === 'field').map((p) => p.w),
  )
  const findings: Finding[] = []
  const excused: Excused[] = []
  for (const f of raw) {
    if (
      f.type === 'only-web' &&
      fieldGap !== undefined &&
      isFieldLabel(f.node, web.nodes, pairedFields, fieldGap, tolerance)
    ) {
      excused.push({ finding: f, reason: FIELD_LABEL })
      continue
    }
    if (f.type === 'only-web') {
      const n = f.node
      const reason =
        n.kind === 'group' &&
        ['list', 'region', 'group'].includes(n.raw) &&
        pairs.some((p) => p.w !== n && inside(p.w.box, n.box))
          ? CONTAINER
          : n.kind === 'text' &&
              pairs.some(
                (p) =>
                  inside(n.box, p.w.box) &&
                  ((p.w.kind === 'field' && p.n.kind === 'field') ||
                    ` ${p.n.says ?? ''} `.includes(` ${n.name} `)),
              )
            ? FIELD_WORDS
            : n.kind !== 'group' &&
                pairs.some(
                  (p) =>
                    p.as === 'same' &&
                    p.w !== n &&
                    p.w.kind !== 'group' &&
                    p.w.name !== n.name &&
                    ` ${p.w.name} `.includes(` ${n.name} `) &&
                    inside(n.box, p.w.box),
                )
              ? IN_STOP
              : undefined
      if (reason) {
        excused.push({ finding: f, reason })
        continue
      }
    }
    const e = excuse(f, screen, exceptions)
    // an excused text that also moved still counts as moved
    if (e && f.type === 'text' && beyond(f.delta, tolerance, f.web))
      findings.push({ type: 'moved', web: f.web, native: f.native, delta: f.delta })
    else if (e) excused.push({ finding: f, reason: e.reason })
    else findings.push(f)
  }
  findings.sort((a, b) => topOf(a) - topOf(b))

  const counts = new Map<string, { dx: number; dy: number; count: number }>()
  for (const f of findings) {
    if (f.type !== 'moved') continue
    const dx = Math.round(f.delta.dx)
    const dy = Math.round(f.delta.dy)
    const k = `${dx},${dy}`
    const c = counts.get(k) ?? { dx, dy, count: 0 }
    c.count++
    counts.set(k, c)
  }

  return {
    screen,
    web: web.target,
    native: native.target,
    matched: pairs.filter((p) => p.as === 'same').length,
    same,
    findings,
    excused,
    shifts: [...counts.values()].sort((a, b) => b.count - a.count),
    pass: findings.length === 0,
  }
}

const topOf = (f: Finding) =>
  f.type === 'only-web' || f.type === 'only-native' ? f.node.box.y : f.web.box.y

const r1 = (n: number) => Math.round(n * 10) / 10
const boxText = (b: Box) => `${r1(b.x)},${r1(b.y)} ${r1(b.w)}×${r1(b.h)}`
const signed = (n: number) => (n > 0 ? `+${r1(n)}` : `${r1(n)}`)

/** A finding in one line, for the report and the sheet. */
export function describe(f: Finding): string {
  switch (f.type) {
    case 'moved': {
      const d = f.delta
      const parts = [
        Math.abs(d.dx) > 0.05 ? `x ${signed(d.dx)}` : '',
        Math.abs(d.dy) > 0.05 ? `y ${signed(d.dy)}` : '',
        Math.abs(d.dw) > 0.05 ? `w ${signed(d.dw)}` : '',
        Math.abs(d.dh) > 0.05 ? `h ${signed(d.dh)}` : '',
      ].filter(Boolean)
      return `${f.web.kind} “${f.web.name}”: ${parts.join(', ')} (web ${boxText(f.web.box)}, device ${boxText(f.native.box)})`
    }
    case 'text':
      return `${f.web.kind} differs: web “${f.web.name}”, device “${f.native.name}” (web ${boxText(f.web.box)}, device ${boxText(f.native.box)})`
    case 'kind':
      return `kind differs: “${f.web.name}” is ${f.web.kind} (${f.web.raw}) on the web, ${f.native.kind} (${f.native.raw}) on the device (web ${boxText(f.web.box)}, device ${boxText(f.native.box)})`
    case 'only-web':
      return `only on the web: ${f.node.kind} (${f.node.raw}) “${f.node.name}” at ${boxText(f.node.box)}`
    case 'only-native':
      return `only on the device: ${f.node.kind} (${f.node.raw}) “${f.node.name}” at ${boxText(f.node.box)}`
  }
}

// ---------------------------------------------------------------- what a run must have (pure)

/**
 * The screens, in the order the steps reach them: part A's (Choose a server, the sign-in, the
 * shell on Home, Settings) and B1's destinations between the shell and Settings, each opened by
 * its address (ROUTES).
 */
export const SCREENS = [
  'connect',
  'sign-in',
  'shell',
  'movies',
  'collections',
  'collection',
  'film',
  'person',
  'search',
  'search-results',
  'search-none',
  'alerts',
  'settings',
] as const
export type Screen = (typeof SCREENS)[number]

/**
 * B1's destinations by their address in apps/client's route tree (`src/app/(in)/`), with the
 * mock's seeded ids that have every part a screen draws (packages/mock's SEED: Tears of Steel,
 * Buster Keaton and the Caminandes Collection, by the contract's ids, which the routes take).
 * Each is opened as a link: on the web by the address, on the devices by the client's URL scheme
 * (XCUIApplication.open). On touch, Movies and Collections are the Library tab's two views
 * (`/movies` goes to `/library`, `/collections` to `/library?view=collections`).
 */
export const ROUTES: Partial<Record<Screen, string>> = {
  movies: '/movies',
  collections: '/collections',
  collection: `/collections/${SEED.collection.id}`,
  film: `/movies/${SEED.film.id}`,
  person: `/people/${SEED.person.id}`,
  search: '/search',
  'search-results': '/search?q=tears',
  'search-none': '/search?q=qxzv',
  alerts: '/alerts',
}

/**
 * Whether a screen is one this form factor has. Alerts is a page only on the TV: with a pointer
 * it's the bell's popover and the phone has none, so `/alerts` goes Home there.
 */
export const appliesTo = (screen: Screen, t: Target) => screen !== 'alerts' || tvLike(t)

/** What a run is asked to capture: `web`, `phone` (the iPhone) and `tv` (the Apple TV). */
export const TARGET_FLAGS = ['web', 'phone', 'tv'] as const
export type TargetFlag = (typeof TARGET_FLAGS)[number]

/** The captures each flag makes. */
export const CAPTURES_OF: Record<TargetFlag, Target[]> = {
  web: ['compact-touch', 'regular-pointer', 'tv'],
  phone: ['iphone'],
  tv: ['appletv'],
}

/** The pairs compared: the web's form factor and the device that has it. */
export const PAIRS = [
  { web: 'compact-touch', native: 'iphone', flag: 'phone', input: 'touch' },
  { web: 'tv', native: 'appletv', flag: 'tv', input: 'tv' },
] as const

/**
 * Each capture's size: the web's viewports, and the devices' windows in points, which must match
 * the web's so the two compare 1:1 (an iPhone 17 Pro, and an Apple TV at 1080p).
 */
export const SIZES: Record<Target, { width: number; height: number }> = {
  'compact-touch': { width: 402, height: 874 },
  'regular-pointer': { width: 1440, height: 900 },
  tv: { width: TV_REFERENCE.width, height: TV_REFERENCE.height },
  iphone: { width: 402, height: 874 },
  appletv: { width: TV_REFERENCE.width, height: TV_REFERENCE.height },
}

const touchLike = (t: Target) => t === 'compact-touch' || t === 'iphone'
const tvLike = (t: Target) => t === 'tv' || t === 'appletv'

/** A node a screen must hold: one of these kinds, with a name that matches. */
export type Anchor = { kinds: Kind[]; name: RegExp; says: string }

/** Search's field: an input on touch and with a pointer, the TV's typed line read as one view. */
const SEARCH_FIELD: Anchor = {
  kinds: ['field', 'other'],
  name: /^search titles genres and people$/,
  says: 'the search field',
}

/**
 * The nodes each screen must hold, every one of them, so a capture of the wrong screen (or none)
 * can't pass. Each is something only that screen has; the devices' runs wait for the same names
 * before they capture (Layout.swift's STEPS).
 */
export const ANCHORS: Record<Screen, (t: Target) => Anchor[]> = {
  connect: () => [{ kinds: ['action'], name: /^harbor\b/, says: 'Harbor’s row' }],
  'sign-in': (t) => [
    tvLike(t)
      ? { kinds: ['text'], name: /^sign in with your phone$/, says: 'Sign in with your phone' }
      : { kinds: ['field'], name: /^password$/, says: 'the Password field' },
  ],
  shell: (t) => [
    touchLike(t)
      ? { kinds: ['action', 'other'], name: /^you$/, says: 'the You tab' }
      : { kinds: ['action', 'other'], name: / settings$/, says: 'the account’s settings stop' },
    { kinds: ['text'], name: /^staff picks by ines$/, says: 'Home’s Staff picks' },
  ],
  movies: (t) => [
    touchLike(t)
      ? { kinds: ['text'], name: /^\d+ of \d+ movies$/, says: 'Library’s count of movies' }
      : tvLike(t)
        ? { kinds: ['action'], name: /^a z$/, says: 'the A–Z sort' }
        : { kinds: ['text'], name: /^\d+ movies$/, says: 'Movies’ count' },
    { kinds: ['action'], name: /^tears of steel 2012$/, says: 'Tears of Steel’s poster' },
  ],
  collections: (t) => [
    tvLike(t)
      ? { kinds: ['text'], name: /^collections$/, says: 'the Collections title' }
      : { kinds: ['text'], name: /^\d+ collections$/, says: 'the count of collections' },
    { kinds: ['action'], name: /^caminandes collection\b/, says: 'the Caminandes Collection' },
  ],
  collection: () => [
    { kinds: ['text'], name: /^caminandes collection$/, says: 'the collection’s title' },
    { kinds: ['text'], name: /^\d+ movies here\b/, says: 'how many of its films are here' },
  ],
  film: () => [
    { kinds: ['text'], name: /^tears of steel$/, says: 'the film’s title' },
    { kinds: ['text'], name: /^cast and crew$/, says: 'Cast and crew' },
  ],
  person: () => [
    { kinds: ['text'], name: /^buster keaton$/, says: 'the person’s name' },
    { kinds: ['text'], name: /^born 4 october 1895\b/, says: 'when they were born' },
  ],
  search: () => [
    SEARCH_FIELD,
    { kinds: ['action'], name: /^fritz lang$/, says: 'the quick picks' },
  ],
  'search-results': () => [
    SEARCH_FIELD,
    { kinds: ['action'], name: /^tears of steel 2012$/, says: 'Tears of Steel among the results' },
  ],
  'search-none': () => [
    SEARCH_FIELD,
    { kinds: ['text'], name: /^nothing on harbor matches qxzv\b/, says: 'that nothing matched' },
  ],
  alerts: () => [
    { kinds: ['text'], name: /^alerts$/, says: 'the Alerts title' },
    { kinds: ['text'], name: /^harbor has a new remote address\b/, says: 'an announcement' },
  ],
  settings: () => [{ kinds: ['text'], name: /^settings$/, says: 'the Settings title' }],
}

/** Whether a capture's nodes hold every anchor; the ones missing, in words. */
export const missingAnchors = (screen: Screen, t: Target, nodes: LayoutNode[]) =>
  ANCHORS[screen](t).filter(
    (a) => !nodes.some((n) => a.kinds.includes(n.kind) && a.name.test(n.name)),
  )

/** The control spec's gap between a field's label and the field, in points at the reference. */
export const fieldGapFor = (input: 'touch' | 'tv') =>
  input === 'tv'
    ? controlMetrics('tv').gap * (TV_REFERENCE.width / 100)
    : controlMetrics('touch').gap

export type Plan = { screens: Screen[]; targets: TargetFlag[] }

const keyOf = (target: Target, screen: string) => `${target}:${screen}`

/**
 * What a run found: every capture asked for is there, has nodes, holds its anchor and has its
 * device's size, and each pair with both sides is compared. A run that asked for a pair and
 * compared nothing fails; one that only captures (the web alone, say) doesn't.
 */
export function assess(
  plan: Plan,
  captures: Capture[],
  options: CompareOptions = {},
): { comparisons: Comparison[]; problems: string[] } {
  const problems: string[] = []
  const byKey = new Map(captures.map((c) => [keyOf(c.target, c.screen), c]))
  const usable = new Set<string>()
  for (const flag of plan.targets)
    for (const target of CAPTURES_OF[flag])
      for (const screen of plan.screens) {
        if (!appliesTo(screen, target)) continue
        const c = byKey.get(keyOf(target, screen))
        if (!c) {
          problems.push(`${target} ${screen}: not captured`)
          continue
        }
        if (c.nodes.length === 0) {
          problems.push(`${target} ${screen}: the capture has no nodes`)
          continue
        }
        const size = SIZES[target]
        if (Math.abs(c.width - size.width) > 0.5 || Math.abs(c.height - size.height) > 0.5) {
          problems.push(
            `${target} ${screen}: ${c.width} × ${c.height}, not the ${size.width} × ${size.height} it's compared at`,
          )
          continue
        }
        const missing = missingAnchors(screen, target, c.nodes)
        if (missing.length) {
          problems.push(
            `${target} ${screen}: ${missing.map((a) => a.says).join(' and ')} isn't there, so it's another screen`,
          )
          continue
        }
        usable.add(keyOf(target, screen))
      }

  const comparisons: Comparison[] = []
  const wanted = PAIRS.filter((p) => plan.targets.includes('web') && plan.targets.includes(p.flag))
  for (const screen of plan.screens)
    for (const p of wanted) {
      if (!appliesTo(screen, p.web)) continue
      const web = byKey.get(keyOf(p.web, screen))
      const device = byKey.get(keyOf(p.native, screen))
      if (
        !web ||
        !device ||
        !usable.has(keyOf(p.web, screen)) ||
        !usable.has(keyOf(p.native, screen))
      )
        continue
      comparisons.push(compare(web, device, { fieldGap: fieldGapFor(p.input), ...options }))
    }
  // a pair that none of the screens asked for has (Alerts, asked of the phone) has nothing to compare
  const comparable = wanted.some((p) => plan.screens.some((s) => appliesTo(s, p.web)))
  if (comparable && comparisons.length === 0)
    problems.push('nothing was compared: no pair had both sides captured and usable')
  return { comparisons, problems }
}

/** The command line, checked: unknown targets, unknown screens, repeats and their order fail. */
export function parseArgs(args: string[]): {
  folder?: string
  preflight: boolean
  plan: Plan
} {
  const VALUE_FLAGS = new Set(['--targets', '--screens'])
  const known = new Set([...VALUE_FLAGS, '--preflight'])
  for (const a of args)
    if (a.startsWith('--') && !known.has(a)) throw new Error(`${a} isn't an option of layout.ts`)
  const value = (name: string) => {
    const i = args.indexOf(name)
    if (i < 0) return undefined
    const v = args[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`)
    return v
  }
  const positional = args.filter(
    (a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1] ?? ''),
  )
  if (positional.length > 1) throw new Error(`one folder at most, not ${positional.join(' ')}`)
  const preflight = args.includes('--preflight')

  const targets = (value('--targets') ?? TARGET_FLAGS.join(',')).split(',')
  for (const t of targets)
    if (!(TARGET_FLAGS as readonly string[]).includes(t))
      throw new Error(`${t} isn't a target: ${TARGET_FLAGS.join(', ')}`)
  if (new Set(targets).size !== targets.length) throw new Error('a target is named twice')

  const asked = value('--screens')
  if (preflight && asked)
    throw new Error('--preflight takes Choose a server only: leave out --screens')
  const screens = preflight ? ['connect'] : (asked?.split(',') ?? [...SCREENS])
  let last = -1
  for (const s of screens) {
    const at = (SCREENS as readonly string[]).indexOf(s)
    if (at < 0) throw new Error(`${s} isn't a screen: ${SCREENS.join(', ')}`)
    if (at <= last)
      throw new Error(`--screens must be in the order the steps reach them: ${SCREENS.join(', ')}`)
    last = at
  }
  return {
    folder: positional[0],
    preflight,
    plan: { screens: screens as Screen[], targets: targets as TargetFlag[] },
  }
}

/** The notes a device run printed (`LAYOUT note: …`), from its output's lines. */
export const notesOf = (target: Target, lines: string[]) =>
  lines
    .filter((l) => l.includes('LAYOUT note: '))
    .map((l) => `${target}: ${l.slice(l.indexOf('LAYOUT note: ') + 13).trim()}`)

// ---------------------------------------------------------------- the run

const TITLES: Record<Screen, string> = {
  connect: 'C1 Choose a server',
  'sign-in': 'C1 Sign in to Harbor',
  shell: 'C2 Home, in the shell',
  movies: 'C3 Movies (the Library tab on the phone)',
  collections: 'C3 Collections (the Library tab’s Collections on the phone)',
  collection: 'A collection: the Caminandes Collection',
  film: 'C4 A film: Tears of Steel',
  person: 'A person: Buster Keaton',
  search: 'C6 Search, empty',
  'search-results': 'C6 Search for “tears”',
  'search-none': 'C6 Search with nothing found',
  alerts: 'Alerts (the TV only)',
  settings: 'C7 Settings',
}

/** The button that acknowledges an owner's announcement (announcements.tsx), normalized. */
export const GOT_IT = 'got it'

/** The client's own URL scheme (apps/client's app.config.ts), which the devices' links use. */
export const CLIENT_SCHEME = 'highsea-client'

/**
 * A device's B1 steps for Layout.swift (its STEPS): each screen asked for that the device has, in
 * order, its link in the client's scheme (Expo Router takes `highsea-client://movies/1` as
 * `/movies/1`), and its anchors' patterns, which Layout.swift waits for before it captures.
 */
export const stepsFor = (target: Target, screens: readonly Screen[]) =>
  screens.flatMap((screen) => {
    const route = ROUTES[screen]
    if (!route || !appliesTo(screen, target)) return []
    return [
      {
        screen,
        url: `${CLIENT_SCHEME}://${route.slice(1)}`,
        anchors: ANCHORS[screen](target).map((a) => a.name.source),
      },
    ]
  })

/**
 * The iPhone 17 Pro's safe area in points, which the web's compact-touch emulates so both lay out
 * in the same space: UIKit reports 62 above (the Dynamic Island's status bar) and 34 below (the
 * home indicator) in portrait on this model.
 */
const PHONE_SAFE_AREA = { top: 62, bottom: 34, left: 0, right: 0 }

type WebForm = {
  target: 'compact-touch' | 'regular-pointer' | 'tv'
  /** The prototypes' platform whose frame this form factor is (clientUrl's). */
  platform: 'mobile' | 'web' | 'tv'
  scale: number
  safeArea?: typeof PHONE_SAFE_AREA
}

const WEB_FORMS: WebForm[] = [
  { target: 'compact-touch', platform: 'mobile', scale: 3, safeArea: PHONE_SAFE_AREA },
  { target: 'regular-pointer', platform: 'web', scale: 1 },
  { target: 'tv', platform: 'tv', scale: 1 },
]

const BUNDLES = { iphone: 'tv.highsea.client.mobile', appletv: 'tv.highsea.client.tv' } as const

/** A device run is stopped after ten minutes: part A's four screens and B1's nine take a few. */
const DEVICE_TIMEOUT = 10 * 60 * 1000

/** The node extraction, run in the page: role, name and box of each node the tree would have. */
function extractWeb(): WebRaw[] {
  const IMPLICIT: Record<string, string> = {
    BUTTON: 'button',
    TEXTAREA: 'textbox',
    SELECT: 'combobox',
    IMG: 'img',
    H1: 'heading',
    H2: 'heading',
    H3: 'heading',
    H4: 'heading',
    H5: 'heading',
    H6: 'heading',
  }
  // read as one: their children are part of their name, as on iOS
  const LEAF = new Set([
    'button',
    'link',
    'tab',
    'menuitem',
    'menuitemradio',
    'menuitemcheckbox',
    'option',
    'radio',
    'checkbox',
    'switch',
    'textbox',
    'searchbox',
    'combobox',
    'spinbutton',
    'slider',
    'adjustable',
    'img',
    'image',
    'heading',
  ])
  const out: WebRaw[] = []
  const ownText = (e: Element) =>
    [...e.childNodes].some((c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim())
  const roleOf = (e: Element): string => {
    const r = e.getAttribute('role')
    if (r) return r
    if (e.tagName === 'INPUT') {
      const t = (e as HTMLInputElement).type
      return t === 'checkbox'
        ? 'checkbox'
        : t === 'radio'
          ? 'radio'
          : t === 'range'
            ? 'slider'
            : 'textbox'
    }
    if (e.tagName === 'A' && e.hasAttribute('href')) return 'link'
    return IMPLICIT[e.tagName] ?? ''
  }
  const walk = (e: Element) => {
    if (e.getAttribute('aria-hidden') === 'true') return
    if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return
    const role = roleOf(e)
    const label = e.getAttribute('aria-label')
    const b = e.getBoundingClientRect()
    const box = { x: b.left, y: b.top, w: b.width, h: b.height }
    if (role && role !== 'presentation' && role !== 'none' && role !== 'generic') {
      const field = e.tagName === 'INPUT' || e.tagName === 'TEXTAREA'
      const name =
        label ?? (field ? (e as HTMLInputElement).placeholder : (e as HTMLElement).innerText) ?? ''
      out.push({ role, name, ...box })
      if (LEAF.has(role)) return
    } else if (label) {
      out.push({ role: '', name: label, ...box })
    } else if (ownText(e)) {
      // a text and the texts nested in it are one paragraph, as React Native's Text is
      out.push({ role: 'text', name: (e as HTMLElement).innerText, ...box })
      return
    }
    for (const c of e.children) walk(c)
  }
  walk(document.body)
  return out
}

/** A simulator's dump, as Layout.swift writes it. */
type Dump = { screen: string; window: { w: number; h: number }; nodes: XCUIRaw[] }

const html = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

if (import.meta.main) {
  const ROOT = join(import.meta.dir, '..', '..')
  const CLIENT = join(ROOT, 'apps/client')
  const BUILDS = join(tmpdir(), 'highsea-layout-builds')
  const args = process.argv.slice(2)
  const log = (s: string) => console.log(`layout: ${s}`)
  const { booted, runUITest } = await import('./tv-uitest.ts')

  if (args[0] === 'build') {
    const which = args[1] ?? 'both'
    if (!['phone', 'tv', 'both'].includes(which) || args.length > 2) {
      console.error('layout.ts build [phone|tv|both]')
      process.exit(2)
    }
    // one build at a time holds apps/client/ios (see the header)
    const lock = join(tmpdir(), 'highsea-client-ios.lock')
    if (existsSync(lock)) {
      const pid = Number(readFileSync(lock, 'utf8'))
      let alive = false
      try {
        process.kill(pid, 0)
        alive = true
      } catch {
        // a lock left by a run that's gone
      }
      if (alive) {
        console.error(`layout: another build (pid ${pid}) holds apps/client/ios: ${lock}`)
        process.exit(1)
      }
    }
    writeFileSync(lock, String(process.pid))
    const env = {
      ...process.env,
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      EXPO_PUBLIC_HIGHSEA_MOCK: '1',
    }
    const prebuild = (tv: boolean) => {
      log(`prebuild for the ${tv ? 'Apple TV' : 'iPhone'}`)
      execFileSync('bun', ['run', tv ? 'prebuild:tv' : 'prebuild'], {
        cwd: CLIENT,
        stdio: 'inherit',
        env: tv ? { ...env, EXPO_TV: '1' } : env,
      })
    }
    const build = (tv: boolean) => {
      const out = join(BUILDS, tv ? 'appletv' : 'iphone')
      const sdk = tv ? 'appletvsimulator' : 'iphonesimulator'
      log(`Release mock-mode build for ${sdk} into ${out}`)
      execFileSync(
        'xcodebuild',
        [
          '-workspace',
          'highsea.xcworkspace',
          '-scheme',
          'highsea',
          '-configuration',
          'Release',
          '-sdk',
          sdk,
          '-derivedDataPath',
          out,
          'CODE_SIGN_IDENTITY=-',
          'CODE_SIGNING_REQUIRED=NO',
          '-quiet',
          'build',
        ],
        { cwd: join(CLIENT, 'ios'), stdio: 'inherit', env },
      )
      const app = join(out, `Build/Products/Release-${sdk}/highsea.app`)
      const udid = tv ? booted('tvOS', 'TV_SIMULATOR') : booted('iOS', 'PHONE_SIMULATOR')
      execFileSync('xcrun', ['simctl', 'install', udid, app], { stdio: 'inherit' })
      log(`installed ${app} on ${udid}`)
    }
    try {
      if (which === 'tv' || which === 'both') {
        try {
          prebuild(true)
          build(true)
        } finally {
          // the phone's prebuild back, so apps/client/ios is the phone's even when the TV's failed
          prebuild(false)
        }
      } else prebuild(false)
      if (which === 'phone' || which === 'both') build(false)
    } finally {
      rmSync(lock, { force: true })
    }
    process.exit(0)
  }

  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs(args)
  } catch (e) {
    console.error(`layout: ${(e as Error).message}`)
    process.exit(2)
  }
  const { plan } = parsed
  const { screens } = plan
  const out = parsed.folder ?? mkdtempSync(join(tmpdir(), 'highsea-layout-'))
  mkdirSync(out, { recursive: true })
  log(`writing to ${out}`)

  const captures: Capture[] = []
  const runProblems: string[] = []
  const notes: string[] = []

  // ---- the web, from one build of the prototypes
  if (plan.targets.includes('web')) {
    const { servePrototypes, clientUrl, launch, settle, settleAnimations } = await import(
      './lib.ts'
    )
    // one export for the whole run: made here, then held (HIGHSEA_CLIENT_EXPORT=0, client-export.ts),
    // so an edit to the client while the run builds can't make the preview export again past
    // servePrototypes' wait
    const { ensureClientExport } = await import('../../design/prototypes/client-export.ts')
    if (!ensureClientExport((m) => log(m))) throw new Error('apps/client’s mock web export failed')
    process.env.HIGHSEA_CLIENT_EXPORT = '0'
    const stop = await servePrototypes()
    const browser = await launch()
    try {
      for (const form of WEB_FORMS) {
        const viewport = SIZES[form.target]
        const context = await browser.newContext({
          viewport,
          deviceScaleFactor: form.scale,
          hasTouch: form.target === 'compact-touch',
        })
        const page = await context.newPage()
        if (form.safeArea) {
          // https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setSafeAreaInsetsOverride
          const cdp = await context.newCDPSession(page)
          await cdp.send(
            'Emulation.setSafeAreaInsetsOverride' as never,
            {
              insets: form.safeArea,
            } as never,
          )
        }
        // waits for the page to stop changing (lib.ts's settle: no DOM change for 600 ms, its
        // longer quiet for the shell's data) and for its animations to end, then reads the tree
        // a screen whose anchors take a while (a page's data) is waited for, up to 30 seconds
        const take = async (screen: Screen) => {
          let nodes: LayoutNode[] = []
          const until = Date.now() + 30_000
          for (;;) {
            await settle(page, { quiet: 600, max: 4000 })
            await settleAnimations(page)
            nodes = fromWeb(await page.evaluate(extractWeb))
            // an owner's announcement that came late, over a destination: Got it, as above
            if (
              ROUTES[screen] &&
              Date.now() < until &&
              nodes.some((n) => n.kind === 'action' && n.name === GOT_IT)
            ) {
              await page.getByRole('button', { name: 'Got it', exact: true }).first().click()
              log(`${form.target} ${screen}: acknowledged the owner’s announcement`)
              continue
            }
            if (!missingAnchors(screen, form.target, nodes).length || Date.now() > until) break
            await page.waitForTimeout(500)
          }
          captures.push({ target: form.target, screen, ...SIZES[form.target], nodes })
          await page.screenshot({ path: join(out, `${form.target}.${screen}.png`) })
          log(`${form.target} ${screen}: ${nodes.length} nodes`)
        }
        try {
          const want = new Set(screens)
          const last = screens[screens.length - 1] as Screen
          await page.goto(clientUrl(`/${form.platform}/connect`, form.platform))
          // discovery has finished when Looking… turns into Look again on the phone and with a
          // pointer, and into the count of servers that answered on the TV, whose Look again is
          // always there (apps/client's connect.tsx); Layout.swift waits for the same
          await (form.target === 'tv'
            ? page.getByText(/^\d+ answered\. /)
            : page.getByRole('button', { name: 'Look again' })
          )
            .first()
            .waitFor({ timeout: 30_000 })
          const harbor = page.getByRole('button', { name: /^Harbor/ }).first()
          if (want.has('connect')) await take('connect')
          if (last === 'connect') continue
          await harbor.click()
          const tv = form.target === 'tv'
          const signIn = tv
            ? page.getByText('Sign in with your phone', { exact: true })
            : page.locator('input[type=password]')
          await signIn.first().waitFor({ timeout: 20_000 })
          if (want.has('sign-in')) await take('sign-in')
          if (last === 'sign-in') continue
          if (!tv) {
            await page.getByRole('textbox', { name: 'Username' }).fill('theo')
            await page.locator('input[type=password]').fill('theo theo theo')
            await page.getByRole('button', { name: 'Sign in', exact: true }).click()
          }
          const settings =
            form.target === 'compact-touch'
              ? page.locator('[role=tab][aria-label="You"]')
              : page.locator('[aria-label$=", settings"]')
          // the TV's code is approved by the mock after 8 seconds (PAIRING_APPROVAL_MS)
          const gotIt = page.getByRole('button', { name: 'Got it', exact: true }).first()
          await settings.first().or(gotIt).first().waitFor({ timeout: 40_000 })
          // the owner's announcement that must be acknowledged (seed.ts's an-new-address) comes
          // over the shell once its list has loaded, and on the TV hides it: Got it, as
          // Layout.swift does, so Home and the destinations are captured as they are under it
          if (
            await gotIt.waitFor({ timeout: 8_000 }).then(
              () => true,
              () => false,
            )
          ) {
            await gotIt.click()
            log(`${form.target}: acknowledged the owner’s announcement`)
          }
          await settings.first().waitFor({ timeout: 20_000 })
          if (want.has('shell')) await take('shell')
          if (last === 'shell') continue
          // B1's destinations, each opened by its address inside the running client, as a link
          // opens one on the devices: pushed onto the history with a popstate, which React
          // Navigation's web linking follows (https://reactnavigation.org/docs/web-support/). A
          // page load would start the mock again, with its own person signed in rather than Theo
          for (const screen of SCREENS) {
            const route = ROUTES[screen]
            if (!route || !want.has(screen) || !appliesTo(screen, form.target)) continue
            await page.evaluate((path) => {
              history.pushState(null, '', path)
              dispatchEvent(new PopStateEvent('popstate', { state: null }))
            }, `/web${route}`)
            await take(screen)
          }
          if (last !== 'settings') continue
          await settings.first().waitFor({ timeout: 20_000 })
          await settings.first().click()
          await page.getByText('Settings', { exact: true }).first().waitFor({ timeout: 20_000 })
          if (want.has('settings')) await take('settings')
        } catch (e) {
          runProblems.push(`${form.target}: the steps stopped early: ${String(e).split('\n')[0]}`)
        } finally {
          await context.close()
        }
      }
    } finally {
      await browser.close()
      // the preview may already have gone (ESRCH from its group's kill): nothing left to stop
      try {
        stop()
      } catch {}
    }
  }

  // ---- the iPhone and the Apple TV, through Layout.swift
  const devices = [
    {
      flag: 'phone',
      target: 'iphone',
      runtime: 'iOS',
      variable: 'PHONE_SIMULATOR',
      scheme: 'LayoutPhone',
    },
    {
      flag: 'tv',
      target: 'appletv',
      runtime: 'tvOS',
      variable: 'TV_SIMULATOR',
      scheme: 'LayoutTV',
    },
  ] as const
  for (const d of devices) {
    if (!plan.targets.includes(d.flag)) continue
    const udid = booted(d.runtime, d.variable)
    const bundle = BUNDLES[d.target]
    let data: string
    try {
      data = execFileSync('xcrun', ['simctl', 'get_app_container', udid, bundle, 'data'], {
        encoding: 'utf8',
      }).trim()
    } catch {
      runProblems.push(`${d.target}: ${bundle} isn't installed on ${udid}: run \`layout.ts build\``)
      continue
    }
    // the servers it knows, so it opens on Choose a server (@highsea-tv/native's server-store)
    try {
      execFileSync('xcrun', ['simctl', 'terminate', udid, bundle], { stdio: 'ignore' })
    } catch {
      // it wasn't running
    }
    rmSync(join(data, 'Documents/servers.json'), { force: true })
    const shots = mkdtempSync(join(tmpdir(), `highsea-layout-${d.target}-`))
    log(`${d.target}: the XCUITest on ${udid}`)
    const run = await runUITest(
      udid,
      'testCapture',
      {
        SHOTS: shots,
        SCREENS: screens.join(','),
        STEPS: JSON.stringify(stepsFor(d.target, screens)),
      },
      {
        dir: 'apps/client/uitest',
        project: 'LayoutCapture',
        scheme: d.scheme,
        testClass: 'Layout',
        prefix: 'LAYOUT ',
        timeout: DEVICE_TIMEOUT,
      },
    )
    notes.push(...notesOf(d.target, run.lines))
    if (run.timedOut) runProblems.push(`${d.target}: the capture was stopped after ten minutes`)
    else if (!run.passed) runProblems.push(`${d.target}: the capture failed (its output is above)`)
    for (const screen of screens) {
      const file = join(shots, `${screen}.json`)
      if (!existsSync(file)) continue
      const dump = JSON.parse(readFileSync(file, 'utf8')) as Dump
      captures.push({
        target: d.target,
        screen,
        width: dump.window.w,
        height: dump.window.h,
        nodes: fromXCUI(dump.nodes),
      })
      cpSync(join(shots, `${screen}.png`), join(out, `${d.target}.${screen}.png`))
      cpSync(file, join(out, `${d.target}.${screen}.json`))
    }
    rmSync(shots, { recursive: true, force: true })
  }

  // ---- the checks
  const { comparisons, problems: found } = assess(plan, captures)
  const problems = [...runProblems, ...found]
  for (const c of comparisons)
    log(
      `${c.screen}, ${c.web} against ${c.native}: ${c.matched} matched, ${c.same} the same, ${c.findings.length} differences, ${c.excused.length} excused`,
    )

  writeFileSync(
    join(out, 'results.json'),
    JSON.stringify({ plan, captures, comparisons, notes, problems }, null, 2),
  )
  writeSheet(out, screens, captures, comparisons, notes, problems)

  const failed = comparisons.filter((c) => !c.pass)
  console.log(
    `\n${comparisons.length} pairs compared, ${failed.length} differ; the sheet is ${join(out, 'index.html')}`,
  )
  for (const c of failed) {
    console.log(`✗ ${c.screen}, ${c.web} against ${c.native}:`)
    for (const f of c.findings.slice(0, 12)) console.log(`  ${describe(f)}`)
    if (c.findings.length > 12) console.log(`  … and ${c.findings.length - 12} more (checklist.md)`)
  }
  for (const n of notes) console.log(`note: ${n}`)
  for (const p of problems) console.error(`✗ ${p}`)
  if (failed.length || problems.length) process.exit(1)
}

/** index.html with every image inline, and checklist.md, in the screens' order. */
function writeSheet(
  out: string,
  screens: Screen[],
  captures: Capture[],
  comparisons: Comparison[],
  notes: string[],
  problems: string[],
) {
  const shot = (name: string) => {
    const file = join(out, `${name}.png`)
    return existsSync(file)
      ? `data:image/png;base64,${readFileSync(file).toString('base64')}`
      : null
  }
  const fig = (label: string, name: string) => {
    const src = shot(name)
    return `<figure><figcaption>${html(label)}</figcaption>${src ? `<img src="${src}" alt="${html(label)}">` : '<div class="none">Not captured</div>'}</figure>`
  }
  const rule = `x and y within ${TOLERANCE} points, width and height within ${TOLERANCE} points${
    TEXT_SHAPING ? ` (a text's within ${TEXT_SHAPING * 100}% of itself when that's more)` : ''
  }`
  const findingList = (c: Comparison | undefined) => {
    if (!c) return '<p class="note">Not compared: a side wasn’t captured, or wasn’t usable.</p>'
    const head = `<p class="${c.pass ? 'ok' : 'bad'}">${c.pass ? 'The same' : `${c.findings.length} differences`}: ${c.matched} nodes matched, ${c.same} within tolerance, ${c.excused.length} excused.${
      c.shifts.length
        ? ` Shared shifts: ${c.shifts
            .slice(0, 3)
            .map((s) => `${s.count} × (x ${s.dx}, y ${s.dy})`)
            .join('; ')}.`
        : ''
    }</p>`
    const items = c.findings.map((f) => `<li>${html(describe(f))}</li>`).join('')
    const excused = c.excused
      .map((e) => `<li>${html(describe(e.finding))}: ${html(e.reason)}</li>`)
      .join('')
    return `${head}${items ? `<ul>${items}</ul>` : ''}${excused ? `<details><summary>Excused</summary><ul>${excused}</ul></details>` : ''}`
  }
  const notHere =
    '<p class="note">Not a screen this form factor has (with a pointer Alerts is the bell’s popover, and the phone has none).</p>'
  const find = (screen: string, web: Target) =>
    comparisons.find((c) => c.screen === screen && c.web === web)

  const sections = screens
    .map((screen, i) => {
      const n = String(i + 1).padStart(2, '0')
      return `<section id="s${n}">
<h2>${n} · ${html(TITLES[screen])}</h2>
<h3>The phone</h3>
<div class="row phone">${fig('Web, compact-touch 402 × 874', `compact-touch.${screen}`)}${fig('iPhone 17 Pro simulator', `iphone.${screen}`)}</div>
${appliesTo(screen, 'compact-touch') ? findingList(find(screen, 'compact-touch')) : notHere}
<h3>The TV</h3>
<div class="row wide">${fig('Web, tv 1920 × 1080', `tv.${screen}`)}${fig('Apple TV simulator', `appletv.${screen}`)}</div>
${findingList(find(screen, 'tv'))}
<h3>The web</h3>
${
  appliesTo(screen, 'regular-pointer')
    ? `<div class="row wide one">${fig('Web, regular-pointer 1440 × 900', `regular-pointer.${screen}`)}</div>
<p class="note">No device has this form factor, so it's here to look at, not compared.</p>`
    : notHere
}
</section>`
    })
    .join('\n')

  const list = (items: string[], cls: string) =>
    items.length
      ? `<ul>${items.map((p) => `<li class="${cls}">${html(p)}</li>`).join('')}</ul>`
      : ''

  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The same screen everywhere</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; background: #111; color: #ddd }
  section { margin: 0 0 64px } h2 { margin: 32px 0 4px; font-size: 20px } h3 { margin: 20px 0 4px; font-size: 15px; color: #bbb }
  p { margin: 6px 0 } .note { color: #888 } .ok { color: #7c7 } .bad { color: #e88 }
  .row { display: grid; gap: 12px; margin: 8px 0; align-items: start }
  .phone { grid-template-columns: repeat(2, minmax(0, 402px)) } .wide { grid-template-columns: repeat(2, minmax(0, 1fr)) } .one { grid-template-columns: minmax(0, 1fr) }
  figure { margin: 0 } figcaption { color: #888; font-size: 12px; margin-bottom: 4px }
  img { width: 100%; border: 1px solid #333 } .none { padding: 24px; border: 1px dashed #444; color: #777 }
  li { margin: 2px 0; font-family: ui-monospace, monospace; font-size: 12px }
</style></head><body>
<h1>The same screen everywhere</h1>
<p class="note">Captured ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by <code>scripts/sweeps/layout.ts</code>: apps/client against the mock on the web and the simulators, compared from their accessibility trees in points (${html(rule)}; web on the left of each difference, the device on the right).</p>
${list(problems, 'bad')}
${notes.length ? `<h3>Notes from the device runs</h3>${list(notes, 'note')}` : ''}
${sections}
</body></html>
`,
  )

  const md = [
    '# The same screen everywhere',
    '',
    `Captured ${new Date().toISOString().slice(0, 10)} by \`scripts/sweeps/layout.ts\`. Each pair is compared from the accessibility trees in points: a difference is a matched node outside ${rule}, a control whose kind differs, a text that differs, or a node on one side only. The images are in index.html.`,
    '',
    ...problems.map((p) => `- ✗ ${p}`),
    ...(problems.length ? [''] : []),
    ...(notes.length ? ['Notes from the device runs:', '', ...notes.map((n) => `- ${n}`), ''] : []),
    ...screens.flatMap((screen, i) => {
      const n = String(i + 1).padStart(2, '0')
      return [
        `## ${n} ${TITLES[screen]}`,
        '',
        ...(['compact-touch', 'tv'] as const).flatMap((web) => {
          const c = find(screen, web)
          const native = web === 'tv' ? 'Apple TV' : 'iPhone'
          if (!appliesTo(screen, web))
            return [`- **${web}**: not a screen this form factor has`, '']
          if (!c) return [`- [ ] **${web} against the ${native}**: not compared`, '']
          return [
            `- [ ] **${web} against the ${native}**: ${c.pass ? 'the same' : `${c.findings.length} differences`} (${c.matched} matched, ${c.same} within tolerance, ${c.excused.length} excused)`,
            ...c.findings.map((f) => `  - ${describe(f)}`),
            ...c.excused.map((e) => `  - excused: ${describe(e.finding)}: ${e.reason}`),
            '',
          ]
        }),
        appliesTo(screen, 'regular-pointer')
          ? `- [ ] **regular-pointer**: captured for review, ${captures.find((c) => c.target === 'regular-pointer' && c.screen === screen)?.nodes.length ?? 0} nodes`
          : '- **regular-pointer**: not a screen this form factor has',
        '',
      ]
    }),
  ]
  writeFileSync(join(out, 'checklist.md'), md.join('\n'))
}
