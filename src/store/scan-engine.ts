import { App, TFile, debounce } from 'obsidian';
import { TaskItem, PluginSettings } from '../types';
import { parseTaskLine } from '../parser';
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
        const CHUNK_SIZE = 50;

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

                if (cache?.listItems) {
                  for (const item of cache.listItems) {
                    if (item.task !== undefined) {
                      const lineIdx = item.position.start.line;
                      if (lineIdx < lines.length) {
                        const task = parseTaskLine(lines[lineIdx], file.path, lineIdx);
                        if (task) {
                          const res = this.roleResolver.resolveTaskRole(task);
                          task.effectiveRole = res.role;
                          task.roleSource = res.source;
                          allTasks.push(task);
                        }
                      }
                    }
                  }
                } else {
                  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                    const task = parseTaskLine(lines[lineIdx], file.path, lineIdx);
                    if (task) {
                      const res = this.roleResolver.resolveTaskRole(task);
                      task.effectiveRole = res.role;
                      task.roleSource = res.source;
                      allTasks.push(task);
                    }
                  }
                }
              } catch (err) {
                console.error(`Error reading ${file.path} in GTD Matrix Tasks:`, err);
              }
            })
          );
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

        if (cache?.listItems) {
          for (const item of cache.listItems) {
            if (item.task !== undefined) {
              const lineIdx = item.position.start.line;
              if (lineIdx < lines.length) {
                const task = parseTaskLine(lines[lineIdx], file.path, lineIdx);
                if (task) {
                  const res = this.roleResolver.resolveTaskRole(task);
                  task.effectiveRole = res.role;
                  task.roleSource = res.source;
                  fileTasks.push(task);
                }
              }
            }
          }
        } else {
          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const task = parseTaskLine(lines[lineIdx], file.path, lineIdx);
            if (task) {
              const res = this.roleResolver.resolveTaskRole(task);
              task.effectiveRole = res.role;
              task.roleSource = res.source;
              fileTasks.push(task);
            }
          }
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
