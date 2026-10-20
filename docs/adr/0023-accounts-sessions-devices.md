# 0023. Every sign-in is a device

- **Status:** Accepted; amended 2026-10-20 (three roles; see ADR 0032)
- **Date:** 2026-10-19

## Context
People sign in to highsea from a browser (the admin) and from apps (web, desktop, mobile, TV). Scripts and other software use the API too. users-devices.md asks for a Devices list where any sign-in can be ended at once, roles and fine-grained permissions, per-library access, and an audit trail. Everything runs in one process on one SQLite file (ADR 0004), so there's no session store to lean on.

## Decision
- **One table for every sign-in.** Each sign-in makes a device row: a browser session or an app's token. Signing a device out deletes its row, and its secret stops working on the next request.
  - **Browser sessions** are cookies. They end after Settings › Security's session length (30 days by default).
  - **App tokens** are bearer tokens that last until signed out, as a TV or phone expects.
  - **Prefixes:** secrets name what they are: `hss_` a session, `hst_` an app token, `hs_` an API key. A leaked secret is then easy to recognise and to scan for.
- **Secrets:**
  - Every secret is 256 random bits. OWASP's Session Management Cheat Sheet asks for at least 64 bits of entropy.
  - Only a SHA-256 verifier is stored, OWASP's "one-way verifier". A fast hash is enough, because a 256-bit secret can't be guessed. Lookups go through a unique index on the verifier.
  - A fresh secret is issued at every sign-in, so a session id can't be fixed in advance (session fixation).
  - The same holds for invite and reset links and for short-lived challenges.
- **Passwords** are hashed with Argon2id from `node:crypto`, at OWASP's minimum: 19 MiB of memory, 2 passes, 1 lane (Password Storage Cheat Sheet). The hash is a PHC string, so stronger parameters later apply at the next sign-in.
- **The cookie** is `HttpOnly` and `SameSite=Lax` (OWASP Session Management Cheat Sheet).
  - Over HTTPS it's `__Host-highsea_session`. Browsers accept that prefix only with `Secure`, `Path=/` and no `Domain` (RFC 6265bis § 4.1.3.2).
  - Over plain HTTP on a LAN, where `Secure` can't be set, it has the bare name.
- **Cross-site request forgery.** Unsafe requests authenticated by the cookie must be same-origin, checked as OWASP's CSRF Prevention Cheat Sheet orders it:
  1. Fetch Metadata: `Sec-Fetch-Site` must be `same-origin` or `none`.
  2. Without that header, `Origin` must match the server's own origin.

  Bearer tokens and API keys aren't sent automatically by a browser, so this check doesn't apply to them.
- **Access is declared per route** in the contract, as `x-highsea-access`: `public`, `user`, `people`, `staff` or `owner`. One guard enforces it before every handler, so a route can't forget it, and the OpenAPI document shows it.
- **Roles and permissions.**
  - Roles (owner, admin, member, restricted) set the defaults, and permissions fine-tune them (users-devices.md).
  - The owner and admins are "staff". Only the owner can make someone an admin.
  - Library access is either all libraries or a list.
- **API keys** act for the person who made them, never beyond an admin, and are either read-only (GET only) or full. The secret shows once; keys are told apart by their first characters.
- **Sign-in throttling** follows OWASP's Authentication Cheat Sheet.
  - **Limits:** failures count per username (10 in 15 minutes) and, more loosely, per address (50 in 15 minutes). Past either limit, password and code attempts wait 5 minutes.
  - **Exemptions:** passkeys and single sign-on are never throttled, so a lockout can't be used to keep the owner out.
  - **Storage:** counts are kept in memory, so a restart clears them. An attacker can't cause a restart, so that costs them nothing useful.
- **Errors** are generic: an unknown user, a wrong password and an account that hasn't joined all get the same message (OWASP Authentication Cheat Sheet).
- **The audit log** records sign-ins, failures, role and access changes, keys, devices and settings. Entries are ordered by an insertion sequence, not by time, because two entries in the same millisecond must keep their order. It's announced on `audit.updated`.

## Consequences
- The Devices list is a plain query, and signing out "everywhere" is a delete.
- Reading the database file doesn't reveal any usable secret.
- A browser on plain HTTP gets a weaker cookie (no `Secure`). The health check flags an external URL that isn't HTTPS.

## Amendment (2026-10-20): administrative and normal access

The owner decided this after checkpoint 4. It replaces the "Roles and permissions" bullet above and the access levels in "Access is declared per route". [ADR 0032](0032-administrative-and-normal-access.md) has the details. Everything else stands.

- **Roles:** owner, admin and user. Member and restricted become user.
- **Staff powers come from the role.** Permissions are a user's alone: Ask for titles and Download for offline.
- **Access levels:** `public`, `user`, `staff` and `owner`. `people` is gone. Admins read people, and only the owner manages them.
- **API keys:** only the owner and admins make them. An admin sees their own; the owner sees everyone's.
