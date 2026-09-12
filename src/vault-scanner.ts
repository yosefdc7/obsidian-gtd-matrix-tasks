import { App, TFile, debounce } from 'obsidian';
import { TaskItem, TaskPriority, SectionId, PluginSettings } from './types';
import {
  parseTaskLine,
  setTaskPriority,
  setTaskCompletion,
  setTaskDueDate,
  setTaskScheduledDate,
  setTaskDescription,
  setTaskWaiting,
  setTaskSomeday
} from './parser';

export class VaultScanner {
  private app: App;
  private settings: PluginSettings;
  private tasks: TaskItem[] = [];
  private listeners: ((tasks: TaskItem[]) => void)[] = [];
  public debouncedScan: () => void;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
    this.debouncedScan = debounce(() => this.scanVault(), 300, true);
  }

  public onTasksUpdated(callback: (tasks: TaskItem[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notify() {
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

  public isExcluded(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    for (const excluded of this.settings.excludedFolders) {
      const normEx = excluded.replace(/\\/g, '/');
      if (normalized.startsWith(normEx) || normalized.includes(`/${normEx}/`)) {
        return true;
      }
    }
    return false;
  }

  public async scanVault(): Promise<TaskItem[]> {
    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      if (this.isExcluded(file.path)) return false;
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache && (!cache.listItems || !cache.listItems.some((i) => i.task !== undefined))) {
        return false;
      }
      return true;
    });

    const allTasks: TaskItem[] = [];
    const CHUNK_SIZE = 50;

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (file) => {
          try {
            const content = await this.app.vault.cachedRead(file);
            const lines = content.split('\n');
            const cache = this.app.metadataCache.getFileCache(file);

            if (cache?.listItems) {
              for (const item of cache.listItems) {
                if (item.task !== undefined) {
                  const lineIdx = item.position.start.line;
                  if (lineIdx < lines.length) {
                    const task = parseTaskLine(lines[lineIdx], file.path, lineIdx);
                    if (task) allTasks.push(task);
                  }
                }
              }
            } else {
              for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const task = parseTaskLine(lines[lineIdx], file.path, lineIdx);
                if (task) allTasks.push(task);
              }
            }
          } catch (err) {
            console.error(`Error reading ${file.path} in GTD Matrix Tasks:`, err);
          }
        })
      );
    }

    this.tasks = allTasks;
    this.notify();
    return this.tasks;
  }

  public async updateTaskLine(
    filePath: string,
    lineNumber: number,
    originalText: string,
    mutator: (line: string) => string
  ): Promise<boolean> {
    const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
    if (!(abstractFile instanceof TFile)) {
      console.warn(`Target file ${filePath} not found`);
      return false;
    }

    try {
      await this.app.vault.process(abstractFile, (data) => {
        const lines = data.split('\n');
        let targetIndex = lineNumber;

        // Verify or fuzzy-find if lines shifted
        if (targetIndex >= lines.length || lines[targetIndex] !== originalText) {
          const matchIdx = lines.findIndex((l) => l.trim() === originalText.trim());
          if (matchIdx !== -1) {
            targetIndex = matchIdx;
          } else {
            // Fuzzy search by description
            const searchPart = originalText.replace(/[-*+]\s*\[.\]/, '').trim().slice(0, 25);
            const partialIdx = lines.findIndex((l) => l.includes(searchPart));
            if (partialIdx !== -1) {
              targetIndex = partialIdx;
            } else {
              console.warn('Could not locate original task line for update');
              return data;
            }
          }
        }

        lines[targetIndex] = mutator(lines[targetIndex]);
        return lines.join('\n');
      });

      // Quick re-scan
      this.debouncedScan();
      return true;
    } catch (err) {
      console.error(`Failed to update task in ${filePath}:`, err);
      return false;
    }
  }

  public async setPriority(task: TaskItem, newPriority: TaskPriority): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskPriority(line, newPriority)
    );
  }

  public async setCompletion(task: TaskItem, completed: boolean): Promise<boolean> {
    const today = this.getTodayDateString();
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskCompletion(line, completed, today)
    );
  }

  public async setDueDate(task: TaskItem, dueDate: string | null): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskDueDate(line, dueDate)
    );
  }

  public async setScheduledDate(task: TaskItem, scheduledDate: string | null): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskScheduledDate(line, scheduledDate)
    );
  }

  public async setDescription(task: TaskItem, newDescription: string): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskDescription(line, newDescription)
    );
  }

  public async setWaiting(task: TaskItem, waiting: boolean): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskWaiting(line, waiting)
    );
  }

  public async setSomeday(task: TaskItem, someday: boolean): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskSomeday(line, someday)
    );
  }

  public async quickAddTask(sectionId: SectionId, text: string): Promise<boolean> {
    const dailyPath = this.getDailyNotePath();
    let file = this.app.vault.getAbstractFileByPath(dailyPath);

    let isWaiting = false;
    let priority: TaskPriority = 'none';
    let extra = '';

    switch (sectionId) {
      case 'gtd-next-actions':
        priority = 'high';
        break;
      case 'gtd-waiting':
        isWaiting = true;
        break;
      case 'gtd-scheduled':
        extra = ` ⏳ ${this.getTodayDateString()}`;
        break;
      case 'gtd-someday':
        extra = ' #someday';
        break;
      case 'eisen-q1':
        priority = 'highest';
        break;
      case 'eisen-q2':
        priority = 'high';
        break;
      case 'eisen-q3':
        priority = 'medium';
        break;
      case 'eisen-q4':
        priority = 'low';
        break;
      default:
        break;
    }

    const statusBox = isWaiting ? '- [?]' : '- [ ]';
    let rawTask = `${statusBox} ${text.trim()}${extra}`;
    if (priority !== 'none') {
      rawTask = setTaskPriority(rawTask, priority);
    }

    if (!(file instanceof TFile)) {
      // Create folder if needed
      const parts = dailyPath.split('/');
      parts.pop();
      const folderPath = parts.join('/');
      await this.ensureFolderExists(folderPath);

      // Create file
      const initialContent = `# ${this.getTodayDateString()}\n\n## Tasks\n\n${rawTask}\n`;
      file = await this.app.vault.create(dailyPath, initialContent);
    } else {
      await this.app.vault.process(file, (data) => {
        return `${data.trimEnd()}\n${rawTask}\n`;
      });
    }

    this.debouncedScan();
    return true;
  }

  private async ensureFolderExists(path: string): Promise<void> {
    if (!path || path === '.') return;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!existing) {
      const parts = path.split('/');
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const check = this.app.vault.getAbstractFileByPath(current);
        if (!check) {
          try {
            await this.app.vault.createFolder(current);
          } catch (e) {
            // Already created or concurrent
          }
        }
      }
    }
  }

  public getTodayDateString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public getDailyNotePath(): string {
    const d = new Date();
    const year = d.getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStr = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, '0');

    // Convention in vault: Jots/YYYY/MMM/DD.md
    return `${this.settings.defaultDailyNoteFolder}/${year}/${monthStr}/${day}.md`;
  }
}
