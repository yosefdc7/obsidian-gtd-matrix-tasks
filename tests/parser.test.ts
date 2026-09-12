import { describe, it, expect } from 'vitest';
import {
  parseTaskLine,
  setTaskPriority,
  setTaskCompletion,
  setTaskDueDate,
  setTaskDescription,
  getTaskSection
} from '../src/parser';
import { TaskItem } from '../src/types';

describe('Task Parser', () => {
  it('parses a basic task with no metadata', () => {
    const line = '- [ ] Buy groceries';
    const task = parseTaskLine(line, 'test.md', 0);
    expect(task).not.toBeNull();
    expect(task?.description).toBe('Buy groceries');
    expect(task?.isCompleted).toBe(false);
    expect(task?.priority).toBe('none');
    expect(task?.dueDate).toBeNull();
  });

  it('parses priority emoji and due date', () => {
    const line = '- [ ] Submit report ⏫ 📅 2026-09-15';
    const task = parseTaskLine(line, 'work.md', 5);
    expect(task).not.toBeNull();
    expect(task?.priority).toBe('highest');
    expect(task?.dueDate).toBe('2026-09-15');
    expect(task?.description).toBe('Submit report');
  });

  it('parses high, medium, and low priority emojis', () => {
    expect(parseTaskLine('- [ ] Task 1 🔼', 'f.md', 0)?.priority).toBe('high');
    expect(parseTaskLine('- [ ] Task 2 🔽', 'f.md', 0)?.priority).toBe('medium');
    expect(parseTaskLine('- [ ] Task 3 ⏬', 'f.md', 0)?.priority).toBe('low');
  });

  it('parses custom status characters like [?] and [/]', () => {
    const onHold = parseTaskLine('- [?] Waiting for review 🔽', 'f.md', 0);
    expect(onHold?.statusChar).toBe('?');
    expect(onHold?.isCompleted).toBe(false);

    const inProgress = parseTaskLine('- [/] Working on feature', 'f.md', 1);
    expect(inProgress?.statusChar).toBe('/');
  });

  it('parses completed tasks with completion emoji date', () => {
    const line = '- [x] Fix login bug ✅ 2026-09-12';
    const task = parseTaskLine(line, 'bug.md', 2);
    expect(task?.isCompleted).toBe(true);
    expect(task?.completedDate).toBe('2026-09-12');
  });
});

describe('Task Mutators', () => {
  it('updates task priority emoji cleanly', () => {
    const line = '- [ ] Draft proposal 📅 2026-09-20';
    const q1 = setTaskPriority(line, 'highest');
    expect(q1).toBe('- [ ] Draft proposal 📅 2026-09-20 ⏫');

    const q2 = setTaskPriority(q1, 'high');
    expect(q2).toBe('- [ ] Draft proposal 📅 2026-09-20 🔼');

    const inbox = setTaskPriority(q2, 'none');
    expect(inbox).toBe('- [ ] Draft proposal 📅 2026-09-20');
  });

  it('updates task completion state and appends date', () => {
    const line = '- [ ] Deploy to staging ⏫';
    const completed = setTaskCompletion(line, true, '2026-09-12');
    expect(completed).toBe('- [x] Deploy to staging ⏫ ✅ 2026-09-12');

    const uncompleted = setTaskCompletion(completed, false);
    expect(uncompleted).toBe('- [ ] Deploy to staging ⏫');
  });

  it('updates due date cleanly', () => {
    const line = '- [ ] Book flight ⏫';
    const dated = setTaskDueDate(line, '2026-09-25');
    expect(dated).toBe('- [ ] Book flight ⏫ 📅 2026-09-25');

    const changed = setTaskDueDate(dated, '2026-10-01');
    expect(changed).toBe('- [ ] Book flight ⏫ 📅 2026-10-01');

    const removed = setTaskDueDate(changed, null);
    expect(removed).toBe('- [ ] Book flight ⏫');
  });

  it('updates task description without losing metadata', () => {
    const line = '  - [ ] Old description ⏫ 📅 2026-09-20';
    const updated = setTaskDescription(line, 'New shiny description');
    expect(updated).toBe('  - [ ] New shiny description ⏫ 📅 2026-09-20');
  });
});

describe('Task Section Classification', () => {
  const baseTask: TaskItem = {
    id: 'f.md:0',
    filePath: 'f.md',
    fileName: 'f',
    lineNumber: 0,
    rawText: '',
    indent: '',
    statusChar: ' ',
    isCompleted: false,
    description: 'Test',
    priority: 'none',
    dueDate: null,
    scheduledDate: null,
    startDate: null,
    completedDate: null,
    tags: []
  };

  const today = '2026-09-12';

  it('routes to Inbox when no priority and no dates', () => {
    expect(getTaskSection({ ...baseTask, priority: 'none' }, today)).toBe('inbox');
  });

  it('routes to Q1, Q2, Q3, Q4 based on priority', () => {
    expect(getTaskSection({ ...baseTask, priority: 'highest' }, today)).toBe('q1-do');
    expect(getTaskSection({ ...baseTask, priority: 'high' }, today)).toBe('q2-schedule');
    expect(getTaskSection({ ...baseTask, priority: 'medium' }, today)).toBe('q3-delegate');
    expect(getTaskSection({ ...baseTask, priority: 'low' }, today)).toBe('q4-someday');
    expect(getTaskSection({ ...baseTask, priority: 'lowest' }, today)).toBe('q4-someday');
  });

  it('routes [?] status to Q3 (Waiting For / Delegated)', () => {
    expect(getTaskSection({ ...baseTask, statusChar: '?' }, today)).toBe('q3-delegate');
  });

  it('routes dated tasks without priority to Scheduled', () => {
    expect(getTaskSection({ ...baseTask, priority: 'none', dueDate: '2026-09-14' }, today)).toBe('scheduled');
  });

  it('routes tasks completed today to completed-today and omits older completed tasks', () => {
    expect(getTaskSection({ ...baseTask, isCompleted: true, completedDate: '2026-09-12' }, today)).toBe('completed-today');
    expect(getTaskSection({ ...baseTask, isCompleted: true, completedDate: '2026-09-10' }, today)).toBeNull();
  });
});
