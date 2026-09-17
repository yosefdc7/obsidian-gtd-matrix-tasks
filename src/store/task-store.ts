import { TaskItem } from '../types';

function debounce<T extends (...args: unknown[]) => void>(fn: T, delayMs: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, delayMs);
  }) as T;
}

export interface SnapshotAdapter {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
}

export interface TaskCachePayload {
  version: number;
  savedAt: number;
  tasks: TaskItem[];
}

export class TaskStore {
  private tasks: TaskItem[] = [];
  private listeners: ((tasks: TaskItem[]) => void)[] = [];
  public debouncedNotify: () => void;
  private snapshotAdapter: SnapshotAdapter | null = null;
  private cacheFilePath: string | null = null;
  public debouncedSaveSnapshot: () => void;

  constructor() {
    this.debouncedNotify = debounce(() => this.notify(), 150);
    this.debouncedSaveSnapshot = debounce(() => void this.saveSnapshot(), 500);
  }

  public configureSnapshot(adapter: SnapshotAdapter, cacheFilePath: string): void {
    this.snapshotAdapter = adapter;
    this.cacheFilePath = cacheFilePath;
  }

  public async loadSnapshot(): Promise<boolean> {
    if (!this.snapshotAdapter || !this.cacheFilePath) return false;
    try {
      if (!(await this.snapshotAdapter.exists(this.cacheFilePath))) {
        return false;
      }
      const raw = await this.snapshotAdapter.read(this.cacheFilePath);
      const parsed = JSON.parse(raw) as TaskCachePayload;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.tasks)) {
        this.tasks = parsed.tasks;
        this.notify();
        return true;
      }
    } catch (err) {
      console.warn('[TaskStore] Failed to load snapshot cache:', err);
    }
    return false;
  }

  public async saveSnapshot(): Promise<void> {
    if (!this.snapshotAdapter || !this.cacheFilePath) return;
    try {
      const payload: TaskCachePayload = {
        version: 1,
        savedAt: Date.now(),
        tasks: this.tasks
      };
      await this.snapshotAdapter.write(this.cacheFilePath, JSON.stringify(payload));
    } catch (err) {
      console.warn('[TaskStore] Failed to save snapshot cache:', err);
    }
  }

  public onTasksUpdated(callback: (tasks: TaskItem[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.tasks);
      } catch (err) {
        console.error('Error in GTD Matrix Tasks listener', err);
      }
    }
  }

  public getTasks(): TaskItem[] {
    return this.tasks;
  }

  public setTasks(newTasks: TaskItem[]): void {
    this.tasks = newTasks;
    this.notify();
    this.debouncedSaveSnapshot();
  }

  public replaceFileTasks(filePath: string, fileTasks: TaskItem[]): void {
    const otherTasks = this.tasks.filter((t) => t.filePath !== filePath);
    this.tasks = otherTasks.concat(fileTasks);
    this.debouncedNotify();
    this.debouncedSaveSnapshot();
  }

  public removeFileTasks(filePath: string): void {
    const prevCount = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.filePath !== filePath);
    if (this.tasks.length !== prevCount) {
      this.debouncedNotify();
      this.debouncedSaveSnapshot();
    }
  }
}
