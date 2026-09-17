import { describe, it, expect, vi } from 'vitest';
import { TaskStore, SnapshotAdapter } from '../src/store/task-store';
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

class MemorySnapshotAdapter implements SnapshotAdapter {
  public files: Map<string, string> = new Map();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async read(path: string): Promise<string> {
    const data = this.files.get(path);
    if (data === undefined) throw new Error(`File not found: ${path}`);
    return data;
  }

  async write(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }
}

describe('TaskStore Snapshot Persistence', () => {
  it('returns false when cache file does not exist', async () => {
    const store = new TaskStore();
    const adapter = new MemorySnapshotAdapter();
    store.configureSnapshot(adapter, 'task-cache.json');

    const loaded = await store.loadSnapshot();
    expect(loaded).toBe(false);
    expect(store.getTasks()).toEqual([]);
  });

  it('saves and loads snapshot successfully', async () => {
    const store = new TaskStore();
    const adapter = new MemorySnapshotAdapter();
    store.configureSnapshot(adapter, 'task-cache.json');

    const task1 = createMockTask('1', 'Note1.md', 'Test Task 1');
    const task2 = createMockTask('2', 'Note2.md', 'Test Task 2');
    store.setTasks([task1, task2]);

    await store.saveSnapshot();
    expect(await adapter.exists('task-cache.json')).toBe(true);

    const newStore = new TaskStore();
    const listener = vi.fn();
    newStore.onTasksUpdated(listener);
    newStore.configureSnapshot(adapter, 'task-cache.json');

    const loaded = await newStore.loadSnapshot();
    expect(loaded).toBe(true);
    expect(newStore.getTasks()).toHaveLength(2);
    expect(newStore.getTasks()[0].description).toBe('Test Task 1');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('gracefully handles corrupted cache file without throwing', async () => {
    const store = new TaskStore();
    const adapter = new MemorySnapshotAdapter();
    await adapter.write('task-cache.json', '{ corrupted json ...');
    store.configureSnapshot(adapter, 'task-cache.json');

    const loaded = await store.loadSnapshot();
    expect(loaded).toBe(false);
    expect(store.getTasks()).toEqual([]);
  });

  it('rejects unsupported schema version', async () => {
    const store = new TaskStore();
    const adapter = new MemorySnapshotAdapter();
    await adapter.write(
      'task-cache.json',
      JSON.stringify({ version: 999, savedAt: 123456, tasks: [] })
    );
    store.configureSnapshot(adapter, 'task-cache.json');

    const loaded = await store.loadSnapshot();
    expect(loaded).toBe(false);
  });
});
