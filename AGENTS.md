<!-- cross-agent-continuity:start -->
## Cross-Agent Continuity

Before beginning meaningful work in a Git repository:

1. Read `CURRENT.md`.
2. Inspect `git status` and relevant uncommitted diffs.
3. Read specs, plans, or tickets referenced by `CURRENT.md`.
4. Verify important handoff claims against the repository and command output.
5. Continue from `Next` unless the latest user instruction overrides it.

If `AGENTS.md` or `CURRENT.md` is missing, initialize the continuity system while preserving all existing project instructions.

Priority of truth:

1. Latest explicit user instruction
2. Actual repository and code state
3. Tests and command output
4. Current approved specification or requirements
5. `CURRENT.md`

Never blindly trust stale handoff information.

Before finishing work that changed repository state, reached an implementation checkpoint, or materially changed the objective, decisions, blockers, or next step, update `CURRENT.md`. Routine read-only explanations, reviews, and diagnosis do not require an update unless they materially change that state.

Keep `CURRENT.md` concise and limited to:

- Objective
- Status
- Completed
- Important Decisions
- Changed Files
- Verification
- Next
- Blockers / Unknowns

Replace stale information instead of appending a diary. Clearly separate verified facts from assumptions. Do not claim tests passed unless they ran, and do not claim completion without repository evidence. Git and the codebase remain the ultimate evidence.
<!-- cross-agent-continuity:end -->
