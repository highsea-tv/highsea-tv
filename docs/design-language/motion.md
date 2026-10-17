# Motion

**Character:** calm and physical. Things settle like a buoy, not a bounce. Motion explains where something came from and where it went; it never decorates.

## Springs

Springs are defined physically by stiffness, damping and mass (1). `@highsea/tokens` exports them two ways:
- for the web, sampled into a CSS `linear()` easing (49 points) with a matching duration;
- for native, as raw parameters for Reanimated.

| Token | Stiffness / damping | ζ | 90% reached | Settled (±0.2%) | Overshoot | Use |
| --- | --- | --- | --- | --- | --- | --- |
| `spring.base` | 120 / 20 | 0.913 | 317 ms | 559 ms | 0.09% | Layout, focus moves, rows and tracks, sheets, entrances |
| `spring.quick` | 300 / 30 | 0.866 | 188 ms | 459 ms | 0.4% | Press feedback, toggles, segmented controls, checkboxes |

- `spring.base` is locked ([direction.md](../brand/direction.md#motion)).
- The board drove button presses with the base curve squeezed into 140ms. `spring.quick` replaces that with a real, faster spring.
- No spring in the system may overshoot more than 1%.

## Durations (non-spring)

| Token | Value | Use |
| --- | --- | --- |
| `duration.color` | 160–200 ms, ease-out | Background, border and color changes on hover or state |
| `duration.fade-out` | 140 ms | Content leaving before a swap (for example, TV hero copy) |
| `duration.dwell` | 220 ms | Focus must rest this long before heavy work starts (hero backdrop, inspector, prefetch) |
| `duration.pulse` | 280 ms, ease-out | Select feedback on TV: brightness 1 → 1.35 → 1 |

## Choreography

**Entrance (lists, grids, page content)**
- Items rise 14px and scale from 0.98 to 1 with `spring.base`, staggered by 45ms.
- Cap the total stagger at 8 items (315ms). Later items enter together with the 8th.

**Content swap.** Used for the TV hero and other places where focus changes what's shown:
1. Old copy fades out over 140ms while moving down 4px.
2. The text is replaced.
3. New copy enters from −6px with `spring.base`.

The artwork behind it cross-fades between two layers, so there is never a blank frame. The swap starts only after `duration.dwell`, so fast scrolling doesn't thrash.

**Focus**
- **Scale:** the focused item scales up (posters 1.09, buttons 1.07) with `spring.base`.
- **Ring:** appears with the focus state, with no ring "travel" between items.
- **Tracks:** rows and columns move by transform with `spring.base` to keep focus in view (see [TV › Scrolling](platforms/tv.md#scrolling)).

**Sheets and dialogs**
- They rise with `spring.base`. Sheets enter from the bottom edge; dialogs enter with a 0.98 scale and fade.
- They leave with a 140ms fade and no spring.

**Nothing moves on its own.** Carousels don't auto-advance, and nothing pulses or loops for attention. The only exceptions are progress indicators and live data (speed charts, progress bars). This also satisfies WCAG 2.2.2.

## Reduced motion

When the OS requests reduced motion:
- **Removed:** translation, scale, stagger, parallax and the select pulse.
- **Kept:** opacity changes of 150ms or less, and instant state changes. The focus ring still appears, and focused items still get their state (without the scale).
- **Instant:** track scrolling jumps instead of springing.

This matches the reference board, which drops transition durations to 1ms and skips the hero copy animation and the press pulse.
