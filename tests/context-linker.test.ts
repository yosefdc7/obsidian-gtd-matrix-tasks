import { describe, it, expect } from 'vitest';
import {
  getIndentLevel,
  extractWikilinks,
  pickBestLink,
  findParentContext,
  injectContextLink,
  extractDateFromPath,
  isWithinActiveWindow,
  reconcileNoteContent
} from '../src/context-linker';

describe('ContextLinker', () => {
  describe('getIndentLevel', () => {
    it('calculates spaces and tab equivalent widths', () => {
      expect(getIndentLevel('no indent')).toBe(0);
      expect(getIndentLevel('  two spaces')).toBe(2);
      expect(getIndentLevel('    four spaces')).toBe(4);
      expect(getIndentLevel('\tone tab')).toBe(4);
      expect(getIndentLevel('\t\ttwo tabs')).toBe(8);
      expect(getIndentLevel('  \tspace then tab')).toBe(6);
    });
  });

  describe('extractWikilinks', () => {
    it('extracts plain wikilinks', () => {
      expect(extractWikilinks('Check [[Yo Manager]] and [[Executive Dashboard]]')).toEqual([
        'Yo Manager',
        'Executive Dashboard'
      ]);
    });

    it('extracts links with aliases and headings', () => {
      expect(extractWikilinks('See [[Executive Dashboard#Stats|Dashboard]] here')).toEqual([
        'Executive Dashboard'
      ]);
    });
  });

  describe('pickBestLink', () => {
    it('prioritizes role and project links over arbitrary notes', () => {
      expect(pickBestLink(['Notes', 'Roles/Yo Manager'])).toBe('Roles/Yo Manager');
      expect(pickBestLink(['Meeting Log', 'Yo Manager'])).toBe('Yo Manager');
      expect(pickBestLink(['Executive Dashboard', 'Josef Self-Care'])).toBe('Josef Self-Care');
      expect(pickBestLink(['Projects/Sprynt', 'Misc Notes'])).toBe('Projects/Sprynt');
    });

    it('falls back to the first link if no prioritized link matches', () => {
      expect(pickBestLink(['Alpha Note', 'Beta Note'])).toBe('Alpha Note');
    });
  });

  describe('findParentContext', () => {
    it('finds direct parent bullet wikilink', () => {
      const lines = [
        '- [[Executive Dashboard]]',
        '    - [ ] meet with daas person'
      ];
      const context = findParentContext(lines, 1);
      expect(context).toEqual({
        link: 'Executive Dashboard',
        type: 'bullet'
      });
    });

    it('finds parent bullet when tab indented', () => {
      const lines = [
        '- [[Partner Reliability]]',
        '\t- [ ] review partner metrics'
      ];
      const context = findParentContext(lines, 1);
      expect(context).toEqual({
        link: 'Partner Reliability',
        type: 'bullet'
      });
    });

    it('navigates multi-level hierarchy where intermediate bullet has no link', () => {
      const lines = [
        '- [[Yo Manager]]',
        '  - Grouping item without link',
        '    - [ ] Subtask'
      ];
      const context = findParentContext(lines, 2);
      expect(context).toEqual({
        link: 'Yo Manager',
        type: 'bullet'
      });
    });

    it('does NOT inherit markdown headings (parent bullets only)', () => {
      const lines = [
        '# [[Yo Manager]]',
        '',
        '- [ ] root level task',
        '- another bullet without link',
        '  - [ ] indented task under bullet with no link'
      ];

      expect(findParentContext(lines, 2)).toEqual({
        link: null,
        type: 'none'
      });

      expect(findParentContext(lines, 4)).toEqual({
        link: null,
        type: 'none'
      });
    });

    it('prefers parent bullet link over enclosing heading', () => {
      const lines = [
        '# [[Yo Manager]]',
        '',
        '- [[Executive Dashboard]]',
        '    - [ ] task under specific project'
      ];
      const context = findParentContext(lines, 3);
      expect(context).toEqual({
        link: 'Executive Dashboard',
        type: 'bullet'
      });
    });

    it('stops bullet search at horizontal rule', () => {
      const lines = [
        '- [[Previous Project]]',
        '---',
        '- [ ] task in new section'
      ];
      const context = findParentContext(lines, 2);
      expect(context).toEqual({
        link: null,
        type: 'none'
      });
    });
  });

  describe('injectContextLink', () => {
    it('appends link before trailing date', () => {
      const input = '- [ ] meet with daas person ⏳ 2026-09-14';
      const output = injectContextLink(input, 'Executive Dashboard');
      expect(output).toBe('- [ ] meet with daas person [[Executive Dashboard]] ⏳ 2026-09-14');
    });

    it('appends link before trailing priority and role tags', () => {
      const input = '- [ ] review dashboard ⏳ 2026-09-14 ⏫ #role/yo-manager';
      const output = injectContextLink(input, 'Executive Dashboard');
      expect(output).toBe('- [ ] review dashboard [[Executive Dashboard]] ⏳ 2026-09-14 ⏫ #role/yo-manager');
    });

    it('appends link at the end when there is no trailing metadata', () => {
      const input = '- [ ] prepare quarterly slides';
      const output = injectContextLink(input, 'Yo Manager');
      expect(output).toBe('- [ ] prepare quarterly slides [[Yo Manager]]');
    });

    it('does not duplicate link if line already contains it', () => {
      const input = '- [ ] meet with daas person [[Executive Dashboard]] ⏳ 2026-09-14';
      const output = injectContextLink(input, 'Executive Dashboard');
      expect(output).toBe('- [ ] meet with daas person [[Executive Dashboard]] ⏳ 2026-09-14');
    });

    it('strips legacy comment tags', () => {
      const input = '- [ ] meet daas person <!-- linked-note-tags: [[Executive Dashboard]] --> ⏳ 2026-09-14';
      const output = injectContextLink(input, 'Executive Dashboard');
      expect(output).toBe('- [ ] meet daas person [[Executive Dashboard]] ⏳ 2026-09-14');
    });
  });

  describe('extractDateFromPath & isWithinActiveWindow', () => {
    const fixedNow = new Date(2026, 8, 14); // Sep 14, 2026

    it('parses MMM DD YYYY formatted paths', () => {
      const date = extractDateFromPath('Jots/2026/Sep/Sep 14 2026.md');
      expect(date).not.toBeNull();
      expect(date?.getFullYear()).toBe(2026);
      expect(date?.getMonth()).toBe(8); // Sep is 8
      expect(date?.getDate()).toBe(14);
    });

    it('parses YYYY-MM-DD paths', () => {
      const date = extractDateFromPath('Jots/2026-09-14.md');
      expect(date).not.toBeNull();
      expect(date?.getDate()).toBe(14);
    });

    it('accepts today and yesterday within 24-hour window', () => {
      expect(isWithinActiveWindow('Jots/2026/Sep/Sep 14 2026.md', 24, fixedNow)).toBe(true);
      expect(isWithinActiveWindow('Jots/2026/Sep/Sep 13 2026.md', 24, fixedNow)).toBe(true);
      expect(isWithinActiveWindow('Jots/2026/Sep/Sep 15 2026.md', 24, fixedNow)).toBe(true); // tomorrow
    });

    it('rejects notes older than 24-48 hours', () => {
      expect(isWithinActiveWindow('Jots/2026/Sep/Sep 10 2026.md', 24, fixedNow)).toBe(false);
      expect(isWithinActiveWindow('Jots/2024/Apr/Apr 10 2024.md', 24, fixedNow)).toBe(false);
    });
  });

  describe('reconcileNoteContent', () => {
    it('reconciles entire daily note outline accurately (parent bullets only)', () => {
      const noteContent = `# [[Yo Manager]]

- [[Executive Dashboard]]
\t- [ ] check progress of data maps
\t- [ ] meet with daas person ⏳ 2026-09-14

- [ ] general team sync 📅 2026-09-15
- [x] completed task that should not be touched
`;

      const result = reconcileNoteContent(noteContent);
      expect(result.changesCount).toBe(2);
      expect(result.content).toContain('\t- [ ] check progress of data maps [[Executive Dashboard]]');
      expect(result.content).toContain('\t- [ ] meet with daas person [[Executive Dashboard]] ⏳ 2026-09-14');
      // Root-level task directly under heading must remain untouched!
      expect(result.content).toContain('- [ ] general team sync 📅 2026-09-15');
      expect(result.content).not.toContain('- [ ] general team sync [[Yo Manager]]');
      expect(result.content).toContain('- [x] completed task that should not be touched');
    });
  });
});
