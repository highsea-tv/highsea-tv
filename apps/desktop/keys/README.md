<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# The desktop app's update keys

Tauri's updater installs an update only when its signature verifies against the public key in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). It can't be turned off (https://v2.tauri.app/plugin/updater/#signing-updates).

`development.key` is the **development key**: a throwaway minisign key, with no password, that signs the installers CI builds in a dry run. It's in the repo on purpose, as the catalog's `development.pem` is: it protects nothing, and anyone can sign with it.

The **release key** signs what a release publishes. It was made on 2026-10-29, on the owner's word, on the owner's Mac: the private key is `~/.tauri/highsea-release.key`, its password beside it in `highsea-release.key.password`, both readable only by the owner and never in the repo. Its public half (key ID `104A54152D2B47D3`) is in `tauri.conf.json`, so steps 1 and 2 below are done; the owner added step 3's secrets to the `release` environment on 2026-10-29. `bun scripts/release.ts check` fails whenever the config has the development key.

## Before the first release with the desktop app

The owner does each of these. Nothing goes in the repo except the public key.

1. **Make the key.** On your own machine, run `bunx tauri signer generate -w ~/.tauri/highsea-release.key` in `apps/desktop`, with a password. Keep the private key and its password offline as well, for example in a password manager. A lost key means installed apps can't take updates any more, only a fresh install.
2. **List the public key.** Put the contents of `highsea-release.key.pub` in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, and commit that.
3. **Add the secrets** to the repository's `release` environment:

   | Secret | What |
   | --- | --- |
   | `TAURI_SIGNING_PRIVATE_KEY` | the private key from step 1 |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | its password |

   And, once the owner has the Apple Developer membership (answer 7), for the Mac app's signing and notarization (ADR 0058):

   | Secret | What |
   | --- | --- |
   | `APPLE_CERTIFICATE` | the Developer ID Application certificate, exported as .p12 and base64-encoded |
   | `APPLE_CERTIFICATE_PASSWORD` | the .p12's password |
   | `APPLE_SIGNING_IDENTITY` | `Developer ID Application: <name> (<team id>)` |
   | `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8` | an App Store Connect API key for notarization |

   The Windows installer stays unsigned until 1.0 (the owner's answer of 2026-10-29).
4. **Check.** Run `bun scripts/release.ts check <version>`, then the Release workflow as a dry run from `main`.
