# Principles

These come from the brand pillars ([brief §4](../brand/brief.md#4-brand-pillars--design-implications)) and the locked direction. When two good options conflict, the earlier principle wins.

## 1. Artwork is the color

The chrome is neutral graphite with one warm accent, so posters, backdrops and stills carry the color.

- Never tint artwork, and never place a colored overlay on it. Scrims fade to `--bg`, not to a hue.
- Use the accent for meaning (active, selected, primary), never for decoration.
- Placeholder art stays muted, so it never out-shouts real posters.

## 2. Physical, never emissive

Things in highsea behave like objects, not lights.

- There are no glows, neon edges or colored halos. Shadows are dark and only express elevation.
- Motion settles like a buoy: a near-critically-damped spring with almost no overshoot.
- Sounds are dry taps of felt and wood, with almost no tail. Nothing glides, sweeps or echoes.

## 3. Focus is never in doubt

On every platform, the user always knows where they are.

- Every focusable element has a visible focus state, carried by ring, scale and motion, never by color alone.
- D-pad and keyboard focus moves where the eye expects: straight lines, no diagonal surprises, and memory of where you were.

## 4. Server first

People open *their* server, not "highsea."

- Clients lead with the server's name, identity and curation (announcements, featured sections).
- highsea's own brand recedes to the mark, the motion and the sound. It is the hull, not the cargo.

## 5. Calm power

The product is deep but never noisy.

- Clients are spacious and content-first. Admin is deliberately dense, but calm: mono figures, quiet borders, status color only where state matters.
- Show advanced options progressively. Never hide them and never dumb them down.
- Content changes only when the user does something. Nothing auto-advances or animates for attention.

## 6. Legible by measurement

Accessibility is measured, not eyeballed.

- Every text and fill pairing meets the [contrast policy](color.md#contrast-policy). The board audits it live, and the theme engine will enforce it.
- Text styles have minimum sizes per role, and the TV scale is designed for 10-foot viewing.

## 7. One system, every screen

The same tokens, components, motion and sounds run from a 6-inch phone to a 10-foot TV to a dense admin table. Platform guides adapt sizes and input. They never introduce a second visual language.
