import { RoleId, SectionId, TaskItem, ViewMode } from '../types';
import {
  setTaskCompletion,
  setTaskDueDate,
  setTaskPriority,
  setTaskScheduledDate,
  setTaskSomeday,
  setTaskWaiting,
  setTaskRole
} from '../parser';
import type { TaskMutator } from '../store/task-mutator';

/** Date offset helper (UTC-stable, day granularity). */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Applies a drop transition to a task as ONE atomic file write
 * (single vault.process + single reindex via batchUpdateTaskLine).
 *
 * roleTag semantics: undefined = preserve current role, null = clear role,
 * RoleId = set role. When the resolved role already matches the task's
 * effective role, the role is left untouched within the same write.
 */
export async function executeTaskTransition(
  task: TaskItem,
  targetSection: SectionId,
  viewMode: ViewMode,
  mutator: TaskMutator,
  todayStr: string,
  roleTag?: RoleId | null
): Promise<boolean> {
  const needsRoleUpdate = roleTag !== undefined && task.effectiveRole !== (roleTag || 'untagged');

  return mutator.batchUpdateTaskLine(task, (line) => {
    let updated = line;

    if (needsRoleUpdate) {
      updated = setTaskRole(updated, roleTag || null);
    }

    if (viewMode === 'gtd') {
      switch (targetSection) {
        case 'gtd-next-actions':
          // Clear waiting/someday flags, set dueDate = today + 3
          if (task.isWaiting) updated = setTaskWaiting(updated, false);
          if (task.isSomeday) updated = setTaskSomeday(updated, false);
          updated = setTaskDueDate(updated, addDays(todayStr, 3));
          break;
        case 'gtd-waiting':
          updated = setTaskWaiting(updated, true);
          break;
        case 'gtd-scheduled':
          // Set scheduledDate = today + 10
          if (task.isWaiting) updated = setTaskWaiting(updated, false);
          if (task.isSomeday) updated = setTaskSomeday(updated, false);
          updated = setTaskScheduledDate(updated, addDays(todayStr, 10));
          break;
        case 'gtd-someday':
          // Add #someday tag, clear dates
          updated = setTaskSomeday(updated, true);
          updated = setTaskDueDate(updated, null);
          updated = setTaskScheduledDate(updated, null);
          break;
        case 'gtd-inbox':
          updated = setTaskPriority(updated, 'none');
          updated = setTaskDueDate(updated, null);
          updated = setTaskScheduledDate(updated, null);
          updated = setTaskWaiting(updated, false);
          updated = setTaskSomeday(updated, false);
          break;
        case 'gtd-completed':
          updated = setTaskCompletion(updated, true, todayStr);
          break;
      }
      return updated;
    }

    // Eisenhower Mode Transitions
    switch (targetSection) {
      case 'eisen-q1':
        updated = setTaskPriority(updated, 'highest');
        break;
      case 'eisen-q2':
        updated = setTaskPriority(updated, 'high');
        break;
      case 'eisen-q3':
        updated = setTaskPriority(updated, 'medium');
        break;
      case 'eisen-q4':
        updated = setTaskPriority(updated, 'low');
        break;
      case 'eisen-inbox':
        updated = setTaskPriority(updated, 'none');
        break;
      case 'eisen-completed':
        updated = setTaskCompletion(updated, true, todayStr);
        break;
    }
    return updated;
  });
}
