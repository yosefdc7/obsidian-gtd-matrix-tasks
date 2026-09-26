import type { HttpTransport } from '../calendar/google-calendar-client';
import type {
  CreateTodoistTaskParams,
  TodoistProject,
  TodoistTask,
  UpdateTodoistTaskParams,
} from './todoist-types';

export class TodoistClient {
  private readonly baseUrl = 'https://api.todoist.com/api/v1';

  constructor(
    private readonly apiToken: string,
    private readonly transport: HttpTransport
  ) {}

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken.trim()}`,
      'Content-Type': 'application/json',
    };

    const res = await this.transport.request({
      url,
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) {
      return null as T;
    }

    if (res.status < 200 || res.status >= 300) {
      const msg = res.text ? `: ${res.text}` : '';
      throw new Error(`Todoist API error (${res.status})${msg}`);
    }

    return res.json as T;
  }

  async getProjects(): Promise<TodoistProject[]> {
    const res = await this.request<{ results?: TodoistProject[] } | TodoistProject[]>('/projects');
    if (Array.isArray(res)) return res;
    if (res && Array.isArray((res as { results?: TodoistProject[] }).results)) {
      return (res as { results: TodoistProject[] }).results;
    }
    return [];
  }

  async createProject(name: string): Promise<TodoistProject> {
    return this.request<TodoistProject>('/projects', 'POST', { name });
  }

  async getTasks(filter?: string): Promise<TodoistTask[]> {
    const query = filter ? `?filter=${encodeURIComponent(filter)}` : '';
    const res = await this.request<{ results?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
      `/tasks${query}`
    );
    const list = Array.isArray(res) ? res : res?.results ?? [];
    return list.map((t) => ({
      id: String(t.id),
      project_id: String(t.project_id),
      content: String(t.content ?? ''),
      description: typeof t.description === 'string' ? t.description : undefined,
      is_completed: Boolean(t.checked ?? t.is_completed),
      due: (t.due as TodoistTask['due']) ?? null,
      priority: typeof t.priority === 'number' ? t.priority : 1,
      parent_id: t.parent_id ? String(t.parent_id) : null,
      labels: Array.isArray(t.labels) ? (t.labels as string[]) : [],
    }));
  }

  async createTask(params: CreateTodoistTaskParams): Promise<TodoistTask> {
    return this.request<TodoistTask>('/tasks', 'POST', params);
  }

  async updateTask(id: string, params: UpdateTodoistTaskParams): Promise<TodoistTask> {
    return this.request<TodoistTask>(`/tasks/${id}`, 'POST', params);
  }

  async moveTask(id: string, params: { parent_id?: string; project_id?: string; section_id?: string }): Promise<TodoistTask> {
    return this.request<TodoistTask>(`/tasks/${id}/move`, 'POST', params);
  }

  async closeTask(id: string): Promise<void> {
    await this.request<void>(`/tasks/${id}/close`, 'POST');
  }

  async reopenTask(id: string): Promise<void> {
    await this.request<void>(`/tasks/${id}/reopen`, 'POST');
  }

  async deleteTask(id: string): Promise<void> {
    await this.request<void>(`/tasks/${id}`, 'DELETE');
  }
}
