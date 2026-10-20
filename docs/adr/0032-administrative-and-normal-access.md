# 0032. Administrative and normal access

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Checkpoint 2 built four roles (owner, admin, member, restricted) and six permissions on top of them (ADR 0023). Members could open the admin with a shorter sidebar, and "Manage the library" or "Manage people" could hand one person part of an admin's powers. Reviewing checkpoint 4, the owner decided the admin is for the owner and admins only (the Phase 3 plan's decision 6). The decisions behind this record are in [phase-3-admin-access.md](../plans/phase-3-admin-access.md).

Half-powers were the problem. A member with "Manage the library" saw an admin with parts missing, and every screen needed a reduced state for them. A permission row that went missing could leave an admin with only some of their powers.

## Decision
- **Two kinds of access, with nothing in between.**
  - **Administrative:** the owner and the admins the owner invites. They open the admin and change the server, its library and its files.
  - **Normal:** users. They use the client apps to watch and listen. They never open the admin or change the server.
- **Three roles: Owner, Admin, User.** Member and Restricted become User.
- **Staff powers come from the role, not from permissions.**
  - `isStaff(role)` is the one test for administrative access. The owner's and admins' permission rows are empty.
  - `PERMISSIONS` is a user's alone: `request` (Ask for titles) and `download` (Download for offline), each set per person. A new user gets Ask for titles and all libraries.
  - Staff see every library. A user sees all libraries, now and later, or the ones chosen for them.
  - No permission grants an administrative power. That way no admin can be half an admin, and no user can be half staff.
- **One admin tier.**
  - Every admin runs the server: the library, downloads, indexers, subtitles, curation and settings, and they approve requests.
  - Some powers stay the owner's alone: inviting and managing people, handing over ownership, security, and backups and restore.
- **The guard's table.** Each route declares its access in the contract (`x-highsea-access`, ADR 0023), and the levels are now `public | user | staff | owner`. `people` and `library` are gone.

  | Access | Who | What it covers |
  | --- | --- | --- |
  | `public` | Anyone | Sign-in, setup, links, pairing from the TV's side, public server info |
  | `user` | Anyone signed in | The client API (items, search, metadata, home, preferences, appearance) and the account's own (profile, password, two-step, passkeys, devices, sign-out) |
  | `staff` | Owner and admins | Running the server: movies, root folders, profiles, formats, settings reads, the dashboard, system, audit, reading people and devices, API keys |
  | `owner` | The owner | Inviting, editing and removing people, reset and invite links, turning off someone's two-step, security, network and metadata saves, role dashboard defaults |

  - The 13 former `library` routes are `staff`.
  - The former `people` routes split. `GET /users` is `staff`, so admins can see people read-only. Inviting, editing, removing, reset links, invite links and two-step resets are `owner`.
  - Signing out someone else's device is the owner's alone. Anyone can sign out their own.
  - A test walks every contract route as each role and checks the guard against this table.
- **Routes moved from `user` to `staff`.** These belong to the admin, not to the client API, so nothing administrative is left at `user`:
  - the dashboard: `GET`, `PUT` and `DELETE /me/dashboard`;
  - the admin's library views: `GET /movies` and `GET /movies/{id}`, which carry files, paths and profiles (the apps read `/items`);
  - `GET /qualityprofiles`, `GET /qualityprofiles/{id}` and `GET /languageprofiles`;
  - `GET /system/jobs`.

  `GET /movies/recent` and `GET /movies/upcoming` stay `user`, because the clients' home shows Recently added.
- **API keys are administrative.**
  - Only the owner and admins can make them. Users' apps sign in with device tokens instead.
  - An admin lists and revokes their own keys. The owner sees and revokes everyone's, so any key that acts on the server can be stopped.
  - A key still acts no further than an admin (ADR 0023). The owner's keys are capped at admin, so they can't manage people or change security.
  - A key whose person is no longer staff is refused.
- **Demoting or removing an admin ends their staff access at once.**
  - Making an admin a User deletes their admin sessions and their API keys in the same transaction as the role change. It's audited with the change.
  - Removing someone deletes their account, and with it every session, token and key.
  - A demoted person's device tokens stay valid, so their apps keep working. From the next request they're checked as a user's.
- **The refusal page.**
  - After setup and sign-in, a user gets a refusal page at every admin address: "This is where the server's owner and admins run it. To watch, use a highsea app.", with **Sign out**.
  - It's a server component and loads no admin data. Once the web client exists (Phase 4), it links there.
  - It tells an outsider nothing the sign-in page doesn't already: that this is a highsea server.
  - The API refuses a user's administrative calls whatever page they're on.
  - An open admin whose person is demoted reloads into the refusal page.
- **Two-step is one switch:** **Require two-step for the owner and admins**. Two-step only ever blocks the admin (ADR 0024), and only staff open the admin now, so "everyone" and "staff" meant the same thing.
  - It's on for new servers.
  - Migration `0004_roles` maps "everyone" and "staff" to on and "optional" to off.
  - A server set up before the migration that never saved Security had "optional" by default. The migration writes off for it, so its behaviour doesn't change.
- **Client search's `discover` section** offers TMDB titles that aren't on the server as requests. It goes only to people who may ask for titles: staff always, users with Ask for titles. The request flow comes with its own checkpoint, so until then the section is left out for everyone.
- **Migration `0004_roles`** is written by hand. In SQLite the role and permission enums are TypeScript-only, so drizzle-kit has nothing to generate. Every statement is safe to repeat.
  - Member and restricted accounts, and pending invites for them, become users. They keep their library choices.
  - Users keep `request` and `download` if they had them. Every other permission row goes, and staff lose all of theirs.
  - The saved `role:member` and `role:restricted` dashboard layouts are deleted. `WidgetRole` is `owner | admin`.
  - The two-step policy is mapped as above.
- **Single sign-on and proxy sign-in** still link only to invited accounts (ADR 0025). The role comes from the invite, never from the provider.

## Consequences
- The admin has one shape. The members' sidebar, palette, status bar, dashboard and the reduced Discover, Movies and movie page are gone.
- Admins see Settings › People read-only: the list and devices, with no actions and no **Invite someone**.
- A member who used to add titles in the admin can't any more. They'll ask for titles once requests arrive, and the owner or an admin approves.
- An admin can't invite people. In a household with one owner, the owner does all the inviting.
- Saving network and metadata settings stays owner-only, as checkpoints 2 and 4 built it. Trusted proxies decide whose forward-auth header the server believes, so an admin who could change them could sign in as the owner. The owner confirmed this on 2026-10-20.
- Security and Backups are left out for admins: not in their Settings, not at their addresses, and no Backups tab in System. The API refuses admins those settings, reads included. The owner chose this over a read-only view on 2026-10-20.
- A future per-user setting such as a content rating limit goes on User. It doesn't bring back a role.
