import { describe, it, expect } from 'vitest';
import { parseTaskLine, sortTasks } from '../src/parser';
import { TaskItem } from '../src/types';

describe('Task Sorting', () => {
  const createMockTask = (desc: string, partial: Partial<TaskItem>): TaskItem => ({
    id: `test.md:${Math.random()}`,
    filePath: 'test.md',
    fileName: 'test',
    lineNumber: 1,
    rawText: `- [ ] ${desc}`,
    indent: '',
    statusChar: ' ',
    isCompleted: false,
    description: desc,
    priority: 'none',
    dueDate: null,
    scheduledDate: null,
    startDate: null,
    completedDate: null,
    createdDate: null,
    tags: [],
    isWaiting: false,
    isSomeday: false,
    isProject: false,
    linkedNotes: [],
    effectiveRole: 'untagged',
    roleSource: 'none',
    ...partial
  });

  it('sorts tasks by date (earliest first, undated last)', () => {
    const t1 = createMockTask('Task 1', { scheduledDate: '2026-09-20' });
    const t2 = createMockTask('Task 2', { dueDate: '2026-09-15' });
    const t3 = createMockTask('Task 3', {}); // undated
    const t4 = createMockTask('Task 4', { scheduledDate: '2026-09-10' });

    const sorted = sortTasks([t1, t2, t3, t4], 'date');
    expect(sorted.map((t) => t.description)).toEqual(['Task 4', 'Task 2', 'Task 1', 'Task 3']);
  });

  it('sorts tasks by priority (highest to lowest to none)', () => {
    const t1 = createMockTask('Task Medium', { priority: 'medium' });
    const t2 = createMockTask('Task Highest', { priority: 'highest' });
    const t3 = createMockTask('Task None', { priority: 'none' });
    const t4 = createMockTask('Task High', { priority: 'high' });
    const t5 = createMockTask('Task Low', { priority: 'low' });

    const sorted = sortTasks([t1, t2, t3, t4, t5], 'priority');
    expect(sorted.map((t) => t.description)).toEqual([
      'Task Highest',
      'Task High',
      'Task Medium',
      'Task Low',
      'Task None'
    ]);
  });

  it('sorts tasks alphabetically by title', () => {
    const t1 = createMockTask('Zebra', {});
    const t2 = createMockTask('Apple', {});
    const t3 = createMockTask('Banana', {});

    const sorted = sortTasks([t1, t2, t3], 'title');
    expect(sorted.map((t) => t.description)).toEqual(['Apple', 'Banana', 'Zebra']);
  });

  it('sorts tasks by created date (newest first, undated last)', () => {
    const t1 = createMockTask('Task 1', { createdDate: '2026-09-01' });
    const t2 = createMockTask('Task 2', { createdDate: '2026-09-14' });
    const t3 = createMockTask('Task 3', {}); // no created date

    const sorted = sortTasks([t1, t2, t3], 'created');
    expect(sorted.map((t) => t.description)).toEqual(['Task 2', 'Task 1', 'Task 3']);
  });
});
