import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App, TFile } from 'obsidian';
import { TaskMutator } from '../src/store/task-mutator';
import type { ScanEngine } from '../src/store/scan-engine';
import { DEFAULT_SETTINGS, PluginSettings, TaskItem } from '../src/types';

const TODAY = '2026-09-15';
const DAILY_PATH = 'Jots/2026/Sep/Sep 15 2026.md';

interface MockVault {
  files: Map<string, string>;
  folders: Set<string>;
}

function createMockApp(initialFiles: Record<string, string> = {}): { app: App; vault: MockVault } {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const folders = new Set<string>();
  const makeFile = (path: string): TFile => Object.assign(new TFile(), { path });

  const vault = {
    getAbstractFileByPath: (path: string): TFile | null => {
      if (files.has(path)) return makeFile(path);
      if (folders.has(path)) return { path } as unknown as TFile;
      return null;
    },
    process: async (file: TFile, fn: (data: string) => string): Promise<string> => {
      const next = fn(files.get(file.path) ?? '');
      files.set(file.path, next);
      return next;
    },
    create: async (path: string, content: string): Promise<TFile> => {
      files.set(path, content);
      return makeFile(path);
    },
    createFolder: async (path: string): Promise<void> => {
      folders.add(path);
    }
  };

  return { app: { vault } as unknown as App, vault: { files, folders } };
}

function createTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't1',
    filePath: 'Tasks.md',
    fileName: 'Tasks',
    lineNumber: 0,
    rawText: '- [ ] Ship it',
    indent: '',
    statusChar: ' ',
    isCompleted: false,
    description: 'Ship it',
    priority: 'none',
    dueDate: null,
    scheduledDate: null,
    startDate: null,
    completedDate: null,
    createdDate: null,
    tags: [],
    isWaiting: false,
    isSomeday: false,
    isProject: false,
    linkedNotes: [],
    effectiveRole: 'untagged',
    roleSource: 'none',
    ...overrides
  };
}

let reindexSpy: ReturnType<typeof vi.fn>;
let scanEngine: ScanEngine;

function createMutator(app: App, settings: Partial<PluginSettings> = {}): TaskMutator {
  return new TaskMutator(app, { ...DEFAULT_SETTINGS, ...settings }, scanEngine);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0));
  reindexSpy = vi.fn().mockResolvedValue(undefined);
  scanEngine = { reindexFile: reindexSpy } as unknown as ScanEngine;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TaskMutator.updateTaskLine', () => {
  it('updates the exact line when the stored line number matches', async () => {
    const { app, vault } = createMockApp({ 'Tasks.md': '- [ ] First\n- [ ] Second\n' });
    const mutator = createMutator(app);

    const ok = await mutator.updateTaskLine('Tasks.md', 1, '- [ ] Second', (l) => `${l} ✨`);

    expect(ok).toBe(true);
    expect(vault.files.get('Tasks.md')).toBe('- [ ] First\n- [ ] Second ✨\n');
    expect(reindexSpy).toHaveBeenCalledTimes(1);
    expect((reindexSpy.mock.calls[0][0] as TFile).path).toBe('Tasks.md');
  });

  it('fuzzy-finds the line when it has shifted', async () => {
    const { app, vault } = createMockApp({
      'Tasks.md': '- [ ] Inserted\n- [ ] First\n- [ ] Second\n'
    });
    const mutator = createMutator(app);

    await mutator.updateTaskLine('Tasks.md', 1, '- [ ] Second', (l) => l.replace('[ ]', '[x]'));

    expect(vault.files.get('Tasks.md')).toBe('- [ ] Inserted\n- [ ] First\n- [x] Second\n');
  });

  it('falls back to a partial description match when the line changed', async () => {
    const changedLine = '- [x] Implement the new dashboard feature ✅ 2026-09-14';
    const { app, vault } = createMockApp({ 'Tasks.md': `- [ ] Other\n${changedLine}\n` });
    const mutator = createMutator(app);

    await mutator.updateTaskLine(
      'Tasks.md',
      0,
      '- [ ] Implement the new dashboard feature',
      (l) => `${l} 🔼`
    );

    expect(vault.files.get('Tasks.md')).toBe(`- [ ] Other\n${changedLine} 🔼\n`);
  });

  it('leaves the data unchanged when the line cannot be located', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { app, vault } = createMockApp({ 'Tasks.md': '- [ ] Something else entirely\n' });
    const mutator = createMutator(app);

    const ok = await mutator.updateTaskLine('Tasks.md', 9, '- [ ] Vanished task', () => 'NOPE');

    expect(ok).toBe(true);
    expect(vault.files.get('Tasks.md')).toBe('- [ ] Something else entirely\n');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('returns false when the file does not exist', async () => {
    const { app } = createMockApp();
    const mutator = createMutator(app);

    const ok = await mutator.updateTaskLine('Missing.md', 0, '- [ ] X', (l) => l);

    expect(ok).toBe(false);
    expect(reindexSpy).not.toHaveBeenCalled();
  });

  it('returns false when vault.process throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = createMockApp({ 'Tasks.md': '- [ ] A\n' });
    vi.spyOn(app.vault, 'process').mockRejectedValue(new Error('boom'));
    const mutator = createMutator(app);

    const ok = await mutator.updateTaskLine('Tasks.md', 0, '- [ ] A', (l) => l);

    expect(ok).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('TaskMutator.batchUpdateTaskLine', () => {
  it('uses the task coordinates to update its line', async () => {
    const { app, vault } = createMockApp({ 'Notes/A.md': '- [ ] Alpha\n- [ ] Beta\n' });
    const mutator = createMutator(app);
    const task = createTask({
      filePath: 'Notes/A.md',
      fileName: 'A',
      lineNumber: 1,
      rawText: '- [ ] Beta'
    });

    const ok = await mutator.batchUpdateTaskLine(task, (l) => `${l} #work`);

    expect(ok).toBe(true);
    expect(vault.files.get('Notes/A.md')).toBe('- [ ] Alpha\n- [ ] Beta #work\n');
  });
});

describe('TaskMutator setters', () => {
  it("setCompletion writes the ✅ marker with today's date", async () => {
    const { app, vault } = createMockApp({ 'Tasks.md': '- [ ] Ship it\n' });
    const mutator = createMutator(app);

    await mutator.setCompletion(createTask(), true);

    expect(vault.files.get('Tasks.md')).toBe(`- [x] Ship it ✅ ${TODAY}\n`);
  });

  it('setScheduledDate stamps and clears the ⏳ date', async () => {
    const { app, vault } = createMockApp({ 'Tasks.md': '- [ ] Ship it\n' });
    const mutator = createMutator(app);
    const task = createTask();

    await mutator.setScheduledDate(task, '2026-09-20');
    expect(vault.files.get('Tasks.md')).toBe('- [ ] Ship it ⏳ 2026-09-20\n');

    await mutator.setScheduledDate(task, null);
    expect(vault.files.get('Tasks.md')).toBe('- [ ] Ship it\n');
  });

  it('setStartDate stamps and clears the 🛫 date', async () => {
    const { app, vault } = createMockApp({ 'Tasks.md': '- [ ] Ship it\n' });
    const mutator = createMutator(app);
    const task = createTask();

    await mutator.setStartDate(task, '2026-09-17');
    expect(vault.files.get('Tasks.md')).toBe('- [ ] Ship it 🛫 2026-09-17\n');

    await mutator.setStartDate(task, null);
    expect(vault.files.get('Tasks.md')).toBe('- [ ] Ship it\n');
  });

  it('setPriority appends the priority emoji', async () => {
    const { app, vault } = createMockApp({ 'Tasks.md': '- [ ] Ship it\n' });
    const mutator = createMutator(app);

    await mutator.setPriority(createTask(), 'highest');

    expect(vault.files.get('Tasks.md')).toBe('- [ ] Ship it ⏫\n');
  });
});

describe('TaskMutator.quickAddTask', () => {
  it('appends a next action with the high priority emoji to the daily note', async () => {
    const { app, vault } = createMockApp({
      [DAILY_PATH]: '# 2026-09-15\n\n## Tasks\n\n- [ ] Old\n'
    });
    const mutator = createMutator(app);

    const ok = await mutator.quickAddTask('gtd-next-actions', 'Call mom');

    expect(ok).toBe(true);
    expect(vault.files.get(DAILY_PATH)).toBe(
      '# 2026-09-15\n\n## Tasks\n\n- [ ] Old\n- [ ] Call mom 🔼\n'
    );
    expect(reindexSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the waiting checkbox for the waiting section', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app);

    await mutator.quickAddTask('gtd-waiting', 'Await reply');

    expect(vault.files.get(DAILY_PATH)).toBe('# 2026-09-15\n- [?] Await reply\n');
  });

  it("stamps today's date for the scheduled section", async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app);

    await mutator.quickAddTask('gtd-scheduled', 'Book flight');

    expect(vault.files.get(DAILY_PATH)).toBe(`# 2026-09-15\n- [ ] Book flight ⏳ ${TODAY}\n`);
  });

  it('tags the someday section with #someday', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app);

    await mutator.quickAddTask('gtd-someday', 'Buy a boat');

    expect(vault.files.get(DAILY_PATH)).toBe('# 2026-09-15\n- [ ] Buy a boat #someday\n');
  });

  it('appends the role tag and created date when enabled', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app, { autoAddCreatedDate: true });

    await mutator.quickAddTask('gtd-next-actions', 'Review PR', 'role/yo-manager');

    expect(vault.files.get(DAILY_PATH)).toBe(
      `# 2026-09-15\n- [ ] Review PR #role/yo-manager 🔼 ➕ ${TODAY}\n`
    );
  });

  it('does not tag untagged roles', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app);

    await mutator.quickAddTask('gtd-inbox', 'Random thought', 'untagged');

    expect(vault.files.get(DAILY_PATH)).toBe('# 2026-09-15\n- [ ] Random thought\n');
  });

  it('creates the daily note and folders when missing', async () => {
    const { app, vault } = createMockApp();
    const mutator = createMutator(app);

    const ok = await mutator.quickAddTask('eisen-q1', 'Fix outage');

    expect(ok).toBe(true);
    expect(vault.files.get(DAILY_PATH)).toBe(`# ${TODAY}\n\n## Tasks\n\n- [ ] Fix outage ⏫\n`);
    expect(vault.folders.has('Jots')).toBe(true);
    expect(vault.folders.has('Jots/2026')).toBe(true);
    expect(vault.folders.has('Jots/2026/Sep')).toBe(true);
    expect(reindexSpy).toHaveBeenCalledTimes(1);
  });
});

describe('TaskMutator.quickAddTaskDated', () => {
  it('stamps the scheduled token for the scheduled anchor', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app);

    await mutator.quickAddTaskDated('Prep deck', '2026-09-18', 'scheduled');

    expect(vault.files.get(DAILY_PATH)).toBe('# 2026-09-15\n- [ ] Prep deck ⏳ 2026-09-18\n');
    expect(reindexSpy).toHaveBeenCalledTimes(1);
  });

  it('stamps the due token for the due anchor', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app);

    await mutator.quickAddTaskDated('Ship release', '2026-09-21', 'due');

    expect(vault.files.get(DAILY_PATH)).toBe('# 2026-09-15\n- [ ] Ship release 📅 2026-09-21\n');
  });

  it('stamps the start token for the start anchor', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app);

    await mutator.quickAddTaskDated('Kick off research', '2026-09-16', 'start');

    expect(vault.files.get(DAILY_PATH)).toBe('# 2026-09-15\n- [ ] Kick off research 🛫 2026-09-16\n');
  });

  it('appends the role tag and created date when enabled', async () => {
    const { app, vault } = createMockApp({ [DAILY_PATH]: '# 2026-09-15\n' });
    const mutator = createMutator(app, { autoAddCreatedDate: true });

    await mutator.quickAddTaskDated('Review PR', '2026-09-18', 'scheduled', 'role/yo-manager');

    expect(vault.files.get(DAILY_PATH)).toBe(
      `# 2026-09-15\n- [ ] Review PR ⏳ 2026-09-18 #role/yo-manager ➕ ${TODAY}\n`
    );
  });

  it('creates the daily note and folders when missing', async () => {
    const { app, vault } = createMockApp();
    const mutator = createMutator(app);

    const ok = await mutator.quickAddTaskDated('Plan sprint', '2026-09-18', 'scheduled');

    expect(ok).toBe(true);
    expect(vault.files.get(DAILY_PATH)).toBe(`# ${TODAY}\n\n## Tasks\n\n- [ ] Plan sprint ⏳ 2026-09-18\n`);
    expect(vault.folders.has('Jots/2026/Sep')).toBe(true);
  });
});

describe('TaskMutator date helpers', () => {
  it('getTodayDateString returns the local YYYY-MM-DD date', () => {
    const { app } = createMockApp();
    const mutator = createMutator(app);

    expect(mutator.getTodayDateString()).toBe(TODAY);
  });

  it('getDailyNotePath follows the vault convention', () => {
    const { app } = createMockApp();
    const mutator = createMutator(app);

    expect(mutator.getDailyNotePath()).toBe(DAILY_PATH);
  });
});
