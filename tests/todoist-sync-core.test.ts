import { describe, expect, it } from 'vitest';
import type { TaskItem } from '../src/types';
import type { TodoistTask } from '../src/todoist/todoist-types';
import {
  cleanTodoistTaskTitle,
  ensureTodoistIdentity,
  extractTodoistId,
  isTodoistEligible,
  mapTaskPriorityToTodoist,
  planTodoistReconciliation,
  resolveFacetProjectName,
} from '../src/todoist/todoist-sync-core';

const task = (overrides: Partial<TaskItem> = {}): TaskItem => ({
  id: 'Jots/2026/Sep/Sep 26 2026.md:5',
  filePath: 'Jots/2026/Sep/Sep 26 2026.md',
  fileName: 'Sep 26 2026',
  lineNumber: 5,
  rawText: '- [ ] Review Q4 delivery plan 📅 2026-09-30 🔺 [[Executive Dashboard]] <!-- {"uuid":"11111111-1111-4111-8111-111111111111"} -->',
  indent: '',
  statusChar: ' ',
  isCompleted: false,
  description: 'Review Q4 delivery plan 📅 2026-09-30 🔺 [[Executive Dashboard]] <!-- {"uuid":"11111111-1111-4111-8111-111111111111"} -->',
  priority: 'highest',
  dueDate: '2026-09-30',
  scheduledDate: null,
  startDate: null,
  completedDate: null,
  createdDate: null,
  tags: [],
  isWaiting: false,
  isSomeday: false,
  isProject: false,
  linkedNotes: ['Executive Dashboard'],
  effectiveRole: 'role/yo-manager',
  roleSource: 'linked-note',
  ...overrides,
});

describe('Todoist Task Eligibility', () => {
  it('accepts only open tasks with space statusChar', () => {
    expect(isTodoistEligible(task())).toBe(true);
    expect(isTodoistEligible(task({ isCompleted: true }))).toBe(false);
    expect(isTodoistEligible(task({ statusChar: 'x' }))).toBe(false);
    expect(isTodoistEligible(task({ statusChar: '-' }))).toBe(false);
  });
});

describe('Todoist Priority & Facet Mapping', () => {
  it('maps Obsidian Tasks priorities to Todoist 1-4 scale', () => {
    expect(mapTaskPriorityToTodoist('highest')).toBe(4);
    expect(mapTaskPriorityToTodoist('high')).toBe(3);
    expect(mapTaskPriorityToTodoist('medium')).toBe(2);
    expect(mapTaskPriorityToTodoist('low')).toBe(1);
    expect(mapTaskPriorityToTodoist('none')).toBe(1);
  });

  it('resolves effectiveRole to 3 identity facets', () => {
    expect(resolveFacetProjectName(task({ effectiveRole: 'role/yo-manager' }))).toBe('Yo the Manager');
    expect(resolveFacetProjectName(task({ effectiveRole: 'role/josef-selfcare' }))).toBe('Josef with Self Care');
    expect(resolveFacetProjectName(task({ effectiveRole: 'role/rj-supportive' }))).toBe('RJ the Supportive');
    expect(resolveFacetProjectName(task({ effectiveRole: 'untagged' }))).toBe('Inbox');
    expect(resolveFacetProjectName(task({ effectiveRole: 'untagged' }), 'MyDefault')).toBe('MyDefault');
  });
});

describe('Todoist Title Cleaning', () => {
  it('removes wikilink brackets and preserves readable label/alias', () => {
    const raw = 'Review [[Executive Dashboard|Exec Dash]] specs 📅 2026-09-30 🔺 <!-- {"uuid":"111"} -->';
    expect(cleanTodoistTaskTitle(raw)).toBe('Review Exec Dash specs');

    const simple = 'Deploy [[GStocks Turbo]] 🛫 2026-09-26 ⏫';
    expect(cleanTodoistTaskTitle(simple)).toBe('Deploy GStocks Turbo');
  });
});

describe('Todoist Identity Management', () => {
  it('extracts Todoist ID from existing JSON comment or legacy comment', () => {
    const jsonComment = '- [ ] Task <!-- {"uuid":"111", "todoistId":"tod_123"} -->';
    expect(extractTodoistId(jsonComment)).toBe('tod_123');

    const legacyComment = '- [ ] Task <!-- todoist-id:tod_999 -->';
    expect(extractTodoistId(legacyComment)).toBe('tod_999');

    expect(extractTodoistId('- [ ] Task without id')).toBe(null);
  });

  it('embeds todoistId cleanly into existing JSON comment', () => {
    const initial = '- [ ] Task 📅 2026-10-01 <!-- {"uuid":"111"} -->';
    const updated = ensureTodoistIdentity(initial, 'tod_456');
    expect(extractTodoistId(updated)).toBe('tod_456');
    expect(updated).toContain('"uuid":"111"');
    expect(updated).toContain('"todoistId":"tod_456"');
  });
});

describe('Todoist Reconciliation Planning', () => {
  it('plans creation of new open tasks lacking todoistId', () => {
    const local = [task()];
    const remote: TodoistTask[] = [];

    const plan = planTodoistReconciliation(local, remote);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].task.id).toBe(local[0].id);
    expect(plan.create[0].projectName).toBe('Yo the Manager');
    expect(plan.closeTodoistIds).toHaveLength(0);
    expect(plan.completeLocalTasks).toHaveLength(0);
  });

  it('marks local task completed when remote task is completed in Todoist', () => {
    const local = [
      task({
        rawText: '- [ ] Review Q4 <!-- {"uuid":"111","todoistId":"tod_100"} -->',
        description: 'Review Q4 <!-- {"uuid":"111","todoistId":"tod_100"} -->',
      }),
    ];
    // Remote task is completed
    const remote: TodoistTask[] = [
      {
        id: 'tod_100',
        project_id: 'proj_1',
        content: 'Review Q4',
        is_completed: true,
        priority: 4,
      },
    ];

    const plan = planTodoistReconciliation(local, remote);
    expect(plan.completeLocalTasks).toHaveLength(1);
    expect(plan.completeLocalTasks[0].task.id).toBe(local[0].id);
  });

  it('closes remote Todoist task when local task is checked off in Obsidian', () => {
    const completedLocal = [
      task({
        rawText: '- [x] Review Q4 <!-- {"uuid":"111","todoistId":"tod_200"} -->',
        isCompleted: true,
        statusChar: 'x',
      }),
    ];
    const remote: TodoistTask[] = [
      {
        id: 'tod_200',
        project_id: 'proj_1',
        content: 'Review Q4',
        is_completed: false,
        priority: 4,
      },
    ];

    const plan = planTodoistReconciliation(completedLocal, remote);
    expect(plan.closeTodoistIds).toEqual(['tod_200']);
  });

  it('detects missing due date in Todoist for tasks with startDate and schedules update', () => {
    const local = [
      task({
        rawText: '- [ ] need headset 🛫 2026-09-27 <!-- {"uuid":"111","todoistId":"tod_headset"} -->',
        description: 'need headset',
        startDate: '2026-09-27',
        dueDate: null,
        scheduledDate: null,
      }),
    ];
    // Remote task exists in Todoist but has no due date (due: null)
    const remote: TodoistTask[] = [
      {
        id: 'tod_headset',
        project_id: 'proj_inbox',
        content: 'need headset',
        is_completed: false,
        priority: 1,
        due: null,
      },
    ];

    const plan = planTodoistReconciliation(local, remote);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].todoistId).toBe('tod_headset');
    expect(plan.update[0].task.startDate).toBe('2026-09-27');
  });
});

describe('Todoist Date Resolution (Option A)', () => {
  it('prefers startDate over scheduledDate and dueDate', () => {
    const { resolveTodoistDueDate } = require('../src/todoist/todoist-sync-core');
    expect(resolveTodoistDueDate(task({ startDate: '2026-09-27', dueDate: '2026-09-30' }))).toBe('2026-09-27');
    expect(resolveTodoistDueDate(task({ startDate: null, scheduledDate: '2026-09-27', dueDate: '2026-09-30' }))).toBe('2026-09-27');
    expect(resolveTodoistDueDate(task({ startDate: null, scheduledDate: null, dueDate: '2026-09-30' }))).toBe('2026-09-30');
    expect(resolveTodoistDueDate(task({ startDate: null, scheduledDate: null, dueDate: null }))).toBe(undefined);
  });
});

describe('Todoist Task Description & Child Notes', () => {
  const {
    cleanTodoistDescription,
    buildTodoistTaskDescription,
  } = require('../src/todoist/todoist-sync-core');

  it('cleans wikilinks and hidden comments in child notes', () => {
    const raw = '- Check [[Executive Dashboard|Exec Dash]] specs <!-- comment -->\n- Follow up on [[Partner Reliability]]';
    const cleaned = cleanTodoistDescription(raw);
    expect(cleaned).toBe('- Check Exec Dash specs\n- Follow up on Partner Reliability');
  });

  it('caps child notes at 50 lines max and adds truncation notice', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `- Note line ${i + 1}`).join('\n');
    const cleaned = cleanTodoistDescription(lines, 50, 5000);
    const lineCount = cleaned.split('\n').length;
    expect(lineCount).toBe(51); // 50 lines + truncation notice
    expect(cleaned).toContain('... (truncated)');
  });

  it('builds full description with child notes and deep link footer', () => {
    const t = task({
      childNotes: '- Note A\n- Note B',
    });
    const desc = buildTodoistTaskDescription(t, '2nd Brain');
    expect(desc).toContain('- Note A\n- Note B');
    expect(desc).toContain('---');
    expect(desc).toContain('🔗 [Open in Obsidian](obsidian://open?vault=2nd%20Brain&file=Jots%2F2026%2FSep%2FSep%2026%202026.md)');
  });

  it('builds link-only description when task has no child notes', () => {
    const t = task({ childNotes: undefined });
    const desc = buildTodoistTaskDescription(t, '2nd Brain');
    expect(desc).toBe('🔗 [Open in Obsidian](obsidian://open?vault=2nd%20Brain&file=Jots%2F2026%2FSep%2FSep%2026%202026.md)');
  });

  it('schedules task update when remote description differs from local child notes', () => {
    const local = [
      task({
        rawText: '- [ ] Task <!-- {"uuid":"111","todoistId":"tod_1"} -->',
        description: 'Task',
        childNotes: '- New context note',
      }),
    ];
    const remote: TodoistTask[] = [
      {
        id: 'tod_1',
        project_id: 'proj_1',
        content: 'Task',
        is_completed: false,
        priority: 4,
        description: '🔗 [Open in Obsidian](obsidian://open?vault=2nd%20Brain&file=Jots%2F2026%2FSep%2FSep%2026%202026.md)',
      },
    ];

    const plan = planTodoistReconciliation(local, remote, 'Inbox', '2nd Brain');
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0].todoistId).toBe('tod_1');
  });

  it('orders parent tasks before child subtasks in create plan', () => {
    const parent = task({
      id: 'Note.md:1',
      lineNumber: 1,
      rawText: '- [ ] Parent Task',
      description: 'Parent Task',
    });
    const child = task({
      id: 'Note.md:2',
      lineNumber: 2,
      rawText: '    - [ ] Child Subtask',
      description: 'Child Subtask',
      parentTaskId: 'Note.md:1',
      parentLineNumber: 1,
    });

    // Pass child first in array to test sorting
    const plan = planTodoistReconciliation([child, parent], [], 'Inbox', '2nd Brain');
    expect(plan.create).toHaveLength(2);
    expect(plan.create[0].task.id).toBe(parent.id);
    expect(plan.create[1].task.id).toBe(child.id);
  });
});

