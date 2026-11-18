# 0066. Client error reports: what the apps send, only to their own server

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Phase 5 puts highsea in real use on the owner's NAS, on the web, the desktop app, the iPhone and the Apple TV ([phase-5-real-use.md](../plans/phase-5-real-use.md), A2a). A finding from the sofa is "the film didn't start on the Apple TV": without the error, the device and what the server decided, it can't be reproduced. The server already writes crash reports for its own failures ([ADR 0047](0047-operations.md)), but an app's failure never reaches it: a screen that throws is lost with the app, and a play that fails shows a message and leaves no trace.

The usual answer is a hosted error service. highsea sends nothing to anyone (ADR 0047's crash reports: "Nothing is sent anywhere"), and a report names a person's device and what they were watching, so it stays on the owner's server or doesn't exist.

## Decision

- **One route:** `POST /api/v1/system/client-reports`, for anyone signed in (`user`). An app sends a report to the server it's signed in to, through its own client, and to nobody else. Staff list them (`GET /system/client-reports`) and download one (`GET /system/client-reports/{id}`).
- **What a report carries** (`ClientReportInput`): its kind (`error` or `play`), the app (`web`, `desktop`, `ios`, `tvos` and the rest of `ClientType`), the app's version, the device (its model and system from [expo-device](https://docs.expo.dev/versions/latest/sdk/device/), or a browser's user agent), the screen's address, and the error: its name, message, stack and React's component stack.
- **Nothing about the person beyond their id.** The app sends no name, account or token. The server adds the user id from the sign-in, the time and its own version. The schema lists every field; anything else an app sends is dropped by the parse, and a test checks it.
- **A failed play** also carries what was asked for (the title, version, sound and subtitle), the built-in profile the app named, the session's id, the server's decision with its reasons (`PlaybackDecision`, [ADR 0051](0051-playback-engine.md)) and where the stream was. The server adds the device's profile as it decides from it, the built-in one with the device's own report laid over it (`profileFor`, [ADR 0052](0052-device-profiles.md)), so the decision can be made again from the report.
- **Limits:**
  - a body over 64 KB is refused before it's read, with Hono's [Body Limit Middleware](https://hono.dev/docs/middleware/builtin/body-limit), and each field has its own length;
  - the server keeps the newest 200 in `<config>/client-reports/`, a JSON file each, and removes the oldest as new ones arrive;
  - an app sends the same failure on the same screen once, and ten reports a run at most.
- **One switch.** (Reports from the apps are now always kept: the dated section of 2026-11-18.) Reports are kept only when General › Diagnostics' **Write crash reports** is on, the owner's switch for crash reports (ADR 0047, the owner's answer 12 there). With it off the route answers 204 and keeps nothing, so an app never learns or cares which.
- **Where the owner sees them:** System › Logs, in a group below Crash reports drawn the same way: the error's first line, the time, the app with its version and screen, the size, and **Download report**. **Download logs** ends with the reports, each as one of the log's JSON lines (`error`, from `client`, the report in its fields), so one file has both.
- **In the apps,** once for every client, in the shared shell (`apps/client/src/shell/reports.tsx`):
  - a React error boundary around the signed-in shell. `componentDidCatch` gets the error and the component stack ([React: Component](https://react.dev/reference/react/Component#componentdidcatch)); the boundary reports it and draws a plain screen with **Go home** in place of the tree that failed;
  - in a browser, the page's [`error`](https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event) and [`unhandledrejection`](https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event) events, for failures outside a render;
  - the player, when its state becomes `failed`.
- **A report never breaks the app.** The sender (`createReporter` in `@highsea-tv/client/data`) never throws, drops a report that can't be sent and never reports that failure, so it can't loop.

## Consequences

- A finding from real use can come with the report that reproduces it, and nothing leaves the owner's server.
- Reports are off until the owner turns **Write crash reports** on, as crash reports are. For Phase 5's real use the owner turns it on once on the NAS.
- A report holds a user id, a device and the address of a screen, which can name a title. It's kept in the config folder, visible to the owner and admins only, and isn't in backups, which hold the database and not this folder.
- On the phone and the TV, an error outside React's render (a rejected promise nobody caught) isn't reported: React Native documents no public way to hear of them, and the boundary and the player cover what the owner sees. A browser reports them through the page's events.
- Nothing is reported before sign-in: the route needs a session, so a failure on Choose a server or the sign-in screen stays on the device.
- Crash reports themselves still have no limit on how many are kept; they're written only on a server failure, and this ADR doesn't change them.
- The 200 kept are shared by everyone on the server: an app that failed over and over on one person's device could push others' reports out, up to the ten a run each app sends.

## 2026-11-18: the apps' reports always kept (HT-56)

The owner's decision of 2026-11-18. **One switch** no longer applies to them: a report from the apps is kept whether or not General › Diagnostics' **Write crash reports** is on, which stays the switch for the server's own crash reports (ADR 0047). The switch is off by default, so the first failed play of real use (HT-56, a resumed MKV film) left nothing to read; a report never leaves the server, so keeping it needs no one's word. The route still answers 204, and the newest 200 are kept as before.
