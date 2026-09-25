import { App, Notice, TFile } from 'obsidian';
import type { PluginSettings, TaskItem } from '../types';
import type { VaultScanner } from '../vault-scanner';
import { ObsidianHttpTransport } from '../calendar/obsidian-http';
import { TodoistClient } from './todoist-client';
import type { TodoistProject, TodoistSyncStatus, TodoistTask } from './todoist-types';
import {
  cleanTodoistTaskTitle,
  ensureTodoistIdentity,
  isTodoistEligible,
  mapTaskPriorityToTodoist,
  planTodoistReconciliation,
  resolveFacetProjectName,
} from './todoist-sync-core';
import { setTaskCompletion } from '../parser';

export class TodoistSyncController {
  private timer: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private status: TodoistSyncStatus = {
    state: 'disabled',
    lastSuccess: null,
    pending: 0,
    lastError: null,
  };

  constructor(
    private readonly app: App,
    private readonly scanner: VaultScanner,
    private readonly getSettings: () => PluginSettings
  ) {}

  start(): void {
    this.unsubscribe = this.scanner.onTasksUpdated(() => this.schedule());
    this.refreshConnectionState();
    this.schedule(2000);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  getStatus(): TodoistSyncStatus {
    return { ...this.status };
  }

  schedule(delayMs = 15_000): void {
    if (!this.getSettings().todoistSyncEnabled) return;
    if (this.running) return;

    this.status.pending = 1;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.syncNow(false);
    }, delayMs);
  }

  async syncNow(showNotice = true): Promise<void> {
    if (this.running) return this.running;
    this.running = this.performSync(showNotice).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async testConnection(): Promise<{ success: boolean; projects: string[]; message?: string }> {
    const settings = this.getSettings();
    if (!settings.todoistApiToken.trim()) {
      return { success: false, projects: [], message: 'Todoist API token is empty.' };
    }

    try {
      const client = new TodoistClient(settings.todoistApiToken, new ObsidianHttpTransport());
      const projects = await client.getProjects();
      const names = projects.map((p) => p.name);
      return { success: true, projects: names };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, projects: [], message: msg };
    }
  }

  private async performSync(showNotice: boolean): Promise<void> {
    const settings = this.getSettings();
    if (!settings.todoistSyncEnabled) {
      this.status.state = 'disabled';
      return;
    }

    if (!settings.todoistApiToken.trim()) {
      this.status.state = 'disconnected';
      if (showNotice) new Notice('Todoist API token is not configured.');
      return;
    }

    this.status.state = 'syncing';
    this.status.pending = 1;

    try {
      const client = new TodoistClient(settings.todoistApiToken, new ObsidianHttpTransport());

      // 1. Fetch remote projects and map by name
      const remoteProjects = await client.getProjects();
      const projectMap = new Map<string, string>();
      for (const p of remoteProjects) {
        projectMap.set(p.name.toLowerCase(), p.id);
      }

      // Helper to ensure target project exists in Todoist
      const ensureProject = async (name: string): Promise<string> => {
        const lower = name.toLowerCase();
        if (projectMap.has(lower)) {
          return projectMap.get(lower)!;
        }
        const created = await client.createProject(name);
        projectMap.set(lower, created.id);
        return created.id;
      };

      // 2. Fetch remote tasks
      const remoteTasks = await client.getTasks();

      // 3. Fetch local tasks
      const localTasks = this.scanner.getTasks();

      // 4. Calculate reconciliation plan
      const plan = planTodoistReconciliation(
        localTasks,
        remoteTasks,
        settings.todoistDefaultProject || 'Inbox'
      );

      let createdCount = 0;
      let updatedCount = 0;
      let closedCount = 0;
      let localCompletedCount = 0;

      // 5. Apply plan: Complete local tasks checked off in Todoist
      for (const { task } of plan.completeLocalTasks) {
        const targetFile = this.app.vault.getAbstractFileByPath(task.filePath);
        if (!(targetFile instanceof TFile)) continue;

        const success = await this.scanner.updateTaskLine(
          task.filePath,
          task.lineNumber,
          task.rawText,
          (line) => setTaskCompletion(line, true)
        );
        if (success) localCompletedCount++;
      }

      // 6. Apply plan: Close remote tasks checked off in Obsidian
      for (const todoistId of plan.closeTodoistIds) {
        await client.closeTask(todoistId);
        closedCount++;
      }

      // 7. Apply plan: Create new open tasks in Todoist
      for (const { task, projectName } of plan.create) {
        const targetProjectId = await ensureProject(projectName);
        const title = cleanTodoistTaskTitle(task.description);
        if (!title) continue;

        const priority = mapTaskPriorityToTodoist(task.priority);
        const vaultName = this.app.vault.getName();
        const description = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(
          task.filePath
        )}\n\nManaged by GTD Matrix Tasks.`;

        const created = await client.createTask({
          content: title,
          project_id: targetProjectId,
          due_date: task.dueDate ?? undefined,
          priority,
          description,
        });

        // Write todoistId back into Obsidian markdown task line
        await this.scanner.updateTaskLine(
          task.filePath,
          task.lineNumber,
          task.rawText,
          (line) => ensureTodoistIdentity(line, created.id)
        );
        createdCount++;
      }

      // 8. Apply plan: Update existing tasks in Todoist
      for (const { todoistId, task, projectName } of plan.update) {
        const targetProjectId = await ensureProject(projectName);
        const title = cleanTodoistTaskTitle(task.description);
        const priority = mapTaskPriorityToTodoist(task.priority);

        await client.updateTask(todoistId, {
          content: title,
          project_id: targetProjectId,
          due_date: task.dueDate ?? undefined,
          priority,
        });
        updatedCount++;
      }

      this.status = {
        state: 'idle',
        lastSuccess: new Date().toISOString(),
        pending: 0,
        lastError: null,
      };

      if (showNotice) {
        new Notice(
          `Todoist synced: ${createdCount} created, ${updatedCount} updated, ${closedCount} closed, ${localCompletedCount} completed locally.`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = { ...this.status, state: 'error', pending: 1, lastError: message };
      console.warn('[GTD Todoist Sync]', error);
      if (showNotice) new Notice(`Todoist sync failed: ${message}`);
    }
  }

  private refreshConnectionState(): void {
    if (!this.getSettings().todoistSyncEnabled) {
      this.status.state = 'disabled';
    } else if (!this.getSettings().todoistApiToken.trim()) {
      this.status.state = 'disconnected';
    } else {
      this.status.state = 'idle';
    }
  }
}
