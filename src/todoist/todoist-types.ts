import type { TaskItem } from '../types';

export interface TodoistProject {
  id: string;
  name: string;
  is_inbox_project?: boolean;
}

export interface TodoistDue {
  date: string;
  datetime?: string;
  string?: string;
  timezone?: string;
}

export interface TodoistTask {
  id: string;
  project_id: string;
  content: string;
  description?: string;
  is_completed: boolean;
  due?: TodoistDue | null;
  priority: number;
  parent_id?: string | null;
  labels?: string[];
}

export interface TodoistSyncStatus {
  state: 'disabled' | 'disconnected' | 'idle' | 'syncing' | 'error';
  lastSuccess: string | null;
  pending: number;
  lastError: string | null;
}

export interface TodoistReconciliationPlan {
  create: Array<{ task: TaskItem; projectName: string }>;
  update: Array<{ todoistId: string; task: TaskItem; projectName: string }>;
  move?: Array<{ todoistId: string; parentId: string }>;
  closeTodoistIds: string[];
  completeLocalTasks: Array<{ task: TaskItem }>;
}

export interface CreateTodoistTaskParams {
  content: string;
  project_id?: string;
  due_date?: string;
  priority?: number;
  description?: string;
  parent_id?: string;
  labels?: string[];
}

export interface UpdateTodoistTaskParams {
  content?: string;
  project_id?: string;
  due_date?: string;
  priority?: number;
  description?: string;
}
