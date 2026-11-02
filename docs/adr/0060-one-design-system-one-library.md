# 0060. One design system and one component library, adaptive to the app it's in

- **Status:** Proposed
- **Date:** 2026-11-01

Design system 1.1 ([design-system-1-1.md](../plans/design-system-1-1.md)), approved with the owner's answers of 2026-11-01. It stays Proposed until the owner signs off part C, when every app is on it.

## Context

Measured on 2026-11-01, the apps drew the same controls differently. The web had heights from 24 to 68 and five corners for one kind of control. The TV mixed heights in three rows, and the phone's buttons were 44 while its fields were 38. Each app took sizes from its own numbers, and the two libraries, `@highsea-tv/ui-web` and `@highsea-tv/ui-native`, were kept in step by hand. The theme audit checked text, not the edges and selected states that mark a control, so a custom theme could draw a field nobody can see (WCAG 2.2's 1.4.11 asks 3:1 for both).

The owner's goal is one design system that works with theming, and one shared component library that adapts to the app it's in. Layout and size may differ by platform. Which component draws a control, its props, its states and the roles they use may not.

## Decision

- **One control spec, in the tokens** (`packages/tokens/src/controls.ts`, [controls.md](../design-language/controls.md)):
  - two sizes, `md` (36) and `sm` (30), each with its padding, gap, icon, text and the `radius-sm` corner;
  - each state as colour roles (`buttonLooks`, `controlLooks`), with an `overlay` look for controls over artwork.
- **One rule per platform, not numbers per app** (`controlMetrics`):
  - **pointer:** as specified, with the admin's 14 and 13 text;
  - **touch:** the same drawn sizes with 16 text, plus an invisible 44 hit area (`targets.touch`). The hit area is React Native's `hitSlop` ([Pressable](https://reactnative.dev/docs/pressable#hitslop)) and, on the web, an `::after` box sized by `--control-hit`. Controls in a row are at least 8 apart, so hit areas never overlap ([WCAG 2.2, 2.5.8 Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html));
  - **TV:** 1.75 times the geometry in screen units, with the TV's own type scale and its minimum icon size.
- **The web takes the rule from CSS.** The tokens write `--control-*` for a pointer on `:root`, for touch under `@media (pointer: coarse)` ([Media Queries Level 4, `pointer`](https://www.w3.org/TR/mediaqueries-4/#pointer)), and for any element that sets `data-platform`. The prototypes' phone and TV frames set it, so they draw the library's real components at the phone's and the TV's rules.
- **One package, two renderers.** `@highsea-tv/ui` joins ui-web and ui-native:
  - each component has one props type (`src/shared/controls.ts`), a web renderer (`src/web`, DOM and Tailwind) and a React Native renderer (`src/native`);
  - the package's root export picks the renderer by the `react-native` condition, which Metro asserts ([Metro, Package Exports](https://metrobundler.dev/docs/package-exports)). This is also how Expo's TypeScript base and `jest-expo` resolve. Vite, Next and Bun take `default`, the web;
  - this follows React Native's documented way of sharing code with the web ([Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code));
  - `src/shared/parity.ts` lists what both renderers draw, and why any component is on one side only.
- **One React per app.** In a workspace, Expo's Metro keeps `react`, `react-native` and the native modules to the app's own copies (`@expo/cli`'s autolinking resolver). The library's tests keep the web's React, so the phone's Jest maps `react` to the app's copy, as Metro does.
- **Theming holds controls too.** The audit gains checks for a field's edge, a chosen segment and the focus ring at 3:1 on every surface, and for a chosen segment's label. They're met by derived roles, as the badge roles are. `control-edge` and `control-selected` are lightened from `line-strong` and `s4` only as far as 3:1 needs, and a custom accent's focus ring the same way. A theme author's own colours stay as they are.
- **Checks keep it.** The sweeps check that controls in a row share one height, corner and text size. A source test finds raw sizes, corners and colours on controls in the apps and the prototypes, with a listed exception file. A bundle test checks that the web build carries no React Native and the phone's no DOM renderer.

## Consequences

- A control is changed in one place for every app and theme. Apps still lay themselves out for their screen.
- Every screen in every app changes a little: the phone's buttons come down from 44 to 36, fields to 36, and pills become `radius-sm`. The prototypes are locked, so part C lists each changed screen beside its old self.
- Edges and selected states are visibly stronger than before in the built-in themes, since they now reach 3:1.
- The library depends on both the DOM's and React Native's packages, with React Native's as optional peers. Each app installs only its own.
- ADR 0008 and ADR 0059 get dated sections for the joined library.
