import { describe, it, expect } from 'vitest';
import {
  parseDateFromPath,
  extractExplicitDateFromLine,
  cleanMentionLine,
  computeMentionScore,
  BacklinkResolver
} from '../src/backlink-resolver';

describe('Backlink Resolver - Date Parsing & Line Extraction', () => {
  it('parses calendar date from file path', () => {
    const d1 = parseDateFromPath('Jots/2026/Sep/Sep 14 2026.md');
    expect(d1).not.toBeNull();
    expect(d1!.getFullYear()).toBe(2026);
    expect(d1!.getMonth()).toBe(8); // September (0-indexed)
    expect(d1!.getDate()).toBe(14);

    const d2 = parseDateFromPath('Notes/2026-09-12.md');
    expect(d2).not.toBeNull();
    expect(d2!.getFullYear()).toBe(2026);
    expect(d2!.getMonth()).toBe(8);
    expect(d2!.getDate()).toBe(12);

    const d3 = parseDateFromPath('Jots/2026/Aug/01.md');
    expect(d3).not.toBeNull();
    expect(d3!.getFullYear()).toBe(2026);
    expect(d3!.getMonth()).toBe(7); // August
    expect(d3!.getDate()).toBe(1);

    expect(parseDateFromPath('References/Topics/Pickle Ball.md')).toBeNull();
    expect(parseDateFromPath('Roles/Yo Manager.md')).toBeNull();
  });

  it('extracts explicit task date emojis from lines', () => {
    expect(extractExplicitDateFromLine('- [ ] drill session ⏳ 2026-09-15')).toBe('2026-09-15');
    expect(extractExplicitDateFromLine('- [x] completed workout ✅ 2026-09-14')).toBe('2026-09-14');
    expect(extractExplicitDateFromLine('Task with deadline 📅 2026-10-01')).toBe('2026-10-01');
    expect(extractExplicitDateFromLine('Regular line with no date')).toBeNull();
  });

  it('cleans leading markdown list markers, checkboxes, and truncates to 200 chars', () => {
    expect(cleanMentionLine('- [ ] [[Pickle Ball]] practice drills')).toBe('[[Pickle Ball]] practice drills');
    expect(cleanMentionLine('- [x] Finished [[Yo Manager]] report')).toBe('Finished [[Yo Manager]] report');
    expect(cleanMentionLine('* Simple bullet [[Note]]')).toBe('Simple bullet [[Note]]');
    expect(cleanMentionLine('1. Numbered item [[Note]]')).toBe('Numbered item [[Note]]');
    expect(cleanMentionLine('## [[Note]] section title')).toBe('[[Note]] section title');

    // Truncation check
    const longText = 'A'.repeat(250);
    const cleaned = cleanMentionLine(longText, 200);
    expect(cleaned.length).toBe(201); // 200 chars + '…'
    expect(cleaned.endsWith('…')).toBe(true);
  });

  it('computes chronological ranking score prioritizing explicit task date over note date over mtime', () => {
    // 1. Explicit date in line (2026-09-16) vs Note date (2026-09-10)
    const score1 = computeMentionScore('Jots/2026/Sep/Sep 10 2026.md', '- [ ] test ⏳ 2026-09-16', 1000);
    const score2 = computeMentionScore('Jots/2026/Sep/Sep 14 2026.md', 'plain note without explicit date', 1000);
    expect(score1.score).toBeGreaterThan(score2.score);

    // 2. Note date (Sep 14) vs generic note mtime (Sep 01)
    const mtimeSep01 = new Date('2026-09-01T00:00:00Z').getTime();
    const score3 = computeMentionScore('References/Topics/General.md', 'some mention', mtimeSep01);
    expect(score2.score).toBeGreaterThan(score3.score);
  });
});

describe('BacklinkResolver - Vault Integration Mock', () => {
  it('returns hasBacklinks: false when note has no incoming links', async () => {
    const mockApp = {
      metadataCache: {
        getFirstLinkpathDest: () => ({ path: 'References/New Note.md', name: 'New Note.md' }),
        getBacklinksForFile: () => ({ data: new Map() })
      },
      vault: {
        getAbstractFileByPath: () => null,
        read: async () => ''
      }
    } as any;

    const resolver = new BacklinkResolver(mockApp);
    const result = await resolver.getLatestBacklinkMention('New Note');
    expect(result.hasBacklinks).toBe(false);
  });

  it('correctly picks the latest chronological mention and extracts clean snippet', async () => {
    const targetFile = { path: 'References/Topics/Pickle Ball.md', name: 'Pickle Ball.md' };
    const olderFile = {
      path: 'Jots/2026/Aug/Aug 01 2026.md',
      name: 'Aug 01 2026.md',
      stat: { mtime: 1000 }
    };
    const newerFile = {
      path: 'Jots/2026/Sep/Sep 08 2026.md',
      name: 'Sep 08 2026.md',
      stat: { mtime: 2000 }
    };

    const backlinksMap = new Map();
    backlinksMap.set(olderFile.path, [
      { position: { start: { line: 2, col: 0, offset: 20 } } }
    ]);
    backlinksMap.set(newerFile.path, [
      { position: { start: { line: 1, col: 0, offset: 15 } } }
    ]);

    const mockApp = {
      metadataCache: {
        getFirstLinkpathDest: (path: string) => targetFile,
        getBacklinksForFile: (f: any) => ({ data: backlinksMap })
      },
      vault: {
        getAbstractFileByPath: (path: string) => {
          if (path === olderFile.path) return olderFile;
          if (path === newerFile.path) return newerFile;
          return null;
        },
        read: async (f: any) => {
          if (f.path === olderFile.path) {
            return 'title\n---\n- [ ] August practice [[Pickle Ball]]';
          }
          if (f.path === newerFile.path) {
            return 'title\n- [ ] [[Pickle Ball]] MOVE → GET LOW → CONTACT IN FRONT ⏳ 2026-09-08';
          }
          return '';
        }
      }
    } as any;

    const resolver = new BacklinkResolver(mockApp);
    const result = await resolver.getLatestBacklinkMention('Pickle Ball');

    expect(result.hasBacklinks).toBe(true);
    expect(result.sourceTitle).toBe('Sep 08 2026.md');
    expect(result.cleanedText).toContain('[[Pickle Ball]] MOVE → GET LOW → CONTACT IN FRONT');
  });

  it('excludes active note if other backlinks exist', async () => {
    const targetFile = { path: 'Roles/Yo Manager.md', name: 'Yo Manager.md' };
    const activeFile = {
      path: 'Jots/2026/Sep/Sep 15 2026.md',
      name: 'Sep 15 2026.md',
      stat: { mtime: 5000 }
    };
    const externalFile = {
      path: 'Jots/2026/Sep/Sep 14 2026.md',
      name: 'Sep 14 2026.md',
      stat: { mtime: 4000 }
    };

    const backlinksMap = new Map();
    backlinksMap.set(activeFile.path, [{ position: { start: { line: 0 } } }]);
    backlinksMap.set(externalFile.path, [{ position: { start: { line: 0 } } }]);

    const mockApp = {
      metadataCache: {
        getFirstLinkpathDest: () => targetFile,
        getBacklinksForFile: () => ({ data: backlinksMap })
      },
      vault: {
        getAbstractFileByPath: (p: string) => (p === activeFile.path ? activeFile : externalFile),
        read: async (f: any) => `Mention in ${f.name}`
      }
    } as any;

    const resolver = new BacklinkResolver(mockApp);
    // When currentFilePath is activeFile.path, it should pick externalFile
    const result = await resolver.getLatestBacklinkMention('Yo Manager', activeFile.path);

    expect(result.hasBacklinks).toBe(true);
    expect(result.sourceTitle).toBe('Sep 14 2026.md');
  });
});
