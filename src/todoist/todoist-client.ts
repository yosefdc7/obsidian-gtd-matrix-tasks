import type { HttpTransport } from '../calendar/google-calendar-client';
import type {
  CreateTodoistTaskParams,
  TodoistProject,
  TodoistTask,
  UpdateTodoistTaskParams,
} from './todoist-types';

export class TodoistClient {
  private readonly baseUrl = 'https://api.todoist.com/rest/v2';

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
    return this.request<TodoistProject[]>('/projects');
  }

  async createProject(name: string): Promise<TodoistProject> {
    return this.request<TodoistProject[]>('/projects', 'POST', { name }) as unknown as Promise<TodoistProject>;
  }

  async getTasks(filter?: string): Promise<TodoistTask[]> {
    const query = filter ? `?filter=${encodeURIComponent(filter)}` : '';
    return this.request<TodoistTask[]>(`/tasks${query}`);
  }

  async createTask(params: CreateTodoistTaskParams): Promise<TodoistTask> {
    return this.request<TodoistTask>('/tasks', 'POST', params);
  }

  async updateTask(id: string, params: UpdateTodoistTaskParams): Promise<TodoistTask> {
    return this.request<TodoistTask>(`/tasks/${id}`, 'POST', params);
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
