import { describe, it, expect, vi } from 'vitest';
import { TaskStore } from '../src/store/task-store';
import { TaskItem } from '../src/types';

function createMockTask(id: string, filePath: string, desc: string): TaskItem {
  return {
    id,
    filePath,
    fileName: filePath.replace('.md', ''),
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
    roleSource: 'none'
  };
}

describe('TaskStore', () => {
  it('stores and retrieves tasks', () => {
    const store = new TaskStore();
    expect(store.getTasks()).toEqual([]);

    const task1 = createMockTask('1', 'Note1.md', 'Task 1');
    store.setTasks([task1]);
    expect(store.getTasks()).toEqual([task1]);
  });

  it('notifies listeners when tasks are set', () => {
    const store = new TaskStore();
    const listener = vi.fn();
    const unsubscribe = store.onTasksUpdated(listener);

    const task1 = createMockTask('1', 'Note1.md', 'Task 1');
    store.setTasks([task1]);

    expect(listener).toHaveBeenCalledWith([task1]);

    unsubscribe();
    store.setTasks([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('replaces tasks for a single file', () => {
    const store = new TaskStore();
    const task1 = createMockTask('1', 'Note1.md', 'Task 1');
    const task2 = createMockTask('2', 'Note2.md', 'Task 2');
    store.setTasks([task1, task2]);

    const updatedTask1 = createMockTask('1-new', 'Note1.md', 'Task 1 Updated');
    store.replaceFileTasks('Note1.md', [updatedTask1]);

    const tasks = store.getTasks();
    expect(tasks).toHaveLength(2);
    expect(tasks.some((t) => t.description === 'Task 1 Updated')).toBe(true);
    expect(tasks.some((t) => t.description === 'Task 2')).toBe(true);
  });

  it('removes tasks for a deleted file', () => {
    const store = new TaskStore();
    const task1 = createMockTask('1', 'Note1.md', 'Task 1');
    const task2 = createMockTask('2', 'Note2.md', 'Task 2');
    store.setTasks([task1, task2]);

    store.removeFileTasks('Note1.md');
    const tasks = store.getTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].filePath).toBe('Note2.md');
  });
});
