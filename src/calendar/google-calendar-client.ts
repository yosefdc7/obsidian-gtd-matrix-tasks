import type { CalendarGateway } from './sync-service';
import type { ManagedCalendarEvent, ManagedEventRef } from './sync-core';

export interface HttpResponse {
  status: number;
  json: unknown;
  text?: string;
}

export interface HttpTransport {
  request(request: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<HttpResponse>;
}

interface GoogleEventList {
  items?: Array<{
    id?: string;
    extendedProperties?: { private?: { taskUuid?: string } };
  }>;
  nextPageToken?: string;
}

const API_ROOT = 'https://www.googleapis.com/calendar/v3';

export class GoogleCalendarClient implements CalendarGateway {
  constructor(
    private readonly http: HttpTransport,
    private readonly getAccessToken: () => Promise<string>,
    private readonly calendarId: string,
  ) {}

  async listManagedEvents(): Promise<ManagedEventRef[]> {
    const events: ManagedEventRef[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        privateExtendedProperty: 'managedBy=gtd-matrix-tasks',
        maxResults: '2500',
        showDeleted: 'false',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await this.authorizedRequest(
        `${API_ROOT}/calendars/${encodeURIComponent(this.calendarId)}/events?${query.toString()}`,
        'GET',
      );
      this.requireSuccess(response, 'list managed calendar events');
      const body = response.json as GoogleEventList;
      for (const item of body.items ?? []) {
        const id = item.id;
        const taskUuid = item.extendedProperties?.private?.taskUuid;
        if (id && taskUuid) events.push({ id, taskUuid });
      }
      pageToken = body.nextPageToken;
    } while (pageToken);
    return events;
  }

  async listWritableCalendars(): Promise<Array<{ id: string; summary: string; timeZone?: string }>> {
    const response = await this.authorizedRequest(`${API_ROOT}/users/me/calendarList?maxResults=250`, 'GET');
    this.requireSuccess(response, 'list calendars');
    const body = response.json as {
      items?: Array<{ id?: string; summary?: string; timeZone?: string; accessRole?: string }>;
    };
    return (body.items ?? [])
      .filter((item) => item.id && item.summary && (item.accessRole === 'writer' || item.accessRole === 'owner'))
      .map((item) => ({ id: item.id!, summary: item.summary!, timeZone: item.timeZone }));
  }

  async upsertEvent(event: ManagedCalendarEvent): Promise<void> {
    const collectionUrl = `${API_ROOT}/calendars/${encodeURIComponent(this.calendarId)}/events`;
    const insert = await this.authorizedRequest(collectionUrl, 'POST', JSON.stringify(event));
    if (insert.status >= 200 && insert.status < 300) return;
    if (insert.status !== 409) this.requireSuccess(insert, 'insert managed calendar event');

    const update = await this.authorizedRequest(
      `${collectionUrl}/${encodeURIComponent(event.id)}`,
      'PUT',
      JSON.stringify(event),
    );
    this.requireSuccess(update, 'update managed calendar event');
  }

  async deleteEvent(eventId: string): Promise<void> {
    const response = await this.authorizedRequest(
      `${API_ROOT}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      'DELETE',
    );
    if (response.status === 404 || response.status === 410) return;
    this.requireSuccess(response, 'delete managed calendar event');
  }

  private async authorizedRequest(url: string, method: string, body?: string): Promise<HttpResponse> {
    const token = await this.getAccessToken();
    return this.http.request({
      url,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
    });
  }

  private requireSuccess(response: HttpResponse, action: string): void {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to ${action} (HTTP ${response.status}).`);
    }
  }
}
