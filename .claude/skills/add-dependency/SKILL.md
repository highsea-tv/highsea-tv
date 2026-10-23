---
name: add-dependency
description: Add or upgrade an npm dependency in highsea under the owner's rules (an exact version at least two weeks old, a licence compatible with AGPL-3.0, no unexcepted advisories), or pin a GitHub Action. Use whenever a package.json dependency or a workflow action is added or changed.
argument-hint: "<package> [workspace]"
---

# Add or upgrade a dependency

The rules: exact versions, each released **at least two weeks ago**, licences **compatible with AGPL-3.0**, and choices grounded in the package's official documentation.

## 1. Is it needed?

Check whether the repo already has something that does the job: `graft grep "<what it does>"`, the root and workspace `package.json` files. Prefer the platform (Node 24, Bun, the web platform) and packages already in the lockfile.

## 2. Pick the version

```sh
bun run pin <pkg> [<pkg> ...]
```

It prints, for each package, the highest stable version published before the two-week cutoff that isn't deprecated, with its date and licence. Use exactly that version, with no `^` or `~`. If the version you need is newer, it can't be pinned yet. Say so, and give the date it becomes pinnable.

## 3. Add it

Add it to the workspace that uses it, not the root (unless it's tooling for `scripts/`):

```sh
bun add --exact <pkg>@<version> --cwd packages/<name>
```

Remember the conventions: packages export raw TypeScript, browser-safe subpaths stay free of Node-only dependencies, and `apps/server` never imports from `design/prototypes`.

## 4. Audit it

```sh
bun run licenses   # every package in the tree, including transitive ones
bun run audit      # npm's advisories for production dependencies; fails on high or critical
```

- **A licence the audit can't read** (prose, a URL, a non-SPDX string) but that is in fact compatible goes in `scripts/license-exceptions.json` as `{ "package", "reason" }`. The reason names the licence, where it's stated, and why it's compatible. Nothing GPL-2.0-only or otherwise incompatible, ever: see ADR 0009.
- **An advisory that doesn't apply, or whose fix can't be pinned yet**, goes in `scripts/audit-exceptions.json` as `{ "advisory", "package", "until", "reason" }`. `until` is the date the fixed version becomes pinnable. The reason says why highsea isn't exposed, citing the advisory's own text. Remove the exception once the fix is pinned.

## 5. Record it

- Cite the docs the choice rests on in the ADR, a code comment or the checkpoint report, together with the alternatives you considered.
- For Node itself: `.nvmrc`, the Dockerfile's two `FROM` lines and `engines` move together.
- For a native addon (as with `better-sqlite3`), check it builds for Node 24.21 and in the image (`bun scripts/image.ts`).

## GitHub Actions

Pin each action to a **full commit SHA**, with its version in a comment: `uses: actions/checkout@<sha> # v5.0.0`. Use a release that's at least two weeks old, and keep to its current major version unless the plan says otherwise.
