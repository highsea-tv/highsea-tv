---
name: guide
description: Write or update a public guide on docs.highsea.tv (apps/docs/content) for a change to what owners do, and retake its admin screenshots. Use when a change alters an admin page, a setting or an install step, or when asked to write, fix or reorganise the docs site's guides.
argument-hint: "[area or page, e.g. 'wanted' or 'install/unraid']"
---

# Write or update a guide

## Which kind of doc this is

Decide from who reads it (the owner's rule of 2026-10-22):

- **Public guides** tell owners how to set highsea up and use it. They live **only** in `apps/docs/content/` and are served at `docs.highsea.tv`.
- **Internal docs** say how highsea is built: plans, ADRs, specs, prototypes. They stay in `docs/` and `design/` and are never published.
- Neither copies the other. A guide explains in its own words for owners, and may link to source on GitHub, but never pastes a spec or an ADR.

A change to what the admin does updates its guide **in the same change**.

## A page

Each page is MDX. Copy the shape of a neighbouring page, for example `apps/docs/content/wanted/index.mdx`:

```mdx
---
title: Wanted
description: More than 20 characters, plain YAML (no ": " inside a value).
---

{/* SPDX-License-Identifier: AGPL-3.0-only */}
{/*
  Sources:
  - The screen: apps/server/src/admin/<area>.tsx and <area>-messages.ts.
  - The behaviour it describes: packages/<pkg>/src/….
*/}

Written for highsea 0.1.0.
```

- **Copy the screen's words exactly.** Read the labels from the screen's `*-messages.ts` and quote them in bold: **Cutoff unmet**, **Search now**. Describe what the code does, not what the spec hoped for.
- **Voice** (`docs/brand/brief.md` § 6): plain, calm and specific, with domain terms owners know, and no exclamation marks anywhere in the prose (the test fails on one).
- **Areas with several pages** are a folder: `index.mdx` introduces it with `<Cards>` linking the sub-pages, and `meta.json` gives `"title"` and the `"pages"` order. The top-level order is `content/meta.json`.
- **A moved or renamed page** gets permanent redirects in `apps/docs/vercel.json`, with and without the trailing slash.
- **Links** go to pages and headings that exist (headings are GitHub-style slugs). Internal links end in `/`.

## Screenshots

Screenshots come from a real seeded server, never from the prototypes:

1. Add or change shots in `scripts/docs-shots/areas/<area>.ts` (`{ name, path, act?, crop?, height? }`). Crop to `main` or to the part the text is about.
2. Run `bun scripts/docs-shots/run.ts <area>` under Node 26.11 (`/checks` has the PATH line). It boots `scripts/sweeps/seeded.ts`, signs in as its owner, and writes `apps/docs/public/images/admin/<area>/<name>.png` at 2× in the default theme. Install pngquant first if it isn't there, for smaller files.
3. Look at every image before you use it.
4. Reference it as `![description](/images/admin/<area>/<name>.png)`. The description is more than 10 characters and says what the image shows. It must contain no `<` or `{`, since MDX reads them as JSX and the build fails.
5. When a shot can't be taken yet, use `<ScreenshotToCome shows="…at least 20 characters…" />`.

Install guides for NAS systems use screenshots of the real system. Ask the owner before using one of their devices.

## Check and ship

- Add every new page's slug to the list in `apps/docs/test/content.test.ts` ("are all there").
- `bun run test apps/docs` and `bun run --filter @highsea-tv/docs build`. Check it with `bun run docs` (http://localhost:3100) when the layout changed.
- **Pushing to `main` publishes it**: Vercel's `highsea-docs` project deploys every push to `main`, and pull requests get previews. Commit and push only on the owner's word (`/signoff`).
