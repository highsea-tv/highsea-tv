# Phase 3: the admin for the owner and admins only

- **Status:** Built on 2026-10-20 on the owner's go-ahead. The owner reviewed it the same day and answered the judgement calls put to them ([Owner's answers at review](#owners-answers-at-review)).
- **Gate:** stop when it's built. Report what was built, the judgement calls, the API changed, screenshots and the check results, then ask for review. Checkpoint 5 (indexers) starts only after sign-off.
- **Parent plan:** [phase-3-server.md](phase-3-server.md), decision 6. Its standing rules, architecture and decisions all apply. This changes checkpoint 2's signed-off work (accounts, the admin shell, users and devices), with the owner's approval.

## Read first

- [admin-shell.md](../product/admin-shell.md) (the members' sidebar this removes) and [users-devices.md](../product/users-devices.md) (roles, permissions, invites).
- [ADR 0023](../adr/0023-accounts-sessions-devices.md) (accounts, roles, sessions, devices), [ADR 0024](../adr/0024-two-step-passkeys-and-tvs.md) (two-step only ever blocks the admin), [ADR 0025](../adr/0025-single-sign-on-and-proxy-auth.md) (single sign-on links to invited accounts).
- The code: `packages/auth/src/roles.ts`, `packages/db/src/schema/auth.ts` (`ROLES`, `PERMISSIONS`), `packages/api-contract/src/common.ts` (`ACCESS`), `apps/server/src/api/guard.ts`, `apps/server/app/(admin)/layout.tsx`.

## Goal

Two kinds of access, with nothing in between:

- **Administrative:** the owner and the admins the owner invites. They open the admin and change the server, its library and its files.
- **Normal:** users. They use the client apps to watch and listen, and never open the admin or change the server.

A permission never crosses the line: no user can be given an administrative power, and the admin never shows a user a reduced version of itself.

## Owner's decisions

The owner decided these on 2026-10-20:

1. **Three roles: Owner, Admin, User.** Member and Restricted become one **User** role. What a user may do is set per person.
2. **One admin tier.** Every admin can run the server: the library, downloads, indexers, subtitles, curation and settings. These stay the owner's alone: inviting and managing people, handing over ownership, security, and backups and restore.
3. **The owner invites everyone,** admins and users. Admins can't invite, edit or remove anyone.
4. **Admins see people read-only:** the People and Devices tabs, without invite, edit, remove, reset, two-step or sign-out actions.
5. **A user's permissions:** **Ask for titles** and **Download for offline**, each on or off per person, plus their libraries ("All, now and later" or chosen). **Approve their own requests** goes.
6. **Requests are always approved by the owner or an admin,** in the admin.
7. **Clients are for watching.** They behave the same for everyone, staff included, and never show administrative actions. Client search's TMDB section, for titles not on the server, becomes a request for users with Ask for titles, and leaves out everyone else.
8. **API keys are administrative.** Only the owner and admins can make them. Users' apps sign in with device tokens.
9. **A user who signs in to the admin sees a refusal page,** not the admin: "This is where the server's owner and admins run it. To watch, use a highsea app." with **Sign out**. Once the web client exists (Phase 4), the page links to it. No admin data loads, and the API refuses their administrative calls whatever page they're on.
10. **Two-step:** the security policy becomes one switch, **Require two-step for the owner and admins**, on for new servers. Two-step only ever blocks the admin (ADR 0024), so with only staff in the admin "everyone" and "staff" meant the same thing.
11. **Demoting or removing an admin ends their admin sessions and their API keys at once.** Their client devices keep working, as a user's.
12. **The prototypes are updated,** as an approved change to locked layouts: the member views go, Settings › People shows Owner, Admin and User with the new permissions, and admins see People read-only.

## The model

| | Owner | Admin | User |
| --- | --- | --- | --- |
| Opens the admin | Yes | Yes | No: the refusal page |
| Runs the server (library, downloads, indexers, subtitles, curation, settings) | Yes | Yes | No |
| Approves requests | Yes | Yes | No |
| People: invite, edit, remove, reset, two-step, sign out devices | Yes | Read-only | No |
| Security, backups and restore, handing over ownership | Yes | No | No |
| API keys | Yes, and sees everyone's | Their own | No |
| Client apps | Yes | Yes | Yes |
| Ask for titles, Download for offline | Always | Always | Per person |
| Libraries | All | All | All, or chosen |

## What changes

### Roles and permissions

- `ROLES` becomes `owner | admin | user`. `PERMISSIONS` becomes `request | download`, a user's only. Staff hold every power by their role, not by permissions, so the owner's and admins' rows hold none.
- `isStaff` stays the one test for administrative access. `canManageUsers` becomes "is the owner". `ROLE_DEFAULTS` gives a new user **Ask for titles** and all libraries.
- **Migration** (`0004_roles`, idempotent):
  - members and restricted accounts become users, keeping their library choices;
  - each user keeps `request` and `download` if they had them, and loses every other permission;
  - staff rows lose their permission rows;
  - `autoApprove`, `manageLibrary`, `manageUsers` and `admin` are gone from the enum;
  - pending invites for Member or Restricted become invites for User.

### API access

- `ACCESS` becomes `public | user | staff | owner`. `library` and `people` go.
  - The 13 `library` routes become `staff`.
  - The `people` routes split: reading people and devices is `staff`; inviting, editing, removing, resets, two-step and signing out devices are `owner`.
  - API key routes are `staff`. An admin lists and revokes their own keys; the owner sees and revokes anyone's.
- `user` routes are the client API and the account's own (profile, preferences, devices, sign-out). Nothing administrative is `user`.
- A test walks every contract route as each role and checks the guard's answer against the table above, so a new route can't slip through with the wrong level.

### The admin

- **The layout's gate:** after setup and sign-in, a user gets the refusal page (decision 9) at every admin address. The page is a server component and loads no admin data.
- **The shell** loses the members' sidebar, palette and status bar variants. The admin has one shape, plus the owner-only items.
- **Settings › People** for admins: the list and devices without actions, and no **Invite someone**. The Edit sheet and invite dialog offer Admin and User; **What they can do** shows only for User.
- **Discover, Movies and the movie page** lose their member states (Add disabled, no bulk bar, read-only Monitored).
- **The dashboard** loses the member layout and member widgets; `WidgetRole` becomes `owner | admin`.
- **Security** shows the one two-step switch (decision 10).

### Sessions and keys

- Changing someone's role from Admin to User, or removing them, ends their admin sessions and revokes their API keys in the same transaction, and audits it. Their device tokens stay valid and are checked as a user's from the next request.
- Single sign-on and proxy sign-in keep linking only to invited accounts (ADR 0025). The role comes from the invite, never from the provider.

### Clients

- Client search's `discover` section: offered only to people who may ask for titles, each result marked for a request. The request flow itself comes with its checkpoint; until then the section is left out for everyone.
- Nothing else in the client API changes: it was already for everyone signed in.

### The prototypes

- `design/prototypes/src/admin`: the member variants go from the shell, nav, dashboard, Discover, Movies, movie detail, person and Activity; Settings › People shows the new roles and permissions and the admins' read-only view.
- The mock server and seed use Owner, Admin and User.

## Docs

- **ADR 0032: administrative and normal access.** The two kinds of access, the three roles, why staff powers come from the role and not from permissions, and the guard's role table.
- **Amends** ADR 0023 (roles and permissions) and ADR 0024 (the two-step policy).
- **Specs:** users-devices.md (roles, permissions, invites, admins' read-only People, API keys), admin-shell.md (one shape, the refusal page), movies.md and media-pages.md (member states removed), dashboard.md (role layouts), settings.md (Security's switch), client-search.md (the discover section), setup.md if its copy names roles.
- **Phase 3 plan:** decision 6 points here.

## Checks

- The guard's role table test (above), the migration test from every old role and permission, and the session and key revocation test.
- The server sweeps sign in as the owner, an admin and a user. As a user every admin address shows the refusal page, and the page passes axe in three themes.
- `bun run lint && bun run typecheck && bun run test`, the Node smoke test, and the sweeps for the server and the prototypes.

## Out of scope

- **The request flow** (asking, approving, the requests list): its own checkpoint. This only settles who may ask and who approves.
- **Content rating limits** for a user, as Restricted once suggested: later, as a per-person setting on User.
- **Managed profiles** without passwords (users-devices.md's open question).

## Judgement calls

- **Staff powers come from the role.** An admin with a missing permission row could otherwise be half an admin, which decision 2 rules out.
- **Admins keep their own API keys** and the owner sees all of them, so the owner can revoke any key that acts on the server.
- **The refusal page tells an outsider nothing** beyond what the sign-in page already does: that this is a highsea server.
- **Existing two-step policies:** "everyone" and "staff" become on, "optional" becomes off.

## Owner's answers at review

The owner settled these on 2026-10-20, after the build:

- **Network and metadata settings stay owner-only.** Trusted proxies decide whose forward-auth header the server believes, so an admin who could change them could sign in as the owner.
- **The owner's API keys act as an admin,** so no key manages people or changes security (ADR 0023).
- **Security and Backups are hidden from admins,** not read-only: out of their Settings and System, and refused by the API, reads included.
