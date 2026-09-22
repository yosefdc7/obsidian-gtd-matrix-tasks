# Date Horizon Buckets

## Purpose

Replace the rolling sequence of eight individual day sections in the By Date view with a compact planning horizon. Only Today and Tomorrow remain exact-day sections; later work is grouped into calendar-aware horizons.

## Bucket order and boundaries

Buckets are mutually exclusive and evaluated in this order:

1. **Past** — open tasks anchored before Today.
2. **Today** — tasks anchored on the current local calendar date.
3. **Tomorrow** — tasks anchored on the next local calendar date.
4. **Later** — tasks anchored after Tomorrow through Sunday of the current Monday-to-Sunday week.
5. **Next Week** — tasks anchored after Tomorrow in the following Monday-to-Sunday week.
6. **Soon** — tasks anchored after Next Week through 90 days after Today, inclusive.
7. **Someday** — tasks anchored 91 or more days after Today.
8. **Undated** — open tasks with no available anchor date.
9. **Completed Today** — tasks completed on Today; older completed tasks remain omitted.

Today and Tomorrow take precedence over broader calendar-week buckets. If Today is Sunday, Tomorrow is Monday; Later is empty and Next Week covers Tuesday through Sunday. There must be no overlap and no uncovered date.

The existing anchor selector remains authoritative. The selected Start, Scheduled, or Due field is used when present, followed by the existing fallback order Scheduled → Due → Start.

## Example

For Tuesday, September 22, 2026:

| Bucket | Range |
| --- | --- |
| Past | Before Sep 22 |
| Today | Sep 22 |
| Tomorrow | Sep 23 |
| Later | Sep 24–27 |
| Next Week | Sep 28–Oct 4 |
| Soon | Oct 5–Dec 21 |
| Someday | Dec 22 onward |

## Presentation

- Hide every empty date bucket in List and Board layouts, including an empty Completed Today bucket.
- Show muted range text beside or below the heading for Later, Next Week, Soon, and Someday.
- Preserve the brighter plain-text treatment for Today and Tomorrow. Do not add accent rails, colored fills, or colored date pills.
- In List view, Past, Today, and Tomorrow start expanded when present.
- In List view, Later, Next Week, Soon, Someday, Undated, and Completed Today start collapsed.
- Manual expand/collapse changes remain session-only.
- Board view shows non-empty buckets as columns and does not add collapse behavior.

## Ordering and interaction

- Within every date bucket, sort by the selected anchor date ascending, then priority descending, then task description for a deterministic tie-break.
- The normal GTD and Eisenhower sort controls continue to work as they do now.
- Hide the sort selector while By Date is active because its order is fixed by this specification.
- Today and Tomorrow keep exact-date drag/drop and quick-add behavior.
- Past, Later, Next Week, Soon, Someday, Undated, and Completed Today do not accept date drops or date quick-add because they do not identify one exact target date.

## Date rollover

- Use the device's local calendar date, matching the existing `getTodayDateString()` behavior.
- While the view remains open, schedule a refresh at the next local midnight.
- After refreshing, schedule the following midnight refresh.
- Clear the timer when the view closes.
- Rollover changes grouping only; it does not modify task files.

## Out of scope

- No week-start setting; weeks are fixed to Monday through Sunday.
- No persisted collapse state.
- No changes to Google Calendar synchronization.
- No migration of task data or dates.
- No new dependencies.
