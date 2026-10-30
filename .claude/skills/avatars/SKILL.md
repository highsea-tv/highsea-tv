---
name: avatars
description: Generate profile avatars for highsea (the pictures people pick for their profile, as on Netflix or HBO Max) with Nano Banana 2.1 in the owner's Google Flow project, driven through the built-in browser, then review them, keep the chosen ones in design/assets/avatars and move the rest to Flow's Trash. Use when the owner asks for new avatars, a new style or collection, or to redo one.
argument-hint: "[collection and subjects, e.g. 'crew: cook, lookout, navigator' or 'redo crew/cook']"
---

# Generate avatars in Google Flow

Google Flow has no API, so this skill drives its web app in the **built-in browser** (`mcp__Claude_Browser__*`). The owner's project is **HIGHSEA.TV Avatars**:

https://flow.google.com/project/40b0eb7a-6871-430c-8566-7734bf2959ae

Kept avatars go in `design/assets/avatars/<collection>/<slug>.jpg` (Flow's originals are 1024 × 1024 JPEGs), listed in `design/assets/avatars/manifest.json`. They aren't wired into any app yet: today every app draws a person's initial on their colour (`TvAvatar` in the prototypes, `Avatar` in ui-native). Choosing a picture on a profile is a product change that needs a prototype and the owner's approval first.

## Before you start

- **Agree the list.** Get the collection and its subjects from the argument or the owner, and say how many images you'll generate. Don't start a collection or style the owner didn't ask for. When the owner asks to try new styles or themes, follow **Trying a new style or theme** in `styles.md`: draft, sample, a contact sheet, their pick.
- **Signing in is the owner's.** If Flow shows Google's sign-in page, stop and ask the owner to sign in in the browser pane. Never type a password or a code.
- **A CAPTCHA is the owner's too.** Flow loads reCAPTCHA. If a challenge appears, stop and ask the owner to complete it.
- **Downloads need the owner's yes** for each batch: say how many files, from where (Flow, at 1K), and where they'll go. The owner choosing which to keep is that yes.
- Set the pane's size first (`resize_window` 1440 × 900), so Flow lays out as below. Reset it to `desktop` at the end.

## Styles and collections

Avatars come in **collections**, like the rows in Netflix's picker: each is one art style with one theme (`sea`: sticker-style sea creatures; `crew`: an illustrated pirate crew). Every style has its own prompt template, and every collection its subjects, in [styles.md](styles.md) beside this file. Read it before writing a prompt, and use the collection's template word for word, changing only the slots. Its rules hold for every style: the shared palette, the face in the circle, friendly expressions, and originals only.

A new style, collection or template change needs the owner's approval: record it in `styles.md` and in the manifest's `collections`.

## Generating

On the project page (the URLs and labels are Flow's as of 2026-10-30, checked in a trial run that day; if they've moved, find them with `read_page` and update this section). Element refs go stale whenever Flow changes page, going back included: `find` them again after every navigation.

1. **Settings.** Open **Settings trigger** (the chip showing "🍌 Nano Banana 2.1 x1" beside the arrow) and check:
   - **Mode:** Image;
   - **Aspect ratio:** 1:1;
   - **Select model family:** 🍌 Nano Banana 2.1;
   - **Output count:** 2 to 4 per subject, so there's a choice;
   - **Generating will use:** the credits it costs. If it's more than 0, tell the owner the total for the batch before generating.

   Press Escape to close it.
2. **Prompt.** Click the **What do you want to create?** box (a contenteditable `div`) and type the prompt from the collection's template. Screenshots can lag behind typing and show the box empty: check the text with `javascript_tool` (`document.querySelector('[aria-label="What do you want to create?"]').textContent`) rather than typing it again. Then press **Start generation** (the arrow). Leave **Agent** off.
3. **Wait.** Grey placeholder tiles with a percentage appear at the top of **All media** at once; two images took about 20 seconds. Wait 10 seconds at a time, then screenshot: when they're done, each tile has Flow's title (a `group` named like "Octopus cartoon avatar waving te…"). Don't start the next prompt until the last one's tiles are done.
4. **Repeat** for each subject.

## Reviewing

- Open a tile by clicking its **title button** (the tile's image alone may not open it). The page becomes `/edit/<media id>`, with the image large and its prompt at the right.
- **Know an image by looking at it, never by its place.** A prompt's images share one title, and neither the grid's order nor `find`'s matches follow A and B (favouriting reorders the grid too). Note each candidate's media id beside what it looks like when you show it, and check both before favouriting, saving or trashing.
- Screenshot it and check: the style matches its description in `styles.md` (the sticker's heavy outline and white edge, the clay's thumbprints, the photo's sharp eyes), the face inside the circle, the subject readable small, nothing malformed (eyes, hands, extra limbs), no text. Zoom (`computer` `zoom`) to look closely.
- **To fix one,** type the change in **What do you want to change?** on that page and generate. Fixing beats regenerating when the rest is right. Say what to change and what to keep: "Change only the face: … Keep everything else exactly the same: pose, size, framing, colours, outline and background." It makes one image in about 25 seconds and keeps the same media id: the edit joins that image's history (the thumbnails at the right), and the large image becomes the edit, so the saving script takes the edit. Record each change in the manifest entry's `edits`.
- Show the owner the candidates: `zoom` on each one's large image on its edit page (about `[180, 80, 480, 380]` in the 800 × 500 screenshot frame) and send the zooms with `SendUserFile`, labelled A, B and so on. Let them choose. Note each chosen one's media id from the URL.
- **Favorite** the chosen ones in Flow, so the project shows what was kept.

## Keeping

For each chosen avatar, with the owner's yes for the batch:

Flow's **Download media** menu (1K Original size, 2K Upscaled) says "Your image has been downloaded" but **the built-in browser drops the file**: nothing reaches disk. The page also can't send requests to localhost (`ERR_BLOCKED_BY_CLIENT`), and the image URLs need the signed-in session, so `curl` gets a redirect. So the image comes out through `receive.ts`, beside this file: Flow's page navigates the tab to a local page with the image in the URL's fragment, and that page saves it.

1. Start the receiver in the background (`run_in_background`), saving to a new, empty folder in your scratchpad:

   ```sh
   bun .claude/skills/avatars/receive.ts <scratchpad>/avatars
   ```

2. On the chosen avatar's `/edit/<media id>` page, check the large image is the chosen one (screenshot), then run this with `javascript_tool`, `<slug>` filled in. It takes the original (`=s0`, 1024 × 1024, the same as Download's 1K) from the large image, the one whose alt is "Read-only image view":

   ```js
   const main = [...document.querySelectorAll('img')].find((i) => i.alt === 'Read-only image view')
   const blob = await (await fetch(main.src.replace(/=[^=/]*$/, '=s0'), { credentials: 'include' })).blob()
   const buf = new Uint8Array(await blob.arrayBuffer())
   let s = ''
   for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
   const b64 = btoa(s)
   setTimeout(() => { location.href = `http://127.0.0.1:8765/#<slug>.jpg:${b64}` }, 100)
   ;({ size: blob.size, type: blob.type })
   ```

   The receiver's output says `saved <slug>.jpg (<n> bytes)`, and `n` matches the `size` the script returned. Navigate back to the project for the next one.
3. Check it with `sips -g pixelWidth -g pixelHeight -g format <file>` (1024, 1024, jpeg) and move it to `design/assets/avatars/<collection>/<slug>.jpg`. The slug is the subject in kebab case: `pirate`, `sleepy-octopus`.
4. Look at the file you moved (Read it) before you list it. Stop the receiver when the batch is done.
5. Add it to `avatars` in `design/assets/avatars/manifest.json`, in the shape of the entries there: `collection`, `slug`, `file`, `name`, `background`, the full `prompt`, `edits` (only when it was fixed), `flowMedia` (the media id), `model` and `made` (the date). `name` follows the brand's voice (`docs/brand/brief.md` § 6): a plain noun, no jokes in the label. A redo replaces the entry and the file, keeping the slug.

## Clearing out what wasn't kept

Once the owner has chosen and the kept ones are saved, move every candidate from this round that wasn't kept to Flow's **Trash** (the owner, 2026-10-30), so the project holds only the avatars in the manifest:

- **What goes:** each image generated this round whose media id isn't in the manifest, rejected candidates and rounds the owner turned down alike. Never one in the manifest, and never one marked as a favourite: those were kept. List what you'll move (by subject and A/B) in your report.
- **How (fastest, the owner, 2026-10-30):** on the project page, right-click the tile (or hover it and press its vertical **⋮**) and choose **Move to trash** from the menu. Screenshot the grid first and right-click the tile you can see is the rejected one: never pick it by title or position, since a prompt's images share one title. A favourite's heart shows on its tile, so a tile with a filled heart is never one to trash.
- **When you can't tell from the tile,** open it by its title button instead, check the large image and the media id in the URL against the manifest, and press **Move to trash** in the top bar (the bin, beside **Download media**). There Flow then **opens the neighbouring image**, often a kept one, so never press the bin twice: go back to the project before the next.
- Flow doesn't ask to confirm either way: it shows "1 item moved to trash" with **Undo**. The grid can still show a trashed tile until the page reloads; reload, then check that only the manifest's avatars (and favourites) are left.
- **A changed pick.** If the owner swaps a winner after it's saved, save the new one over the old file, put its media id in the manifest, favourite it, then remove the old one's favourite (**Remove favorite**, the heart) before moving it to Trash.
- **Edits stay.** A fixed image keeps its earlier version in its history; that's the same media, so leave it.
- **Trash only.** Never empty Flow's Trash or delete from it: that's permanent, and it's the owner's to do. Trash lets them restore anything moved by mistake.

## Finishing

- Reset the pane (`resize_window` preset `desktop`).
- Report: the collection, each kept avatar with its file, what was moved to Trash, and the credits used.
- Commit only on the owner's word, as always.
