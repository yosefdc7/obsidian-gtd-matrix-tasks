import { describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import type { PluginSettings } from '../src/types';
import { ScanEngine } from '../src/store/scan-engine';
import { TaskStore } from '../src/store/task-store';
import type { RoleResolver } from '../src/store/role-resolver';

describe('ScanEngine', () => {
  it('reads Markdown tasks even when Obsidian metadata cache reports no tasks', async () => {
    const file = { path: '00 Identity/Project.md', extension: 'md' } as TFile;
    const app = {
      vault: {
        getMarkdownFiles: () => [file],
        cachedRead: vi.fn().mockResolvedValue('- [ ] Review plan <!-- {"todoistId":"remote-1"} -->'),
      },
      metadataCache: { getFileCache: () => ({ listItems: [] }) },
    } as unknown as App;
    const store = new TaskStore();
    const roleResolver = {
      resolveTaskRole: () => ({ role: 'untagged', source: 'none' }),
    } as unknown as RoleResolver;
    const scanner = new ScanEngine(app, { excludedFolders: [] } as unknown as PluginSettings, store, roleResolver);

    const tasks = await scanner.scanVault();

    expect(tasks).toHaveLength(1);
    expect(tasks[0].rawText).toContain('remote-1');
    expect(app.vault.cachedRead).toHaveBeenCalledWith(file);
  });
});
