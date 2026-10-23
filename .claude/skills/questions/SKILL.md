---
name: questions
description: Take the owner through a highsea plan's open questions one at a time as multiple-choice questions, the recommendation first, then record the answers in the plan. Use when the owner asks to go through the open questions, a Q&A, a questionnaire or the decisions.
argument-hint: "[plan file, defaults to the newest in docs/plans]"
---

# Go through a plan's open questions

The owner has asked for this format for every plan: one question at a time, multiple choice, with the recommendation first.

## Asking

1. Find the plan: the argument if given, otherwise the newest file in `docs/plans/` that has an "Open questions for the owner" section with no "The owner's answers" yet.
2. Ask with `AskUserQuestion`. Each question:
   - is the plan's question in a sentence, with enough context to answer without opening the plan;
   - has the recommendation as its **first** option, labelled `(Recommended)`;
   - has the plan's alternatives as the other options (at most four; "Other" is added automatically);
   - gives each option a one-sentence trade-off in `description`.
3. Up to four questions fit in one call. Send them in plan order, in batches of up to four, unless the owner asked for strictly one at a time. Then send one per call.
4. If an answer changes later questions (as the docs-site answer did in 9b), rewrite those questions before you ask them. Add any new questions that follow from it to the plan.
5. If the owner answers "Other" with something new, treat it as **an owner's change**. Work out what it changes in the plan, and ask a follow-up question if it leaves anything open.

## Recording

In the plan, below the open questions:

- **`## The owner's changes`**, when there were any: `On YYYY-MM-DD, reviewing this scope, the owner made N changes:`, then a numbered list. Each item says what changed and links the section it affects.
- **`## The owner's answers`**: `On YYYY-MM-DD the owner took every recommendation for questions 1 to N except …`, then a numbered list that answers each in a line. Mark a changed one `**Changed by the owner:**`.
- Rewrite the body of the plan to match the answers. Leave the open questions as they were asked, so the history reads.
- Update `CLAUDE.md`'s "Where things stand" line to say the plan was approved with the owner's answers of that date.
- Use today's date (absolute, never "today").

Then report what changed in a few lines, and stop. Don't start building unless the owner said to.
