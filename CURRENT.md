# Current Work — obsidian-gtd-matrix-tasks

## Objective
Port the approved **Stream UI** direction into the plugin on the ADR 0005 modular renderers (ADR 0008): the List layout becomes the Stream list, shared chrome (header, NL quick-add, role chips, every add-composer, quick-capture modal) gets the Stream treatment, and secondary toolbar controls move behind an options disclosure. The Board keeps its kanban structure (drag-drop, swimlanes, mobile carousel untouched). Source design: `2nd Brain/prototypes/gtd-ui/refined-stream.html` (untouched).

## Status
Set default view mode to "By Date" anchored to "Scheduled" date (`[antigravity] feat: default view mode to By Date (Scheduled)`). Configurable role tags setting, "All" pill filter, and exclusive radio-style role filtering delivered and verified (`189/189` tests, `tsc --noEmit` exit 0).

## Completed
- Role Filter Pills & Filtering:
  - Added "All" pill to role filter chips row (`All`, then configured roles, then `Untagged`).
  - Exclusive radio-style filtering: clicking a pill (e.g. `Untagged`) activates *only* that pill and shows only tasks for that role.
  - Clicking the same active solo pill again reverts back to "All" (all pills active).
  - Modifier multi-select: holding `Shift` or `Ctrl`/`Cmd` allows toggling multiple specific roles simultaneously.
  - Filtering dynamically applies to Swimlanes mode (soloing a role shows only that role's swimlane).
- Configurable Role Tags Setting:
  - Added "Role tags" text setting in plugin settings tab (`PluginSettings.configuredRoleTags`, default `'role/yo-manager, role/josef-selfcare, role/rj-supportive'`).
  - Clean Title Case label derivation (`role/yo-manager` -> "Yo Manager", with custom title casing for user aliases).
  - Deterministic rotating color palette (blue, emerald, purple, amber, cyan, rose).
  - Unified tag & folder matching for task role resolution.
  - Context menu for role assignment dynamically populates from configured role definitions.
- `src/view/calendar-picker.ts`: Minimalist month grid date calendar picker popover (`showCalendarPicker`).
  - Monday-first 7-column calendar grid with `<` and `>` month navigation.
  - Formats ISO `YYYY-MM-DD`, detects today (`is-today`) and selected date (`is-selected`).
  - 1-click select immediately calls `onSelect` and mutates date on task.
  - Clicking currently selected date deselects it (sets to null); discreet "Clear date" button in footer also provided.
  - Automatic positioning below anchor with viewport edge protection.
  - Escape key or outside click (`pointerdown`) immediately dismisses popover.
- `src/view/card-renderer.ts`: Replaced legacy `<input type="date">` in `showScheduledDatePicker`, `showDueDatePicker`, and `showStartDatePicker` with `showCalendarPicker`.
- `styles.css`: Added styles for `.gtd-calendar-popover`, `.gtd-cal-header`, `.gtd-cal-title`, `.gtd-cal-nav-btn`, `.gtd-cal-weekdays`, `.gtd-cal-days`, `.gtd-cal-day`, `.gtd-cal-footer`, `.gtd-cal-clear-btn` matching Obsidian theme CSS variables.
- Verified live in `2nd brain v7` via CDP and screenshot inspection. Commit: `66bcdf4`.
- `src/nl-input.ts` (new, pure, zero obsidian imports): `parseNaturalLanguageInput` (`today`/`tomorrow`/`next week` → +0/+1/+7 UTC-stable; `p1..p4` → highest/high/medium/low; `#yo/#yomanager/#josef/#josefselfcare/#rj/#rjsupportive/#untagged` + spelled phrases → RoleId; tokens stripped, fallback to original text; unknown tokens kept) and `previewDestinationLabel` (synthesized task through the real classifiers → "adds to …" chip label).
- `src/view/composer.ts` (new): `renderParseChips` (date/priority/role/destination chips + empty-state hint), `renderQuickAddRow` / `renderDateQuickAddRow` moved from `card-renderer.ts`; board columns + date buckets keep always-visible inputs, list/swimlane sections use the collapsed `+ Add task` reveal (Enter commits, Esc closes/clears); chip updates are local DOM (no `setState`), so typing never loses focus.
- Mutator (`src/store/task-mutator.ts`): optional `parsed` overlay on `quickAddTask` / `quickAddTaskDated` with precedence role `parsed.role ?? lane` · priority `quadrant ?? parsed ?? section` · date `parsed ?? section`; new `deleteTaskLine(task)` (exact index → trimmed → 25-char fuzzy, splice + save + reindex; children left in place).
- Toolbar (`toolbar-renderer.ts` + `ViewState.optionsOpen`): brand row (grid icon + stats pill + search) → segmented view tabs → By-Date-only anchor row → options disclosure (layout toggle, sort, Filter|Swimlanes, quick chips, folder, refresh) → NL quick-add bar with parse chips → role chips row. Options row survives re-renders; `optionsOpen` is session-only, default closed.
- Rows (`card-renderer.ts`): check circle (`gtd-row-check`, aria "Complete task") | title (markdown + click-to-edit + links) | meta chips (date pills, icon-only priority, file link, role dot) | hover action cluster (schedule, move, more). Drag kept.
- Section headers (`list-renderer.ts`): chevron + uppercase short title + count pill; full title/subtitle in tooltip; By Date buckets get their icon and stay non-collapsible.
- Menu (`task-menus.ts`): "Delete task" (trash) item → `deleteTaskLine`.
- Quick-capture modal: parse chips + hint under the input; commit passes the parsed overlay (`parsed.role ?? selected chip`).
- `styles.css`: Stream sections (header/brand/tabs/options/NL bar/chips/section headers/rows/composer/role chips); legacy toolbar and `.gtd-task-item` rules replaced; board/swimlane/carousel/FAB/modal styles intact.

## Important Decisions (full rationale in ADR 0008)
- List becomes the Stream; Board keeps kanban structure; shared chrome only elsewhere.
- Secondary controls behind an options disclosure; By Date anchor row stays inline.
- NL grammar strips only known tokens; preview uses real classifiers; unknown tokens stay.
- Priority stays icon-only in rows (prototype's P1..P4 text wins only in composer chips).
- Delete is line-level without cascade; board FAB/modal unchanged.
- Scoped CSS selectors (`.gtd-matrix-view input.X` / `button.X`) to outrank Obsidian's `input[type='text']` font-size and `.is-tablet button` padding rules (iOS 16px zoom + fixed-size icons).

## Verification
- `npm test`: 185/185 passed (13 files; 158 prior + 27 new across `nl-input` and `task-mutator`). `tsc --noEmit` exit 0. `npm run build` OK; deployed via `scripts/deploy-plugin.ps1` to `2nd brain v7`.
- Live NL quick-add (chips `⏳ Tomorrow | P1 | RJ Supportive | ⏎ Add to Next Actions`) wrote the task line to `Jots/2026/Sep/Sep 15 2026.md` and the row appeared in Next Actions; deleted afterwards via the row menu ("Delete task") — file + DOM clean, store back to 54 rows.
- Waiting composer with `p2`: chips `P2 | ⏎ Add to Waiting`, wrote `- [?] … 🔼`, auto-closed; completion toggle wrote `[x] ✅ 2026-09-15` (row re-classified to Done) and reverted.
- Options disclosure: board→list round-trip persisted through on-disk `data.json` (`"defaultLayoutMode": "list"`); optionsOpen state survived re-renders.
- Eisenhower + By Date render (anchors, tag-mode toggle hidden, 8 buckets, 4 day composers). Mobile emulation (CDP 400×800): carousel `scroll-snap-type: x mandatory` on `.gtd-board`, 6 tab buttons, 6 column quick-adds; FAB 52×52/svg 24×24; modal parse chips + Escape close.
- Scoped-selector fixes verified: nl/search inputs 16px, row check 32×32 (mobile) / 18×18 (desktop), action buttons 34/26, options toggle 40/32, layout buttons 36×36, all svg intact.
- `dev:errors` clean after every interaction. Screenshots: `%TEMP%\gtd-stream-verify\` (stream + board mobile, desktop final).
- Note: after `plugin:reload` or a mobile-emulation reload, stale leaves lose `contentEl`; detach them (`getLeavesOfType('gtd-matrix-tasks-view')`) and call `plugin.activateView()` before DOM checks.

## Changed Files (committed `1703010`)
- New: `src/nl-input.ts`, `src/view/composer.ts`, `tests/nl-input.test.ts` (+ `tests/task-mutator.test.ts` extensions)
- Modified: `src/store/task-mutator.ts`, `src/view/` (types, view, toolbar-renderer, card-renderer, list-renderer, board-renderer, task-menus, quick-capture-modal), `styles.css`

## Next
1. User visual pass on a real mobile device — Stream rows, chips, FAB/modal flow.
2. (Deferred, optional) "new row flash" animation from the prototype.
