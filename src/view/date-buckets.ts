import { DateAnchorField, SortCriteria, TaskItem } from '../types';
import { sortTasks } from '../parser';

/** A single column/group of the By Date view. */
export interface DateBucketDefinition {
  id: string;
  title: string;
  subtitle: string;
  badgeClass: string;
  icon: string;
  /** ISO date for drop-enabled day buckets; null for non-day buckets. */
  dayDate: string | null;
}

export const DATE_BUCKET_PAST = 'date-past';
export const DATE_BUCKET_SOON = 'date-soon';
export const DATE_BUCKET_SOMEDAY = 'date-someday';
export const DATE_BUCKET_UNDATED = 'date-undated';
export const DATE_BUCKET_COMPLETED = 'date-completed';

/** Sections that should begin collapsed for a calmer first scan of any view. */
export function createDefaultCollapsedSections(): Set<string> {
  return new Set([DATE_BUCKET_COMPLETED, 'gtd-completed', 'eisen-completed']);
}

/** Individual day buckets cover Today through today + 7 (8 buckets). */
export const DAY_BUCKET_COUNT = 8;
/** Soon covers +8 to +90 days; beyond that is Someday (matches GTD routing). */
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
  if (diff < DAY_BUCKET_COUNT) return dateBucketDayId(anchor);
  if (diff <= SOON_MAX_DAYS) return DATE_BUCKET_SOON;
  return DATE_BUCKET_SOMEDAY;
}

/** Chronological bucket list: Past | Today…+7 | Soon | Someday | Undated | Completed Today. */
export function buildDateBuckets(todayStr: string): DateBucketDefinition[] {
  const buckets: DateBucketDefinition[] = [
    {
      id: DATE_BUCKET_PAST,
      title: 'Past — Overdue',
      subtitle: 'Anchor date before today.',
      badgeClass: 'badge-date-past',
      icon: 'alert-triangle',
      dayDate: null
    }
  ];

  for (let i = 0; i < DAY_BUCKET_COUNT; i++) {
    const date = addDays(todayStr, i);
    const { title, subtitle } = formatDayLabel(date);
    buckets.push({
      id: dateBucketDayId(date),
      title: i === 0 ? `Today — ${title}` : i === 1 ? `Tomorrow — ${title}` : title,
      subtitle,
      badgeClass: 'badge-date-day',
      icon: 'calendar',
      dayDate: date
    });
  }

  buckets.push(
    {
      id: DATE_BUCKET_SOON,
      title: 'Soon — Next 90 Days',
      subtitle: 'Anchor date 8 to 90 days out.',
      badgeClass: 'badge-date-soon',
      icon: 'clock',
      dayDate: null
    },
    {
      id: DATE_BUCKET_SOMEDAY,
      title: 'Someday — Far Future',
      subtitle: 'Anchor date more than 90 days out.',
      badgeClass: 'badge-date-someday',
      icon: 'archive',
      dayDate: null
    },
    {
      id: DATE_BUCKET_UNDATED,
      title: 'Undated — No Dates Set',
      subtitle: 'No scheduled, due, or start date.',
      badgeClass: 'badge-date-undated',
      icon: 'help-circle',
      dayDate: null
    },
    {
      id: DATE_BUCKET_COMPLETED,
      title: 'Completed Today',
      subtitle: 'Tasks checked off today.',
      badgeClass: 'badge-done',
      icon: 'check-circle',
      dayDate: null
    }
  );

  return buckets;
}

/** Buckets tasks by Anchor Date, pre-sorted per bucket for the renderers. */
export function groupByDateBucket(
  tasks: TaskItem[],
  anchorField: DateAnchorField,
  todayStr: string,
  sortCriteria: SortCriteria
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
