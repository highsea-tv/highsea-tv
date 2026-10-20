# Login

- **Platforms:** Admin (`apps/server`), every breakpoint. It has no shell.
- **Prototype:** `#/admin/login` (flow A18).
- **Roadmap:** [Phase 2 › A18](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes › Setup and access](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes).

## Purpose

Gets a person into the admin with the least friction the server's security allows: a username and password, a two-factor code when they've turned it on, or single sign-on when the owner has set up an OIDC provider. Errors say what happened and what to do next.

## Entry points

- Any admin route without a session redirects here, then returns to that route after sign-in. (The prototype always goes to the dashboard.)
- **Sign out** in the ⌘K palette.

## Layout

- A single card (`s1`, `radius-lg`, `shadow-2`, max 384px) centered on `bg`, with the lockup above.
- **Sign-in step:** "Sign in to {server name}"; Username, Password, **Sign in**. When OIDC is set up: an "or" divider and **Sign in with {provider}**. A footer line for forgotten passwords.
- **Code step:** "Enter your code", one line of explanation, a 6-digit code field in mono with wide tracking, **Verify**, and **Use a different account**.
- **Single sign-on step:** "Signing in with {provider}", a spinner with "Waiting for {provider} to confirm it's you…", and **Cancel**.
- **Responsive:** the card fills the width less a 16px gutter at compact. Nothing else changes.

## States

- **Loading:** while the server's public info loads, the card shows skeletons for the title, two fields and the button.
- **Error (server unreachable):** "Can't reach the server" with the reason and **Try again**.
- **Wrong credentials (401):** the message sits under Password, which is marked invalid. The username is kept and the password field keeps focus.
- **Rate limited (429):** an alert above the button, "Too many attempts. Try again in 5 minutes."
- **Wrong code:** "That code didn't work. Codes change every 30 seconds." under the code field, which clears and keeps focus for the next try.
- **Submitting:** **Sign in** and **Verify** show a spinner and ignore repeat presses.
- **No OIDC:** the divider and the provider button are absent.
- **Permission-limited:** not applicable before sign-in. A disabled account gets the same 401 as a wrong password, so the form doesn't reveal which accounts exist.

## Interactions

- Enter in either field submits. The username field doesn't autocapitalize or spellcheck; both fields carry the right `autocomplete` values, so password managers fill them.
- **Code:** digits only (anything else is dropped as you type). The sixth digit submits on its own, and pasting a full code does too. `autocomplete="one-time-code"` lets phones offer the code from a text message.
- **Use a different account** returns to the sign-in step and clears the code.
- **Sign in with {provider}** sends the browser to the provider. The prototype simulates the round trip, then lands on the dashboard; **Cancel** returns to the form.
- **Focus:** the password field on load when the username is remembered (always, in the prototype), otherwise the username; the password again after a failed attempt; the code field on the code step.
- **Sound:** none. Admin sound is off by default.
- **Touch and D-pad:** the code field opens the numeric keypad. D-pad is not applicable.

## Copy

| Where | Text |
| --- | --- |
| Title | Sign in to {server name} |
| Footer | Forgot your password? The server's owner can reset it from Settings › Users. |
| Wrong password | That username and password don't match. |
| Rate limit | Too many attempts. Try again in 5 minutes. |
| Code step | Enter your code · Open your authenticator app and type the 6-digit code for highsea. |
| Wrong code | That code didn't work. Codes change every 30 seconds. |
| SSO wait | Waiting for {provider} to confirm it's you… |
| Unreachable | Can't reach the server · {reason} · Try again |
| Page title | Sign in · highsea |

## Data

As built in Phase 3 (ADR 0023–0025); the OpenAPI document has every shape.

- `system.publicInfo()` → `GET /api/v1/system/info/public`: `{ id, name, version, setupComplete, auth: { local, oidc: { name } | null, passkeys } }`. Unauthenticated.
- `auth.signIn({ username, password, device? })` → `POST /api/v1/auth/sign-in`. The admin gets an HTTP-only session cookie; an app sends `device` and gets a device token instead.

  ```ts
  type SignInResult =
    | { status: 'signed-in'; session: Session; token?: string; recoveryCodes?: string[] }
    | { status: 'two-factor'; challenge: string }
    // the security policy requires two-step and this person hasn't set it up (admin only)
    | { status: 'two-factor-setup'; challenge: string; secret: string; uri: string }
  ```

  Errors: 401 `invalid-credentials`, 429 `rate-limited`.
- `auth.twoFactor({ challenge, code })` → `POST /api/v1/auth/two-factor`: a code from the app, a recovery code, or the first code while enrolling. Returns `SignInResult`.
- `auth.passkeyOptions()` → `POST /api/v1/auth/passkeys/options`, then `auth.passkeySignIn({ challenge, response })` → `POST /api/v1/auth/passkeys/verify`. Passkeys are discoverable, so no username is needed.
- OIDC → `GET /api/v1/auth/oidc/start`, a redirect to the provider and back to `/api/v1/auth/oidc/callback`, which sets the cookie and redirects to the admin, or to `/login?error=…`.
- `Session` is `{ user, deviceId, expiresAt, method }`. The cookie is `__Host-highsea_session` over HTTPS and `highsea_session` over plain HTTP.

## Decisions

- **One generic credentials error** for an unknown user, a wrong password or a disabled account, so the form doesn't reveal which usernames exist.
- **Credential errors sit under Password;** other errors (rate limit, server) use an alert above the button, since they're not about a field.
- **The code submits itself at six digits.** There's still a Verify button for people who expect one, and for assistive tech.
- **No "Remember me".** Sessions last 30 days on the device and can be revoked from Settings › Devices.
- **Password reset goes through the owner.** A self-hosted server can't assume it can send email, so the footer says who can help instead of offering a link that may not work.
- **The prototype prefills the username "ines"**, who has two-factor on, so the code step is one password away. The toolbar's hints list the test passwords. The product leaves the field empty.

## Open questions

- **Recovery codes.** What does someone do when they've lost their authenticator? A "Use a recovery code" link on the code step, with codes issued when two-factor is turned on?
- **Passkeys.** Should passkeys sit beside the password from M1, or later?
- **OIDC only.** When the owner turns local sign-in off, should the page go straight to the provider, or show the provider button alone?
