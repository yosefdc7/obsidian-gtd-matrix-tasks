import type { TaskItem } from '../types';

const UUID_COMMENT_RE = /<!--\s*\{[^>]*?"uuid"\s*:\s*"([0-9a-fA-F-]{36})"[^>]*?\}\s*-->/;
const HIDDEN_COMMENT_RE = /<!--.*?-->/g;

export interface ManagedEventRef {
  id: string;
  taskUuid: string;
}

export interface CalendarEventDateTime {
  dateTime: string;
  timeZone: string;
}

export interface ManagedCalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: CalendarEventDateTime;
  end: CalendarEventDateTime;
  visibility: 'private';
  transparency: 'opaque';
  reminders: { useDefault: true };
  extendedProperties: {
    private: {
      managedBy: 'gtd-matrix-tasks';
      taskUuid: string;
    };
  };
}

export interface ManagedEventOptions {
  vaultName: string;
  defaultStartTime: string;
  defaultDurationMinutes: number;
  timeZone: string;
}

export interface ReconciliationPlan {
  upsert: Array<{ eventId: string; task: TaskItem }>;
  deleteEventIds: string[];
}

export function extractTaskUuid(rawText: string): string | null {
  return rawText.match(UUID_COMMENT_RE)?.[1]?.toLowerCase() ?? null;
}

export function googleEventIdForTask(uuid: string): string {
  return `gtd${uuid.toLowerCase().replace(/-/g, '')}`;
}

export function isCalendarEligible(task: TaskItem): boolean {
  return (
    !task.isCompleted &&
    task.statusChar === ' ' &&
    Boolean(task.startDate) &&
    Boolean(extractTaskUuid(task.rawText))
  );
}

export function cleanTaskTitle(description: string): string {
  return description
    .replace(HIDDEN_COMMENT_RE, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias || target.split('/').pop() || target)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function localDateTime(date: string, time: string, offsetMinutes = 0): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute + offsetMinutes));
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-') + `T${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}:00`;
}

export function buildManagedEvent(task: TaskItem, options: ManagedEventOptions): ManagedCalendarEvent {
  const uuid = extractTaskUuid(task.rawText);
  if (!uuid || !task.startDate) {
    throw new Error('A managed event requires an open task with a Start date and UUID.');
  }

  const sourceUrl = `obsidian://open?vault=${encodeURIComponent(options.vaultName)}&file=${encodeURIComponent(task.filePath)}`;
  return {
    id: googleEventIdForTask(uuid),
    summary: cleanTaskTitle(task.description),
    description: `Open source note: ${sourceUrl}\n\nManaged by GTD Matrix Tasks. Edit this task in Obsidian.`,
    start: {
      dateTime: localDateTime(task.startDate, options.defaultStartTime),
      timeZone: options.timeZone,
    },
    end: {
      dateTime: localDateTime(task.startDate, options.defaultStartTime, options.defaultDurationMinutes),
      timeZone: options.timeZone,
    },
    visibility: 'private',
    transparency: 'opaque',
    reminders: { useDefault: true },
    extendedProperties: {
      private: {
        managedBy: 'gtd-matrix-tasks',
        taskUuid: uuid,
      },
    },
  };
}

export function buildReconciliationPlan(
  tasks: TaskItem[],
  existingManagedEvents: ManagedEventRef[],
): ReconciliationPlan {
  const eligible = tasks.filter(isCalendarEligible);
  const activeEventIds = new Set(
    eligible.map((task) => googleEventIdForTask(extractTaskUuid(task.rawText)!)),
  );

  return {
    upsert: eligible.map((task) => ({
      eventId: googleEventIdForTask(extractTaskUuid(task.rawText)!),
      task,
    })),
    deleteEventIds: existingManagedEvents
      .filter((event) => !activeEventIds.has(event.id))
      .map((event) => event.id),
  };
}
