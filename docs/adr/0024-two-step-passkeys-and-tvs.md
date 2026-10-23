# 0024. Two-step verification and passkeys never reach the TV

- **Status:** Accepted; amended 2026-10-20 (one two-step switch; see ADR 0032)
- **Date:** 2026-10-19

## Context
The owner asked for two-step verification and passkeys, on one condition: they must not get in the way of linking a TV or signing in on one. A TV has no authenticator app at hand, no keyboard worth typing a code on, and usually no WebAuthn. Passkeys also have hard platform limits. WebAuthn runs only in a secure context (HTML's secure contexts), and a relying party id must be a domain, never an IP address (WebAuthn Level 3 § 5.1.3).

## Decision
- **TVs sign in by pairing** (connectivity.md), shaped like OAuth's device authorization grant (RFC 8628).
  - The TV shows a short user code. A phone or computer that's already signed in approves it at `/link`.
  - The TV polls with a separate device code (RFC 8628 § 3.2). Someone who reads the code off the screen can approve it, but can't collect the token.
  - A code lasts 10 minutes and works once (§ 6.1).
  - The approving device has already passed two-step or a passkey. **The TV itself never sees either.**
- **Two-step verification** is TOTP (RFC 6238 over RFC 4226): HMAC-SHA1, 6 digits, 30-second steps. That's RFC 6238's default and what authenticator apps implement.
  - **Codes:** one step of clock drift either side is accepted, and a code works once (OWASP Multifactor Authentication Cheat Sheet).
  - **Recovery codes:** ten, stored as verifiers, each single use.
  - **Storage:** the seed is sealed with the server's key.
  - **Changes:** turning two-step on or off, or making new recovery codes, asks for the password again.
- **The policy** in Settings › Security is optional, staff or everyone.
  - It forces enrolment **only in the admin**, during a password sign-in.
  - An app signing in with a password meets the code step only if that person has turned two-step on themselves. It is never asked to enrol.
- **Passkeys** use SimpleWebAuthn, following its server guide.
  - Credentials are discoverable (`residentKey: "required"`), so signing in needs no username.
  - User verification is `"required"`, so a passkey counts as two factors and skips the code step (NIST SP 800-63B § 5.1.9).
  - Attestation is `"none"`: a household server has no use for vetting authenticator models.
  - Challenges are single use and last five minutes.
- **Losing both the app and the recovery codes.** OWASP's Multifactor Authentication Cheat Sheet ("Resetting MFA") asks for the same care as the original enrolment. A household has no help desk, so a person does it.
  - Whoever manages people confirms who's asking outside highsea, then turns two-step off from the Users page (`DELETE /users/{id}/two-factor`).
  - Only the owner can do it for an admin, and nobody can do it for the owner. Your own goes through Account, with your password.
  - It removes the seed and the recovery codes, but not passkeys or devices. It's audited as `two-factor.reset`.
  - If the policy asks for two-step, they set it up again at their next admin sign-in.
  - Reset and invite links need the same standing, since either one hands the account over.
- **Where passkeys work.** The relying party id is the external URL's host when that URL is HTTPS, or `localhost`. The login page offers passkeys only where the browser exposes WebAuthn. Its interfaces are `[SecureContext]`, so that rules out plain HTTP everywhere except `localhost`.

## Consequences
- Linking a TV is the same however strict the security policy is.
- The owner has no one to vouch for them, so they keep their recovery codes or a passkey. Recovery from the host's command line, for an owner with neither, is still to come.
- Passkeys don't work at `http://192.168.x.x:3000`, as the WebAuthn spec requires. The login page hides the option there instead of failing.
- Someone who loses their phone and their recovery codes, and has no passkey, can't sign in to the admin until someone turns two-step off for them. Their apps stay signed in meanwhile.

## Amendment (2026-10-20): one switch for the owner and admins

The owner decided this with [ADR 0032](0032-administrative-and-normal-access.md). It replaces the "policy" bullet above, and in "Losing both the app and the recovery codes", "whoever manages people" now means the owner. Everything else stands.

- **The policy is one switch:** **Require two-step for the owner and admins**. Only they open the admin, and two-step only ever blocks the admin, so "everyone" and "staff" meant the same thing.
- **New servers** start with it on. Migration `0004_roles` turns "everyone" and "staff" on and "optional" off. A server that never saved Security keeps what it had: off.
- **Turning someone else's two-step off** is the owner's alone, for admins and users alike.
