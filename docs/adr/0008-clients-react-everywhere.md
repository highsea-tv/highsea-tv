# 0008. Clients: React everywhere

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Clients target web, desktop, mobile and TV (Apple TV, Android TV, webOS and Tizen).

## Decision
| Platform | Stack |
| --- | --- |
| Web | React |
| Desktop | Tauri wrapping the web client |
| Mobile and TV | Expo React Native + react-native-tvos |
| webOS / Tizen | Web build |

- All clients share `@highsea/tokens`, `@highsea/sdk`, hooks and state.
- Components come in two implementations on one token set: `@highsea/ui-web` and `@highsea/ui-native`.
- Motion and sound tokens are platform-agnostic: Motion on web, Reanimated on native.

## Consequences
- The token package must emit both CSS and React Native outputs.
- Every `ui-web` component must be fully keyboard- and focus-complete, because TV navigation depends on it.

## 2026-11-01: one library, two renderers (design system 1.1)

`@highsea-tv/ui-web` and `@highsea-tv/ui-native` are now one package, `@highsea-tv/ui`, with one props type per component and a web and a React Native renderer, chosen by the `react-native` export condition ([ADR 0060](0060-one-design-system-one-library.md)). Every control takes its sizes from one spec in `@highsea-tv/tokens`, by a rule per platform: pointer, touch or the TV.

## 2026-11-03: one drawing per component, in React Native, for every client (one client platform, part A)

The two implementations become one. Every client draws each component with `@highsea-tv/ui`'s React Native renderer: the phone and the TV natively, and the web through react-native-web, so the desktop app does too ([ADR 0061](0061-one-client-platform.md)). The phone, the TV and the web are one Expo project, `apps/client`, and a screen asks the form-factor rule (an input and a width class, through `useFormFactor`) rather than the platform. Where a platform needs its own code, a platform file stands behind one component: the web's focus ring and keys, its scrollbar, the TV's focus engine in a browser, and the web's video engine. The web renderer stays only until part D, for the admin, `apps/web` and the prototypes' own screens. Then the admin draws with the same library through react-native-web, its own parts included, and the guides' drawn parts follow in part E.

The original consequence still holds in another form: the TV's focus engine in a browser, the one a webOS or Tizen build would use, is the spatial engine behind `Focusable`, so every component stays keyboard- and focus-complete on the web.
