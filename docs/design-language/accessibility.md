# Accessibility

**Standard:** WCAG 2.2 Level AA on every surface, plus the APCA-based [contrast policy](color.md#contrast-policy) (which is stricter for body text). Every surface is fully operable by keyboard, and TV is fully operable by D-pad.

## Perceivable

- **Contrast:** every text and fill pairing meets the contrast policy, measured over the backdrop it actually sits on. Gradients are checked at each stop.
- **Not color alone:**
  - status badges pair a dot with a label;
  - progress bars show a percentage;
  - active nav items also change weight or background;
  - focus uses a ring and scale, not color.
- **Text size:**
  - minimum 11px for any text;
  - text under 12px is limited to labels, table headers and release names, and never holds information that isn't also available in full elsewhere (details, hover, tooltip);
  - `text-3` only for metadata the user doesn't need in order to act;
  - mobile text scales with the OS setting to at least 200%;
  - web content reflows at 320 CSS px wide (400% zoom at 1280px) without scrolling in two directions, except inside data tables (WCAG 1.4.10).
- **Media:**
  - subtitles and captions are first-class: subtitle styling (size, background, position) is user-configurable in the player;
  - audio description tracks are selectable when present.
- **Images:** posters have alt text from the title, and decorative artwork (backdrops, motifs) is hidden from assistive tech.

## Operable

- **Keyboard (web, desktop, admin):**
  - every action is reachable;
  - focus order follows reading order;
  - the focus ring is always visible (a 2px `focus` ring with a 2px offset);
  - `⌘K` / `Ctrl K` opens the command palette.
- **D-pad (TV):** the [spatial focus model](platforms/tv.md#spatial-focus-model) guarantees that every focusable item is reachable, and that Back always returns somewhere predictable.
- **Targets:** at least 24×24px on pointer surfaces (WCAG 2.2 2.5.8), and 44×44pt on touch.
- **Motion:**
  - [reduced motion](motion.md#reduced-motion) is honored everywhere;
  - nothing auto-advances, and nothing flashes more than three times a second.
- **Time:** no timeouts on user tasks. Toasts with actions stay until dismissed, or for at least 8 seconds, and pause on hover or focus.

## Understandable

- Plain language ([voice and tone](../brand/brief.md#6-voice-and-tone)). Errors say what happened, why, and what to do next.
- Destructive actions explain their consequences before confirming, and use the danger fill.
- Form fields have visible labels, not placeholder-only labels. Errors are announced and tied to their field.

## Robust

- Use native semantics first. Radix primitives on web, and platform accessibility APIs on native.
- The TV web build exposes the focused item to the platform screen reader (for example, VoiceOver on tvOS, TalkBack on Android TV) with its title and state.
- Live regions announce queue changes politely, and only for user-initiated actions.

## Sound

Sound never carries meaning on its own (see [sound](sound.md#accessibility)). It is off by default everywhere except TV.

## Verification

- **Tokens:** every built-in theme passes the contrast policy in CI.
- **Storybook:** the a11y addon (axe) is clean for every component story. Keyboard-only and D-pad walkthroughs are part of component review.
- **Phase 2 prototypes:** each flow is tested keyboard-only, with reduced motion, and at 200% text.
