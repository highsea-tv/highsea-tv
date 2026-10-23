# 0046. Notifications: the event catalogue, channels as code, delivery, email and web push

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
Checkpoint 8b has highsea tell the owner what happened where they already look: Discord, ntfy, email, the browser ([the plan](../plans/phase-3-checkpoint-8.md#notifications-8b)). The owner chose every channel in the roadmap at launch (answer 6) and no media-server refresh (answer 7). Each service is an outside API that changes and fails on its own schedule, and none of them may be reached by a test. The invites and password resets in users-devices.md need email too.

## Decision
- **One package, `@highsea/notifications`,** with one subpath per part (ADR 0036): `shared` (the events, their payloads and messages), `channels` (one adapter per kind), `service` (connections, delivery, web push, the server's mail) and `fake`. It depends on `core`, `db`, `jobs` and `i18n`. The runtime calls `notify` from what it already sees. The package knows nothing of movies, downloads or the health list.
- **The event catalogue:**
  - The events are grabbed, imported, upgraded, download failed, subtitle added, health, update and movie added, plus test.
  - Each has a typed payload. Every movie event carries the title, year and TMDB id, and the poster and the movie's page as absolute URLs when the server's external URL is known.
  - A list run is one movie-added message, never one per movie. A health change is one message when it turns and one when it clears.
- **Messages:**
  - Messages come from an i18n catalog in the server's language (ADR 0021), in the brief's voice: "Sintel (2010) is in the library. Bluray-1080p, 1.2 GB."
  - Each is rendered once into a title, a body, a level, a link and an image. Rich channels use the parts (Discord's embed, Slack's blocks, Telegram's photo). Plain ones use the line of text.
- **Channels are code, not configuration.**
  - **What a channel is:** each kind is a module with a zod schema for its settings, the list of its secret fields, and `send`. Each is written from its service's documentation, cited in the code:
    - [Discord's Execute Webhook](https://discord.com/developers/docs/resources/webhook#execute-webhook);
    - [Slack's incoming webhooks](https://api.slack.com/messaging/webhooks) with [Block Kit](https://api.slack.com/reference/block-kit/blocks);
    - [Telegram's sendMessage and sendPhoto](https://core.telegram.org/bots/api#sendmessage);
    - [ntfy's JSON publish](https://docs.ntfy.sh/publish/#publish-as-json);
    - [Gotify's POST /message](https://gotify.net/api-docs) and its [extras](https://gotify.net/docs/msgextras);
    - [Pushover's messages API](https://pushover.net/api);
    - [Matrix's PUT …/send/m.room.message/{txnId}](https://spec.matrix.org/latest/client-server-api/#put_matrixclientv3roomsroomidsendeventtypetxnid);
    - the [Apprise API's](https://github.com/caronc/apprise-api#api-details) `/notify/{key}` and stateless `/notify`;
    - a generic JSON webhook, whose body is `{ event, level, title, body, text, url, image, at, payload }`.
  - **Requests:** all HTTP goes through the fetch seam (ADR 0029).
  - **Secrets:** the secret fields (tokens, passwords, webhook addresses) are sealed with the server's key and shown as `••••` and their last four characters. A masked value sent back keeps the secret it stands for, so an edit dialog never has to show one.
  - **Matrix's transaction id** is the message's log id. The spec makes a repeated PUT with the same id idempotent, so a retry Matrix already took isn't posted twice.
  - **Not here:** a plugin system for channels is [Later], as the roadmap says.
- **Delivery:**
  - **`notify(event, payload, eventId)`** writes one `notification_log` row per enabled connection that hears the event. The unique (connection, event id) makes a repeated event one message (ADR 0022). It then queues one `notifications.send` job per row, keyed `{connectionId}:{eventId}`.
  - **A failed send** is classed by the answer:
    - a 429, a 5xx or no answer at all is tried again;
    - anything else (a 4xx: a deleted webhook, a wrong token) fails at once, since trying again can't help.
  - **Why the job reschedules itself:** the job queue's retries can't wait for a time the response names. So a retryable failure writes the attempt to the log and queues the next try itself. It waits the service's own figure or the backoff, whichever is longer:
    - the service's figure is `Retry-After` ([RFC 9110 § 10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3)), Discord's and Telegram's `retry_after`, or Matrix's `retry_after_ms`;
    - the backoff is 30 seconds, doubling, at most an hour.
  - **After a day:** a message still unsent 24 hours after its event is dropped. System › Health then shows the connection until a later message gets through, and does the same for one whose last message failed.
  - **The log:** a daily `notifications.prune` keeps the log for 30 days. It also drops a message whose job was lost. The plan's Jobs table had no prune job for notifications, so this one is added.
  - **Test** sends at once, outside the queue, and reports the service's answer.
- **Delivery is at least once.**
  - The log's `sent` is written after the service answers. If the process stops in between, the job runs again on boot and the message is sent twice.
  - Holding messages back to avoid this would mean losing them in the same crash. A rare duplicate notification is the cheaper failure.
  - Matrix is the exception, through its transaction id.
- **No media-server refresh.** highsea is the media server: it replaces Plex, Jellyfin and Emby and competes with them (the owner's answer 7, the plan's decision 7). It has no connection kinds for them and never calls their APIs.
- **Email through Nodemailer** (MIT-0, [nodemailer.com/smtp](https://nodemailer.com/smtp/)), version 10, which ships its own types.
  - **Security:** each connection uses implicit TLS on 465, required STARTTLS on 587, or plain for a relay on the local network.
  - **Retries:** SMTP's reply codes decide whether to try again ([RFC 5321 § 4.2.1](https://www.rfc-editor.org/rfc/rfc5321#section-4.2.1)). A 4yz is tried again and a 5yz isn't. A connection that can't be made is tried again.
  - **The server's mail:** one email connection can be marked as the server's mail, and `sendServerMail` sends invites and password resets through it, as plain text with an HTML part.
- **Web push with VAPID:**
  - **The protocol:** a browser's subscription is an endpoint on its push service and its keys ([RFC 8030](https://www.rfc-editor.org/rfc/rfc8030)). Each message is encrypted for that browser in the aes128gcm coding ([RFC 8291](https://www.rfc-editor.org/rfc/rfc8291), [RFC 8188](https://www.rfc-editor.org/rfc/rfc8188)). It is signed with the server's VAPID key as `Authorization: vapid t=…, k=…` ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)).
  - **The library:** [`web-push`](https://github.com/web-push-libs/web-push) (MPL-2.0) builds the request with `generateRequestDetails`. highsea sends it through the fetch seam, like every other channel, with a TTL of a day.
  - **The keys:** they are made on first use and kept in the `notifications.vapid` settings row, with the private key sealed.
  - **The contact:** VAPID's `sub` is the runtime's choice, then the server mail's sender, then `mailto:highsea@localhost`.
  - **Gone subscriptions:** a 404 (expired, RFC 8030 § 7.3) or 410 (unsubscribed) makes highsea forget the subscription.
  - **Who hears it:** a Browser connection names the people whose browsers hear it.

## Alternatives considered
- **Apprise for everything:** one dependency instead of eleven adapters. But it is a Python program the owner would have to run, and highsea would know nothing of each service's rate limits or answers. It stays as one channel among the others.
- **The job queue's own retries:** simpler, but they can't wait for a service's `Retry-After`. A Discord webhook would then be retried into its rate limit.
- **Exactly once, by marking a message sent before sending:** a crash then loses the message without a trace. A notification sent twice is the kinder failure.
- **Sending web push with `web-push`'s own `sendNotification`:** it opens its own HTTPS connection, outside the fetch seam, so tests would need a TLS server and the dev server's fakes couldn't answer it.
- **Notifying Plex, Jellyfin or Emby:** ruled out by the owner's answer 7.

## Consequences
- **Two new dependencies:**
  - `nodemailer` 10.0.16 (MIT-0, no dependencies);
  - `web-push` 3.6.7 (MPL-2.0), with its dependencies `asn1.js`, `http_ece`, `https-proxy-agent`, `jws` and `minimist`, all MIT.
- **Testing:** each channel is tested against the documented request shape on the fakes. The fakes catch highsea's mistakes, not a service's changes, and the health list names a connection that keeps failing.
- **Duplicates:** a crash mid-send can deliver a message twice, except on Matrix.
- **Browser notifications** need the admin's service worker and the server's external URL over HTTPS, since push subscriptions are only made in a secure context.

## Email templates (2026-10-21)
The owner approved the email prototype ([docs/product/emails.md](../product/emails.md)) during 8b, and the server sends it.

- **One source:** the templates, their words and tokens are `@highsea/notifications/mail`, pure and browser-safe. They return MJML and plain text; the prototypes' preview renders the same code with `mjml-browser`.
- **MJML at send time:** the email channel and the service compile with `mjml` 5.4.1 (MIT), MJML's documented Node API, in `src/mail/compile.ts`, which the browser-safe entry never imports. Validation is strict, so a template mistake throws rather than sending, and `fonts: {}` keeps MJML from linking Google Fonts. Compiling costs milliseconds next to an SMTP round trip, so nothing is cached. `mjml` brings `mjml-cli` for its command, never loaded at run time; all of it is plain JavaScript. `slick`, through `juice`, is MIT written in prose, so it's a listed licence exception.
- **Images by Content-ID:** the logo and a movie's poster are attachments the HTML names as `cid:` (Nodemailer's embedded images), with a new Content-ID per message (RFC 2392). The message is `multipart/alternative`, with the text and a `multipart/related` of the HTML and its images. No email has a remote image, so they show without the reader allowing remote content and without an external URL.
- **Dark only:** the palette is Abyss, resolved from `@highsea/tokens`, with translucent roles painted to solid hex; the HTML declares `color-scheme: dark`. Clients that invert anyway turn it light and readable. The sources are Litmus' dark-mode guide, the CSS Color Adjustment spec and caniemail ([emails.md › Dark mode](../product/emails.md#dark-mode-in-mail-clients)). A light version waits until people ask (the owner's call).
- **Its sources:** the runtime hands notifications a `MailBrand`: the server's name, external URL, language and time zone; the Appearance mark when it's a PNG; and the poster from the metadata image cache at `w185`. So the package still imports neither personalization nor metadata (ADR 0036). An SVG mark, or none, gives highsea's app icon, which is read from `@highsea/brand` with `import.meta.resolve`. The accent stays highsea's.
- **The server's mail** goes through `sendServerMail(to, link)`, which renders the invite or reset with the same brand. The old plain renderer (`renderLinkMail`, `mailMessages` in `shared`) is gone.

