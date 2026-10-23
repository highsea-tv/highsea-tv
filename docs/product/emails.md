# Emails

- **Platforms:** email clients: Apple Mail, Gmail (web and apps), Outlook (web, Windows, apps), Yahoo, and plain-text readers.
- **Prototype:** `design/prototypes/src/email/` at `index.html?emails` (`#invite`, `#imported`, and one hash per email). The owner asked for it on 2026-10-21, during checkpoint 8b, with MJML suggested, and approved it the same day with the four recommendations below taken, as part of 8b.
- **Built:** checkpoint 8b. The templates are `@highsea-tv/notifications/mail` (`packages/notifications/src/mail/`), the one source the server sends and the prototype's preview renders; see [As built (8b)](#as-built-8b).
- **Plan:** [phase-3-checkpoint-8.md › Email for people](../plans/phase-3-checkpoint-8.md#email-for-people) and the Email connection in [Notifications](../plans/phase-3-checkpoint-8.md).

## Purpose

highsea sends two kinds of mail. **The server's mail** goes to people: an invite and a password reset, each with a single-use link. **An Email connection** sends the owner the events it hears: a movie imported, a download failed, a health warning. Both should look like highsea, not like a default HTML page, and both should read well where people actually open mail: on a phone, often in dark mode, sometimes as plain text.

## The emails

Every email has the same frame: the server's logo and name, a card, and a footer in captions.

| Email | Card | Footer |
| --- | --- | --- |
| **Invite** | "You’re invited to {server}", "Hello {name},", "{inviter} invited you to {server}. Choose a password to finish your account:", the **Choose a password** button, the link written out in mono, then "The link works once, until {date}." and "If you weren’t expecting this, you can ignore it." | "Sent by {server} with highsea." |
| **Password reset** | "Reset your password on {server}", "Hello {name},", "Choose a new password for {server} with this link. Your apps and TVs stay signed in.", **Choose a new password**, then the same link, expiry and ignore lines | The same |
| **A notification** | A badge (the event's name, coloured by its level), the title, then the body. A movie's event shows its poster beside its details (what the event's payload carries: release, indexer and size for Grabbed; quality, size, and what it replaced for Imported and Upgraded), which stand in for the body rather than repeat it; an event without details shows the body, and a movie without a poster leaves the poster's column out. **Open in {server}** links to the movie or the page, and only appears when the server has an external URL: a LAN address means nothing to a phone on mobile data | "You get this because {connection} hears {event}. Change it in Settings › Connections." then "Sent by {server} with highsea." |
| **Test** | "A test from highsea" and "This connection works. Messages you choose will arrive here." | "You get this because someone pressed Test on {connection}." |

- **The events** are Imported, Upgraded, Grabbed, Download failed, Subtitle added, Health (a warning, and its clearing), Update, Movie added (by a list) and Test. Their titles, bodies and levels are `render()`'s in `@highsea-tv/notifications/shared`, so the email says what Discord and ntfy say; `test/emails.test.tsx` renders each sample's payload and checks the words still match.
- **A server left named highsea** signs "Sent by highsea.", not "Sent by highsea with highsea.", and the invite says "You’re invited to highsea", never "a highsea server".
- **Plain text** goes with every email, as its own part: the same words in the same order, the link on its own line, details as `Label: value` in place of the body. A reader that shows text, or a filter that strips HTML, loses nothing.
- **The preheader** (the line an inbox shows after the subject) is the body for a notification, and a short line for the invite and reset ("Ines invited you. Choose a password to finish your account.").
- **Copy** follows the brand brief's voice: plain, calm, specific, no exclamation marks. The invite keeps the server mail's earlier keys and words; the reset body is new, written for the link the owner makes on A13.

## Design

The emails use **Abyss**, the default theme, dark first, as the admin does. The tokens in `packages/notifications/src/mail/tokens.ts` come from `resolveTheme(defaultTheme)` in `@highsea-tv/tokens`, not from copied values, so a token change reaches the emails. Email clients can't be trusted with alpha or `color-mix()`, so every translucent role is painted onto the card first, the way the contrast audit measures it, and written as solid hex.

| Role | Value | From |
| --- | --- | --- |
| Canvas | `#0b0b0c` | `bg` |
| Card | `#121214` | `s1` |
| Border, divider | `#232324` | `line` over `s1` |
| Text | `#ededee`, `#c7c7cb`, `#a2a2a7` | `text`, `text-2`, `text-3` |
| Link | `#d6cfc2` | `accent-text` |
| Button | `#ebe6dc` with a `#0b0b0c` label | `accent-fill`, `on-accent` |
| Badges | dot, label and fill per level: info `#8fb0d6` / `#a9c1dd` / `#24282f`, success `#7cc4a0` / `#9dd0b5` / `#212b28`, warning `#dcb06a` / `#e1c191` / `#2e2820`, error `#e88787` / `#eeb9b8` / `#302224` | the status role, its badge label (color.md's recipe) and its 14% tint over `s1` |

- **Type:** the system's own UI face, with Geist first for the few readers that have it installed. **No web font is loaded,** so opening an email makes no request beyond its images. Gmail documents no web-font support, and MJML would otherwise link Google Fonts on its own whenever a font stack names Roboto, so the templates compile with `fonts: {}`. Sizes follow direction.md: the title is 24/30 at weight 600 with -0.02em tracking, body 15/24, captions 12.5/18, details 13/20 in mono.
- **Shape:** a 560px column; the card has a radius of 16 and padding of 32, which drops to 24 under 480px; the button has a radius of 8; the logo is 32px with a radius of 8; the poster is 96×144 with a radius of 10.
- **Posters stay beside the details on a phone.** They sit in an `mj-group`, which never stacks; under 480px the poster's column takes 32% of the card, so the poster stays near full size, and the gap is the details' own padding.
- **Images:** the logo is the server's own (Settings › Appearance) when it's a PNG, and highsea's app icon otherwise, a tile that carries its own dark ground, so it reads in any client. The server attaches the logo and posters to the message and refers to them by CID (Nodemailer's embedded images), so they show without the reader allowing remote images and without the server being reachable. The prototype passes the brand's PNG and the fixtures' SVG posters as data URIs instead.

## Dark mode in mail clients

Email clients treat dark mode in three ways ([Litmus](https://www.litmus.com/blog/the-ultimate-guide-to-dark-mode-for-email-marketers)):

- **No change:** Apple Mail on the Mac, Gmail on the web, Yahoo and AOL show the email as written.
- **Partial invert:** Outlook.com, Outlook on iOS and Android, and Gmail on Android darken light backgrounds and lighten dark text. A dark design passes through mostly as written.
- **Full invert:** Gmail on iOS, and Outlook 2021 and Office 365 on Windows, flip every colour. A dark email turns light.

highsea's emails are dark by design, so the first two groups show them as designed. The HTML says so with `<meta name="color-scheme" content="dark">` and `supported-color-schemes` ([CSS Color Adjustment › color-scheme](https://www.w3.org/TR/css-color-adjust-1/#color-scheme-meta)), which Apple Mail reads. `prefers-color-scheme` reaches about 42% of clients and is rewritten by some (Yahoo, AOL, HEY) ([caniemail](https://www.caniemail.com/features/css-at-media-prefers-color-scheme/)), so the design does not depend on it.

In a full-invert client the email turns light: a pale card on a pale canvas, dark text, a dark button. It stays readable, and the badges keep their hue. The preview's **Full invert** control approximates it with `filter: invert(1) hue-rotate(180deg)`, images flipped back; the real clients' algorithms aren't published, so it's a guide, not a proof.

## Building them

- **MJML 5** ([documentation.mjml.io](https://documentation.mjml.io/)) compiles the templates into tables and inline styles that Outlook on Windows and Gmail render. The prototype uses `mjml-browser` 5.4.1 (MIT) in the page; the server uses `mjml` 5.4.1 (MIT) and compiles each email as it sends it (`mjml2html` is asynchronous in MJML 5).
- **CSS** lives in one `<mj-style>`: the link colour, and the rules under 480px. Gmail keeps `<style>` blocks with class selectors and width media queries ([Gmail › CSS support](https://developers.google.com/workspace/gmail/design/css)); a client that drops them gets the desktop layout scaled down, which still works.
- **Strings** are a `defineMessages` catalog (`packages/notifications/src/mail/messages.ts`) like everything else (ADR 0021): the frame's words only, since the notifications' come from their package.
- **The tests** compile every email for a named server and for one left as highsea, with and without an external URL, in strict validation: no errors, no remote stylesheet, the color-scheme metas, the right footer, the link in both parts. They check the notifications' words against `render()`, and render the preview with axe.

## In the prototype

`index.html?emails` lists every email (a select on narrow screens) and shows the chosen one as an inbox would: From, Subject and the preheader above a sandboxed frame. Its controls are **Width** (Phone at 375px, Desktop at 720px), **Client** (As designed, Full invert), **Format** (HTML, Plain text), **Server name** (Harbor, highsea) and **External URL** (set, None). The launcher links it under **Email**.

## Decisions

The owner approved the prototype on 2026-10-21 with each recommendation taken:

1. **A light version.** The emails are dark only. A light one, chosen by `prefers-color-scheme`, would help clients that honour it, but only about 42% do and some rewrite it. **Decided:** dark only for now; look again if people ask.
2. **The server's branding.** Settings › Appearance sets the server's logo and accent. **Decided:** the server's logo replaces highsea's in the header (it's already the server's name beside it), but the accent stays highsea's: a custom accent hasn't been checked for contrast on the email's card, and the button's label depends on it.
3. **Levels.** They follow `render()`: a failed download is a warning, since another release is usually grabbed in its place, and a subtitle is info. If a failed download with no replacement should be an error, that's a change in `render()`, and the email follows.
4. **Posters.** The prototype shows the fixtures' SVG posters; most clients don't show SVG, so the server sends TMDB's JPEG, attached by CID. **Decided:** a movie without a poster leaves the column out, so the details take the width.

## As built (8b)

- **One source.** `@highsea-tv/notifications/mail` holds the templates, their words, the tokens and each event's details (`emailDetails`), with no DOM, no React and nothing from Node, so the prototype's preview imports the same code and compiles it with `mjml-browser`. The server compiles with `mjml` in `src/mail/compile.ts`, which the browser-safe entry never imports; the email channel and the service do.
- **`mjml`, not `mjml-core` with `mjml-preset-core`.** MJML documents the `mjml` package's `mjml2html` as its Node API; `mjml-core`'s own README points back to it. Its runtime entry loads only `mjml-core`, `mjml-validator` and `mjml-preset-core`; `mjml-cli` is a dependency for its `mjml` command and is never loaded. Everything it brings is plain JavaScript, with no native code, and under licences compatible with AGPL-3.0: `slick`, through `juice`, writes MIT in prose, so it's listed in `scripts/license-exceptions.json` with that reason.
- **Compiled at send time,** with `validationLevel: 'strict'`, so a template mistake throws rather than sending a broken email, and `fonts: {}`. Not minified: a compiled email is about 15 kB, far from Gmail's 102 kB clipping, and readable HTML is easier to check.
- **Images by Content-ID.** The logo and the poster are attachments with a `cid` (Nodemailer's [embedded images](https://nodemailer.com/message/embedded-images/)), so the message is `multipart/alternative` with the text and a `multipart/related` of the HTML and its images. Each Content-ID is new for each message (RFC 2392). The HTML has no remote image at all.
- **The logo** is the mark from Settings › Appearance when it's a PNG. An SVG mark gives highsea's app icon instead: most clients don't show SVG ([caniemail](https://www.caniemail.com/features/image-svg/)), and rasterising it would take a native renderer. highsea's icon is `@highsea-tv/brand/icons/web/icon-192.png`, found with `import.meta.resolve`, which reaches it in the workspace and in the Docker image alike (the image copies the whole workspace).
- **The poster** is the movie's from the metadata image cache at `w185`, about twice the 96px it's shown at; a list's run shows its first movie's. A movie with no cached poster has none, and its column is left out.
- **Brand data** comes from the runtime (`packages/runtime/src/mail-brand.ts`): the server's name, its external URL, General's language and time zone, the logo and the poster, so notifications imports neither personalization nor metadata (ADR 0036).
- **Open in {server}** shows only when the server has an external URL. The footer names the connection and the event; a test from a connection not yet saved says "this connection".
- **Details** are only what each payload carries. Imported and Upgraded have no release name in their payloads, so the server's emails show quality, size and what was replaced, and the prototype's samples now derive theirs the same way.
