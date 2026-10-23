# Connectivity: connect, sign in, switch servers

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web/connect`, `#/mobile/connect`, `#/tv/connect` (C1). The toolbar's **Connection** (on the LAN, remote, unreachable) shows the connection states on every client screen.
- **Roadmap:** [Phase 2 › C1](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Connectivity, local and remote](../roadmap.md#connectivity-local-and-remote-highseanetwork--sdk), [optional highsea cloud](../roadmap.md#gap-analysis-what-a-true-end-to-end-replacement-still-needs) (find my servers, relay).

## Purpose

Getting from "I installed the app" to watching, on any network, with as little typing as possible. The app finds servers on the network by itself, takes an address when it can't, and signs in. Once it knows a server, it reaches it on the LAN or remotely without being asked, and says so when it can't reach it at all. On TV, where typing is slow, sign-in is by code from a phone.

## Entry points

- First launch: the app opens here.
- The server switcher (web top bar, mobile header sheet): **Add a server**, or a server you're signed out of.
- Profile › **Sign out of {server}**.
- Unreachable: **Switch server** (web, mobile) or **Another server** (TV).

## Layout

### Web and mobile

One column (max 28rem), in a card on a desktop and full width on a phone, under the lockup.

- **Choose a server:**
  - **Your servers:** servers this device has signed in to: the mark, the name, "{Owner}'s server · signed in · just now".
  - **On this network:** servers answering discovery that aren't yours yet, appearing as they answer (nearest first, over about two seconds), with "Looking…" while the scan runs and **Look again** after. With nothing new: "Only servers you already use answered." or "No servers answered. They may be on another network, or discovery may be off: add one by address."
  - **Add a server by address:** one field (mono), the hint "Its name or IP, with the port if it isn't 443", **Connect**.
  - **Find my servers with a highsea account** (collapsed): what highsea cloud does and that it's optional.
- **Sign in to {server}:** the server and how it was reached ("On this network, at 192.168.1.20:3000" or "Remotely, through harbor.example.net"); Username; Password; **Sign in**; **Sign in with {OIDC provider}** when the server offers it.
- **Two-step verification:** the 6-digit code field; **Verify**.
- Back (←) returns to Choose a server.

### TV

- **Sign in with your phone** (the default):
  - left: the server's mark and name; the title; two numbered steps ("On your phone or computer, go to harbor.example.net/link, or scan the code." · "Enter KQ7-4PM and approve this TV."); the status ("Waiting for approval. The code works for 10 minutes." → "Approved. Signing in…");
  - right: the QR code (22u), "Scan with your phone's camera";
  - actions: **Use a password**, **Another server**.
- **Use a password:** the username and password as two fields, an on-screen key grid (10 columns: a–z, 0–9, `.`, `-`, `_`, `@`), then **Delete**, **Next** / **Sign in**, **Use a code instead**.
- **Servers on this network:** the discovered servers as a list, then "{n} answered. Add one by address from the highsea app on your phone."

### The switcher

- **Web:** the top bar's server name opens a menu: each known server with how it's reached ("On this network · 192.168.1.20:3000", "Remote · harbor.example.net", "Signed out · last used 9d ago"), then **Add a server**.
- **Mobile:** the header's server name opens a sheet with the same list, a check on the current one, and **Add a server**.
- **TV:** **Another server** on sign-in and on the unreachable screen. Switching while signed in is in Settings (C7).

## States

- **On the LAN:** nothing to say. The address won the latency probe.
- **Connected remotely:** the LAN didn't answer and the remote address did. The switcher says "Connected remotely" (web: a pill beside the name; mobile: a line under it; TV: under the server name, top left). Everything works; streams may be transcoded down for the connection (C5).
- **Unreachable:** neither answered. Web and mobile replace the page with "Can't reach {server}" · "highsea tried {server} on this network and at its remote address. It may be off, or the network may be down. Downloads still play." with **Try again** and **Switch server** (mobile: **Watch downloads** first). TV: the same, with **Try again** and **Another server**.
- **Discovering:** servers appear one by one; the list never jumps (new ones append).
- **Errors:** "That doesn't look like an address. Try harbor.example.net or 192.168.1.20." · "Nothing answered at {address}. Check the address, and that the server is running and reachable from here." · sign-in and 2FA errors as on the admin's sign-in ([login.md](login.md#copy)).
- **Loading:** buttons show their spinner while probing or signing in.

## Interactions

- **Choosing a server** probes it first, then asks for sign-in; the probe's answer decides the line under the server's name.
- **Failover is automatic:** the client probes the LAN addresses and the remote one by latency and keeps the winner; it re-probes on network changes. Nobody picks "local" or "remote".
- **TV pairing:** the TV asks the server for a code, shows it and its QR (`{public URL}/link?code=…`), and polls. A signed-in phone or computer opens the link, sees "Sign in {TV name} as {you}?" and approves; the TV receives a device token. The code lasts 10 minutes and is single-use. In the prototype, approval arrives after eight seconds.
- **Keyboard and D-pad:** web and mobile are native controls in reading order. On TV the key grid is a spatial-focus grid; the fields switch with **Next**.
- **Sound:** TV plays `navigate` and `select` as everywhere; nothing extra here.

## Copy

| Where | Text |
| --- | --- |
| Title | Choose a server |
| Address hint | Its name or IP, with the port if it isn't 443: harbor.example.net, 192.168.1.20:3000. |
| highsea cloud | Optional. If your server's owner turned on highsea cloud, signing in with your highsea account lists every server shared with you, and connects through the relay when there's no other way in. Your media never passes through it unless that's the only route. |
| TV steps | 1. On your phone or computer, go to {url}, or scan the code. · 2. Enter {code} and approve this TV. |
| TV status | Waiting for approval. The code works for 10 minutes. · Approved. Signing in… |
| Remote | Connected remotely |
| Unreachable | Can't reach {server} · highsea tried {server} on this network and at its remote address. It may be off, or the network may be down. |

## Data

- `connect.known()` → the SDK's saved servers (`KnownServer`: addresses, signed in, last seen). Stored on the device, not the server.
- `connect.discover()` → UDP broadcast of `highsea:discover:1` to port 7368, and mDNS `_highsea._tcp` answers (`DiscoveredServer`; ADR 0020).
- `connect.probe(address)` → `GET {address}/api/v1/system/info/public`: `ProbeResult` (public info plus the address and `reachability`).
- `auth.signIn`, `auth.twoFactor` → as the admin, with `device`: clients receive a **per-server device token**. They're never asked to enrol in two-step (ADR 0024).
- **Pairing,** shaped like OAuth's device authorization grant (RFC 8628):
  1. `auth.startPairing({ device })` → `POST /api/v1/auth/pairing`: `Pairing`, which is `{ code, pollToken, url, expiresAt, interval }`.
  2. The TV polls with `auth.pollPairing` → `POST /api/v1/auth/pairing/poll` with its `pollToken` every `interval` seconds. It gets `pending`, or `signed-in` with its token once. A 404 `pairing-expired` means the code ran out.
  3. The approving device reads `auth.pairingRequest` → `GET /api/v1/auth/pairing/{code}`, then calls `auth.approvePairing` → `POST /api/v1/auth/pairing/{code}/approve`.

  The code shown on the TV can't collect the token.
- Reachability comes from the SDK's `ServerConnection` (roadmap), not from the server.

## Decisions

- **The TV signs in by code first.** Typing a password with a remote is the slowest thing a TV asks for; a phone is nearly always nearby. The key grid stays as the fallback, for households without one.
- **Pairing codes are needed when the TV app ships** (Phase 4). The roadmap's auth section has them as "later; the model supports them": this moves them to the TV app's release, not the server's M1.
- **Discovery results append, nearest first,** and never reorder, so a server doesn't move under the pointer or the finger.
- **Remote is a fact, not a mode.** The app says "Connected remotely" and carries on; there's no switch to flip.
- **Unreachable points to what still works:** downloads on mobile and desktop, another server everywhere.
- **highsea cloud is collapsed and explained,** never the default path, matching the roadmap's opt-in cloud.

## Open questions

- **Discovery port and Docker:** discovery needs host networking or a published UDP port (roadmap › Docker). Should the app tell people why nothing answered when it's running in a container on the same machine?
- **TV approval UI on the phone:** a page on the server (`/link`) or a screen in the mobile app? The page works without the app; the app can skip typing the code with the QR.
- **Remember me:** device tokens don't expire unless revoked. Should a TV have a shorter life?
