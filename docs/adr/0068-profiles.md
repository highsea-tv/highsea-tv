# 0068. Profiles: the people who watch with an account, chosen per device

- **Status:** Accepted
- **Date:** 2026-11-18

## Context

Phase 5's A2b ([plan](../plans/phase-5-real-use.md), the owner's answers 14 to 17) makes profiles real. The one client platform drafted them (`packages/api-contract/src/profiles.ts`, ADR 0061's B3 section): the clients draw Who's watching, Switch profile and the TV's new-profile screens from the mock, and the real server answered 501. Watch state was kept per account (ADR 0054), so a household on one account shared one Continue watching.

The owner's answers: existing watch state goes to each account's own profile (15); the profile watching now is per device, not per account, so the Apple TV can watch as one person while a phone watches as another (16); no kids' profiles or ratings limits yet (17).

Alternatives weighed:

- **The profile on the account** (as the mock keeps it): one switch moves every app. Answer 16 rules it out.
- **The profile sent with each request** (a header): every client would have to keep and send it, and a request without one would need a rule anyway. Keeping it on the device the server already knows from the token needs nothing new from the clients.
- **A separate id for the account's own profile:** every read by a user id (API keys, a forward-auth proxy's request, code not yet aware of profiles) would need a lookup to find it.

## Decision

- **The model.** A `profiles` table under each account (`packages/db/src/schema/auth.ts`): name, tone, a PIN kept only as a hash, `main` for the account's own, wrong tries and when a rest ends. At most `MAX_PROFILES` (6). **The account's own profile has the account's id**, so the migration (`0018_profiles.sql`) only copies `user_id` into `profile_id`, and anything that reads by a user id reads the account's own profile. It's made for every existing account in the migration and for each new account (`ensureMainProfile` in `packages/auth/src/profiles.ts`), named as the account was then, and renamed independently after.
- **Watch state per profile.** `watch_positions`, `watch_history` and `playback_prefs` gain `profile_id` (ADR 0054's 2026-11-18 section), keyed `(profile_id, item_id)`, with `user_id` kept beside it for the account's events and Now playing. Home's arrangement (`home_layouts`) is keyed by profile too (ADR 0027's section). Each references `profiles` with `ON DELETE CASCADE`, so deleting a profile deletes its watch state in the same statement ([SQLite foreign keys § 4.3](https://www.sqlite.org/foreignkeys.html#fk_actions)).
- **The profile watching now is the device's.** `devices.profile_id` (`ON DELETE SET NULL`), null meaning the account's own. `authenticateDevice` puts it on the `Principal` as `profileId` (ADR 0023's section); an admin's session cookie is a device as well. An API key and a forward-auth proxy's request have no device and watch as the account's own; `choose` from them is 403 with `reason: 'no-device'`. `choose` changes only the asking device, then tells the account's apps (`profiles.updated`, `watch.updated`, `home.updated`) so each reads its own profile again.
- **PINs.** Four digits, hashed with Argon2id as passwords are (ADR 0023, [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106)), never returned: the apps see `hasPin`. A missing PIN is checked against the hash like a wrong one. A wrong PIN is 403 with `{ field: 'pin', reason: 'wrong-pin' }` (not 401, which says the app isn't signed in: [RFC 9110 § 15.5.2](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.2)); the fifth wrong in a row rests the profile for a minute, 429 with `retryAfter` ([RFC 6585 § 4](https://www.rfc-editor.org/rfc/rfc6585#section-4)). Wrong tries count against the profile, not the device, so moving to another app doesn't reset them; the rest ends by itself, as the [OWASP Authentication Cheat Sheet's Account Lockout](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#account-lockout) advises, so a lockout can't keep someone out for long. The profile watching now needs no PIN.
- **Audit.** A profile added (`profile.create`), deleted (`profile.delete`) and its PIN set or turned off (`profile.pin-set`, `profile.pin-off`); renames and colours aren't recorded.
- **Who reads the profile.** Everything that reads or writes watch state takes it: the library's items and search (`packages/media/src/movies/client.ts`), positions, Watched, Remove from Continue watching, the player's picks and Next up (`watch.ts`, `playback.ts`, a `Watcher` of account and profile), Home's Continue watching (`curation-library.ts`), smart collections' watch rules (`collection-query.ts`, ADR 0049's section), Home's arrangement. Audiences of announcements, featured sections and collections stay the account's: a profile isn't a role. Now playing, its history and the playback started notification name the profile beside the account (`now-playing.ts` keeps its name when the session starts; the history stores it, `playback_history.profile_name`). Trakt's watchlist and the account's preferences (theme, sound, the apps' playback settings) stay the account's or the device's.
- **Served.** The `profiles` group loses `draft()`, public info's `sources` lists `profiles`, and the clients, which already hide profiles unless it's listed (ADR 0061's section), draw them from the server.

## Consequences

- Two people on one account no longer share Continue watching, Watched or Next up, and a TV and a phone can watch as different people at once.
- Code still passing a user id where a profile id belongs reads the account's own profile rather than failing: safe, but a missed call site shows the wrong person's state instead of an error. The tests cover each read the plan names.
- A profile with a PIN keeps casual hands off, not a determined person on the account: anyone signed in can delete the profile or turn its PIN off, as on the services the design follows. Kids' profiles and ratings limits (answer 17) come later, on this model.
- The admin shows profiles only in Now playing and as a count in Users; managing another person's profiles from the admin is left for later.

## 2026-11-18: built (Phase 5's A2b, HT-52)

As above. `bun run openapi` regenerated the document; `profiles.updated` keeps its name in `DRAFT_TOPICS` (shows' and music's are still drafts there).
