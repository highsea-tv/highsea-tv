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

## 2026-10-29: the Synology package on each stable release (install-simplicity.md, part D)

The release workflow has an `spk` job. For a stable version it builds the Synology package (ADR 0057's 2026-10-29 section) with `bun scripts/spk.ts build`, with the commit's time as `SOURCE_DATE_EPOCH` so the same commit makes the same package ([SOURCE_DATE_EPOCH](https://reproducible-builds.org/specs/source-date-epoch/)), and uploads it. `github-release` attaches it to the GitHub release. A prerelease gets none, since DSM's versions can't hold one, and the release goes ahead without it. A dry run builds and uploads it for review, and publishes nothing.

**The package source.** highsea's own source at `packages.highsea.tv` (install-simplicity.md's answer 8) lets Package Center list the package under Community and offer its updates. Synology doesn't document what a package source answers, so it answers as [SynoCommunity's spkrepo](https://github.com/SynoCommunity/spkrepo) does (`views/nas.py`, `domain/catalog.py`), the server the community sources run: Package Center sends the NAS's DSM build, architecture and language, and gets `{"packages": [...]}` with an entry per package that runs on that build. That needs code per request, not the static hosting the docs and catalog use, so it's `apps/packages`, one Vercel Function ([Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js)) with the icons beside it.

- **Where the package comes from:** each stable release also attaches `highsea-spk.json`, written by `scripts/spk.ts` beside the `.spk`: its version, file name, size, MD5 and SHA-256, the DSM it needs and its dependency. The function reads the manifest from GitHub's Latest release (`releases/latest/download/highsea-spk.json`) at most every five minutes, keeps the last good one while GitHub is unreachable, and links the package to that release's asset. So a release publishes itself to the source, with nothing to deploy, and a fix to an older line, which doesn't take Latest, doesn't replace it. Before any release has a manifest the source says so with a 503.
- **The entry:** spkrepo's fields, with its quick flags worked out as spkrepo does: the install wizard means no quiet install or start, and with no upgrade wizard upgrades are quiet, so automatic updates can run. A DSM older than the package's `os_min_ver` gets an empty list. Someone opening the address in a browser is sent to the guide.
- **Tried on the DS1520+ on 2026-10-29,** from this Mac on the LAN with a local manifest: DSM 7.4.1 asks with a GET and its query (`build`, `arch`, `language`, `major`, `minor`, `package_update_channel` and others), lists highsea under Community with its icon, description, publisher and dependency, downloads the package through a redirect as GitHub's links give, adding its own query (GitHub ignores it), installs it through the wizard, and offers **Update** when the source lists a newer build. DSM keeps the sources' answers in `/run/synopkg/pkglist/` and fetches them again on its own schedule, so an update shows some time after the release. DSM 7.4 has no trust level setting to change. Afterwards the package, its share, user and group and the test source were removed.
- **Hosting,** on the owner's word of 2026-10-29: Vercel's `highsea-packages` project, root `apps/packages`, no framework, deploying a push to `main` only when something it depends on changed, with preview URLs behind Vercel's sign-in as the docs have them. `packages.highsea.tv` is on it; its CNAME is a DNS-only record in Cloudflare, which the owner adds. On the owner's word of 2026-10-29, 0.2.0's package and manifest were built from `main` (the release came before the package) and attached to its release, so the source lists 0.2.0-0001; later stable releases attach their own.

## 2026-10-29: the desktop app on each stable release (checkpoint 4.4a)

The desktop app carries the release's version like everything else: `scripts/release.ts prepare` sets it in `apps/desktop/src-tauri/tauri.conf.json`, `Cargo.toml` (with `Cargo.lock`'s line) and `apps/desktop/package.json`, and `check` fails when any of them differs.

The release workflow gains two jobs for a stable release, both waiting in the `release` environment with the rest:

- **`desktop`** builds the app on macOS, Windows and Linux ([ADR 0058](0058-desktop-app.md)), with the updater's artifacts signed by `TAURI_SIGNING_PRIVATE_KEY` and its password ([Tauri › updater › building](https://v2.tauri.app/plugin/updater/#building)). A real release first runs `release.ts desktop-key`, which fails while `tauri.conf.json` trusts the development key. A dry run without the secret signs with the development key and warns. The Mac app is signed and notarised when the `APPLE_*` secrets are there, and built unsigned with a warning until then ([Tauri › macOS signing](https://v2.tauri.app/distribute/sign/macos/)).
- **`desktop-feed`** makes the updater's `latest.json` from the signatures (`release.ts feed`, [Tauri's static JSON](https://v2.tauri.app/plugin/updater/#static-json-file)), with the changelog's section as its notes, and `SHA256SUMS` for every installer.

The GitHub release attaches the installers, `latest.json` and `SHA256SUMS`. Installed apps read `latest.json` from the Latest release, so a beta never reaches them. Nothing is published without the owner's word, as before. The secrets to add are listed in `apps/desktop/keys/README.md`.

## 2026-10-29: the phone app's version (checkpoint 4.5a)

The phone app carries the release's version. Its `app.config.ts` reads `apps/mobile/package.json`, and `scripts/release.ts prepare` sets that file with the desktop app's, which `check` reads back. Nothing of the phone's is built or uploaded by the release workflow in 4.5: store uploads wait for the Apple Developer membership and the owner's word. Build numbers come with the first upload ([ADR 0059](0059-native-apps.md)).

## 2026-10-29: the TV app's version (checkpoint 4.5b)

The TV app carries the release's version as the phone does: its `app.config.ts` reads `apps/tv/package.json`, which `scripts/release.ts prepare` sets and `check` reads back. Nothing of it is built or uploaded by the release workflow until the Apple Developer membership and the owner's word ([ADR 0059](0059-native-apps.md)).

## 2026-11-04: the phone's and the TV's version from `apps/client` (one client platform, part B2)

`apps/mobile` and `apps/tv` are removed ([ADR 0061](0061-one-client-platform.md)'s 2026-11-04 section). The phone and the TV now carry the release's version from `apps/client/package.json`, which its `app.config.ts` reads and `scripts/release.ts prepare` already set; `prepare` and `check` no longer touch the two removed apps. Nothing is built or uploaded for them by the release workflow until the Apple Developer membership and the owner's word.

## 2026-11-06: work lands on `next` (next-branch.md)

Work now collects on `next`, and `main` changes only through the owner's merge of `next` into it, by a pull request that runs every job ([ADR 0062](0062-next-branch-and-ci-by-branch.md)). Releases still come from `main`, and `release.yml` still fails unless it runs there; it calls `ci.yml` and `e2e.yml` whole, as before. The docs still deploy from `main` (the 2026-10-23 section), so a guide goes out when `next` reaches `main`, not when a part is committed. `next` gets Vercel's previews like any other branch ([Vercel: Git deployments](https://vercel.com/docs/deployments/git)). A push to `main` now runs only `ci.yml`'s `check`: the pull request from `next` ran everything on the same result.

## 2026-11-15: a stable release at each part of Phase 5 (Phase 5 A1)

Phase 5 puts highsea in the owner's real use on their NAS, updated through Package Center as owners' NASes are. Each part's sign-off is followed by a stable release (0.4.0 for A1, then 0.5.0 and on), each on the owner's separate word as before; nothing in this section publishes, tags or runs the workflow by itself. Before a release, the build is tried on the NAS from a local image, as 4.3c and part D did, with the owner's permission for each test install. The workflow and its gates are unchanged.

## 2026-11-17: a pre-production release is one click from `next` (HT-43)

The owner asked for this on 2026-11-17: "we just need to be able to quickly and easily push new releases while we continue working on the apps and clients so we can rapidly update them as we test new features." highsea is pre-production, serving one user, the owner. A release took two to three hours over five steps: a task ran `prepare` and opened a pull request into `next`, the owner merged it, merged `next` into `main` (about an hour of CI), ran Release from `main` twice (a dry run, then the real one), and updated the NAS. Now it's one run.

**The owner's steps:** Actions › Release › Run workflow on `next`, the version left blank; approve the `release` environment when it asks; then **Update** in Package Center on the NAS.

**What the run does** (`release.yml`'s header has the whole of it):

- **The version.** `release.ts version` picks it. Blank (or `patch`) is the next patch after the newest `v*` tag, unless `apps/server` is already at a newer version, which a hand-prepared release keeps. `minor` and `major` step those parts, and an explicit SemVer version must be newer than every tag. From a pre-release a step finishes it first, as SemVer orders them ([§ 11](https://semver.org/#spec-item-11)). The dry-run input stays, off by default.
- **The changelog.** When `Unreleased` is empty, `release.ts merged` lists the pull requests merged since the newest tag (the branch's first-parent commits, with the files each changed from git and its labels from [GitHub's API](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)), and `release.ts changelog` writes them in. Each entry is the squash commit's subject, which is the pull request's title as merged, with a link to it. A `bug` or `fix` label or a title starting with "Fix" puts it under Fixed; a `feature`, `enhancement` or `added` label or a title starting with "Add", "Let", "Allow", "Support", "Show" or "Introduce" under Added; everything else under Changed. A pull request touching only `docs/`, `.claude/`, `.github/`, `scripts/`, `CLAUDE.md` or `AGENTS.md` is left out, as are the release's own. The catalog's notes keep to their 50 lines of 300 characters as before (`notesOf`). **Entries written by hand win:** an `Unreleased` with anything in it is used as it is.
- **Preparing.** `release.ts prepare` runs with that version and the run's date, unless the commit is already prepared for it (`check` passes), in which case it's released as it is. `prepare` now also sets the released workspaces' versions in `bun.lock` (on 2026-11-17 it still said 0.4.0 after 0.4.1 and 0.4.2 were prepared; HT-42 found it), and `check` reads them back.
- **The bumped tree's checks.** The bump changes the versions, the changelog, `releases.json`, the catalog's `CHANGES.md`, the seed, `openapi.json` and `bun.lock`, and nothing else. So on the bumped tree prepare runs what reads those files: `bun install --frozen-lockfile` (the lockfile agrees with the workspaces), Biome on the changed files, the tests that check `openapi.json` and the seed are current (`apps/server/test/api.test.ts`, `packages/catalog/test/signing.test.ts`), `release.ts`'s own tests and `release.ts check` (the version against the tags, and every file agreeing). The package build and both image builds then always run on the bumped files.
- **Reusing next's checks.** `.github/scripts/reuse-release.sh` asks the REST API whether next's newest push run of `ci.yml`, and of `e2e.yml`, for exactly the commit the release started from finished with `success` ([Workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)), waiting for it while it's still going. A push run takes its workflow file from the commit pushed ([Events › push](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#push)), so it tested the same tree with the same workflow; ADR 0062's 2026-11-17 section has `next` run every heavy workflow on every push for this reason. When both passed, the release skips its calls of them. Otherwise, from `main` or a task branch, or on any API error, it runs them whole. Reusing is safe because the bump changes only version strings and notes, which the bumped tree's checks above cover; the image, the package and the desktop app are still built from the bumped tree.
- **One click.** A new job, `checks`, passes only when prepare, the package and each of the two workflows passed or was reused (a skipped job counts as passing, so it reads each result, [Contexts › needs](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context)). Every job that names the `release` environment waits on it alone, so they all ask at the same moment and the owner's one approval covers them: on 0.4.2's run (44227620609), one approval let six waiting jobs go.
- **Landing the commit.** `next` and `main` are protected by rulesets that require pull requests. The rulesets' documented bypass for a workflow without a person is a deploy key (`DeployKey` among a ruleset's bypass actors, [Repository rules](https://docs.github.com/en/rest/repos/rules#create-a-repository-ruleset)). A pull request opened by the workflow would need a bypass anyway: pull requests opened with `GITHUB_TOKEN` don't start workflows, so their required checks never run ([GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)). On the owner's answer of 2026-11-17: a deploy key with write access, its private half in the `release` environment as `RELEASE_DEPLOY_KEY`, a `DeployKey` bypass (mode `always`) on both rulesets, and `next` added to the branch policies of the `release` and `github-pages` environments. The coordinator applies it; this work changes no setting. Only a job the owner has approved holds the key, and a push with it, unlike one with `GITHUB_TOKEN`, runs the branches' own workflows.
- **One release commit.** Prepare commits the bump with next's commit as its first parent. When `main` isn't already its ancestor (each merge of `next` into `main` left a merge commit on `main` alone), `main`'s commit is its second parent, so both branches can fast-forward to it; that's only allowed when merging `main` in gives the same tree, `git merge-tree --write-tree`, or the release stops and says to merge `main` into `next` first. A git bundle carries the commit to `github-release`.
- **Publishing, then landing.** `github-release` waits, in its own steps, for `merge`, `pages` and, for a stable release, `spk` and `desktop-feed`, and stops unless each passed ([Workflow jobs](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt)). Then it pushes the tag on the release commit, creates the GitHub release on it (`--verify-tag`), and pushes the commit to `next` and to `main`, both fast-forwards; `main`'s push deploys `docs.highsea.tv` (the 2026-10-23 section). If `next` moved on during the release, the release commit is merged into it instead. If `main` moved, the release stands and the run says to merge by hand.
- **From `main`** Release runs as before, for when the ceremony comes back: a real run needs a commit already prepared, and nothing is pushed to a branch. A dry run can come from any branch, though the `release` environment's jobs run only on the branches its policy allows.

**Kept:** the `release` environment's approval, the version and tag checks, the signed catalog, the Synology package and `packages.highsea.tv`'s Latest, the desktop feed, and nothing published on a failed check.

**Given up while highsea is pre-production, and what brings each back when it's announced:**

| Given up | Brings it back |
| --- | --- |
| The hand-written changelog by default: entries are the pull requests' titles, written for the project rather than for owners | Writing `Unreleased` by hand before each release, which the workflow already prefers; or making `changelog` refuse to generate |
| The review on `main`: the release is published from `next`, and `main` follows it | Running Release from `main` again, after the `next` → `main` pull request, which still works |
| The dry run by default | Setting the `dry-run` input's default back to `true` |
| The release's own record in a pull request | The release commit is still in git, on both branches, with the run's address in its message |

**Consequences.**

- A release is one run and one approval, about 40 minutes when `next`'s checks for the commit passed (the image, desktop and package builds), and about as long as before when they didn't.
- The notes are only as good as the pull requests' titles. They're written plainly already (CLAUDE.md's copy rule), but for the project's readers. A release meant to explain something to owners still gets `Unreleased` written by hand.
- The deploy key can push to `next` and `main` without a pull request. It lives only in the `release` environment, whose jobs run after the owner's approval and only from the branches it allows.
- `main` stays an ancestor of `next` after each release from `next`, so the next release's commit is a plain one. A merge of `next` into `main` by pull request makes `main` diverge again, and the next release gives its commit two parents again.

**2026-11-18, the first one-click run stopped before publishing (HT-50).** Run 44267473765, from `next` at `30a5dda`, reused next's results, so `ci` and `e2e` were skipped on purpose, and then `image`, `catalog`, `desktop`, `merge`, `pages` and `desktop-feed` were skipped too. Their `if:` had no status function, so it was `success()` and the rest, and GitHub skips every job after a skipped or failed one in its `needs` chain unless its `if:` says otherwise ([Workflow syntax › needs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds), [Status check functions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions)); `ci` and `e2e` were in their chain through `checks`. Only `github-release`, which had `!cancelled()`, reached the `release` environment. The coordinator rejected it, so nothing was published: no `v0.4.3` tag, no release or draft, and `next` still at `30a5dda`, since prepare pushes nothing. Had it been approved, its step that waits for the jobs it publishes after would have found `merge` skipped and stopped before the tag. The fix:

- Every job after `checks` runs on `!cancelled()` and names the results it needs (`needs.<job>.result == 'success'`), with its own conditions (dry run, prerelease) kept. `scripts/release-gate.test.ts` reads `release.yml` and holds every such job to it.
- Whether a release may publish is one rule, `scripts/release-gate.ts`, with its tests: `checks`, `image` and `catalog` pass; `spk`, `desktop` and `desktop-feed` pass on a stable release and are skipped on a prerelease; `merge`, `pages` and `github-release` pass on a real run and are skipped on a dry run; any other skip, failure or cancel stops it. `github-release` reads the run's jobs through it before pushing anything, and a new last job, `outcome`, applies it to the whole run, so a dry run that skipped a build fails.
- A tag pushed without its release is taken back, so a new run releases the same version.
- The same mistake elsewhere: `ci.yml`'s fast jobs after `changes` and its `check` already run on `!cancelled()`, its heavy jobs need nothing, and `reuse-next.sh` skips steps inside a job, not jobs, so nothing after it is skipped; `e2e.yml` has one job.
