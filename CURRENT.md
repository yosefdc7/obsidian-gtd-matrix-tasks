# Current Work — obsidian-gtd-matrix-tasks

## Objective
Deliver the three `/grill-with-docs`-approved enhancements (2026-09-15) on top of the ADR 0005 modular architecture: the **By Date** third view mode (ADR 0006), the icon-only color-coded priority button, and toolbar layout persistence into `settings.defaultLayoutMode` (ADR 0007). Docs: `2nd Brain/docs/adr/0006-by-date-view.md`, `0007-layout-toggle-persists-default.md`; domain terms (By Date, Anchor Date) in `2nd Brain/CONTEXT.md`.

## Status
Implementation complete on the ADR 0005 modular renderers and live-verified against `2nd brain v7` (2,673-task store). Feature changes are **uncommitted** (16 modified + 2 new files); HEAD remains `a66f3a2` (Stage B/C decomposition committed: `a8a6731`, `27366fc`).

## Completed
- ADR 0006 item 8 amended: the feature lands on the `src/view/` renderer modules (not the monolith), after Stage C (`27366fc`).
- `src/view/date-buckets.ts` (new, pure, zero obsidian imports): `getAnchorDate` (chosen field, else Scheduled→Due→Start), `getDateBucketId`, `buildDateBuckets` (Past + 8 day buckets + Soon + Someday + Undated + Completed = 13), `groupByDateBucket` (per-bucket sort; all buckets pre-initialized).
- By Date mode end-to-end: `ViewMode` gains `'date'`; mode switcher `[GTD Workflow] [Eisenhower Matrix] [By Date]`; session-only anchor switcher `[Start | Scheduled | Due]` (defaults Scheduled); Filter|Swimlanes toggle hidden while active; board (13 columns, day buckets as drop targets + quick-add, others "Empty" and drop-rejecting) and list (empty groups hidden except Completed Today) layouts; coordinator early-return date branch.
- Date wiring: `TaskMutator.quickAddTaskDated` (stamps ⏳/📅/🛫 per anchor), `appendRawTask` extracted for daily-note create/append/reindex; `executeDateBucketDrop` (day-bucket drop = scheduling gesture, single `batchUpdateTaskLine`); `setStartDate` (🛫) + parser `setTaskStartDate`.
- Priority button is now icon-only color-coded (`arrow-up-down`, tooltip + aria-label carry the text) in `card-renderer.ts` + CSS; start-date pills (`🛫`, `.gtd-date-start`) and date quick-add rows added; date bucket border colors per bucket class.
- Layout persistence (ADR 0007): Board/List toggle writes `settings.defaultLayoutMode` + `saveSettings()`; settings tab "Default view mode" gains the By Date option.
- Wired through the modular seam: `toolbar-renderer.ts`, `board-renderer.ts` (`renderDateBoard`), `list-renderer.ts` (`renderDateList`/`renderDateSection`), `card-renderer.ts`, `view/view.ts` (4th ctor arg `saveSettings`, `handleDateDrop`, `quickAddToDate`), `src/main.ts`.

## Important Decisions (full rationale in ADR 0006/0007)
- Anchor Date ≠ Effective Date: chosen-field-first with Scheduled→Due→Start fallback, versus the GTD earliest-of-three Effective Date. Both documented in CONTEXT.md to prevent conflation.
- Day buckets accept drops (set the anchor field's date) and quick-adds dated to the bucket; Past/Soon/Someday/Undated/Completed Today reject drops.
- Completed tasks never enter date buckets; only ✅ = today renders in the trailing Completed Today group.
- Soon spans +8→+90 days, mirroring the GTD 4–90d / >90d classification so both perspectives classify identically.
- Priority icon-only: single `arrow-up-down` icon, color-coded by priority class; label text lives in tooltip + aria-label.
- Layout persistence scope is layout only; view mode, sort, tag mode, and anchor field remain session state seeded from settings.

## Changed Files (uncommitted)
- New: `src/view/date-buckets.ts`, `tests/date-buckets.test.ts` (14 tests)
- Modified: `src/types.ts` (ViewMode +'date', DateAnchorField), `src/parser.ts`, `src/main.ts`, `src/settings-tab.ts`, `src/store/task-mutator.ts`, `src/view/` (types, task-transitions, card-renderer, board-renderer, list-renderer, toolbar-renderer, view), `styles.css`
- Tests modified: `tests/task-transitions.test.ts` (+5), `tests/task-mutator.test.ts` (+6), `tests/parser.test.ts` (+1)

## Verification
- `npm test`: 158/158 passed (12 files; 132 baseline + 26 new). `tsc --noEmit` exit 0. `npm run build` OK (main.js 80,810 B). Deployed via `scripts/deploy-plugin.ps1 -SkipBuild` to `2nd brain v7`.
- Live (Obsidian CLI, real vault): By Date board renders 13 columns with correct titles/counts, anchor defaulting to Scheduled; Filter|Swimlanes toggle absent in By Date; priority badges 54/54 icon-only (SVG present, empty text, aria-label/title `Priority: … — click to change`); 5 start-date pills rendered.
- Data paths (live, then cleaned up): quick-add into the Tomorrow bucket wrote `- [ ] … ⏳ 2026-09-16` to `Jots/2026/Sep/Sep 15 2026.md` (bucket 1→2); synthetic DOM drop onto the Thu bucket rewrote the token to `⏳ 2026-09-17` (counts 2→1 / 2→3); test line removed via vault API (0 marker hits, counts restored, DOM clean).
- Layout persistence A/B (on-disk `data.json`): `list → board → list` matching the clicks; DOM toggled 8 list sections ↔ 13 board columns. Anchor switcher Scheduled→Due→Scheduled re-rendered; bucket counts identical under both anchors — correct: only 1 of 2,673 tasks has both ⏳ and 📅 (same date).
- `dev:errors`: No errors captured after all interactions. Live view left in its found state (By Date, Scheduled anchor, List layout).
- Note: after `plugin:reload`, stale leaves lose `contentEl`; detach them and open a fresh leaf before DOM checks.

## Next
1. Commit the feature changes (untagged conventional, e.g. `feat: add By Date view, icon priority button, and layout persistence`).
2. (Carryover) User visual pass on a real mobile device — By Date buckets + icon priority button feel.

## Blockers / Unknowns
- None technical. Live vault data-path tests were fully cleaned up; only real-device visual feel remains user-side.
