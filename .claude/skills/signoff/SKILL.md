---
name: signoff
description: Record the owner's sign-off of a highsea checkpoint or part in the plan, CLAUDE.md and the roadmap, then commit the whole working tree in the house style and push if asked. Also the house rules for any commit. Use when the owner approves or signs off work and asks to commit, push or move on.
argument-hint: "[checkpoint or part] [push]"
disable-model-invocation: true
---

# Record a sign-off and commit

Run this only on the owner's word. "Approved", "signed off" and "looks good, commit" all count. Push only if they said push (or "merge and push").

## 1. Record the sign-off

Use today's date, written out (`2026-10-23`), never a relative date.

- **The plan:** in Progress, change the part's entry from "built and waiting for the owner's review" to `signed off by the owner on YYYY-MM-DD`. Note anything the owner approved or changed at review, such as a locked design-system change they allowed or a decision from "Needs your decision".
- **`CLAUDE.md`'s "Where things stand":** the part is signed off on that date. When the last part of a checkpoint is signed off, the checkpoint is signed off. When the last checkpoint of a phase is signed off, the phase is (and the next phase may start).
- **`docs/roadmap.md`:** only when a phase or a whole checkpoint is signed off, or the scope changed.
- If the owner's review leaves items for later, list them where the plan keeps them ("what it leaves for later").

## 2. Commit

The rules (the plan's standing rules, and `CLAUDE.md`):

- **Everything in the working tree.** Check `git status` and include untracked files, apart from what `.gitignore` keeps out. Never `.env.local`. The owner once found files left out of a sign-off commit.
- **No attribution or co-author lines**, whatever the tooling suggests.
- **Subject:** imperative, sentence case, no full stop, saying what the change does for highsea. For a whole checkpoint it's `Phase 3 checkpoint 9a: <its name>`; for a sign-off on its own, `Record checkpoint 8b's sign-off, and start 8c`.
- **Body:** a blank line, then `- ` bullets, one per area of change, each a plain sentence or two naming files and ADRs. The last bullet is the checks line from `/checks`, for example `- Checks under Node 24.21: lint, typecheck, 11,394 tests pass (6 skipped), smoke, licences, audit, the docs build and the sweeps clean`.
- Read `git log -5 --format=%B` and match it.

Pass the message through a heredoc so the bullets survive:

```sh
git add -A && git commit -F - <<'EOF'
Subject line

- First bullet
- Checks under Node 24.21: …
EOF
```

## 3. Push, if asked

- On the default branch `main`, `git push`. **Pushing to `main` deploys `docs.highsea.tv`** (Vercel's `highsea-docs` project), so say so when the commit touches `apps/docs`.
- On a work branch, push it. Merge into `main` only if the owner said merge.
- Never tag, publish an image or run the release workflow without the owner's separate word (checkpoint 9's rule).

## 4. Move on

If the owner said to move on, read the next part's scope and begin it. Otherwise say what's next in a line and stop.
