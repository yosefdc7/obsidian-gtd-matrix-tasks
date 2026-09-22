# Date Horizon Buckets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Target executor:** GPT-5.6 LUNA. Follow the tasks in order, keep each commit scoped to one task, and do not redesign the approved bucket semantics.

**Goal:** Replace individual date sections after Tomorrow with calendar-aware Later, Next Week, Soon, and Someday horizons in both By Date layouts.

**Architecture:** Keep date classification, labels, deterministic ordering, default collapse IDs, and visible-bucket filtering as pure functions in `src/view/date-buckets.ts`. Let the list and board renderers consume the same definitions and filtered bucket list. Add one small local-midnight timing module and let `GTDMatrixView` own and clean up the refresh timer.

**Tech Stack:** TypeScript, Obsidian Plugin API, Vitest, CSS, esbuild.

**Spec:** `docs/specs/2026-09-22-date-horizon-buckets.md`

## Global Constraints

- Weeks are Monday through Sunday.
- Today and Tomorrow take precedence over broader week ranges.
- Soon ends 90 days after Today, inclusive; Someday starts on day 91.
- Use the device local date and refresh an open view at local midnight.
- Keep exact-date drop and quick-add only for Today and Tomorrow.
- Preserve neutral styling; do not restore colored section rails, fills, pills, or priority rings.
- Collapse changes are session-only.
- Do not change task files, date syntax, anchor fallback rules, Google Calendar sync, or dependencies.
- Preserve the pre-existing uncommitted Google sign-in planning files (`CURRENT.md`, `CONTEXT.md`, `docs/adr/`, `docs/google-calendar-seamless-signin-spec.md`, and `docs/superpowers/plans/2026-09-22-seamless-google-calendar-signin.md`). Do not stage them in date-horizon commits.
- Run narrow tests after every production change and commit only when that task's checks pass.
- Do not push tags or publish a GitHub release without a separate explicit user request.

## Review Focus

- **Sunday overlap:** Tomorrow is Monday; Later is empty and Next Week begins Tuesday without duplicating Monday.
- **Boundary continuity:** Sunday-to-Monday transitions, day 90, and day 91 produce neither gaps nor duplicate buckets.
- **Anchor consistency:** classification and sorting use the same selected/fallback anchor date.
- **Empty results:** list sections, board tabs, and board columns all omit empty buckets, including Completed Today.
- **Lifecycle cleanup:** midnight timers are rescheduled after firing and cleared when the view closes.

---

## File Structure

- `CONTEXT.md` — canonical task-planning vocabulary; already contains the approved date-horizon terms.
- `docs/specs/2026-09-22-date-horizon-buckets.md` — complete behavior specification and acceptance source.
- `src/view/date-buckets.ts` — pure horizon boundaries, task classification, labels, sorting, collapse defaults, and visible-bucket filtering.
- `src/view/date-rollover.ts` — pure next-midnight delay calculation.
- `src/view/view.ts` — view lifecycle, midnight timer ownership, and updated grouping call.
- `src/view/list-renderer.ts` — non-empty accordion sections and muted visible range labels.
- `src/view/board-renderer.ts` — non-empty tabs/columns and muted visible range labels.
- `src/view/toolbar-renderer.ts` — hides the irrelevant sort selector in By Date mode.
- `styles.css` — neutral range-label typography for list and board headers.
- `tests/date-buckets.test.ts` — horizon, precedence, range-label, collapse, visibility, and anchor-aware ordering tests.
- `tests/date-rollover.test.ts` — local-midnight delay tests.
- `manifest.json`, `package.json`, `package-lock.json` — v1.2.0 release metadata after behavior is complete.
- `CURRENT.md` — implementation and verification handoff state.

---

### Task 1: Commit the approved behavior documents without absorbing unrelated work

**Files:**
- Read only: `CONTEXT.md`
- Create: `docs/specs/2026-09-22-date-horizon-buckets.md`
- Create: `docs/superpowers/plans/2026-09-22-date-horizon-buckets.md`

**Interfaces:**
- Consumes: the approved decisions from the grill-with-docs session.
- Produces: executable requirements in the spec and this plan. The existing untracked `CONTEXT.md` also contains Google-connection vocabulary from separate work, so preserve it without staging it in this feature's documentation commit.

- [ ] **Step 1: Review the documentation diff**

Run:

```powershell
git diff --no-index -- NUL docs/specs/2026-09-22-date-horizon-buckets.md
git diff --no-index -- NUL docs/superpowers/plans/2026-09-22-date-horizon-buckets.md
```

Expected: the glossary defines mutually exclusive buckets; the spec includes all nine buckets, UI behavior, ordering, Sunday precedence, and midnight rollover.

- [ ] **Step 2: Check documentation for whitespace errors**

Run:

```powershell
git diff --check
```

Expected: exit code 0.

- [ ] **Step 3: Commit the approved documents**

```powershell
git add docs/specs/2026-09-22-date-horizon-buckets.md docs/superpowers/plans/2026-09-22-date-horizon-buckets.md
git commit -m "docs: define date horizon buckets"
```

---

### Task 2: Replace rolling day buckets with the approved horizon engine

**Files:**
- Modify: `src/view/date-buckets.ts`
- Modify: `tests/date-buckets.test.ts`

**Interfaces:**
- Consumes: `TaskItem`, `DateAnchorField`, and existing `getAnchorDate(task, anchorField)` behavior.
- Produces: `DATE_BUCKET_LATER`, `DATE_BUCKET_NEXT_WEEK`, `DateBucketDefinition.rangeLabel`, `buildDateBuckets(todayStr)`, and gap-free `getDateBucketId(task, anchorField, todayStr)` behavior.

- [ ] **Step 1: Replace old horizon expectations with failing boundary tests**

In `tests/date-buckets.test.ts`, import the two new constants and replace the old `Today…+7`, `+8`, and `+91` expectations with fixed Tuesday boundaries:

```ts
const HORIZON_TODAY = '2026-09-22';

it('routes every Tuesday horizon boundary without gaps', () => {
  const cases: Array<[string, string]> = [
    ['2026-09-21', DATE_BUCKET_PAST],
    ['2026-09-22', dateBucketDayId('2026-09-22')],
    ['2026-09-23', dateBucketDayId('2026-09-23')],
    ['2026-09-24', DATE_BUCKET_LATER],
    ['2026-09-27', DATE_BUCKET_LATER],
    ['2026-09-28', DATE_BUCKET_NEXT_WEEK],
    ['2026-10-04', DATE_BUCKET_NEXT_WEEK],
    ['2026-10-05', DATE_BUCKET_SOON],
    ['2026-12-21', DATE_BUCKET_SOON],
    ['2026-12-22', DATE_BUCKET_SOMEDAY]
  ];

  for (const [date, expectedBucket] of cases) {
    expect(getDateBucketId(makeTask(`- [ ] Task 📅 ${date}`), 'scheduled', HORIZON_TODAY))
      .toBe(expectedBucket);
  }
});
```

Add the Sunday precedence regression:

```ts
it('gives Tomorrow precedence over Next Week when Today is Sunday', () => {
  const sunday = '2026-09-27';
  expect(getDateBucketId(makeTask('- [ ] Monday 📅 2026-09-28'), 'scheduled', sunday))
    .toBe(dateBucketDayId('2026-09-28'));
  expect(getDateBucketId(makeTask('- [ ] Tuesday 📅 2026-09-29'), 'scheduled', sunday))
    .toBe(DATE_BUCKET_NEXT_WEEK);
  expect(getDateBucketId(makeTask('- [ ] Sunday 📅 2026-10-04'), 'scheduled', sunday))
    .toBe(DATE_BUCKET_NEXT_WEEK);
  expect(getDateBucketId(makeTask('- [ ] Following Monday 📅 2026-10-05'), 'scheduled', sunday))
    .toBe(DATE_BUCKET_SOON);
});
```

Replace the bucket-definition test with:

```ts
it('builds nine buckets in the approved order with visible range labels', () => {
  const buckets = buildDateBuckets(HORIZON_TODAY);
  expect(buckets.map((bucket) => bucket.id)).toEqual([
    DATE_BUCKET_PAST,
    dateBucketDayId('2026-09-22'),
    dateBucketDayId('2026-09-23'),
    DATE_BUCKET_LATER,
    DATE_BUCKET_NEXT_WEEK,
    DATE_BUCKET_SOON,
    DATE_BUCKET_SOMEDAY,
    DATE_BUCKET_UNDATED,
    DATE_BUCKET_COMPLETED
  ]);
  expect(buckets.map((bucket) => bucket.rangeLabel)).toEqual([
    null,
    null,
    null,
    'Sep 24–27',
    'Sep 28–Oct 4',
    'Oct 5–Dec 21',
    'Dec 22 onward',
    null,
    null
  ]);
});
```

Add a Sunday label assertion so the visible Next Week range matches the tasks it can contain:

```ts
it('shrinks the Sunday Next Week label after Tomorrow takes Monday', () => {
  const buckets = buildDateBuckets('2026-09-27');
  expect(buckets.find((bucket) => bucket.id === DATE_BUCKET_LATER)?.rangeLabel).toBeNull();
  expect(buckets.find((bucket) => bucket.id === DATE_BUCKET_NEXT_WEEK)?.rangeLabel)
    .toBe('Sep 29–Oct 4');
});
```

Update the existing drop-target assertion from eight exact day buckets to two:

```ts
it('marks only Today and Tomorrow as exact-date drop targets', () => {
  const buckets = buildDateBuckets(HORIZON_TODAY);
  expect(buckets.filter((bucket) => bucket.dayDate !== null).map((bucket) => bucket.dayDate))
    .toEqual(['2026-09-22', '2026-09-23']);
});
```

In the existing grouping tests, change the expected map size from `13` to `9`, route Sep 16 to Tomorrow, route Sep 18 and Sep 20 to `DATE_BUCKET_LATER`, and retain the Past, Undated, Completed Today, old-completed omission, and selected-anchor assertions.

- [ ] **Step 2: Run the focused test and confirm it fails**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-buckets.test.ts
```

Expected: failures for missing `DATE_BUCKET_LATER`, `DATE_BUCKET_NEXT_WEEK`, `rangeLabel`, and the old rolling-day routing.

- [ ] **Step 3: Implement UTC-stable Monday-to-Sunday boundary helpers**

In `src/view/date-buckets.ts`:

```ts
export const DATE_BUCKET_LATER = 'date-later';
export const DATE_BUCKET_NEXT_WEEK = 'date-next-week';
const SOON_MAX_DAYS = 90;

interface DateHorizonBoundaries {
  laterStart: string;
  laterEnd: string | null;
  nextWeekStart: string;
  nextWeekEnd: string;
  soonStart: string;
  soonEnd: string;
  somedayStart: string;
}

function getDateHorizonBoundaries(todayStr: string): DateHorizonBoundaries {
  const today = new Date(`${todayStr}T00:00:00Z`);
  const utcDay = today.getUTCDay();
  const daysUntilSunday = utcDay === 0 ? 0 : 7 - utcDay;
  const laterStart = addDays(todayStr, 2);
  const laterEnd = daysUntilSunday >= 2 ? addDays(todayStr, daysUntilSunday) : null;
  const calendarNextWeekStart = addDays(todayStr, daysUntilSunday + 1);
  const nextWeekStart = addDays(
    todayStr,
    Math.max(2, daysBetween(todayStr, calendarNextWeekStart))
  );
  const nextWeekEnd = addDays(todayStr, daysUntilSunday + 7);

  return {
    laterStart,
    laterEnd,
    nextWeekStart,
    nextWeekEnd,
    soonStart: addDays(nextWeekEnd, 1),
    soonEnd: addDays(todayStr, SOON_MAX_DAYS),
    somedayStart: addDays(todayStr, SOON_MAX_DAYS + 1)
  };
}
```

Extend `DateBucketDefinition`:

```ts
export interface DateBucketDefinition {
  id: string;
  title: string;
  subtitle: string;
  rangeLabel: string | null;
  badgeClass: string;
  icon: string;
  dayDate: string | null;
}
```

Add a compact cross-month label formatter:

```ts
function formatRangeLabel(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const startMonth = MONTHS[startDate.getUTCMonth()];
  const endMonth = MONTHS[endDate.getUTCMonth()];
  const startDay = startDate.getUTCDate();
  const endDay = endDate.getUTCDate();
  return startMonth === endMonth
    ? `${startMonth} ${startDay}–${endDay}`
    : `${startMonth} ${startDay}–${endMonth} ${endDay}`;
}
```

Implement the classification in `getDateBucketId()` exactly as follows, preserving its completed and undated guards above this block:

```ts
const diff = daysBetween(todayStr, anchor);
if (diff < 0) return DATE_BUCKET_PAST;
if (diff === 0) return dateBucketDayId(todayStr);

const tomorrow = addDays(todayStr, 1);
if (diff === 1) return dateBucketDayId(tomorrow);

const boundaries = getDateHorizonBoundaries(todayStr);
if (
  boundaries.laterEnd &&
  anchor >= boundaries.laterStart &&
  anchor <= boundaries.laterEnd
) {
  return DATE_BUCKET_LATER;
}
if (anchor >= boundaries.nextWeekStart && anchor <= boundaries.nextWeekEnd) {
  return DATE_BUCKET_NEXT_WEEK;
}
if (anchor >= boundaries.soonStart && anchor <= boundaries.soonEnd) {
  return DATE_BUCKET_SOON;
}
return DATE_BUCKET_SOMEDAY;
```

Add the single-date formatter used by Someday:

```ts
function formatIsoDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
```

Rewrite `buildDateBuckets()` with these exact definitions:

```ts
export function buildDateBuckets(todayStr: string): DateBucketDefinition[] {
  const tomorrow = addDays(todayStr, 1);
  const boundaries = getDateHorizonBoundaries(todayStr);
  return [
    {
      id: DATE_BUCKET_PAST,
      title: 'Past',
      subtitle: 'Anchor date before today.',
      rangeLabel: null,
      badgeClass: 'badge-date-past',
      icon: 'alert-triangle',
      dayDate: null
    },
    {
      id: dateBucketDayId(todayStr),
      title: 'Today',
      subtitle: todayStr,
      rangeLabel: null,
      badgeClass: 'badge-date-day',
      icon: 'calendar',
      dayDate: todayStr
    },
    {
      id: dateBucketDayId(tomorrow),
      title: 'Tomorrow',
      subtitle: tomorrow,
      rangeLabel: null,
      badgeClass: 'badge-date-day',
      icon: 'calendar',
      dayDate: tomorrow
    },
    {
      id: DATE_BUCKET_LATER,
      title: 'Later',
      subtitle: 'After tomorrow through Sunday.',
      rangeLabel: boundaries.laterEnd
        ? formatRangeLabel(boundaries.laterStart, boundaries.laterEnd)
        : null,
      badgeClass: 'badge-date-later',
      icon: 'calendar-days',
      dayDate: null
    },
    {
      id: DATE_BUCKET_NEXT_WEEK,
      title: 'Next Week',
      subtitle: 'The following Monday-to-Sunday week after tomorrow.',
      rangeLabel: formatRangeLabel(boundaries.nextWeekStart, boundaries.nextWeekEnd),
      badgeClass: 'badge-date-next-week',
      icon: 'calendar-range',
      dayDate: null
    },
    {
      id: DATE_BUCKET_SOON,
      title: 'Soon',
      subtitle: 'After next week through 90 days from today.',
      rangeLabel: formatRangeLabel(boundaries.soonStart, boundaries.soonEnd),
      badgeClass: 'badge-date-soon',
      icon: 'clock',
      dayDate: null
    },
    {
      id: DATE_BUCKET_SOMEDAY,
      title: 'Someday',
      subtitle: 'Anchor date 91 or more days from today.',
      rangeLabel: `${formatIsoDay(boundaries.somedayStart)} onward`,
      badgeClass: 'badge-date-someday',
      icon: 'archive',
      dayDate: null
    },
    {
      id: DATE_BUCKET_UNDATED,
      title: 'Undated',
      subtitle: 'No scheduled, due, or start date.',
      rangeLabel: null,
      badgeClass: 'badge-date-undated',
      icon: 'help-circle',
      dayDate: null
    },
    {
      id: DATE_BUCKET_COMPLETED,
      title: 'Completed Today',
      subtitle: 'Tasks checked off today.',
      rangeLabel: null,
      badgeClass: 'badge-done',
      icon: 'check-circle',
      dayDate: null
    }
  ];
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-buckets.test.ts
```

Expected: all horizon, completed, undated, anchor-selection, exact-target, grouping, and emphasis tests pass.

- [ ] **Step 5: Commit the horizon engine**

```powershell
git add src/view/date-buckets.ts tests/date-buckets.test.ts
git commit -m "feat: add calendar-aware date horizons"
```

---

### Task 3: Make date ordering and collapse defaults deterministic

**Files:**
- Modify: `src/view/date-buckets.ts`
- Modify: `src/view/view.ts`
- Modify: `src/view/toolbar-renderer.ts`
- Modify: `tests/date-buckets.test.ts`

**Interfaces:**
- Consumes: `getAnchorDate(task, anchorField)` and the horizon constants from Task 2.
- Produces: `sortDateBucketTasks(tasks, anchorField)`, a simplified `groupByDateBucket(tasks, anchorField, todayStr)` signature, and expanded default-collapse IDs.

- [ ] **Step 1: Write failing ordering and collapse tests**

Add to `tests/date-buckets.test.ts`:

```ts
it('sorts date buckets by selected anchor, priority, then description', () => {
  const laterLow = makeTask('- [ ] Zebra ⏳ 2026-10-06 🛫 2026-10-08 🔽');
  const earlierLow = makeTask('- [ ] Alpha ⏳ 2026-10-06 🛫 2026-10-07 🔽');
  const earlierHigh = makeTask('- [ ] Beta ⏳ 2026-10-06 🛫 2026-10-07 ⏫');
  const grouped = groupByDateBucket(
    [laterLow, earlierLow, earlierHigh],
    'start',
    HORIZON_TODAY
  );
  expect(grouped.get(DATE_BUCKET_SOON)).toEqual([earlierHigh, earlierLow, laterLow]);
});

it('starts only long-horizon and completed date sections collapsed', () => {
  expect(createDefaultCollapsedSections()).toEqual(new Set([
    DATE_BUCKET_LATER,
    DATE_BUCKET_NEXT_WEEK,
    DATE_BUCKET_SOON,
    DATE_BUCKET_SOMEDAY,
    DATE_BUCKET_UNDATED,
    DATE_BUCKET_COMPLETED,
    'gtd-completed',
    'eisen-completed'
  ]));
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-buckets.test.ts
```

Expected: the grouping signature/order and collapsed set do not match.

- [ ] **Step 3: Implement anchor-aware sorting and defaults**

In `src/view/date-buckets.ts`, remove `SortCriteria` and `sortTasks` imports. Add:

```ts
const PRIORITY_WEIGHT: Record<TaskItem['priority'], number> = {
  highest: 5,
  high: 4,
  medium: 3,
  low: 2,
  lowest: 1,
  none: 0
};

export function sortDateBucketTasks(
  tasks: TaskItem[],
  anchorField: DateAnchorField
): TaskItem[] {
  return [...tasks].sort((a, b) => {
    const dateA = getAnchorDate(a, anchorField);
    const dateB = getAnchorDate(b, anchorField);
    if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;

    const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
  });
}
```

Change `groupByDateBucket()` to accept only `(tasks, anchorField, todayStr)` and call `sortDateBucketTasks(list, anchorField)` for every bucket. Update the call in `src/view/view.ts` to remove `this.viewState.sortCriteria`.

Update `createDefaultCollapsedSections()` to return the eight IDs asserted by the test. Past and the two dynamic day IDs remain expanded because they are absent from the set.

In `src/view/toolbar-renderer.ts`, wrap creation of `gtd-sort-wrapper` and its `<select>` in `if (state.viewMode !== 'date')`. Keep the existing selector unchanged for GTD and Eisenhower modes.

- [ ] **Step 4: Run focused tests and TypeScript checking**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-buckets.test.ts
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit deterministic date-view ordering**

```powershell
git add src/view/date-buckets.ts src/view/view.ts src/view/toolbar-renderer.ts tests/date-buckets.test.ts
git commit -m "feat: order and collapse date horizons"
```

---

### Task 4: Render only non-empty buckets with muted range labels

**Files:**
- Modify: `src/view/date-buckets.ts`
- Modify: `src/view/list-renderer.ts`
- Modify: `src/view/board-renderer.ts`
- Modify: `styles.css`
- Modify: `tests/date-buckets.test.ts`

**Interfaces:**
- Consumes: `DateBucketDefinition.rangeLabel` and grouped task maps from Tasks 2–3.
- Produces: `getVisibleDateBuckets(buckets, grouped)` used identically by list and board renderers.

- [ ] **Step 1: Write the failing visibility test**

Add to `tests/date-buckets.test.ts`:

```ts
it('keeps only buckets that contain tasks', () => {
  const buckets = buildDateBuckets(HORIZON_TODAY);
  const grouped = new Map(buckets.map((bucket) => [bucket.id, [] as TaskItem[]]));
  grouped.set(dateBucketDayId(HORIZON_TODAY), [makeTask('- [ ] Today 📅 2026-09-22')]);
  grouped.set(DATE_BUCKET_UNDATED, [makeTask('- [ ] No date')]);

  expect(getVisibleDateBuckets(buckets, grouped).map((bucket) => bucket.id)).toEqual([
    dateBucketDayId(HORIZON_TODAY),
    DATE_BUCKET_UNDATED
  ]);
});
```

Import `getVisibleDateBuckets` in the test.

- [ ] **Step 2: Run the focused test and confirm it fails**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-buckets.test.ts
```

Expected: `getVisibleDateBuckets` is missing.

- [ ] **Step 3: Implement one visibility rule for both layouts**

Add to `src/view/date-buckets.ts`:

```ts
export function getVisibleDateBuckets(
  buckets: DateBucketDefinition[],
  grouped: Map<string, TaskItem[]>
): DateBucketDefinition[] {
  return buckets.filter((bucket) => (grouped.get(bucket.id)?.length ?? 0) > 0);
}
```

In `renderDateList()`, iterate over `getVisibleDateBuckets(buckets, grouped)` and remove the existing Completed Today empty exception.

At the beginning of `renderDateBoard()`, calculate:

```ts
const visibleBuckets = getVisibleDateBuckets(buckets, grouped);
```

Use `visibleBuckets` for mobile tabs, first-active selection, and board columns. Do not alter general GTD/Eisenhower board rendering.

- [ ] **Step 4: Render range text in list and board headings**

In `renderDateSection()`, add the range immediately after the title when present:

```ts
titleGroup.createSpan({ cls: 'gtd-section-title', text: bucket.title });
if (bucket.rangeLabel) {
  titleGroup.createSpan({ cls: 'gtd-bucket-range', text: bucket.rangeLabel });
}
titleGroup.createSpan({ cls: 'gtd-count-badge', text: String(tasks.length) });
```

In each date board column header, use a dedicated text group:

```ts
const heading = colHeader.createDiv({ cls: 'gtd-board-col-heading' });
heading.createSpan({ cls: 'gtd-board-col-title', text: bucket.title });
if (bucket.rangeLabel) {
  heading.createSpan({ cls: 'gtd-bucket-range', text: bucket.rangeLabel });
}
```

Keep the count badge after the heading. Mobile tab labels use only `bucket.title`.

Append neutral typography to `styles.css`:

```css
.gtd-bucket-range {
  color: var(--text-faint);
  font-size: 0.72em;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  white-space: nowrap;
}

.gtd-board-col-heading {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
```

Do not assign range-specific colors, borders, or backgrounds.

- [ ] **Step 5: Run focused tests, type checking, and production build**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-buckets.test.ts
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' esbuild.config.mjs production
```

Expected: all commands exit 0 and `main.js` is rebuilt.

- [ ] **Step 6: Commit the shared presentation behavior**

```powershell
git add src/view/date-buckets.ts src/view/list-renderer.ts src/view/board-renderer.ts styles.css tests/date-buckets.test.ts main.js
git commit -m "feat: render compact date horizons"
```

---

### Task 5: Refresh the open view at local midnight

**Files:**
- Create: `src/view/date-rollover.ts`
- Create: `tests/date-rollover.test.ts`
- Modify: `src/view/view.ts`

**Interfaces:**
- Produces: `millisecondsUntilNextLocalMidnight(now: Date): number`.
- Consumes: `window.setTimeout`, the existing `render()` method, and `onOpen()`/`onClose()` lifecycle hooks.

- [ ] **Step 1: Write failing next-midnight tests**

Create `tests/date-rollover.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { millisecondsUntilNextLocalMidnight } from '../src/view/date-rollover';

describe('millisecondsUntilNextLocalMidnight', () => {
  it('returns the remaining local-day duration', () => {
    expect(millisecondsUntilNextLocalMidnight(new Date(2026, 8, 22, 23, 59, 59, 500)))
      .toBe(500);
  });

  it('returns one local day when called exactly at midnight', () => {
    expect(millisecondsUntilNextLocalMidnight(new Date(2026, 8, 22, 0, 0, 0, 0)))
      .toBe(new Date(2026, 8, 23, 0, 0, 0, 0).getTime() - new Date(2026, 8, 22, 0, 0, 0, 0).getTime());
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-rollover.test.ts
```

Expected: module `src/view/date-rollover.ts` is missing.

- [ ] **Step 3: Implement the pure local-midnight delay**

Create `src/view/date-rollover.ts`:

```ts
export function millisecondsUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(1, next.getTime() - now.getTime());
}
```

- [ ] **Step 4: Run the rollover tests and confirm they pass**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-rollover.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Wire timer ownership into the view lifecycle**

In `src/view/view.ts`, import the helper and add:

```ts
private midnightTimer: number | null = null;

private scheduleMidnightRefresh(): void {
  if (this.midnightTimer !== null) window.clearTimeout(this.midnightTimer);
  this.midnightTimer = window.setTimeout(() => {
    this.midnightTimer = null;
    this.render();
    this.scheduleMidnightRefresh();
  }, millisecondsUntilNextLocalMidnight(new Date()));
}
```

Call `this.scheduleMidnightRefresh()` once in `onOpen()` after rendering. In `onClose()`, clear a non-null timer and restore it to `null` before unsubscribing. Do not rescan or mutate the vault when the timer fires.

- [ ] **Step 6: Run rollover tests, date tests, and type checking**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run tests/date-rollover.test.ts tests/date-buckets.test.ts
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit midnight rollover**

```powershell
git add src/view/date-rollover.ts src/view/view.ts tests/date-rollover.test.ts
git commit -m "feat: refresh date horizons at midnight"
```

---

### Task 6: Verify, version, deploy, and prepare the handoff

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Preserve without staging: `CURRENT.md`
- Generated: `main.js`

**Interfaces:**
- Consumes: all completed implementation tasks.
- Produces: locally deployed GTD Matrix Tasks v1.2.0 and an evidence-backed handoff ready for a separate push/release request. Because `CURRENT.md` already contains unrelated uncommitted Google sign-in planning, report the date-horizon handoff in the final response instead of modifying or staging that file.

- [ ] **Step 1: Run the complete automated verification suite**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\vitest\vitest.mjs run
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' esbuild.config.mjs production
git diff --check
```

Expected: every test passes, TypeScript exits 0, production build exits 0, and diff check exits 0. The known corrupted-cache and missing-file test cases may write expected warnings to stderr while still passing.

- [ ] **Step 2: Bump release metadata to v1.2.0**

Update these exact values:

```json
// manifest.json
"version": "1.2.0"

// package.json and package-lock.json root package entries
"version": "1.2.0"
```

Keep `minAppVersion` at `1.11.4` because the feature adds no newer Obsidian API dependency.

- [ ] **Step 3: Rebuild after the version bump**

```powershell
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' .\node_modules\typescript\bin\tsc --noEmit
& 'C:\Users\josef\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' esbuild.config.mjs production
```

Expected: both commands exit 0.

- [ ] **Step 4: Deploy the built plugin to the active vault**

```powershell
.\scripts\deploy-plugin.ps1 -VaultPath 'C:\Users\josef\Documents\2nd Brain' -SkipBuild
```

Expected: deployment succeeds to `C:\Users\josef\Documents\2nd Brain\.obsidian\plugins\gtd-matrix-tasks`.

- [ ] **Step 5: Verify deployed artifact identity**

```powershell
$repoFiles = Get-FileHash main.js,manifest.json,styles.css
$vaultFiles = Get-FileHash `
  'C:\Users\josef\Documents\2nd Brain\.obsidian\plugins\gtd-matrix-tasks\main.js', `
  'C:\Users\josef\Documents\2nd Brain\.obsidian\plugins\gtd-matrix-tasks\manifest.json', `
  'C:\Users\josef\Documents\2nd Brain\.obsidian\plugins\gtd-matrix-tasks\styles.css'
$repoFiles.Hash
$vaultFiles.Hash
```

Expected: corresponding repository and vault hashes match, and the deployed manifest reports `1.2.0`.

- [ ] **Step 6: Perform the live Obsidian acceptance check**

Reload the GTD Matrix Tasks plugin, open By Date in List and Board layouts, and verify:

```text
Past → Today → Tomorrow → Later → Next Week → Soon → Someday → Undated → Completed Today
```

Confirm empty buckets are absent, ranges are muted and accurate, Today/Tomorrow retain plain brighter text, long horizons start collapsed in List view, only Today/Tomorrow accept exact-date drop/quick-add, and the sort selector is absent in By Date mode.

- [ ] **Step 7: Commit release-ready artifacts**

```powershell
git add manifest.json package.json package-lock.json main.js
git commit -m "chore: prepare v1.2.0"
git status --short
```

Expected: the commit succeeds. `git status --short` still shows only the preserved pre-existing Google sign-in planning files. Stop before pushing or publishing; report the commit SHA, verification evidence, deployment path, live UI result, and remaining pre-existing files to the user.

---

## Final Acceptance Checklist

- [ ] All nine buckets appear in the approved order when populated.
- [ ] Today and Tomorrow are the only exact-day buckets.
- [ ] Tuesday and Sunday boundary tests prove gap-free, duplicate-free classification.
- [ ] Day 90 routes to Soon and day 91 routes to Someday.
- [ ] Date-view sorting uses the chosen anchor date, then priority, then description.
- [ ] Empty buckets are absent from list sections, board tabs, and board columns.
- [ ] Range labels are visible and neutral in both layouts.
- [ ] Past, Today, and Tomorrow start expanded; longer horizons, Undated, and Completed start collapsed in List view.
- [ ] Only Today and Tomorrow accept date drop and date quick-add.
- [ ] An open view re-renders at local midnight and clears its timer on close.
- [ ] Google Calendar behavior and task files are unchanged.
- [ ] Full tests, TypeScript, build, diff check, local deployment, and live UI verification pass.
