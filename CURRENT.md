# Current Work — obsidian-gtd-matrix-tasks

## Objective
Decompose the two architectural hotspots of this plugin per ADR 0005 (`2nd Brain/docs/adr/0005-storage-read-write-and-view-decomposition.md`): the store layer (`src/vault-scanner.ts`) and the view layer (`src/view.ts`, 1,743 lines). Plan locked in the 2026-09-15 `/grill-with-docs` session (decision log recorded in `2nd Brain/CURRENT.md`).

## Status
Stage C complete: view decomposition built, deployed to `2nd brain v7`, live-verified (renders + data-path + mobile carousel probes), and committed as `27366fc` (`refactor: decompose view.ts into renderer modules`). Both ADR 0005 stages (store + view) are now executed.

## Completed
- Stage A: ADR 0005 amended (TaskFilter module, coordinator size 150–200, role folding); created this `CURRENT.md` and `AGENTS.md`.
- Stage B: store decomposition deployed via `scripts/deploy-plugin.ps1` and verified live against the real vault — cold scan rendered 2,672 tasks / 6 columns; quick-add wrote to `Jots/2026/Sep/Sep 15 2026.md` (+1 store row); checkbox toggle wrote `- [x] … ✅ 2026-09-15` and revert stripped it; drag Inbox→Next Actions wrote `📅 2026-09-18`, drag back cleared it; test task removed (store back to 2,672); user's 10s typing check OK. Commit `a8a6731`.
- Stage C: orphan drafts deleted; the 1,743-line `view.ts` re-extracted into `src/view/` — `types.ts` (ViewContext seam), pure `task-filter.ts` + `task-transitions.ts`, `task-menus.ts`, `card-renderer.ts`, `board-renderer.ts`, `list-renderer.ts`, `toolbar-renderer.ts`, `quick-capture-modal.ts`, and the 191-line `view/view.ts` coordinator. Old monolith deleted; `main.ts` import → `./view/view`. `tests/task-mutator.test.ts` (19 tests) added with `vitest.config.ts` aliasing the types-only `obsidian` npm package to `tests/__stubs__/obsidian.ts`. Committed `27366fc`.

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
- `src/view/` — 10 modules: `view.ts` (coordinator), `types.ts`, `task-filter.ts`, `task-transitions.ts`, `task-menus.ts`, `card-renderer.ts`, `board-renderer.ts`, `list-renderer.ts`, `toolbar-renderer.ts`, `quick-capture-modal.ts` (committed `27366fc`; old `src/view.ts` deleted)
- `src/main.ts` — import switched to `./view/view` (committed `27366fc`)
- `tests/task-filter.test.ts`, `tests/task-transitions.test.ts`, `tests/task-mutator.test.ts`, `tests/__stubs__/obsidian.ts`, `vitest.config.ts` (committed `27366fc`)

## Verification
- `npm test`: 132/132 passed (11 files, 2026-09-15 22:05). `tsc --noEmit`: clean (via `npm run build`).
- Stage C live: `plugin:reload` + fresh leaf — GTD board 6 columns / 54 cards; swimlane board 4 lanes; list layout 6 sections; Eisenhower Q1 renders; quick-add wrote `- [ ] ZZ c8 test task` to the Sep 15 jot (+1 card); checkbox wrote `- [x] … ✅ 2026-09-15` (card moved to Completed); drag→Waiting wrote `- [?] ZZ c8 test task` (the ✅ residue when dropping a completed card matches the original code bug-for-bug — old transition also called only `setWaiting`); test task removed via vault API (back to 54 cards); `dev:errors` clean.
- Mobile: `dev:mobile` emulation sets body classes only (no viewport resize) and smooth scroll animations pause on background leaves, so the carousel was probed with injected mobile CSS (removed after): tabs `display:flex`; tab click → `scrollIntoView` on the board carousel (`s=4879`) + `is-active` set; board scroll → active tab syncs after the 75ms debounce. Visual feel on a real phone remains a user-side pass.
- Note: after `plugin:reload`, stale leaves lose `contentEl`; detach them and open a fresh leaf before DOM checks.
- Screenshot evidence (not inspected by agent — model cannot view images): `2nd Brain/stage-b-verify.png`.

## Next
1. (Carryover) User visual pass on a real mobile device: swipe-tab carousel feel (functional logic already verified via the emulation probe).
2. Keep commits untagged conventional.

## Blockers / Unknowns
- Mobile carousel visual feel still needs a user-side pass on a real device; `dev:mobile` emulation can't resize the window (body-class only) and background-leaf smooth scrolling is paused.
- ResizeObserver error noise (unknown origin) seen pre-reload; error log is clean post-reload — revisit only if it resurfaces.
