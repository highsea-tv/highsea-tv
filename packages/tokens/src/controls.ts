// SPDX-License-Identifier: AGPL-3.0-only
// The one control spec (docs/design-language/controls.md, design system 1.1). Every button, field,
// select, segmented control, tab, chip, checkbox, radio and switch on every platform takes its
// size, shape and colours from here, through one rule per platform. Nothing else sets them.
import type { ColorRole } from './roles.ts'
import { icon, radius, targets } from './scales.ts'
import { adminText, mobileText, type TextStyle, tvText } from './typography.ts'

/** Where a control is drawn: a mouse or trackpad, a finger, or a remote across the room. */
export type ControlPlatform = 'pointer' | 'touch' | 'tv'
export const CONTROL_PLATFORMS: readonly ControlPlatform[] = ['pointer', 'touch', 'tv']

/** `md` everywhere; `sm` only in dense places (a table's row, a card, a widget's header). */
export type ControlSize = 'md' | 'sm'

/**
 * The geometry, in px at a pointer. `pad` is a button's, a chip's and a segment's side padding;
 * `fieldPad` a field's and a select's; `inset` the gap between a segmented control's track and its
 * thumb.
 */
export const controlGeometry = {
  md: { height: 36, pad: 16, fieldPad: 12, gap: 8, icon: 16, inset: 3 },
  sm: { height: 30, pad: 12, fieldPad: 10, gap: 6, icon: 14, inset: 3 },
} as const satisfies Record<ControlSize, ControlGeometry>

export type ControlGeometry = {
  height: number
  pad: number
  fieldPad: number
  gap: number
  icon: number
  inset: number
}

/** Each control's corner is `radius-sm`, scaled with the rest (spacing-layout.md › Radii). */
export const CONTROL_RADIUS = radius.sm

/** The space between controls in one row, before scaling: wide enough that touch hit areas never overlap. */
export const CONTROL_GAP = targets.touch - controlGeometry.md.height

/** The TV's reference screen, 1080p (tv.md › Units): its 1u is a hundredth of the width. */
export const TV_REFERENCE = { width: 1920, height: 1080 } as const

/** The TV's 1u at its reference width (tv.md › Units). */
const TV_UNIT_AT_REFERENCE = TV_REFERENCE.width / 100

/**
 * One rule per platform:
 * - `scale` multiplies the geometry. A pointer and touch draw it as it is; the TV draws it 1.75 times
 *   larger at 1080p, in screen units, for a couch three metres away;
 * - `text` takes the platform's own type scale: the admin's `form` and `ui`, the phone's `body`
 *   (16, so iOS never zooms into a field), and the TV's `button` and `pill`;
 * - `hit` is the invisible box around each control: 44 on touch (`targets.touch`), so a 36 control
 *   is easy to tap without changing its size or the layout. A pointer's 36 and 30 already pass
 *   WCAG 2.5.8's 24, and the TV has no touch.
 */
export const controlRules = {
  pointer: { unit: 'px', scale: 1, text: { md: adminText.form, sm: adminText.ui }, hit: 0 },
  touch: {
    unit: 'px',
    scale: 1,
    text: { md: mobileText.body, sm: mobileText.body },
    hit: targets.touch,
  },
  tv: {
    unit: 'u',
    scale: 1.75 / TV_UNIT_AT_REFERENCE,
    text: { md: tvText.button, sm: tvText.pill },
    hit: 0,
  },
} as const satisfies Record<
  ControlPlatform,
  { unit: 'px' | 'u'; scale: number; text: Record<ControlSize, TextStyle>; hit: number }
>

/** A control's measurements for a platform: px for a pointer and touch, screen units on the TV. */
export type ControlMetrics = ControlGeometry & {
  radius: number
  rowGap: number
  text: number
  leading: number
  weight: number
  hit: number
  unit: 'px' | 'u'
}

const round = (n: number) => Number(n.toFixed(4))

/** The rule applied: what a control of `size` measures on `platform`. */
export function controlMetrics(
  platform: ControlPlatform,
  size: ControlSize = 'md',
): ControlMetrics {
  const rule = controlRules[platform]
  const g = controlGeometry[size]
  const s = (n: number) => round(n * rule.scale)
  const text = rule.text[size]
  return {
    height: s(g.height),
    pad: s(g.pad),
    fieldPad: s(g.fieldPad),
    gap: s(g.gap),
    // the TV's icons are never under its minimum (iconography.md)
    icon: platform === 'tv' ? Math.max(s(g.icon), icon.sizeTv.min) : s(g.icon),
    inset: s(g.inset),
    radius: s(CONTROL_RADIUS),
    rowGap: s(CONTROL_GAP),
    text: text.size,
    leading: text.leading ?? 1.4,
    weight: text.weight,
    hit: rule.hit,
    unit: rule.unit,
  }
}

// ---- looks: the colour roles each state uses, the same on every platform

/** A look's roles. `fill` and `edge` are absent when the control has none. */
export type ControlLook = {
  fill?: ColorRole
  edge?: ColorRole
  label: ColorRole
  /** 600 for the view's main action and destructive fills, 500 otherwise. */
  weight: 500 | 600
  hover?: { fill?: ColorRole; label?: ColorRole }
}

/**
 * Buttons and icon buttons. `overlay` is for controls over artwork (a film's page, the TV's
 * hero): `text` at a low alpha, so the picture shows through.
 */
export const buttonLooks = {
  primary: { fill: 'accent-fill', label: 'on-accent', weight: 600 },
  secondary: { fill: 's2', edge: 'line-strong', label: 'text', weight: 500, hover: { fill: 's3' } },
  ghost: { label: 'text-2', weight: 500, hover: { fill: 's2', label: 'text' } },
  danger: { fill: 'danger-fill', label: 'on-danger', weight: 600 },
  'danger-ghost': { label: 'danger', weight: 500, hover: { fill: 's2' } },
  overlay: {
    fill: 'control-overlay',
    label: 'text',
    weight: 500,
    hover: { fill: 'control-overlay-hover' },
  },
} as const satisfies Record<string, ControlLook>
export type ButtonVariant = keyof typeof buttonLooks
export const BUTTON_VARIANTS = Object.keys(buttonLooks) as ButtonVariant[]

/**
 * Fields, selects and the choices. A field's edge is what identifies it, so it reaches 3:1
 * (`control-edge`); a chosen segment, tab or chip is `control-selected`, also 3:1 on its track.
 */
export const controlLooks = {
  field: { fill: 's1', edge: 'control-edge', label: 'text', weight: 500 },
  fieldFocused: { fill: 's1', edge: 'focus', label: 'text', weight: 500 },
  fieldInvalid: { fill: 's1', edge: 'danger', label: 'text', weight: 500 },
  placeholder: { label: 'text-3', weight: 500 },
  track: { fill: 's2', label: 'text-2', weight: 500, hover: { label: 'text' } },
  selected: { fill: 'control-selected', label: 'text', weight: 600 },
  chip: { fill: 's2', edge: 'line-strong', label: 'text-2', weight: 500, hover: { label: 'text' } },
  toggleOff: { fill: 'control-edge', label: 'text', weight: 500 },
  toggleOn: { fill: 'accent-fill', label: 'on-accent', weight: 600 },
} as const satisfies Record<string, ControlLook>

/** Disabled controls keep their look at this opacity. */
export const CONTROL_DISABLED_OPACITY = 0.45
/** A pressed control's scale (motion.md); the TV's focus scale is `focus.tv.scaleButton`. */
export const CONTROL_PRESS_SCALE = 0.97

/** The controls the spec covers, by name, in both renderers. */
export const CONTROLS = [
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
] as const
export type ControlName = (typeof CONTROLS)[number]

// ---- the components' own measures (one-client-platform-e.md › The tokens, E1): a measure only
// one component draws, in that component's group, as `density` and `controlGeometry` are. px with a
// pointer and on touch; a `tv` key's are screen units.

/** The account's avatar beside the server's name. */
export const avatar = { size: 36 } as const

/** Badge's status dot and QualityTag's height and icon. */
export const badge = {
  dot: 6,
  dotTv: 0.4,
  iconTv: 0.95,
  tag: { height: 20, heightTv: 1.04 },
} as const

/** A drag handle's square, in SortableList and the widget editor. */
export const dragHandle = 28

/** EmptyState's icon inside its disc, and its words' greatest widths. */
export const emptyState = { icon: 26, words: 320, wordsInline: 440 } as const

/** FeaturedCard's: its words' widths, its title's sizes, the share of a phone it takes, and the TV's in u. */
export const featuredCard = {
  tagline: 480,
  title: { min: 48, max: 88, width: 352 },
  touchShare: 0.78,
  words: 608,
  tv: {
    height: 40.5,
    inset: 2.8,
    lineY: 0.15,
    radius: 1.4,
    skeletonMetaWidth: 16,
    skeletonTitle: 6,
    skeletonTitleWidth: 22,
    words: 34,
  },
} as const

/** FilmRow's on the TV, in u. */
export const filmRow = {
  tv: {
    captionBottom: 1.1,
    skeletonLine: 1,
    skeletonTitle: 1.2,
    skeletonTitleWidth: 12,
    title: 1.6,
    titleLeading: 1.7,
  },
} as const

/** LetterIndex's line. */
export const letterIndex = { leading: 12 } as const

/** The Lockup's sizes: the sidebar's and the guides' (`size`), the sign-in card's, the TV preview's. */
export const lockup = { size: 17, auth: 20, tv: 22 } as const

/** The music player's: the bar's icons and queue, Now Playing's backdrop, and the TV's in u. */
export const musicPlayer = {
  backdropScale: 1.5,
  bar: { icon: 18, skipIcon: 17 },
  queueWidth: 384,
  tv: {
    bars: 1.2,
    bigIcon: 2,
    cover: 24,
    dot: 0.3,
    headCover: 2,
    markWidth: 0.2,
    pausedScale: 0.9,
    play: 5,
    round: 3.6,
    title: 3,
    upNext: 9,
  },
} as const

/** The overlays' widths: the menu, the popover, the tooltip, the toaster and the command palette. */
export const overlay = {
  menu: 224,
  popover: 288,
  tooltip: 256,
  toaster: 420,
  palette: { width: 560, field: 48, list: 360, row: 36 },
} as const

/** The page parts': a named action's width, and the TV's fact label, person's name and photo, in u. */
export const pageParts = {
  namedAction: 80,
  tv: { factLabel: 9, personName: 20, photo: 13 },
} as const

/** The video player's, on a pointer and touch, and the TV's in u. */
export const player = {
  icon: { md: 22, lg: 28, xl: 34, '2xl': 36 },
  menu: { checkTouch: 18, row: 40 },
  message: { maxWidth: 448 },
  panel: { width: 352 },
  pictureIcon: 40,
  round: { md: 56, lg: 72, xl: 80 },
  scrubber: {
    hit: 32,
    preview: 160,
    previewLift: 36,
    thumb: 14,
    thumbActive: 20,
    track: 4,
  },
  subtitle: { gap: 2, size: 17, sizeTv: 1.8 },
  timeMinWidth: 96,
  touch: { subtitleLift: 84 },
  tv: {
    chipY: 0.15,
    fade: 6,
    next: 30,
    nextBottom: 14,
    nextChoices: 46,
    play: 6,
    playIcon: 2.6,
    preview: 14,
    scrubberHit: 1.6,
    thumb: 1.4,
    track: 0.5,
    trackFocused: 0.8,
    upNextStill: 10,
  },
  upNext: { still: 96 },
  volume: { track: 6, width: 80 },
} as const

/** ProgressBar's height, and the panel look's. */
export const progress = { height: 4, panel: 5 } as const

/** Rating's star on the TV, in u. */
export const rating = { starTv: 1.04 } as const

/** The admin's search trigger in the top bar. */
export const searchTrigger = { width: 320 } as const

/** SectionHeading's action's square. */
export const sectionHeading = { action: 28 } as const

/** The server card's mark in the sidebar. */
export const serverCard = { mark: 26 } as const

/** Sheet's header. */
export const sheet = { header: 56 } as const

/** The sidebar item's padding down. */
export const sidebar = { itemY: 7 } as const

/** SortableList's row. */
export const sortableList = { row: 56 } as const

/** Sparkline's height and stroke. */
export const sparkline = { height: 48, stroke: 1.5 } as const

/** The status bar's item basis. */
export const statusBar = { itemBasis: 160 } as const

/** Stepper's disc and row. */
export const stepper = { disc: 22, row: 36 } as const

/** Table's head. */
export const table = { head: 36 } as const

/** Toggle's thumb and track. */
export const toggle = { thumb: 18, track: 40 } as const

/** The TV's acknowledgement card, in u. */
export const tvConfirm = { icon: 1.1, width: 44 } as const

/** The TV's detail page, in u. */
export const tvDetail = { progressLine: 0.3, progressWidth: 11, sideDialog: 32 } as const

/** The TV's menu card, in u. */
export const tvMenu = { column: 30 } as const

/** The TV's message, in u. */
export const tvMessage = { keyDot: 0.5, width: 46 } as const

/** The TV's notice card, in u. */
export const tvNotice = { width: 40 } as const

/** The TV's tiles, in u. */
export const tvTiles = { progress: 0.25, wide: 17 } as const

/** Waveform's shortest bar. */
export const waveform = { barMin: 2 } as const

/** A widget's head, and the resize mark. */
export const widget = { head: 24, resizeMark: 12 } as const

/** The basis a wrapping row's item takes before it wraps (the admin's forms, the status panels). */
export const wrapBasis = 192

/**
 * The admin's screens' own measures (one-client-platform-e.md, answer 9 on E1's values): the few
 * the screens share first, then a key per screen. `skeleton` is the loading states' one scale.
 */
export const admin = {
  measure: 600,
  filterWidth: 192,
  progressWidth: 160,
  selectWidth: 144,
  sideColumn: 208,
  search: { basis: 256, maxWidth: 576 },
  summaryPoster: { above: 128, beside: 144 },
  table: { cellX: 14, checkColumn: 40 },
  skeleton: {
    block: 96,
    card: 128,
    field: 40,
    heading: 28,
    headingLarge: 32,
    item: 64,
    line: 20,
    panel: 160,
    row: 48,
    title: 24,
    width: { sm: 96, md: 160, lg: 192, xl: 256 },
  },
  activity: { blockReasonWidth: 320, reasonWidth: 288 },
  appearance: {
    editorFieldsWidth: 320,
    hexWidth: 128,
    previewMark: 28,
    previewWidth: 256,
    sampleMark: 22,
    /** The least a theme's card takes in its grid: its mark, its name and line, its swatches. */
    themeMin: 192,
    /** The accent offered when a custom accent is turned on: a suggestion, not a theme's colour. */
    suggestedAccent: '#8fbfb7',
  },
  authCard: { cardWidth: 384 },
  collections: { art: 56 },
  collectionsEditor: {
    artwork: { column: 160, poster: 112 },
    cell: 64,
    result: { minWidth: 288, maxWidth: 352 },
  },
  /** The least a connection kind's Add button takes in its grid: its icon and its longest name. */
  connections: { kindMin: 144 },
  collectionsRules: { columns: { field: 192, op: 160 }, matchWidth: 96 },
  curation: { reachWidth: 192, sampleWidth: 36 },
  curationFrame: { maxWidth: 448, panel: 320, spot: { min: 224, max: 320 } },
  curationPreview: { bezel: 12, deviceCorner: 56, platformWidth: 160, screenCorner: 44 },
  curationSection: { thumb: 40, thumbSmall: 32 },
  curationShared: { formWidth: 448 },
  downloads: { categoryWidth: 176, priorityWidth: 160, sheetWidth: 640 },
  general: { keyIdWidth: 192, logLevelWidth: 288 },
  import: { choice: 176, movie: 240, name: 288 },
  indexers: {
    bullet: 20,
    healthWidth: 288,
    languageWidth: 176,
    priorityWidth: 112,
    searchWidth: 256,
  },
  lists: { codeTracking: 2, profileWidth: 224 },
  mediaSections: {
    crewPhoto: { width: 28 },
    posterBlock: 112,
    posterColumn: 160,
    sideColumn: 320,
  },
  movieDetail: { factBasis: 96, labelWidth: 64, languageWidth: 224 },
  nowPlaying: { posterWidth: 64, selectWidth: 176 },
  person: { departmentWidth: 192, libraryColumn: 160 },
  security: { fieldWidth: 192 },
  /**
   * Settings: the least an area's page needs beside the areas' column, so Appearance's identity
   * keeps its fields and preview side by side without breaking a word (the owner's decision of
   * 2026-11-10). Below it, the areas fold into a menu above the page. A component's own measure,
   * not a page width: the window it gives is the sidebar, the padding, the column and this.
   */
  settings: { contentMin: 640 },
  setup: {
    header: 56,
    labelWidth: 160,
    listHeight: 256,
    moreWidth: 224,
    pageWidth: 960,
    portWidth: 112,
    rowHeight: 36,
  },
  shell: { skipLinkOffset: 80 },
  showDetail: {
    monitoredColumn: 56,
    numberColumn: 40,
    searchColumn: 48,
    statusMinWidth: 96,
    titleMaxWidth: 320,
  },
  showsLibrary: { episodesWidth: 144 },
  subtitles: { addWidth: 224, formWidth: 672, leftWidth: 224, ruleWidth: 192, short: 128 },
  system: {
    eventTime: 80,
    levelWidth: 208,
    measure: 800,
    narrow: 640,
    searchWidth: 256,
    stateWidth: 176,
  },
  twoFactor: { qr: 176 },
  users: { toolbarField: 224 },
  vpn: { labelWidth: 128 },
  wanted: { day: { minHeight: 96 }, dot: 10, monthLabel: 160, timeColumn: 56 },
  widgets: {
    calendarCell: 28,
    dot: 6,
    dotSmall: 4,
    graphMin: 48,
    legendSwatch: 8,
    metaMax: 160,
    poster: 32,
    progressColumn: 160,
    speedColumn: 64,
    storageBar: 8,
  },
} as const
