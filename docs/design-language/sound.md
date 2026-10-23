# Sound

**Character: felt and wood.** Each sound is a short, dry tap with a warm body and almost no tail. Nothing glides, sweeps or echoes, so sound reads as physical, matching the Bone accent, rather than electronic. The values for the default sound pack are in [direction.md › Sound](../brand/direction.md#sound).

## Event taxonomy

UI sound is limited to seven events. Components map interactions to events; they never pick a sound directly.

| Event | Fires on | Doesn't fire on |
| --- | --- | --- |
| `navigate` | Focus moves by D-pad or keyboard arrows | Pointer hover, scrolling |
| `select` | Activating a control (OK, Enter, Space, tap) | Typing in text fields |
| `back` | Back or Escape that leaves a level | Closing a toast |
| `success` | A user-initiated action completes (added, saved, grabbed) | Background jobs finishing |
| `error` | A user-initiated action fails, or input is rejected | Hitting the edge of a list (see below) |
| `notify` | An announcement or notification arrives that the user should see | Silent background updates |
| `arrival` | A client app launches and connects to its server | Reconnects, screen changes |

**Edge of a list.** When a D-pad press finds nothing in that direction, play no sound and nudge the focused item 0.2u (≈ 4px at 1080p) toward the press, then spring back. With reduced motion, nothing moves. Error is reserved for real failures.

## Defaults

| Client | Default |
| --- | --- |
| TV | On (subtle) |
| Admin | Off |
| Mobile | Off; follows the device's silent switch when on |
| Desktop and web clients | Off |

- Users can toggle sound and set its volume per device. Preferences sync through the layered preference model (user → client type → device).
- Owners can set a server default sound pack.

## Loudness and length rules

These are measured by rendering the sound offline through the same synthesis graph:
- **audible length** is the time until the signal stays below −40 dB relative to its peak;
- **peak** is in dBFS, before the master compressor.

| Rule | Limit |
| --- | --- |
| Interaction sounds (`navigate`, `select`, `back`) | ≤ 60 ms audible |
| Result sounds (`success`, `error`) | ≤ 300 ms |
| `notify` | ≤ 400 ms |
| `arrival` | ≤ 1.5 s |
| Peak level | Between −32 and −16 dBFS; `navigate` is the quietest, since it repeats most |
| Pitch movement | No glides. A natural drop of ≤ 10% is allowed (for example `back`, 400 → 370 Hz) |
| Reverb | Only the shared room bus (45 ms, low feedback), and only on `notify` and `arrival` |

**Default pack, measured:**

| Event | Audible length |
| --- | --- |
| navigate | ≈ 17 ms |
| select | 38 ms |
| back | 44 ms |
| success | 265 ms |
| error | 178 ms |
| notify | 356 ms |
| arrival | 1.0 s |

**Repeat throttling.** When a D-pad key auto-repeats, `navigate` plays at most once every 80ms, so held keys don't buzz. Two different events never overlap, except `notify` over others.

## Recipe format

A pack is data, not audio files. The web synthesizes it with Web Audio at runtime. Native clients play it rendered to audio by the offline renderer in `@highsea-tv/tokens`; the default pack ships pre-rendered in `@highsea-tv/brand` ([sources](../../design/assets/sounds/README.md)). A pack is:

```ts
type SoundPack = {
  gain: number                       // master gain before the compressor (default pack: 0.9)
  room?: { time: number; feedback: number; mix: number; lowpass: number } // shared reflection bus
  events: Record<SoundEvent, Voice[]>
}

type Voice = {
  wave?: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise' // default 'sine'
  freq?: number          // Hz (ignored for noise)
  freqEnd?: number       // optional pitch drop target; glide time = glide ?? dur
  glide?: number
  at?: number            // start offset, s
  attack?: number        // linear attack, s (default 0.003)
  dur: number            // exponential decay to silence after the attack, s
  gain: number           // peak gain
  lowpass?: number; highpass?: number; bandpass?: number; q?: number // filters, in that order
  room?: boolean         // send to the room bus
  partials?: [mult: number, gain: number, dur?: number][] // extra copies at freq × mult
}
```

- **Master chain:** pack gain → compressor (threshold −14 dB, ratio 3) → output.
- **Field names:** the reference board uses short keys for the same fields (`w, f, f2, t, a, d, g, lp, hp, bp, q, echo, p`). `@highsea-tv/tokens` uses the long names above.

## Sound packs

- Packs are distributed through the signed catalog (`catalog/sounds`), and users can upload custom packs.
- Every pack must pass the loudness and length rules above. The catalog CI renders each pack offline and rejects violations.

## Accessibility

- Sound never carries meaning on its own. Every event has a visual counterpart.
- Respect OS-level settings (mute, reduce-sound or mono-audio, where the platform exposes them).
- `arrival` is skipped when the app restores from the background.
