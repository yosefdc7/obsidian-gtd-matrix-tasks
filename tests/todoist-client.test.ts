import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport } from '../src/calendar/google-calendar-client';
import { TodoistClient } from '../src/todoist/todoist-client';

describe('TodoistClient', () => {
  it('sends Bearer authorization header and fetches projects', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        json: [{ id: 'proj_1', name: 'Yo the Manager' }],
        text: '',
      }),
    };

    const client = new TodoistClient('test_token', transport);
    const projects = await client.getProjects();

    expect(projects).toEqual([{ id: 'proj_1', name: 'Yo the Manager' }]);
    expect(transport.request).toHaveBeenCalledWith({
      url: 'https://api.todoist.com/rest/v2/projects',
      method: 'GET',
      headers: {
        Authorization: 'Bearer test_token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('creates task with project, due date, and priority', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        json: { id: 'tod_1', content: 'Buy milk', priority: 4, is_completed: false, project_id: 'proj_1' },
        text: '',
      }),
    };

    const client = new TodoistClient('test_token', transport);
    const task = await client.createTask({
      content: 'Buy milk',
      project_id: 'proj_1',
      due_date: '2026-09-30',
      priority: 4,
    });

    expect(task.id).toBe('tod_1');
    expect(transport.request).toHaveBeenCalledWith({
      url: 'https://api.todoist.com/rest/v2/tasks',
      method: 'POST',
      headers: {
        Authorization: 'Bearer test_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: 'Buy milk',
        project_id: 'proj_1',
        due_date: '2026-09-30',
        priority: 4,
      }),
    });
  });

  it('closes task with POST /tasks/{id}/close', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue({
        status: 204,
        json: null,
        text: '',
      }),
    };

    const client = new TodoistClient('test_token', transport);
    await client.closeTask('tod_1');

    expect(transport.request).toHaveBeenCalledWith({
      url: 'https://api.todoist.com/rest/v2/tasks/tod_1/close',
      method: 'POST',
      headers: {
        Authorization: 'Bearer test_token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('throws descriptive error on 401 or 429 status', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue({
        status: 401,
        json: null,
        text: 'Unauthorized',
      }),
    };

    const client = new TodoistClient('bad_token', transport);
    await expect(client.getProjects()).rejects.toThrow('Todoist API error (401)');
  });
});
