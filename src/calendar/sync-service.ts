import type { TaskItem } from '../types';
import {
  buildManagedEvent,
  buildReconciliationPlan,
  type ManagedCalendarEvent,
  type ManagedEventOptions,
  type ManagedEventRef,
} from './sync-core';

export interface CalendarGateway {
  listManagedEvents(): Promise<ManagedEventRef[]>;
  upsertEvent(event: ManagedCalendarEvent): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
}

export interface SyncResult {
  upserted: number;
  deleted: number;
}

export class CalendarSyncService {
  constructor(private readonly gateway: CalendarGateway) {}

  async sync(tasks: TaskItem[], options: ManagedEventOptions): Promise<SyncResult> {
    const existing = await this.gateway.listManagedEvents();
    const plan = buildReconciliationPlan(tasks, existing);

    for (const entry of plan.upsert) {
      await this.gateway.upsertEvent(buildManagedEvent(entry.task, options));
    }
    for (const eventId of plan.deleteEventIds) {
      await this.gateway.deleteEvent(eventId);
    }

    return { upserted: plan.upsert.length, deleted: plan.deleteEventIds.length };
  }
}
