import { describe, expect, it } from 'vitest';
import { GoogleCalendarClient, type HttpResponse, type HttpTransport } from '../src/calendar/google-calendar-client';
import type { ManagedCalendarEvent } from '../src/calendar/sync-core';

class ScriptedTransport implements HttpTransport {
  requests: Array<{ url: string; method: string; body?: string }> = [];
  constructor(private readonly responses: HttpResponse[]) {}
  async request(request: { url: string; method: string; headers?: Record<string, string>; body?: string }): Promise<HttpResponse> {
    this.requests.push({ url: request.url, method: request.method, body: request.body });
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  }
}

const event = {
  id: 'gtd123', summary: 'Task', description: 'Managed',
  start: { dateTime: '2026-09-22T07:00:00', timeZone: 'Asia/Singapore' },
  end: { dateTime: '2026-09-22T07:30:00', timeZone: 'Asia/Singapore' },
  visibility: 'private', transparency: 'opaque', reminders: { useDefault: true },
  extendedProperties: { private: { managedBy: 'gtd-matrix-tasks', taskUuid: '123' } },
} satisfies ManagedCalendarEvent;

describe('GoogleCalendarClient', () => {
  it('lists only managed event identity and follows pagination', async () => {
    const http = new ScriptedTransport([
      { status: 200, json: { items: [{ id: 'one', extendedProperties: { private: { taskUuid: 'u1' } } }], nextPageToken: 'next' } },
      { status: 200, json: { items: [{ id: 'two', extendedProperties: { private: { taskUuid: 'u2' } } }] } },
    ]);
    const client = new GoogleCalendarClient(http, () => Promise.resolve('token'), 'calendar@example.com');

    expect(await client.listManagedEvents()).toEqual([
      { id: 'one', taskUuid: 'u1' }, { id: 'two', taskUuid: 'u2' },
    ]);
    expect(http.requests[1].url).toContain('pageToken=next');
  });

  it('inserts by deterministic ID and updates on conflict', async () => {
    const http = new ScriptedTransport([
      { status: 409, json: {} },
      { status: 200, json: {} },
    ]);
    const client = new GoogleCalendarClient(http, () => Promise.resolve('token'), 'primary');

    await client.upsertEvent(event);

    expect(http.requests.map((request) => request.method)).toEqual(['POST', 'PUT']);
    expect(http.requests[1].url).toContain('/events/gtd123');
  });

  it('treats deleting an already absent event as success', async () => {
    const http = new ScriptedTransport([{ status: 404, json: {} }]);
    const client = new GoogleCalendarClient(http, () => Promise.resolve('token'), 'primary');
    await expect(client.deleteEvent('gone')).resolves.toBeUndefined();
  });
});
