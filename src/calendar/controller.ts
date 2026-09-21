import { App, Notice, TFile } from 'obsidian';
import type { PluginSettings, TaskItem } from '../types';
import type { VaultScanner } from '../vault-scanner';
import { GoogleCalendarClient } from './google-calendar-client';
import { GoogleTokenManager, buildGoogleAuthorizationUrl, validateOAuthCallback } from './google-oauth';
import { ObsidianHttpTransport } from './obsidian-http';
import { CalendarSyncService } from './sync-service';
import { ensureHiddenTaskUuid } from './task-identity';
import { extractTaskUuid } from './sync-core';

const REFRESH_TOKEN_SECRET = 'gtd-google-calendar-refresh-token';
const PENDING_STATE_KEY = 'gtd-google-calendar-oauth-state';

export interface CalendarSyncStatus {
  state: 'disabled' | 'disconnected' | 'idle' | 'syncing' | 'error';
  lastSuccess: string | null;
  pending: number;
  lastError: string | null;
}

export class CalendarSyncController {
  private timer: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private status: CalendarSyncStatus = {
    state: 'disabled', lastSuccess: null, pending: 0, lastError: null,
  };

  constructor(
    private readonly app: App,
    private readonly scanner: VaultScanner,
    private readonly getSettings: () => PluginSettings,
  ) {}

  start(): void {
    this.unsubscribe = this.scanner.onTasksUpdated(() => this.schedule());
    this.refreshConnectionState();
    this.schedule(1000);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  getStatus(): CalendarSyncStatus {
    return { ...this.status };
  }

  schedule(delayMs = 15_000): void {
    if (!this.getSettings().calendarSyncEnabled) return;
    // scanVault() publishes a fresh task snapshot during a sync. Ignore that
    // self-generated notification so it does not create an endless 15s loop.
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
    this.running = this.performSync(showNotice).finally(() => { this.running = null; });
    return this.running;
  }

  beginConnect(): void {
    const settings = this.getSettings();
    if (!settings.googleOAuthClientId || !settings.googleOAuthRedirectUri) {
      throw new Error('Enter the Google OAuth client ID and Apps Script callback URL first.');
    }
    if (!this.app.secretStorage.getSecret(settings.googleOAuthClientSecretId)) {
      throw new Error('Select or create the Google OAuth client secret first.');
    }
    const state = crypto.randomUUID();
    this.app.saveLocalStorage(PENDING_STATE_KEY, state);
    window.open(buildGoogleAuthorizationUrl({
      clientId: settings.googleOAuthClientId,
      redirectUri: settings.googleOAuthRedirectUri,
      state,
    }), '_blank');
  }

  async handleOAuthCallback(params: Record<string, string>): Promise<void> {
    const expectedState = String(this.app.loadLocalStorage(PENDING_STATE_KEY) ?? '');
    const code = validateOAuthCallback(params, expectedState);
    const tokenManager = this.createTokenManager();
    await tokenManager.exchangeCode(code);
    this.app.saveLocalStorage(PENDING_STATE_KEY, null);
    this.status.state = 'idle';
    this.status.lastError = null;
    new Notice('Google Calendar connected on this device.');
    this.schedule(0);
  }

  disconnect(): void {
    this.createTokenManager().disconnect();
    this.status = { state: 'disconnected', lastSuccess: null, pending: 0, lastError: null };
  }

  isConnected(): boolean {
    try { return this.createTokenManager().isConnected(); } catch { return false; }
  }

  async listWritableCalendars(): Promise<Array<{ id: string; summary: string; timeZone?: string }>> {
    const settings = this.getSettings();
    const tokenManager = this.createTokenManager();
    const client = new GoogleCalendarClient(
      new ObsidianHttpTransport(),
      () => tokenManager.getAccessToken(),
      settings.googleCalendarId || 'primary',
    );
    return client.listWritableCalendars();
  }

  private async performSync(showNotice: boolean): Promise<void> {
    const settings = this.getSettings();
    if (!settings.calendarSyncEnabled) {
      this.status.state = 'disabled';
      return;
    }
    if (!this.isConnected()) {
      this.status.state = 'disconnected';
      return;
    }

    this.status.state = 'syncing';
    this.status.pending = 1;
    try {
      await this.ensureEligibleTasksHaveUuids(this.scanner.getTasks());
      const tasks = await this.scanner.scanVault();
      const tokenManager = this.createTokenManager();
      const client = new GoogleCalendarClient(
        new ObsidianHttpTransport(),
        () => tokenManager.getAccessToken(),
        settings.googleCalendarId || 'primary',
      );
      const service = new CalendarSyncService(client);
      const result = await service.sync(tasks, {
        vaultName: this.app.vault.getName(),
        defaultStartTime: settings.calendarDefaultStartTime || '07:00',
        defaultDurationMinutes: settings.calendarDefaultDurationMinutes || 30,
        timeZone: settings.calendarTimeZone || 'Asia/Singapore',
      });
      this.status = {
        state: 'idle',
        lastSuccess: new Date().toISOString(),
        pending: 0,
        lastError: null,
      };
      if (showNotice) new Notice(`Calendar synced: ${result.upserted} updated, ${result.deleted} removed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.status = { ...this.status, state: 'error', pending: 1, lastError: message };
      console.warn('[GTD Calendar Sync]', error);
      if (showNotice) new Notice(`Calendar sync failed: ${message}`);
    }
  }

  private async ensureEligibleTasksHaveUuids(tasks: TaskItem[]): Promise<void> {
    const candidates = tasks.filter((task) =>
      !task.isCompleted && task.statusChar === ' ' && Boolean(task.startDate) && !extractTaskUuid(task.rawText),
    );
    for (const task of candidates) {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!(file instanceof TFile)) continue;
      await this.scanner.updateTaskLine(task.filePath, task.lineNumber, task.rawText, (line) =>
        ensureHiddenTaskUuid(line).line,
      );
    }
  }

  private createTokenManager(): GoogleTokenManager {
    const settings = this.getSettings();
    const clientSecret = this.app.secretStorage.getSecret(settings.googleOAuthClientSecretId) ?? '';
    if (!settings.googleOAuthClientId || !clientSecret || !settings.googleOAuthRedirectUri) {
      throw new Error('Google OAuth configuration is incomplete.');
    }
    return new GoogleTokenManager(
      new ObsidianHttpTransport(),
      {
        getSecret: (id) => this.app.secretStorage.getSecret(id),
        setSecret: (id, value) => this.app.secretStorage.setSecret(id, value),
        deleteSecret: (id) => this.app.secretStorage.setSecret(id, ''),
      },
      {
        clientId: settings.googleOAuthClientId,
        clientSecret,
        redirectUri: settings.googleOAuthRedirectUri,
      },
      REFRESH_TOKEN_SECRET,
    );
  }

  private refreshConnectionState(): void {
    if (!this.getSettings().calendarSyncEnabled) this.status.state = 'disabled';
    else this.status.state = this.isConnected() ? 'idle' : 'disconnected';
  }
}
