import { DateAnchorField, SortCriteria, TaskItem } from '../types';
import { sortTasks } from '../parser';

/** A single column/group of the By Date view. */
export interface DateBucketDefinition {
  id: string;
  title: string;
  subtitle: string;
  rangeLabel: string | null;
  badgeClass: string;
  icon: string;
  /** ISO date for drop-enabled day buckets; null for non-day buckets. */
  dayDate: string | null;
}

export const DATE_BUCKET_PAST = 'date-past';
export const DATE_BUCKET_LATER = 'date-later';
export const DATE_BUCKET_NEXT_WEEK = 'date-next-week';
export const DATE_BUCKET_SOON = 'date-soon';
export const DATE_BUCKET_SOMEDAY = 'date-someday';
export const DATE_BUCKET_UNDATED = 'date-undated';
export const DATE_BUCKET_COMPLETED = 'date-completed';

/** Sections that should begin collapsed for a calmer first scan of any view. */
export function createDefaultCollapsedSections(): Set<string> {
  return new Set([DATE_BUCKET_COMPLETED, 'gtd-completed', 'eisen-completed']);
}

/** Soon covers the days after Next Week through today + 90; beyond that is Someday. */
const SOON_MAX_DAYS = 90;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateBucketDayId(dateStr: string): string {
  return `date-day:${dateStr}`;
}

/** Today and Tomorrow share the sole date-header emphasis; all other buckets remain neutral. */
export function getDateBucketEmphasis(
  bucket: DateBucketDefinition,
  todayStr: string
): 'current-day' | null {
  if (!bucket.dayDate) return null;
  return daysBetween(todayStr, bucket.dayDate) >= 0 && daysBetween(todayStr, bucket.dayDate) <= 1
    ? 'current-day'
    : null;
}

/** UTC-stable day offset (mirrors task-transitions.addDays). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr: string, toStr: string): number {
  const fromMs = new Date(`${fromStr}T00:00:00Z`).getTime();
  const toMs = new Date(`${toStr}T00:00:00Z`).getTime();
  return Math.round((toMs - fromMs) / 86400000);
}

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

function formatIsoDay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatDayLabel(dateStr: string): { title: string; subtitle: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const label = `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return { title: label, subtitle: dateStr };
}

/**
 * Anchor Date: the chosen field if set, otherwise the next available in
 * Scheduled → Due → Start order. Only fully dateless tasks yield null.
 */
export function getAnchorDate(task: TaskItem, anchorField: DateAnchorField): string | null {
  const chosen =
    anchorField === 'start' ? task.startDate : anchorField === 'due' ? task.dueDate : task.scheduledDate;
  return chosen ?? task.scheduledDate ?? task.dueDate ?? task.startDate;
}

/** Bucket that positions a task in the By Date view; null omits the task entirely. */
export function getDateBucketId(
  task: TaskItem,
  anchorField: DateAnchorField,
  todayStr: string
): string | null {
  if (task.isCompleted) {
    // Completed tasks never enter date buckets; only today's closure shows.
    return task.completedDate === todayStr ? DATE_BUCKET_COMPLETED : null;
  }

  const anchor = getAnchorDate(task, anchorField);
  if (!anchor) return DATE_BUCKET_UNDATED;

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
}

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

/** Buckets tasks by Anchor Date, pre-sorted per bucket for the renderers. */
export function groupByDateBucket(
  tasks: TaskItem[],
  anchorField: DateAnchorField,
  todayStr: string,
  sortCriteria: SortCriteria = 'date'
): Map<string, TaskItem[]> {
  const grouped = new Map<string, TaskItem[]>();
  for (const bucket of buildDateBuckets(todayStr)) {
    grouped.set(bucket.id, []);
  }

  for (const task of tasks) {
    const bucketId = getDateBucketId(task, anchorField, todayStr);
    if (bucketId) {
      grouped.get(bucketId)?.push(task);
    }
  }

  for (const [id, list] of grouped) {
    grouped.set(id, sortTasks(list, sortCriteria));
  }

  return grouped;
}
