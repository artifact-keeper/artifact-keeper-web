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

## Opening a Pull Request

**Every PR MUST add a `CHANGELOG.md` entry, in the same PR as the change.** A change that reaches users but leaves no trace in the changelog is invisible at release time, and reconstructing it afterwards from a merged diff is far harder than writing it while the reasoning is still in your head.

**MANDATORY WORKFLOW:**

1. **Add the entry under `## [Unreleased]`**, never under a released version heading — those are cut at release time. Create the `[Unreleased]` block if it is missing.
2. **Pick the section that matches the change**: `Added`, `Changed`, `Fixed`, `Accessibility`, `Security`, or `Notes`. Add the section if it does not exist yet.
3. **Insert at the TOP of that section** — entries run newest first.
4. **Follow the house format**, one entry per line:
   ```markdown
   - **Short bold summary** (#ISSUE) - what the user saw, why it happened, what changed.
   ```
5. **Reference the ISSUE number, not the PR number** — `(#768)`, not the PR that closed it. The changelog is read by people tracking a problem they reported or hit, and that is the number they hold. Every PR has one, since the `Require Linked Issue` check enforces it. Issues in the backend repository are referenced by full name: `artifact-keeper#2520`.
6. **Lead with the user-visible symptom**, then the mechanism. Someone deciding whether to upgrade must be able to tell whether this affected them without reading the diff.
7. **Record the trade-offs you accepted** — a known cost, a deliberate scope limit, or a trap left in place belongs in the entry. That is what makes the changelog worth reading later.

**CRITICAL RULES:**
- The entry lands in the SAME PR as the change — never "in a follow-up"
- Do NOT invent a new version heading; new work goes under `[Unreleased]`
- Do NOT write the entry from the diff alone — state the symptom and the cause, not the files touched
- A genuinely user-invisible change (internal refactor, test-only, CI) MAY skip the entry, but you MUST say so explicitly in the PR description rather than silently omitting it

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

