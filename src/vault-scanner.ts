import { App, TFile, normalizePath } from 'obsidian';
import { TaskItem, TaskPriority, SectionId, PluginSettings, RoleId, ConfiguredRole } from './types';
import { TaskStore } from './store/task-store';
import { RoleResolver, ResolvedRole } from './store/role-resolver';
import { ScanEngine } from './store/scan-engine';
import { TaskMutator } from './store/task-mutator';
import { parseConfiguredRoles } from './parser';

export class VaultScanner {
  public store: TaskStore;
  public roleResolver: RoleResolver;
  public scanEngine: ScanEngine;
  public mutator: TaskMutator;
  public debouncedScan: () => void;
  public debouncedNotify: () => void;
  private app: App;

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.store = new TaskStore();
    const configDir = app.vault.configDir || '.obsidian';
    const cachePath = normalizePath(`${configDir}/plugins/gtd-matrix-tasks/task-cache.json`);
    this.store.configureSnapshot(app.vault.adapter, cachePath);

    this.roleResolver = new RoleResolver(app, parseConfiguredRoles(settings.configuredRoleTags));
    this.scanEngine = new ScanEngine(app, settings, this.store, this.roleResolver);
    this.mutator = new TaskMutator(app, settings, this.scanEngine);

    this.debouncedScan = this.scanEngine.debouncedScan;
    this.debouncedNotify = this.store.debouncedNotify;
  }

  public async loadSnapshot(): Promise<boolean> {
    return this.store.loadSnapshot();
  }

  public async saveSnapshot(): Promise<void> {
    return this.store.saveSnapshot();
  }

  public onTasksUpdated(callback: (tasks: TaskItem[]) => void): () => void {
    return this.store.onTasksUpdated(callback);
  }

  public getTasks(): TaskItem[] {
    return this.store.getTasks();
  }

  public updateSettings(settings: PluginSettings): void {
    this.roleResolver.setConfiguredRoles(parseConfiguredRoles(settings.configuredRoleTags));
    this.scanEngine.updateSettings(settings);
    this.mutator.updateSettings(settings);
  }

  public isExcluded(filePath: string): boolean {
    return this.scanEngine.isExcluded(filePath);
  }

  public resolveTaskRole(task: TaskItem): ResolvedRole {
    return this.roleResolver.resolveTaskRole(task);
  }

  public async scanVault(): Promise<TaskItem[]> {
    return this.scanEngine.scanVault();
  }

  public async reindexFile(file: TFile): Promise<void> {
    return this.scanEngine.reindexFile(file);
  }

  public handleFileDelete(filePath: string): void {
    this.scanEngine.handleFileDelete(filePath);
  }

  public async handleFileRename(newFile: TFile, oldPath: string): Promise<void> {
    return this.scanEngine.handleFileRename(newFile, oldPath);
  }

  public async updateTaskLine(
    filePath: string,
    lineNumber: number,
    originalText: string,
    mutator: (line: string) => string
  ): Promise<boolean> {
    return this.mutator.updateTaskLine(filePath, lineNumber, originalText, mutator);
  }

  public async batchUpdateTaskLine(
    task: TaskItem,
    mutator: (line: string) => string
  ): Promise<boolean> {
    return this.mutator.batchUpdateTaskLine(task, mutator);
  }

  public async setPriority(task: TaskItem, newPriority: TaskPriority): Promise<boolean> {
    return this.mutator.setPriority(task, newPriority);
  }

  public async setCompletion(task: TaskItem, completed: boolean): Promise<boolean> {
    return this.mutator.setCompletion(task, completed);
  }

  public async setDueDate(task: TaskItem, dueDate: string | null): Promise<boolean> {
    return this.mutator.setDueDate(task, dueDate);
  }

  public async setScheduledDate(task: TaskItem, scheduledDate: string | null): Promise<boolean> {
    return this.mutator.setScheduledDate(task, scheduledDate);
  }

  public async setDescription(task: TaskItem, newDescription: string): Promise<boolean> {
    return this.mutator.setDescription(task, newDescription);
  }

  public async setWaiting(task: TaskItem, waiting: boolean): Promise<boolean> {
    return this.mutator.setWaiting(task, waiting);
  }

  public async setSomeday(task: TaskItem, someday: boolean): Promise<boolean> {
    return this.mutator.setSomeday(task, someday);
  }

  public async setRole(task: TaskItem, newRole: RoleId | null, configuredRoles?: ConfiguredRole[]): Promise<boolean> {
    return this.mutator.setRole(task, newRole, configuredRoles ?? this.roleResolver.getConfiguredRoles());
  }

  public async quickAddTask(sectionId: SectionId, text: string, role?: RoleId | null): Promise<boolean> {
    return this.mutator.quickAddTask(sectionId, text, role);
  }

  public getTodayDateString(): string {
    return this.mutator.getTodayDateString();
  }

  public getDailyNotePath(): string {
    return this.mutator.getDailyNotePath();
  }
}
