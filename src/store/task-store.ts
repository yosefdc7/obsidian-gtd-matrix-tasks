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

export class TaskStore {
  private tasks: TaskItem[] = [];
  private listeners: ((tasks: TaskItem[]) => void)[] = [];
  public debouncedNotify: () => void;

  constructor() {
    this.debouncedNotify = debounce(() => this.notify(), 150);
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
  }

  public replaceFileTasks(filePath: string, fileTasks: TaskItem[]): void {
    const otherTasks = this.tasks.filter((t) => t.filePath !== filePath);
    this.tasks = otherTasks.concat(fileTasks);
    this.debouncedNotify();
  }

  public removeFileTasks(filePath: string): void {
    const prevCount = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.filePath !== filePath);
    if (this.tasks.length !== prevCount) {
      this.debouncedNotify();
    }
  }
}
