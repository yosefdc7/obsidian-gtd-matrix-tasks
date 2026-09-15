import { App, TFile } from 'obsidian';
import { TaskItem, TaskPriority, SectionId, PluginSettings, RoleId } from '../types';
import {
  setTaskPriority,
  setTaskCompletion,
  setTaskDueDate,
  setTaskScheduledDate,
  setTaskDescription,
  setTaskWaiting,
  setTaskSomeday,
  setTaskRole
} from '../parser';
import { ScanEngine } from './scan-engine';

export class TaskMutator {
  constructor(
    private app: App,
    private settings: PluginSettings,
    private scanEngine?: ScanEngine
  ) {}

  public updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  public setScanEngine(scanEngine: ScanEngine): void {
    this.scanEngine = scanEngine;
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

      // Synchronous immediate reindex of the modified file
      if (this.scanEngine) {
        await this.scanEngine.reindexFile(abstractFile);
      }
      return true;
    } catch (err) {
      console.error(`Failed to update task in ${filePath}:`, err);
      return false;
    }
  }

  public async batchUpdateTaskLine(
    task: TaskItem,
    mutator: (line: string) => string
  ): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, mutator);
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

  public async setRole(task: TaskItem, newRole: RoleId | null): Promise<boolean> {
    return this.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
      setTaskRole(line, newRole)
    );
  }

  public async quickAddTask(sectionId: SectionId, text: string, role?: RoleId | null): Promise<boolean> {
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

    if (role && role !== 'untagged') {
      extra += ` #${role}`;
    }

    const statusBox = isWaiting ? '- [?]' : '- [ ]';
    let rawTask = `${statusBox} ${text.trim()}${extra}`;
    if (priority !== 'none') {
      rawTask = setTaskPriority(rawTask, priority);
    }
    if (this.settings.autoAddCreatedDate) {
      rawTask += ` ➕ ${this.getTodayDateString()}`;
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

    if (this.scanEngine && file instanceof TFile) {
      await this.scanEngine.reindexFile(file);
    }
    return true;
  }

  public async ensureFolderExists(path: string): Promise<void> {
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

    // Convention in vault: Jots/YYYY/MMM/MMM DD YYYY.md
    return `${this.settings.defaultDailyNoteFolder}/${year}/${monthStr}/${monthStr} ${day} ${year}.md`;
  }
}
