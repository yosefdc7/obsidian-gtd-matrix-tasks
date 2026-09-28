import { App, Notice, TFile } from 'obsidian';
import type { PluginSettings, TaskItem } from '../types';
import type { VaultScanner } from '../vault-scanner';
import { ObsidianHttpTransport } from '../calendar/obsidian-http';
import { TodoistClient } from './todoist-client';
import type { TodoistProject, TodoistSyncStatus, TodoistTask } from './todoist-types';
import {
  buildTodoistTaskDescription,
  cleanTodoistTaskTitle,
  ensureTodoistIdentity,
  extractTodoistId,
  extractTodoistLabels,
  isTodoistEligible,
  mapTaskPriorityToTodoist,
  mergeTodoistLabelsToLocalLine,
  planTodoistReconciliation,
  resolveFacetProjectName,
  resolveTodoistDueDate,
  updateTaskLineDueDate,
} from './todoist-sync-core';
import { setTaskCompletion } from '../parser';
import {
  ensureDailyJotFile,
  formatInboundTaskBlock,
  insertTaskIntoDailyJotContent,
  resolveTargetSectionHeader,
} from './daily-jot-task-inserter';

export class TodoistSyncController {
  private timer: number | null = null;
  private intervalTimer: number | null = null;
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
    this.schedule(3000);

    const intervalMinutes = Math.max(1, this.getSettings().todoistSyncIntervalMinutes || 5);
    this.intervalTimer = window.setInterval(() => {
      if (this.getSettings().todoistSyncEnabled) {
        void this.syncNow(false);
      }
    }, intervalMinutes * 60 * 1000);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.intervalTimer !== null) window.clearInterval(this.intervalTimer);
    this.intervalTimer = null;
  }

  getStatus(): TodoistSyncStatus {
    return { ...this.status };
  }

  schedule(delayMs = 5_000): void {
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
      const projectIdToNameMap = new Map<string, string>();
      for (const p of remoteProjects) {
        projectMap.set(p.name.toLowerCase(), p.id);
        projectIdToNameMap.set(p.id, p.name);
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
      const remoteTaskMap = new Map<string, TodoistTask>();
      for (const r of remoteTasks) {
        remoteTaskMap.set(r.id, r);
      }

      // 3. Fetch local tasks
      const localTasks = this.scanner.getTasks();
      const fileMtimeMap = new Map<string, number>();
      for (const task of localTasks) {
        if (!fileMtimeMap.has(task.filePath)) {
          const file = this.app.vault.getAbstractFileByPath(task.filePath);
          if (file instanceof TFile) {
            fileMtimeMap.set(task.filePath, file.stat.mtime);
          }
        }
      }

      // 4. Calculate reconciliation plan
      const vaultName = this.app.vault.getName();
      const plan = planTodoistReconciliation(
        localTasks,
        remoteTasks,
        settings.todoistDefaultProject || 'Inbox',
        vaultName,
        fileMtimeMap,
        projectIdToNameMap
      );

      let createdCount = 0;
      let updatedCount = 0;
      let closedCount = 0;
      let localCompletedCount = 0;
      let localCreatedCount = 0;
      let localLabelsUpdatedCount = 0;
      let localDueDatesUpdatedCount = 0;

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

      // 5b. Apply plan: Merge new labels from Todoist to local tasks
      if (plan.updateLocalLabels) {
        for (const { task, labelsToAdd } of plan.updateLocalLabels) {
          const targetFile = this.app.vault.getAbstractFileByPath(task.filePath);
          if (!(targetFile instanceof TFile)) continue;

          const success = await this.scanner.updateTaskLine(
            task.filePath,
            task.lineNumber,
            task.rawText,
            (line) => mergeTodoistLabelsToLocalLine(line, labelsToAdd)
          );
          if (success) localLabelsUpdatedCount++;
        }
      }

      // 5c. Apply plan: Merge new due dates from Todoist to local tasks
      if (plan.updateLocalDueDates) {
        for (const { task, newDueDate } of plan.updateLocalDueDates) {
          const targetFile = this.app.vault.getAbstractFileByPath(task.filePath);
          if (!(targetFile instanceof TFile)) continue;

          const success = await this.scanner.updateTaskLine(
            task.filePath,
            task.lineNumber,
            task.rawText,
            (line) => updateTaskLineDueDate(line, newDueDate)
          );
          if (success) localDueDatesUpdatedCount++;
        }
      }

      // 5d. Apply plan: Create local tasks in today's Daily Jot for new tasks in Todoist
      if (plan.createLocalTasks && plan.createLocalTasks.length > 0) {
        const dailyFile = await ensureDailyJotFile(this.app, settings.defaultDailyNoteFolder || 'Jots');

        for (const { remoteTask, projectName } of plan.createLocalTasks) {
          const targetHeader = resolveTargetSectionHeader(projectName);
          const taskUuid = crypto.randomUUID().toLowerCase();
          const taskBlock = formatInboundTaskBlock(remoteTask, taskUuid);

          await this.app.vault.process(dailyFile, (data) => {
            return insertTaskIntoDailyJotContent(data, targetHeader, taskBlock);
          });
          localCreatedCount++;
        }

        // Reindex the modified daily note so scanner and store immediately track the new tasks
        await this.scanner.reindexFile(dailyFile);
      }

      // 6. Apply plan: Close remote tasks checked off in Obsidian
      for (const todoistId of plan.closeTodoistIds) {
        await client.closeTask(todoistId);
        closedCount++;
      }

      // 7. Apply plan: Create new open tasks in Todoist
      const createdIdMap = new Map<string, string>();
      const localTaskById = new Map<string, TaskItem>();
      for (const t of localTasks) {
        localTaskById.set(t.id, t);
      }

      for (const { task, projectName } of plan.create) {
        const targetProjectId = await ensureProject(projectName);
        const title = cleanTodoistTaskTitle(task.description);
        if (!title) continue;

        const priority = mapTaskPriorityToTodoist(task.priority);
        const description = buildTodoistTaskDescription(task, vaultName);
        const labels = extractTodoistLabels(task);

        // Resolve parent_id if this is an indented child subtask
        let parentTodoistId: string | undefined = undefined;
        if (task.parentTaskId) {
          if (createdIdMap.has(task.parentTaskId)) {
            parentTodoistId = createdIdMap.get(task.parentTaskId);
          } else {
            const parent = localTaskById.get(task.parentTaskId);
            if (parent) {
              const id = extractTodoistId(parent.rawText);
              if (id) parentTodoistId = id;
            }
          }
        }

        const created = await client.createTask({
          content: title,
          project_id: targetProjectId,
          due_date: resolveTodoistDueDate(task),
          priority,
          description,
          parent_id: parentTodoistId,
          labels: labels.length > 0 ? labels : undefined,
        });

        createdIdMap.set(task.id, created.id);

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
        const description = buildTodoistTaskDescription(task, vaultName);
        const labels = extractTodoistLabels(task);
        // Include any remote labels so Todoist additions aren't wiped
        const remoteTask = remoteTaskMap.get(todoistId);
        const remoteLabels = (remoteTask?.labels ?? []).map((l) => l.toLowerCase().replace(/\//g, '-'));
        const combinedLabels = Array.from(new Set([...labels, ...remoteLabels])).sort();

        const remoteUpdatedAtMs = remoteTask?.updated_at ? new Date(remoteTask.updated_at).getTime() : 0;
        const localMtimeMs = fileMtimeMap.get(task.filePath) ?? 0;

        let targetDueDate: string | undefined = undefined;
        let targetDueString: string | undefined = undefined;

        if (remoteUpdatedAtMs > localMtimeMs) {
          // Remote Todoist is newer: adopt remote due date state
          if (remoteTask?.due?.date) {
            targetDueDate = remoteTask.due.date;
          } else {
            targetDueString = 'no date';
          }
        } else {
          // Local Obsidian note is newer: push local due date state
          const localDueDate = resolveTodoistDueDate(task);
          if (localDueDate) {
            targetDueDate = localDueDate;
          } else if (remoteTask?.due?.date) {
            // Local date was removed, so clear remote due date in Todoist
            targetDueString = 'no date';
          }
        }

        await client.updateTask(todoistId, {
          content: title,
          project_id: targetProjectId,
          due_date: targetDueDate,
          due_string: targetDueString,
          priority,
          description,
          labels: combinedLabels,
        });
        updatedCount++;
      }

      // 9. Apply plan: Move tasks to link under parent tasks if needed
      if (plan.move) {
        for (const { todoistId, parentId } of plan.move) {
          try {
            await client.moveTask(todoistId, { parent_id: parentId });
          } catch (err) {
            console.warn(`[GTD Todoist Sync] Failed to move task ${todoistId} to parent ${parentId}:`, err);
          }
        }
      }

      this.status = {
        state: 'idle',
        lastSuccess: new Date().toISOString(),
        pending: 0,
        lastError: null,
      };

      if (showNotice) {
        const parts = [
          `${createdCount} created in Todoist`,
          `${updatedCount} updated`,
          `${closedCount} closed`,
          `${localCompletedCount} completed locally`,
        ];
        if (localCreatedCount > 0) {
          parts.push(`${localCreatedCount} created in Daily Jot`);
        }
        if (localLabelsUpdatedCount > 0) {
          parts.push(`${localLabelsUpdatedCount} tags updated locally`);
        }
        if (localDueDatesUpdatedCount > 0) {
          parts.push(`${localDueDatesUpdatedCount} due dates updated locally`);
        }
        new Notice(`Todoist synced: ${parts.join(', ')}.`);
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
