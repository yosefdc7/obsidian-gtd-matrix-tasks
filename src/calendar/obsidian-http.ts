import { requestUrl } from 'obsidian';
import type { HttpResponse, HttpTransport } from './google-calendar-client';

export class ObsidianHttpTransport implements HttpTransport {
  async request(request: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<HttpResponse> {
    const response = await requestUrl({ ...request, throw: false });
    return { status: response.status, json: response.json, text: response.text };
  }
}
