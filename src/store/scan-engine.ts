import { App, TFile, debounce, Platform } from 'obsidian';
import { yieldCooperative } from '../utils/yield';
import { TaskItem, PluginSettings } from '../types';
import { parseTaskLine, parseFileTasks } from '../parser';
import { TaskStore } from './task-store';
import { RoleResolver } from './role-resolver';

export class ScanEngine {
  public debouncedScan: () => void;
  private currentScanPromise: Promise<TaskItem[]> | null = null;

  constructor(
    private app: App,
    private settings: PluginSettings,
    private store: TaskStore,
    private roleResolver: RoleResolver
  ) {
    this.debouncedScan = debounce(() => void this.scanVault(), 2000, false);
  }

  public updateSettings(settings: PluginSettings): void {
    this.settings = settings;
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
    if (this.currentScanPromise) {
      return this.currentScanPromise;
    }

    this.currentScanPromise = (async () => {
      try {
        const files = this.app.vault.getMarkdownFiles().filter((f) => !this.isExcluded(f.path));

        const allTasks: TaskItem[] = [];
        const CHUNK_SIZE = Platform.isMobile ? 15 : 50;

        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
          const chunk = files.slice(i, i + CHUNK_SIZE);
          await Promise.all(
            chunk.map(async (file) => {
              const cache = this.app.metadataCache.getFileCache(file);
              // Skip reading file if metadata cache is populated and has no tasks
              if (cache && (!cache.listItems || !cache.listItems.some((item) => item.task !== undefined))) {
                return;
              }

              try {
                const content = await this.app.vault.cachedRead(file);
                const lines = content.split('\n');
                const fileTasks = parseFileTasks(lines, file.path);
                const taskById = new Map<string, TaskItem>();

                for (const task of fileTasks) {
                  const res = this.roleResolver.resolveTaskRole(task);
                  task.effectiveRole = res.role;
                  task.roleSource = res.source;

                  if (task.parentTaskId && task.effectiveRole === 'untagged') {
                    const parent = taskById.get(task.parentTaskId);
                    if (parent && parent.effectiveRole !== 'untagged') {
                      task.effectiveRole = parent.effectiveRole;
                      task.roleSource = parent.roleSource;
                    }
                  }

                  taskById.set(task.id, task);
                  allTasks.push(task);
                }
              } catch (err) {
                console.error(`Error reading ${file.path} in GTD Matrix Tasks:`, err);
              }
            })
          );

          if (Platform.isMobile && i + CHUNK_SIZE < files.length) {
            await yieldCooperative();
          }
        }

        this.store.setTasks(allTasks);
        await this.store.saveSnapshot();
        return allTasks;
      } finally {
        this.currentScanPromise = null;
      }
    })();

    return this.currentScanPromise;
  }

  public async reindexFile(file: TFile): Promise<void> {
    if (!file || file.extension !== 'md') return;

    if (this.isExcluded(file.path)) {
      this.store.removeFileTasks(file.path);
      return;
    }

    const cache = this.app.metadataCache.getFileCache(file);
    const fileTasks: TaskItem[] = [];

    // Only read file if it contains list items / tasks or cache is not ready
    if (!cache || (cache.listItems && cache.listItems.some((i) => i.task !== undefined))) {
      try {
        const content = await this.app.vault.cachedRead(file);
        const lines = content.split('\n');
        const tasks = parseFileTasks(lines, file.path);
        const taskById = new Map<string, TaskItem>();

        for (const task of tasks) {
          const res = this.roleResolver.resolveTaskRole(task);
          task.effectiveRole = res.role;
          task.roleSource = res.source;

          if (task.parentTaskId && task.effectiveRole === 'untagged') {
            const parent = taskById.get(task.parentTaskId);
            if (parent && parent.effectiveRole !== 'untagged') {
              task.effectiveRole = parent.effectiveRole;
              task.roleSource = parent.roleSource;
            }
          }

          taskById.set(task.id, task);
          fileTasks.push(task);
        }
      } catch (err) {
        console.error(`Error reindexing ${file.path} in GTD Matrix Tasks:`, err);
        return;
      }
    }

    this.store.replaceFileTasks(file.path, fileTasks);
  }

  public handleFileDelete(filePath: string): void {
    this.store.removeFileTasks(filePath);
  }

  public async handleFileRename(newFile: TFile, oldPath: string): Promise<void> {
    this.handleFileDelete(oldPath);
    await this.reindexFile(newFile);
  }
}
