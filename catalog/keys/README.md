# Catalog signing keys

`development.pem` is the **development key**: a throwaway ed25519 key that signs the seed snapshot in the repo and every catalog CI builds. Only development builds trust it (`HIGHSEA_CATALOG_DEV_KEY`, on unless `NODE_ENV=production`). It's in the repo on purpose: it protects nothing, and anyone can sign with it.

The **release key** signs what a release publishes: the catalog's channels and the seed inside the image (ADR 0034, ADR 0050). It exists: the owner made it offline before 0.1.0, its id is `release-2027`, and its public half is in `RELEASE_KEYS` in `packages/catalog/src/keys.ts`. The private half and its id live only in the repository's `release` environment, as the secrets `HIGHSEA_CATALOG_KEY` and `HIGHSEA_CATALOG_KEY_ID`, never in the repo. Only the release workflow's image and catalog jobs name that environment, and each waits for the owner's approval. It has signed every release since 0.1.0 (2026-10-23); 0.4.0 (2026-11-17) is the latest.

## Setting up a release key

The owner did each of these steps before 0.1.0. They're kept for a rotation, or for setting up the `release` environment again. Nothing here is automated, and nothing goes in the repo except the public key.

1. **Make the key.** On your own machine, run `bun scripts/catalog.ts keygen release-2027`. It prints a key pair. Keep the private key offline as well, for example in a password manager.
2. **List the public key.** Add the public key and its id to `RELEASE_KEYS` in `packages/catalog/src/keys.ts`, and commit that.
3. **Make the `release` environment.** In the repository's Settings › Environments:
   - add the owner as a required reviewer;
   - limit deployments to the `main` branch, so dry runs also start from `main`;
   - add these environment secrets:

   | Secret | What |
   | --- | --- |
   | `HIGHSEA_CATALOG_KEY` | the private key from step 1 |
   | `HIGHSEA_CATALOG_KEY_ID` | its id, `release-2027` |
   | `HIGHSEA_OPENSUBTITLES_KEY` | highsea's OpenSubtitles.com API key |
   | `HIGHSEA_TRAKT_CLIENT_ID` | highsea's Trakt Client ID |
   | `HIGHSEA_TRAKT_CLIENT_SECRET` | optional; Trakt's new portal issues none (ADR 0045) |
   | `HIGHSEA_TMDB_READ_TOKEN` | highsea's TMDB API Read Access Token, built into the image so setup needs no key (ADR 0057); the owner added it on 2026-10-28 |

4. **Pages.** In Settings › Pages, set the source to GitHub Actions and the custom domain to `catalog.highsea.tv`. At the DNS host, add a CNAME record from `catalog` to `highsea-tv.github.io`. Then turn on Enforce HTTPS once GitHub offers it.
5. **Packages.** In the organisation's Settings › Packages, allow public packages. After the first release, make `highsea` public on its package page.
6. **Check.** Run the Release workflow as a dry run from `main`. Its trust and key checks should pass without a warning.

## Rotation

There's room for one rotation. A second release key can be listed beside the first, so that manifests signed with either key verify during the switch. Then the old key comes out of `RELEASE_KEYS` in a later release.
