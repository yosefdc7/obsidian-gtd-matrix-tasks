import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../src/types';
import type { CalendarGateway } from '../src/calendar/sync-service';
import { CalendarSyncService } from '../src/calendar/sync-service';
import type { ManagedCalendarEvent, ManagedEventRef } from '../src/calendar/sync-core';

class MemoryCalendar implements CalendarGateway {
  events = new Map<string, ManagedCalendarEvent>();

  async listManagedEvents(): Promise<ManagedEventRef[]> {
    return [...this.events.values()].map((event) => ({
      id: event.id,
      taskUuid: event.extendedProperties.private.taskUuid,
    }));
  }

  async upsertEvent(event: ManagedCalendarEvent): Promise<void> {
    this.events.set(event.id, event);
  }

  async deleteEvent(eventId: string): Promise<void> {
    this.events.delete(eventId);
  }
}

const makeTask = (description: string, completed = false): TaskItem => ({
  id: 'note.md:0', filePath: 'note.md', fileName: 'note', lineNumber: 0,
  rawText: `- [${completed ? 'x' : ' '}] ${description} 🛫 2026-09-22 <!-- {"uuid":"123e4567-e89b-12d3-a456-426614174000"} -->`,
  indent: '', statusChar: completed ? 'x' : ' ', isCompleted: completed, description,
  priority: 'none', dueDate: null, scheduledDate: null, startDate: '2026-09-22',
  completedDate: completed ? '2026-09-21' : null, createdDate: null, tags: [],
  isWaiting: false, isSomeday: false, isProject: false, linkedNotes: [],
  effectiveRole: 'untagged', roleSource: 'none',
});

const options = {
  vaultName: '2nd Brain',
  defaultStartTime: '07:00',
  defaultDurationMinutes: 30,
  timeZone: 'Asia/Singapore',
};

describe('CalendarSyncService', () => {
  it('updates a renamed task in place without creating a second event', async () => {
    const calendar = new MemoryCalendar();
    const service = new CalendarSyncService(calendar);

    await service.sync([makeTask('Buy milk')], options);
    await service.sync([makeTask('Buy oat milk')], options);

    expect(calendar.events.size).toBe(1);
    expect([...calendar.events.values()][0].summary).toBe('Buy oat milk');
  });

  it('deletes the managed event when its source task is completed', async () => {
    const calendar = new MemoryCalendar();
    const service = new CalendarSyncService(calendar);
    await service.sync([makeTask('Buy milk')], options);

    const result = await service.sync([makeTask('Buy milk', true)], options);

    expect(calendar.events.size).toBe(0);
    expect(result).toEqual({ upserted: 0, deleted: 1 });
  });
});
