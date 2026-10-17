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
