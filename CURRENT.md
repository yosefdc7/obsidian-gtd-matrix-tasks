# Current Work — obsidian-gtd-matrix-tasks

## Objective
Decompose the two architectural hotspots of this plugin per ADR 0005 (`2nd Brain/docs/adr/0005-storage-read-write-and-view-decomposition.md`): the store layer (`src/vault-scanner.ts`) and the view layer (`src/view.ts`, 1,743 lines). Plan locked in the 2026-09-15 `/grill-with-docs` session (decision log recorded in `2nd Brain/CURRENT.md`).

## Status
Stage B complete: store decomposition built, deployed to `2nd brain v7`, live data-path verified, and committed as `a8a6731` (`refactor: split vault-scanner into store modules`). View decomposition not started — the four orphaned `src/view/` draft files are to be deleted; clean re-extraction from `view.ts` is the agreed approach.

## Completed
- Stage A: ADR 0005 amended (TaskFilter module, coordinator size 150–200, role folding); created this `CURRENT.md` and `AGENTS.md`.
- Stage B: store decomposition deployed via `scripts/deploy-plugin.ps1` and verified live against the real vault — cold scan rendered 2,672 tasks / 6 columns; quick-add wrote to `Jots/2026/Sep/Sep 15 2026.md` (+1 store row); checkbox toggle wrote `- [x] … ✅ 2026-09-15` and revert stripped it; drag Inbox→Next Actions wrote `📅 2026-09-18`, drag back cleared it; test task removed (store back to 2,672); user's 10s typing check OK. Commit `a8a6731`.

## Important Decisions (from grill-with-docs 2026-09-15)
- Delete orphan view drafts; re-extract from `view.ts`. `src/view/types.ts` (ViewContext seam) and `task-transitions.ts` are written fresh to the ADR 0005 spec, not extracted.
- Store checkpoint first: deploy → live data-path verify → commit alone. Then view decomposition; second deploy/verify/commit.
- Extract pure `src/view/task-filter.ts` (filter + bucket + pre-sort), unit-tested without Obsidian mocks.
- Transition parity table verified from live code; swimlane role changes fold into the single `batchUpdateTaskLine` write (undefined=preserve / id=set / null=clear); failed writes stay log-only.
- Tests to add: `task-transitions` (exact output, date offsets, role matrix, exactly-one-call proof), `task-filter`, scoped `task-mutator` (minimal `vi.mock('obsidian')`).
- Live verification at each checkpoint (data-path checks); full UI matrix + `dev:mobile` emulation at the end. Error bar: no gtd-attributed dev errors (ResizeObserver noise tolerated).
- Facade wiring retained: `new GTDMatrixView(leaf, scanner, settings)`; ViewContext built from `scanner.store` / `scanner.mutator`.
- Untagged conventional commits (`refactor: ...`), one per stage.

## Changed Files
- `src/vault-scanner.ts` — 123-line facade (committed `a8a6731`)
- `src/store/task-store.ts`, `scan-engine.ts`, `task-mutator.ts`, `role-resolver.ts` (committed `a8a6731`)
- `tests/task-store.test.ts` (committed `a8a6731`)
- `src/view/{types,task-transitions,task-menus,card-renderer}.ts` — orphan drafts still on disk, untracked; delete as Stage C step 1

## Verification
- `npm test`: 81/81 passed (re-run 2026-09-15 21:44). `tsc --noEmit`: clean via build.
- Stage B live: `plugin:reload` + fresh view leaf rendered 54 board cards from the store; all data-path checks wrote expected lines (see Completed); `dev:errors` clean after checks.
- Note: after `plugin:reload`, stale leaves lose `contentEl`; detach them and open a fresh leaf before DOM checks.
- Screenshot evidence (not inspected by agent — model cannot view images): `2nd Brain/stage-b-verify.png`.

## Next
1. Stage C: delete orphan `src/view/` drafts; re-extract in planned order (`types.ts` → `task-filter.ts` + tests → `task-transitions.ts` + tests → `task-menus.ts` → `card-renderer.ts` → `board-renderer.ts` → `list-renderer.ts` → `toolbar-renderer.ts` → `quick-capture-modal.ts` → `view/view.ts` coordinator) → delete old `src/view.ts` → update `main.ts` import → add `tests/task-mutator.test.ts` → full verification matrix + `dev:mobile` → commit `refactor: decompose view.ts into renderer modules`.
2. Keep commits untagged conventional.

## Blockers / Unknowns
- Mobile emulation (`dev:mobile`) checks still pending (Stage C end).
- ResizeObserver error noise (unknown origin) seen pre-reload; error log is clean post-reload — revisit only if it resurfaces.
