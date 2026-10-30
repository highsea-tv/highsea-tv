# Avatar styles and collections

A **style** is how an avatar is made: its prompt template. A **collection** is one style with one theme, like a row in Netflix's picker: every avatar in it shares the template and differs only in subject, details and background. The apps will group avatars by collection, so never mix styles within one.

Every template fills the same four slots:

- **{subject}:** who or what, with a friendly adjective: "a weathered sea captain", "a puffin".
- **{details}:** two or three large, readable features that tell this avatar apart from its neighbours.
- **{background}:** one colour from the shared palette, spread across the collection so neighbours differ.
- The framing sentence stays as written: it keeps the face inside the circle the apps crop to.

## Rules for every style

- **The shared palette**, in every collection, so the picker reads as one set: warm-yellow, coral, tangerine, rose, lavender, sky-blue, teal, mint, plus **cobalt**, **crimson**, **violet** and **emerald** for the saturated styles (illustrated, wildlife, icon, pixel). Solid colour, no scenery.
- **The face sits in the inscribed circle**, big enough to read at 40 px. Shoulders and bodies may run off the bottom edge; ears, hats and hair may touch the top, but nothing important goes in the corners.
- **Friendly or calm expressions:** open eyes and a smile, or a neutral look. No half-lidded eyes, smirks, leers, bared teeth or anything sultry or menacing.
- **Original only.** No text, letters or logos, no real people, no famous characters or anyone's likeness, and no studio or artist names in a prompt ("in the style of …"): describe the look in plain terms instead. These ship with an AGPL project.
- **People are varied** across a collection: ages, skin tones, hair, build, gender.

Styles and themes are open-ended: any look a prompt can describe, and any theme, nautical or not. To add one, follow **Trying a new style or theme** below. Change an approved template only with the owner's approval, and note the date.

## Styles

### `sticker`: chunky cartoon sticker

Set by the first avatar in the project, the pirate (2026-10-30).

```text
Chunky 2D sticker-style cartoon avatar of {subject}, centered square portrait. Extremely simple shapes, heavy black contour lines, and bright pop-art flat coloring. Features {details}. Zero fine detail, flat vector graphics, clean minimalist silhouette, solid {background} background.
```

For subjects with big heads, add after "centered square portrait": "The whole {animal} is small enough to sit fully inside the frame, with wide empty margins on every side and nothing touching the edges."

### `illustrated`: animated-series character

Head-and-shoulders portraits of people, drawn like a modern 2D animated series.

```text
Stylized 2D animated-series character portrait of {subject}, head and shoulders facing the viewer, square composition with the face centred and the shoulders running off the bottom edge. Clean confident line work, flat cel shading with a single soft shadow tone, bold simplified shapes, an expressive friendly face. {details}. Solid {background} background, no gradient, no scenery.
```

### `clay`: stop-motion clay

Handmade plasticine characters, photographed.

```text
Handmade stop-motion clay character of {subject}, sculpted from plasticine with visible thumbprints and soft rounded shapes, photographed from the chest up as a centred square portrait. Big simple glossy eyes, a chunky friendly face, gentle studio lighting. {details}. Plain solid {background} paper backdrop, shallow depth of field.
```

### `wildlife`: photographic animal portrait

Real animals, lit like a studio portrait and cut out onto colour.

```text
Photorealistic wildlife portrait of {subject}, head and shoulders filling a square frame, looking straight at the camera with a calm expression, sharp focus on the eyes, soft studio lighting. {details}. The animal is cleanly cut out against a solid flat {background} background, no scenery, no shadow on the background.
```

### `icon`: bold flat mask

Minimal graphic faces: a disguise, a mask or a headpiece that fills the frame.

```text
Bold flat graphic icon of {subject}, a minimal face that fills a square frame, built from only three or four flat colours and thick solid black shapes, no outlines, no shading, no texture. {details}. Solid {background} background.
```

### `pixel`: 16-bit pixel art

```text
16-bit pixel art portrait of {subject}, head and shoulders centred in a square frame, chunky visible square pixels, a limited palette of about twelve colours, a crisp one-pixel dark outline, a friendly face. {details}. Solid {background} background, no dithering on the background.
```

## Collections

Each is `<collection>`: style, theme, then the subjects kept and ideas for more. A collection's files live in `design/assets/avatars/<collection>/`. Approved on 2026-10-30, from the first sampler.

- **`sea`**: `sticker`, sea creatures. Kept: octopus, crab, whale, pufferfish, seagull.
- **`crew`**: `illustrated`, a pirate ship's crew. Kept: captain. Ideas: captain, navigator, cook, lookout, carpenter, cabin kid, quartermaster, ship's doctor.
- **`harbour`**: `clay`, harbour animals. Kept: puffin. Ideas: seal, pelican, hermit crab, lobster, gull, sea otter.
- **`ocean`**: `wildlife`, ocean wildlife. Kept: sea otter. Ideas: harbour seal, sea turtle, puffin, octopus, manatee, walrus, penguin.
- **`disguises`**: `icon`, masks and headgear. Kept: diving helmet. Ideas: eye patch and tricorn, bandit mask, aviator goggles, captain's cap and beard.
- **`space`**: `pixel`, a space crew, the first theme beyond the sea. Kept: astronaut. Ideas: robot, alien, pilot, engineer.

## Trying a new style or theme

Do this whenever the owner asks for new styles or themes, or to "try" or "sample" something.

1. **Draft** each new style as a section under **Styles**, marked *(trying)*: a backtick id, a one-line description, and a template with the four slots and a framing sentence that keeps the face in the circle. Describe the look in plain words, never by a studio, show or artist. A new theme on an existing style needs no template, only a collection line.
2. **Sample** it: one subject per new style or theme, 2 images each, all through the normal Generating steps. Make one contact sheet of the lot (below) and send it, labelled by style and A or B.
3. **The owner picks** which styles become collections, then the winner of each pair. Keep the winners as usual (they start their collections), remove the *(trying)* mark, add the collection here and to the manifest's `collections`, and move every other sampler image to Trash.
4. **What didn't work goes under Dropped** below, with the date and why, so it isn't tried again unchanged.

**The contact sheet.** On the project page, the newest tiles come first, each pair left to right (A, B). Draw them into a canvas in the page and send it out through `receive.ts` like an avatar: fetch each tile's `img` at `=s512` with `credentials: 'include'`, `createImageBitmap`, `drawImage` in a grid with a label above each, `toBlob('image/jpeg', 0.9)`, then the same base64 hand-off to `http://127.0.0.1:8765/#sampler.jpg:…`. Read the sheet before sending it.

## Dropped

- **`fuzzy`** (2026-10-30): a square of fluffy fur with a tiny face, for a `fluff` collection of moods. The face came out a few pixels wide, unreadable at 40 px, and the owner didn't take it. A retry would ask for a face a third of the frame wide.
