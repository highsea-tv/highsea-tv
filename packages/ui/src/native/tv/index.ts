// SPDX-License-Identifier: AGPL-3.0-only
// The TV's parts of the design system (tv.md), for tvOS now and Android TV in 4.5c: focus stops
// on react-native-tvos's focus engine (the spatial focus engine in a browser, ./engine.web.tsx),
// buttons, keys, chips, tiles and rows, and the layout and remote rules in model.ts.

// the old names of parts now drawn at every form factor, until B2
export * from './aliases.ts'
export * from './cards.tsx'
export * from './controls.tsx'
export * from './detail.tsx'
// the remote's presses on every platform, and the focus guide: a region that remembers the stop
// focused last in it (`autoFocus`), traps focus at its sides (`trapFocus*`) or hands focus arriving
// from outside to its `destinations`, as Search's keyboard does; the rest of the engine pair stays
// inside the parts
export { FocusGuide, type FocusGuideProps, type RemotePress, useRemote } from './engine'
export * from './focusable.tsx'
export * from './head.tsx'
export * from './model.ts'
export * from './page.tsx'
export * from './tiles.tsx'
