# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Changelog Entries

**Every user-visible change ships its `CHANGELOG.md` entry in the same PR as the change.** Not a follow-up PR, not a sweep before the release.

- **Section** - put the entry under `## [Unreleased]` in the Keep a Changelog section that matches what happened: `Added`, `Changed`, `Fixed`, or `Removed`. This repo also keeps `Accessibility`, `Security` and `Notes` sections; use one of those when it describes the change better.
- **Order** - newest first. New entries go at the TOP of their section.
- **Reference the issue, not the PR** - write `(#767)`, the issue the work closes. The issue holds the report, the reproduction and the discussion; the PR number is noise to anyone reading release notes later. Backend issues are written `backend artifact-keeper#2520`.
- **Lead with the user-visible symptom, not the files touched** - open with what an operator saw or can now do ("the pagination bar reported a total that grew with the page number"), then give the cause and the fix. A list of changed files is not an entry.
- **Format** - `- **Bold one-line summary** (#N) - prose.` Match the depth of the surrounding entries: symptom, cause, fix, and anything a reader would otherwise be surprised by later (costs accepted, halves deliberately left undone).

**What does NOT need an entry:** internal refactors with no observable behavior change, test-only changes, CI and workflow plumbing, dependency bumps that change nothing user-facing, and documentation edits. If you cannot state what someone using the web UI would notice, skip it.

**Why it has to be the same PR:** written afterwards, the entry has to be reconstructed from a merged diff. A diff records what changed. It does not record why that approach was picked, which trade-off was accepted, or which alternative was rejected and on what grounds. That reasoning exists only while the work is fresh, and it is the part of an entry actually worth reading. An entry reverse-engineered from a diff months later just restates the code, which the code already does better.

