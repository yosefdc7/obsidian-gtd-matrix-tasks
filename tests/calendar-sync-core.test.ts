import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../src/types';
import {
  buildManagedEvent,
  buildReconciliationPlan,
  extractTaskUuid,
  googleEventIdForTask,
  isCalendarEligible,
} from '../src/calendar/sync-core';

const task = (overrides: Partial<TaskItem> = {}): TaskItem => ({
  id: 'Jots/2026/Sep/Sep 21 2026.md:4',
  filePath: 'Jots/2026/Sep/Sep 21 2026.md',
  fileName: 'Sep 21 2026',
  lineNumber: 4,
  rawText: '- [ ] Buy milk 🛫 2026-09-22 <!-- {"uuid":"123e4567-e89b-12d3-a456-426614174000"} -->',
  indent: '',
  statusChar: ' ',
  isCompleted: false,
  description: 'Buy milk <!-- {"uuid":"123e4567-e89b-12d3-a456-426614174000"} -->',
  priority: 'none',
  dueDate: null,
  scheduledDate: null,
  startDate: '2026-09-22',
  completedDate: null,
  createdDate: null,
  tags: [],
  isWaiting: false,
  isSomeday: false,
  isProject: false,
  linkedNotes: [],
  effectiveRole: 'untagged',
  roleSource: 'none',
  ...overrides,
});

describe('calendar sync identity', () => {
  it('extracts the hidden UUID and derives a Google-safe deterministic event ID', () => {
    expect(extractTaskUuid(task().rawText)).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(googleEventIdForTask('123e4567-e89b-12d3-a456-426614174000')).toBe(
      'gtd123e4567e89b12d3a456426614174000',
    );
  });
});

describe('calendar eligibility', () => {
  it('includes only open tasks with a Start date and UUID', () => {
    expect(isCalendarEligible(task())).toBe(true);
    expect(isCalendarEligible(task({ startDate: null }))).toBe(false);
    expect(isCalendarEligible(task({ isCompleted: true }))).toBe(false);
    expect(isCalendarEligible(task({ statusChar: '-' }))).toBe(false);
    expect(isCalendarEligible(task({ rawText: '- [ ] Buy milk 🛫 2026-09-22' }))).toBe(false);
  });
});

describe('managed Google event payload', () => {
  it('creates a private busy 30-minute event at 07:00 in the calendar timezone', () => {
    expect(
      buildManagedEvent(task(), {
        vaultName: '2nd Brain',
        defaultStartTime: '07:00',
        defaultDurationMinutes: 30,
        timeZone: 'Asia/Singapore',
      }),
    ).toEqual({
      id: 'gtd123e4567e89b12d3a456426614174000',
      summary: 'Buy milk',
      description:
        'Open source note: obsidian://open?vault=2nd%20Brain&file=Jots%2F2026%2FSep%2FSep%2021%202026.md\n\nManaged by GTD Matrix Tasks. Edit this task in Obsidian.',
      start: { dateTime: '2026-09-22T07:00:00', timeZone: 'Asia/Singapore' },
      end: { dateTime: '2026-09-22T07:30:00', timeZone: 'Asia/Singapore' },
      visibility: 'private',
      transparency: 'opaque',
      reminders: { useDefault: true },
      extendedProperties: {
        private: {
          managedBy: 'gtd-matrix-tasks',
          taskUuid: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    });
  });
});

describe('reconciliation plan', () => {
  it('upserts every eligible task and deletes only managed events absent from that set', () => {
    const plan = buildReconciliationPlan(
      [task(), task({ rawText: '- [x] Done 🛫 2026-09-22 <!-- {"uuid":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"} -->', isCompleted: true })],
      [
        { id: 'gtd123e4567e89b12d3a456426614174000', taskUuid: '123e4567-e89b-12d3-a456-426614174000' },
        { id: 'gtdeeeeeeeeeeee4eee8eeeeeeeeeeeeeee', taskUuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
      ],
    );

    expect(plan.upsert.map((entry) => entry.eventId)).toEqual([
      'gtd123e4567e89b12d3a456426614174000',
    ]);
    expect(plan.deleteEventIds).toEqual(['gtdeeeeeeeeeeee4eee8eeeeeeeeeeeeeee']);
  });
});
