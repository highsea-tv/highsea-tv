# Users and devices

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `#/admin/settings/users` (A13): People, Devices and API keys tabs.
- **Roadmap:** [Phase 2 › A13](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), auth (roles, permissions, per-server device tokens, API keys), [gap analysis › permissions model](../roadmap.md#gap-analysis-what-a-true-end-to-end-replacement-still-needs).

## Purpose

Who can sign in to the server, what each person can do and watch, where they're signed in, and the keys other apps use. Everything a household owner needs to let someone in, keep a child to the right library, or cut off a lost phone.

## Entry points

- Settings › **Users and devices** (owners and admins).
- The palette ("users", "devices", "api keys").

## Layout

A settings area ([settings.md](settings.md#layout)) with line tabs: **People**, **Devices**, **API keys**. The page's primary action follows the tab: **Invite someone** or **New API key**.

- **People** (a table, stacked rows on a phone):
  - "5 people · 1 invited";
  - each person: the initial in a disc, the name and `@username`, **Invited** until they join; the role (Owner, Admin, User); the libraries ("All libraries" or the ones chosen); two-step verification (On, Off); last seen ("Just now", "3h ago", "Hasn't joined yet");
  - **Edit** and a More menu: **Send a password reset**, **Turn off two-step** (when it's on), **Remove** (or, for an invite, **Copy the invite link** and **Cancel the invite**). These are the owner's alone, and the owner's own row has none.
- **Edit** opens a sheet from the right: **Role** (Admin or User, each with what it means); for a User, **What they can do** (Ask for titles, Download for offline), reset to the role's defaults when the role changes, and **Libraries**: "All, now and later" or **Choose** (Movies; "TV shows, music and books join this list when the server has them"); **Save**. An admin can do everything except manage people, security, backups and ownership, and sees every library, so neither section shows for Admin.
- **Invite someone** (a dialog): Name, Email (optional: "Leave it empty to share a link yourself"), Role (Admin or User), Libraries (for a User), **Create invite link** (or **Send invite** with an email). Then the link itself, with **Copy link**: "Send them this link. It works once, for 7 days, and lets them choose a password."
- **Devices** (a table): a filter (Everyone's devices, or one person's); each device with its kind's icon (TV, phone, laptop), the name, **This browser** for the admin's own; the person; the app ("Apple TV · 1.0.0"); the address; last seen; **Sign out**.
- **API keys:** one card each, your own for an admin and everyone's for the owner (with whose it is): the name, Read only or Full access, the prefix (`hs_7Kq2…`), when it was made and last used; **Revoke**. **New API key** (a dialog): Name, Access (Read only: see the library, queue and status; Full access: everything an admin can do), **Make key**; then the key, once, with **Copy key** and **I've copied it**.

## States

- **Loading / error:** table skeletons; "Couldn't load the people on this server" with **Try again**.
- **Empty:** no API keys: "No API keys. Make one for a script or another app that talks to the server."
- **Invalid:** an empty name ("Give them a name."); a name already taken ("There's already someone called Mara."); choosing no library.
- **Refusals** (from the server, as toasts): "The owner stays the owner. Hand ownership over in Security first." · "The owner can't be removed." · "You can't remove yourself." · "That's the browser you're using. Sign out instead."
- **Admins (read-only):** the People and Devices tabs show the same lists without **Invite someone**, **Edit**, the More menu or **Sign out**. The API keys tab is theirs to use for their own keys.
- **Users** never open the admin: they get the refusal page ([admin-shell.md](admin-shell.md#states)).

## Interactions

- **Removing someone** signs them out everywhere and removes their devices, after a confirmation: "They're signed out everywhere and can't sign back in. Their watch history goes with them."
- **Signing out a device** stops its token at once: "It stops working at once. Ruth signs in again with a code or a password."
- **Turning off someone's two-step** is for when they've lost their authenticator app and their recovery codes. A confirmation asks you to make sure it's really them: "For when they've lost their authenticator app and their recovery codes. Make sure it's really them asking. Their passkeys and devices stay signed in." If the security policy asks for two-step, they set it up again at their next admin sign-in.
- **Making an admin a User** ends their admin sessions and revokes their API keys at once, in the same change. Their apps stay signed in, as a user's.
- **Revoking a key:** "Anything using it stops working at once. You can't undo this; make a new key instead."
- **Role changes** apply the next time that person's apps check in.
- **Sound:** none.

## Copy

| Where | Text |
| --- | --- |
| Invite sent | {Name} is invited · Send them this link. It works once, for 7 days, and lets them choose a password. |
| Reset | Reset link sent to {Name} · Their devices stay signed in. |
| Device hint | Signing a device out makes it ask for a new code or password. |
| New key | Copy your key now · This is the only time it shows. Store it where the script can read it. |

## Data

As built in Phase 3 (ADR 0023); each route's access is in the OpenAPI document.

- `users.list()` → `GET /api/v1/users` (staff). Everything else under `/users` is the owner's ([ADR 0032](../adr/0032-administrative-and-normal-access.md)).
- `users.invite(input)` → `POST /api/v1/users/invites`: `InviteInput` → `Invite`, which is the pending user, the link and its expiry.
- `users.inviteLink(id)` → `POST /api/v1/users/{id}/invite-link`: a pending invite's link, to copy again.
- `users.update(id, patch)` → `PATCH /api/v1/users/{id}`: role, permissions, libraries. Permissions and libraries are a user's; making an admin a User ends their admin sessions and API keys.
- `users.remove(id)` → `DELETE /api/v1/users/{id}`, which also cancels an invite.
- `users.resetPassword(id)` → `POST /api/v1/users/{id}/password-reset`: a link to pass on. Email arrives in checkpoint 8.
- `users.resetTwoFactor(id)` → `DELETE /api/v1/users/{id}/two-factor`: turns someone else's two-step off (ADR 0024). The owner's alone, so nobody can for the owner.
- `links.get(token)` → `GET /api/v1/links/{token}` and `links.accept(token, { password, username? })` → `POST /api/v1/links/{token}/accept`, for the invite and reset pages. Links work once, for 7 days.
- `devices.list({ userId? })` → `GET /api/v1/devices` (staff); `me.devices()` → `GET /api/v1/me/devices`; `devices.revoke(id)` → `DELETE /api/v1/devices/{id}`: your own, or anyone's for the owner.
- `apiKeys.list()`, `apiKeys.create({ name, scope: 'read' | 'full' })` → `CreatedApiKey` (the secret, once), `apiKeys.revoke(id)`. Staff: an admin lists and revokes their own keys, the owner everyone's. Users' apps sign in with device tokens instead.
- `audit.list({ cursor? })` → `GET /api/v1/audit`, newest first.
- Events: `users.updated`, `audit.updated`.

## Decisions

- **Invites are links first,** email second: most households pass the link in a chat. The link is single-use and lasts a week.
- **Three roles: Owner, Admin, User** ([ADR 0032](../adr/0032-administrative-and-normal-access.md); owner's decision, 2026-10-20). The owner and admins run the server by their role; a user's **Ask for titles** and **Download for offline** are set per person. No permission grants an administrative power. Changing the role resets the permissions to its defaults.
- **The owner invites everyone,** admins and users. Admins see People and Devices read-only.
- **One owner,** changed only by handing the server over (Security), never by editing a role.
- **Only the owner and admins open the admin** (owner's decision, 2026-10-20). Requests are always approved by the owner or an admin, in the admin; **Approve their own requests** is gone.
- **Library access is "all, now and later" by default,** so a new library (TV shows) doesn't need everyone re-granted; a user's can be chosen instead. Staff see every library.
- **API keys are administrative.** Only the owner and admins make them, and the owner sees all of them, so any key that acts on the server can be revoked.
- **Keys show once** and are listed by prefix; a lost key is revoked and replaced, never recovered.
- **Reset links and invite links need the same standing as editing the person.** Either one hands over the account, so only the owner makes them.
- **Two-step recovery goes through a person** (OWASP Multifactor Authentication Cheat Sheet, "Resetting MFA"). The owner confirms who's asking outside highsea, then turns it off. The owner keeps their recovery codes or a passkey: no one above them can vouch for them.
- **This browser can't sign itself out here.** Signing out is in the profile menu, where it's expected.

## Open questions

- **Managed profiles without passwords** (children on a shared TV): a profile picker on the TV, instead of an account each?
- **Content rating limits** for a user: a per-person setting on User, later.
- **Invite by QR** for a TV in the same room?
- **Key scopes:** are read and full enough, or do scripts need per-area scopes (downloads only)?
