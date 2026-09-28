import { describe, expect, it, vi } from 'vitest';
import type { HttpTransport } from '../src/calendar/google-calendar-client';
import { TodoistClient } from '../src/todoist/todoist-client';

describe('TodoistClient', () => {
  it('fetches every active task page', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: { results: [{ id: 'open_1', project_id: 'p', content: 'A' }], next_cursor: 'page2' }, text: '' })
      .mockResolvedValueOnce({ status: 200, json: { results: [{ id: 'open_2', project_id: 'p', content: 'B' }], next_cursor: null }, text: '' });
    const tasks = await new TodoistClient('test_token', { request }).getTasks();

    expect(tasks.map((task) => task.id)).toEqual(['open_1', 'open_2']);
    expect(request.mock.calls[1][0].url).toContain('cursor=page2');
  });
  it('fetches all recent completed task pages', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 200, json: { items: [{ id: 'done_1', project_id: 'p', content: 'A' }], next_cursor: 'page2' }, text: '' })
      .mockResolvedValueOnce({ status: 200, json: { items: [{ id: 'done_2', project_id: 'p', content: 'B' }], next_cursor: null }, text: '' });
    const client = new TodoistClient('test_token', { request });
    const tasks = await client.getRecentlyCompletedTasks(new Date('2026-09-01T00:00:00Z'), new Date('2026-09-28T00:00:00Z'));

    expect(tasks.map((task) => [task.id, task.is_completed])).toEqual([['done_1', true], ['done_2', true]]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0].url).toContain('cursor=page2');
  });
  it('sends Bearer authorization header and fetches projects from API v1', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        json: { results: [{ id: 'proj_1', name: 'Yo the Manager' }] },
        text: '',
      }),
    };

    const client = new TodoistClient('test_token', transport);
    const projects = await client.getProjects();

    expect(projects).toEqual([{ id: 'proj_1', name: 'Yo the Manager' }]);
    expect(transport.request).toHaveBeenCalledWith({
      url: 'https://api.todoist.com/api/v1/projects',
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
        json: { id: 'tod_1', content: 'Buy milk', priority: 4, checked: false, project_id: 'proj_1' },
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
      url: 'https://api.todoist.com/api/v1/tasks',
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
      url: 'https://api.todoist.com/api/v1/tasks/tod_1/close',
      method: 'POST',
      headers: {
        Authorization: 'Bearer test_token',
        'Content-Type': 'application/json',
      },
    });
  });

  it('moves task to parent via /tasks/{id}/move', async () => {
    const transport: HttpTransport = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        json: { id: 'child_1', parent_id: 'parent_1' },
        text: '',
      }),
    };

    const client = new TodoistClient('test_token', transport);
    const moved = await client.moveTask('child_1', { parent_id: 'parent_1' });

    expect(moved.id).toBe('child_1');
    expect(moved.parent_id).toBe('parent_1');
    expect(transport.request).toHaveBeenCalledWith({
      url: 'https://api.todoist.com/api/v1/tasks/child_1/move',
      method: 'POST',
      headers: {
        Authorization: 'Bearer test_token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent_id: 'parent_1' }),
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
