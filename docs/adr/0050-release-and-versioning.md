# 0050. Release and versioning: one SemVer version, two channels, a prepared commit and a gated workflow

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Checkpoint 9 publishes highsea for the first time. Until now nothing had a release:
- `apps/server` said `0.1.0`;
- there were no tags and no changelog;
- the catalog's `releases` field (ADR 0047) had nothing to carry;
- the release key named in ADR 0034 didn't exist.

The scope and the owner's answers are in [phase-3-checkpoint-9.md](../plans/phase-3-checkpoint-9.md) › Release (9b), questions 2, 4 and 5. Decision 5 of the [Phase 3 plan](../plans/phase-3-server.md) says nothing is published until the owner says so.

Three facts shaped the design:

- **A server learns of releases only through the catalog.** The `releases` ride the main catalog's signed manifest (ADR 0047). The server fetches a manifest's bundle, and keeps its releases, only when the manifest's version is newer than the one installed (`packages/catalog/src/service.ts`). So a release that changed `releases.json` alone would never reach a server. It has to bump the catalog's version too.
- **Production servers trust release keys only** (ADR 0034). The image's seed snapshot is signed with the development key, which production refuses. So the first release has to sign the seed as well as the published channels.
- **BuildKit leaves a secret's contents out of the cache key** ([Docker: build secrets](https://docs.docker.com/build/building/secrets/)). The release image takes highsea's OpenSubtitles.com key and Trakt application as build secrets. A layer that CI cached without them would be reused by a release build that has them.

## Decision

### Versions

- **One version for highsea:** `apps/server`'s `version`, in [Semantic Versioning 2.0.0](https://semver.org/). The runtime reports it, the image is tagged with it, and the changelog, the catalog's `releases` and the git tag `v0.1.0` all name it.
- **The workspace packages aren't released on their own,** so they stay unversioned. The design system's `1.0.0` is the design system's own version.
- **A beta is a SemVer pre-release** (`0.2.0-beta.1`). It sorts before `0.2.0` (§ 11). The comparison is `compareAppVersions` in `@highsea-tv/catalog`, beside the release format, so the runtime and `scripts/release.ts` agree.
- **The first version is `0.1.0`, stable,** at the Phase 3 sign-off. `1.0.0` comes with the apps and playback in Phase 4. Under SemVer § 4, 0.x may change anything, and the changelog says so.

### Channels

| Channel | Who gets it | Image tags | Catalog |
| --- | --- | --- | --- |
| Stable | everyone by default | `0.1.0`; `0.1` while it's the newest of its line; `latest` while it's the newest stable | `stable` |
| Beta | servers set to Beta in Settings › General | `0.2.0-beta.1`; `beta` while it's the newest release of either kind | `beta`, which also lists stable releases (ADR 0047) |

There's no `edge` or nightly tag. `scripts/release.ts tags` works out a release's tags from the versions already tagged, so a fix to an older line moves only that line's tag. GitHub's Latest release follows the image's `latest`.

### The changelog

`CHANGELOG.md` at the root, in [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/):
- an `Unreleased` section that a release moves under its version and date;
- the groups Added, Changed, Deprecated, Removed, Fixed and Security;
- link references to the tags;
- written for owners, in the brand brief's voice.

It's written, not generated, so the commit style stays the owner's.

### A release is prepared in a commit

`bun scripts/release.ts prepare 0.1.0` writes everything a release changes into the working tree, for a commit on main:
- `Unreleased` moves to `## [0.1.0] - date`;
- `apps/server`'s version is set;
- `catalog/indexers/releases.json` gains the entry, newest first, at most 20. Its notes are the section's bullets as plain text, within the schema's 50 lines of 300 characters; a longer section ends with a line pointing to the release's page;
- the catalog's `CHANGES.md` gains a version for the release date, so servers fetch the manifest that lists it;
- the committed seed is rebuilt, signed with the development key as the repository's always is.

`check` confirms all of that agrees, and that the version is newer than every `v*` tag. `notes` prints the section for the GitHub release, and `trust` confirms production servers would accept what the release signs.

The plan had the workflow write the `releases.json` entry. Preparing it in a commit instead means what's published is what's in git, reviewed like any change. The release then never needs to push to main. The workflow still writes the entry, but only in a dry run of a version that hasn't been prepared.

### The workflow

`.github/workflows/release.yml` is run by hand with a version and a dry-run switch, which is on by default:

1. **prepare:** a real release comes from main and must already be prepared (`check`). A dry run prepares it in the runner when it isn't.
2. **The checks:** the whole of CI and the end-to-end run, called as reusable workflows from the same commit. Their concurrency groups carry the caller's workflow name, so a push to main can't cancel a release's checks ([GitHub: reusing workflow configurations](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)).
3. **image:** each platform on its own native runner, with:
   - the keys as build secrets;
   - the seed re-signed with the release key;
   - the OCI labels, provenance (`mode=min`) and an SBOM, checked by `scripts/image.ts attestations`;
   - `no-cache`, for the reason in the Context.

   A dry run keeps and uploads each OCI layout. A real release also pushes each one by digest (`push-by-digest=true,name-canonical=true`, [the image exporter](https://docs.docker.com/build/exporters/image-registry/)).
4. **catalog:** built and signed with the release key. A real release stops if production wouldn't trust it.
5. **Publish, only when it isn't a dry run:**
   - `docker buildx imagetools create` puts both platforms under every tag, with the description, source and licence as index annotations. GitHub reads a multi-arch image's description from there ([GitHub: the Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)).
   - The catalog deploys to GitHub Pages.
   - `gh release create` makes the release and, with it, the tag.

This follows the way Docker's GitHub Builder distributes a build: native runners, a push by digest, then a merge ([Docker: multi-platform with GitHub Actions](https://docs.docker.com/build/ci/github-actions/multi-platform/)). The builder itself isn't used, because its reusable workflow (v1.17.0) takes no build secrets, only registry logins and a GitHub token, and it builds from the Git context rather than the checkout.

### The keys

- **The release key** is generated offline by the owner (`bun scripts/catalog.ts keygen release-2027`). Its public half goes in `RELEASE_KEYS` (`packages/catalog/src/keys.ts`) through ADR 0034's rotation path. The private half and its id go only into the repository's `release` environment, as `HIGHSEA_CATALOG_KEY` and `HIGHSEA_CATALOG_KEY_ID`.
- **highsea's own keys,** `HIGHSEA_OPENSUBTITLES_KEY`, `HIGHSEA_TRAKT_CLIENT_ID` and the optional `HIGHSEA_TRAKT_CLIENT_SECRET`, are `release` environment secrets too.
- **The `release` environment requires the owner's review,** and its secrets reach only jobs that name it, after its rules pass ([GitHub: managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)). Only the image and catalog jobs name it, so no workflow builds a keyed image or signs a catalog without the owner's approval. A dry run asks for it too, so that it builds what a release would.

### The catalog's address

In production, the runtime checks `https://catalog.highsea.tv`: GitHub Pages on the organisation's repository, on its custom domain. With a custom Actions workflow a `CNAME` file is ignored ([GitHub: managing a custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)), so the domain is set in the repository's Pages settings, with a CNAME record to `highsea-tv.github.io`. `HIGHSEA_CATALOG_URL` names another address, and `off` turns it off. Development and tests have no default, so they never reach the network.

### What "publish" means

Under decision 5, publishing is any of:
- pushing an image to GHCR;
- deploying the catalog's Pages channels;
- making a tag or a GitHub release;
- submitting to an app store;
- deploying `docs.highsea.tv`.

Each one happens only when the owner says so: a real run of `release.yml` from main, approved in the `release` environment, or a deploy the owner starts. Every other run is a dry run.

## Consequences

- **A release takes two steps, both visible in git:** a commit from `prepare`, then a run of the workflow. Anything wrong in the notes shows up in review, not after publishing.
- **The first release needs the owner first:**
  - the release key generated, and its public half committed;
  - the `release` environment created with the owner as its required reviewer and the five secrets in it;
  - GHCR allowing public packages for the organisation;
  - Pages set to GitHub Actions with the custom domain.

  `trust` and the key checks stop a real run until all of that is done.
- **A release image is built from scratch each time,** which is slower than CI's cached build. That's the price of keeping keys out of shared cache layers.
- **Before the first publish, a production image checks `catalog.highsea.tv` and finds nothing.** The catalog reports the failure, and the seed keeps working.
- **A fix to an older line moves only its own tags,** so `latest`, `beta` and GitHub's Latest never go backwards.

## 2026-10-23: the docs deploy from `main`

On the owner's word, `docs.highsea.tv` went live ahead of the first release, and it stays out of the release. Vercel's `highsea-docs` project deploys every push to `main` from Vercel's GitHub integration, so a merged change to `apps/docs/content/` is the owner's word for that change ([Vercel: Git deployments](https://vercel.com/docs/deployments/git)). Pull requests get previews behind Vercel's sign-in. The other four kinds of publishing above are unchanged.

## 2026-10-28: highsea's TMDB key in the image (checkpoint 4.3c)

Setup no longer asks for a TMDB key (ADR 0057). On the owner's answer of 2026-10-28 to install-simplicity's question on the key, highsea ships its own. The owner added it to the `release` environment as `HIGHSEA_TMDB_READ_TOKEN`, TMDB's API Read Access Token, which makes six secrets there.

- **The release workflow** passes it to the image build as the `tmdb` BuildKit secret, beside the OpenSubtitles.com and Trakt keys. The key check now needs it too: a dry run without it warns, and a real run stops ([Docker: build secrets](https://docs.docker.com/build/building/secrets/)).
- **CI's image and a build from this checkout** have no secret, so they carry no key. They use `HIGHSEA_TMDB_READ_TOKEN` from their environment if it's set, as development does from `.env.local`. Without it, Health says no key is set.
- `catalog/keys/README.md` lists the secret with the others.

## 2026-10-28: the stores and `get.highsea.tv` (checkpoint 4.3c)

ADR 0057 left the stores to part C of install-simplicity.md. They're one more way a release reaches owners, and each is published only on the owner's word, as the image is.

- **`get.highsea.tv`** serves the Linux installer, `apps/docs/public/install.sh`, with `install.sh.sha256` beside it. It's a domain of Vercel's `highsea-docs` project, so it deploys from `main` with the guides, as the 2026-10-23 section says. `vercel.json` sends the domain's `/` to `/install.sh`, since Vercel serves a static file before a rewrite ([Vercel: rewrites](https://vercel.com/docs/project-configuration/vercel-json#rewrites)), and every other path to the installer's guide. The installer writes a compose file on the `latest` tag, or the version given with `--version`, and an existing one is kept, so the owner's pins stay.
- **The store listings** live in `templates/` and pin the release they were written for: Unraid's templates and `ca_profile.xml` (Community Applications reads them from this repository), and the apps for TrueNAS's community train, Umbrel and CasaOS, each copied into that store's repository by pull request. Unraid follows the tag. TrueNAS's and Umbrel's listings pin a digest, so moving them is a change in their repositories: TrueNAS's bot opens it ([truenas/apps: CONTRIBUTIONS.md](https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md)), and Umbrel's is a pull request. `prepare` doesn't touch them yet.
- **When they're submitted:** on the owner's answer of 2026-10-28, all four go in after the release that has 4.3c in it, with each listing's pin moved to that release first. TrueNAS's app passed truenas/apps' own checks and Umbrel's installed on umbrelOS 2.0.0 (install-simplicity.md's Progress).
