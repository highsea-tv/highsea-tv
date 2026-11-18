---
name: checkpoint-report
description: Finish a highsea checkpoint or gated part, run the local checks CI can't, read CI's result, record progress in the plan and docs/status.md, and report at the gate for the owner's review. Use when a checkpoint's or part's work is done and it's time to stop at the gate.
argument-hint: "[checkpoint or part, e.g. 9b]"
---

# Report at a checkpoint's gate

The owner reviews every checkpoint and part before the next starts. Make the report complete enough to sign off from.

## 1. Close the work

- Read the plan's scope for this part again, and check every item. Anything not done goes under "Left open", with the reason.
- Every change to what the admin does has its guide updated and its screenshots retaken (`/guide`).
- New decisions have their ADRs, and changed ones have dated sections (`/adr`).
- Every new source file has its SPDX header: `// SPDX-License-Identifier: AGPL-3.0-only` (`/* */` in CSS, `#` in YAML and shell, `{/* */}` in MDX). Check with `git ls-files -mo --exclude-standard`.
- Every new dependency went through `/add-dependency`.

## 2. Run what CI can't, and read CI's result

CI is the full gate (the owner, 2026-11-17), so the gate doesn't run it all again here:

- **Locally:** `/checks full`, under Node 26.11.1. Since 2026-11-17 that's only what CI can't run: the browser sweeps, `one-place` and `controls.ts`, and the simulators, the desktop app and the NAS where the part touched them. The `checks` skill's table says which and when.
- **CI:** the latest run on the work's branch or pull request, both tiers (the heavy jobs through the `full-ci` label, or the push to `next`). Give its link and its jobs' results in the report rather than rerunning them here.

Fix what fails, and find the documented cause before working around it.

## 3. Record it

- **The plan's Progress section:** a dated entry (`- **YYYY-MM-DD, 9b, built and waiting for the owner's review:**`), with what was built, its numbers and checks, judgement calls in short, and what was found and fixed along the way.
- **`docs/status.md`:** the part's line says "built and waiting for the owner's review", in one or two sentences with links.
- Commit nothing unless the owner has asked.

## 4. Report

Open with one sentence: the part is built, whether the checks pass, that you've stopped at the gate, and what hasn't happened (nothing committed, pushed, tagged or published; the next part not started).

Then these sections, in this order:

- **What was built**: grouped bullets in plain words, with file paths where the owner will look. Measurements against their budgets go in a table.
- **Results**: a table, one row per check, with the numbers, saying which ran here and which in CI (with the run's link). Say the local ones ran under Node 26.11.1.
- **Found and fixed along the way**: bugs found outside the scope, what caused each and how it was fixed. Flag any change to the locked design system, tokens or prototypes, since those need the owner's approval.
- **Judgement calls**: every unknown you decided, so the owner can overturn it. Include where you departed from the plan and why, and any **change real data forced on a prototype screen** (the standing rules require these to be listed).
- **Needs your decision**: a numbered list of what's blocked on the owner, with your recommendation for each.

End by asking for review. Offer to go through the decisions with `/questions` if there are several. Don't start the next part.
