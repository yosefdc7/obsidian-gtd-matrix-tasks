import { describe, it, expect } from 'vitest';
import { App, TFile } from 'obsidian';
import {
  parseTaskLine,
  setTaskRole,
  formatRoleLabel,
  extractRoleFromIdentities,
  extractRoleFromPath,
  DEFAULT_ROLE_DEFS
} from '../src/parser';
import { RoleResolver } from '../src/store/role-resolver';
import { determineDestinationFolder } from '../src/auto-mover';
import { TaskItem } from '../src/types';

function createMockApp(filesMap: Record<string, { path: string; basename: string; frontmatter?: Record<string, any> }>): App {
  return {
    vault: {
      getAbstractFileByPath: (path: string): TFile | null => {
        const entry = filesMap[path];
        if (!entry) return null;
        const file = new TFile();
        Object.assign(file, { path: entry.path, basename: entry.basename });
        return file;
      }
    },
    metadataCache: {
      getFirstLinkpathDest: (link: string, _sourcePath: string): TFile | null => {
        for (const entry of Object.values(filesMap)) {
          if (entry.basename === link || entry.path === link || entry.path.endsWith(`/${link}.md`)) {
            const file = new TFile();
            Object.assign(file, { path: entry.path, basename: entry.basename });
            return file;
          }
        }
        return null;
      },
      getFileCache: (file: TFile) => {
        const entry = filesMap[file.path];
        return entry ? { frontmatter: entry.frontmatter } : null;
      }
    }
  } as unknown as App;
}

function makeTask(rawText: string, filePath: string = 'Jots/2026-09-19.md'): TaskItem {
  const parsed = parseTaskLine(rawText, filePath, 1);
  if (!parsed) throw new Error(`Failed to parse task: ${rawText}`);
  return parsed;
}

describe('Identity Inheritance & Zero-Tag Architecture', () => {
  describe('Full Narrative Labels & Defaults', () => {
    it('uses full narrative labels in DEFAULT_ROLE_DEFS', () => {
      expect(DEFAULT_ROLE_DEFS).toEqual([
        { id: 'role/yo-manager', label: 'Yo the Manager', tag: 'role/yo-manager' },
        { id: 'role/josef-selfcare', label: 'Josef with Self Care', tag: 'role/josef-selfcare' },
        { id: 'role/rj-supportive', label: 'RJ the Supportive', tag: 'role/rj-supportive' }
      ]);
    });

    it('formats role labels to full narrative title strings', () => {
      expect(formatRoleLabel('yo-manager')).toBe('Yo the Manager');
      expect(formatRoleLabel('yo the manager')).toBe('Yo the Manager');
      expect(formatRoleLabel('role/yo-manager')).toBe('Yo the Manager');
      expect(formatRoleLabel('josef-selfcare')).toBe('Josef with Self Care');
      expect(formatRoleLabel('josef with self care')).toBe('Josef with Self Care');
      expect(formatRoleLabel('role/josef-selfcare')).toBe('Josef with Self Care');
      expect(formatRoleLabel('rj-supportive')).toBe('RJ the Supportive');
      expect(formatRoleLabel('rj the supportive')).toBe('RJ the Supportive');
      expect(formatRoleLabel('role/rj-supportive')).toBe('RJ the Supportive');
    });
  });

  describe('extractRoleFromIdentities', () => {
    it('resolves roles from array of wikilinks', () => {
      expect(extractRoleFromIdentities(['[[Yo the Manager]]'])).toBe('role/yo-manager');
      expect(extractRoleFromIdentities(['[[Josef with Self Care]]'])).toBe('role/josef-selfcare');
      expect(extractRoleFromIdentities(['[[RJ the Supportive]]'])).toBe('role/rj-supportive');
    });

    it('resolves roles from aliases and aliases with pipes', () => {
      expect(extractRoleFromIdentities(['[[Yo Manager|Yo]]'])).toBe('role/yo-manager');
      expect(extractRoleFromIdentities(['[[Josef Self-Care|Self Care]]'])).toBe('role/josef-selfcare');
      expect(extractRoleFromIdentities(['[[RJ Supportive]]'])).toBe('role/rj-supportive');
    });

    it('resolves roles from scalar string values', () => {
      expect(extractRoleFromIdentities('[[Yo the Manager]]')).toBe('role/yo-manager');
      expect(extractRoleFromIdentities('Josef with Self Care')).toBe('role/josef-selfcare');
    });

    it('returns null for unknown entities or empty inputs', () => {
      expect(extractRoleFromIdentities(null)).toBeNull();
      expect(extractRoleFromIdentities([])).toBeNull();
      expect(extractRoleFromIdentities(['[[Project Phoenix]]'])).toBeNull();
    });
  });

  describe('extractRoleFromPath', () => {
    it('extracts role from 00 Identity/ paths', () => {
      expect(extractRoleFromPath('00 Identity/Yo the Manager/Projects/App.md')).toBe('role/yo-manager');
      expect(extractRoleFromPath('00 Identity/Josef with Self Care/Health & Fitness/Gym.md')).toBe('role/josef-selfcare');
      expect(extractRoleFromPath('00 Identity/RJ the Supportive/Admin & Life/Family.md')).toBe('role/rj-supportive');
    });

    it('maintains backward compatibility with legacy Roles/ paths', () => {
      expect(extractRoleFromPath('Roles/Yo Manager/Projects/Old.md')).toBe('role/yo-manager');
    });

    it('returns null for notes outside identity hierarchies', () => {
      expect(extractRoleFromPath('Jots/2026-09-19.md')).toBeNull();
      expect(extractRoleFromPath('References/Topics/Finance.md')).toBeNull();
    });
  });

  describe('setTaskRole (Zero-Tag Wikilink Mutation)', () => {
    it('appends narrative identity wikilink when assigning role to untagged task', () => {
      const line = '- [ ] Buy groceries ⏳ 2026-09-20';
      const updated = setTaskRole(line, 'role/josef-selfcare');
      expect(updated).toBe('- [ ] Buy groceries ⏳ 2026-09-20 [[Josef with Self Care]]');
      expect(updated).not.toContain('#role');
    });

    it('replaces existing identity wikilink in-place without touching other wikilinks', () => {
      const line = '- [ ] Review sprint [[Project Phoenix]] [[Yo the Manager]] ⏳ 2026-09-20';
      const switched = setTaskRole(line, 'role/rj-supportive');
      expect(switched).toBe('- [ ] Review sprint [[Project Phoenix]] [[RJ the Supportive]] ⏳ 2026-09-20');
      expect(switched).toContain('[[Project Phoenix]]');
    });

    it('strips legacy #role/... tags when updating to narrative wikilink', () => {
      const line = '- [ ] Fix production bug #role/yo-manager ⏳ 2026-09-20';
      const updated = setTaskRole(line, 'role/yo-manager');
      expect(updated).not.toContain('#role');
      expect(updated).toBe('- [ ] Fix production bug ⏳ 2026-09-20 [[Yo the Manager]]');
    });

    it('strips identity wikilink cleanly when set to untagged or null', () => {
      const line = '- [ ] Wash car [[Josef with Self Care]] 📅 2026-09-21';
      const stripped = setTaskRole(line, 'untagged');
      expect(stripped).toBe('- [ ] Wash car 📅 2026-09-21');
      expect(stripped).not.toContain('[[Josef with Self Care]]');
    });
  });

  describe('RoleResolver Cascade & Project-First Priority', () => {
    const mockApp = createMockApp({
      '00 Identity/Yo the Manager/Projects/Executive Dashboard.md': {
        path: '00 Identity/Yo the Manager/Projects/Executive Dashboard.md',
        basename: 'Executive Dashboard',
        frontmatter: {
          type: 'project',
          identities: ['[[Yo the Manager]]']
        }
      },
      '00 Identity/Josef with Self Care/Projects/Half Marathon.md': {
        path: '00 Identity/Josef with Self Care/Projects/Half Marathon.md',
        basename: 'Half Marathon',
        frontmatter: {
          type: 'project',
          identities: ['[[Josef with Self Care]]']
        }
      },
      '00 Identity/RJ the Supportive/RJ the Supportive.md': {
        path: '00 Identity/RJ the Supportive/RJ the Supportive.md',
        basename: 'RJ the Supportive',
        frontmatter: {}
      },
      '00 Identity/Yo the Manager/Yo the Manager.md': {
        path: '00 Identity/Yo the Manager/Yo the Manager.md',
        basename: 'Yo the Manager',
        frontmatter: {}
      },
      'Jots/2026-09-19.md': {
        path: 'Jots/2026-09-19.md',
        basename: '2026-09-19',
        frontmatter: {}
      }
    });

    const resolver = new RoleResolver(mockApp);

    it('Tier 1: inline #role tag overrides all linked notes and parent notes', () => {
      const task = makeTask(
        '- [ ] Prepare slides [[Executive Dashboard]] #role/rj-supportive',
        '00 Identity/Yo the Manager/Projects/Executive Dashboard.md'
      );
      const res = resolver.resolveTaskRole(task);
      expect(res).toEqual({ role: 'role/rj-supportive', source: 'inline' });
    });

    it('Tier 2: Single-Link Rule inherits identity from linked project note', () => {
      const task = makeTask('- [ ] Finalize Q3 roadmap [[Executive Dashboard]]', 'Jots/2026-09-19.md');
      const res = resolver.resolveTaskRole(task);
      expect(res).toEqual({ role: 'role/yo-manager', source: 'linked-note' });
    });

    it('Tier 2: Project-first tie-breaker prioritizes project over person/area link', () => {
      // Task links RJ the Supportive first, but links Executive Dashboard (Project) second
      const task = makeTask(
        '- [ ] Sync with [[RJ the Supportive]] about [[Executive Dashboard]]',
        'Jots/2026-09-19.md'
      );
      const res = resolver.resolveTaskRole(task);
      expect(res).toEqual({ role: 'role/yo-manager', source: 'linked-note' });
    });

    it('Tier 2: Falls back to first link if no project link is present', () => {
      const task = makeTask('- [ ] Family catchup [[RJ the Supportive]]', 'Jots/2026-09-19.md');
      const res = resolver.resolveTaskRole(task);
      expect(res).toEqual({ role: 'role/rj-supportive', source: 'linked-note' });
    });

    it('Tier 3: Inherits from parent note folder path when task has no links', () => {
      const task = makeTask(
        '- [ ] Plan 10k interval training',
        '00 Identity/Josef with Self Care/Projects/Half Marathon.md'
      );
      const res = resolver.resolveTaskRole(task);
      expect(res).toEqual({ role: 'role/josef-selfcare', source: 'parent-note' });
    });

    it('Tier 4: Falls back to untagged for general notes without links', () => {
      const task = makeTask('- [ ] Random idea without links', 'Jots/2026-09-19.md');
      const res = resolver.resolveTaskRole(task);
      expect(res).toEqual({ role: 'untagged', source: 'none' });
    });
  });

  describe('AutoMover Destination Routing for 00 Identity/', () => {
    it('routes project note with frontmatter.identities to 00 Identity/<Facet>/Projects', () => {
      const destYo = determineDestinationFolder('Jots/New Work Project.md', ['project'], {
        identities: ['[[Yo the Manager]]']
      });
      expect(destYo).toBe('00 Identity/Yo the Manager/Projects');

      const destSelfCare = determineDestinationFolder('Jots/Sleep Tracking.md', ['project'], {
        identities: ['[[Josef with Self Care]]']
      });
      expect(destSelfCare).toBe('00 Identity/Josef with Self Care/Projects');

      const destRJ = determineDestinationFolder('Jots/Home Reno.md', ['project'], {
        identities: ['[[RJ the Supportive]]']
      });
      expect(destRJ).toBe('00 Identity/RJ the Supportive/Projects');
    });

    it('protects System/Templates/ and System/Tests/ from being moved', () => {
      expect(determineDestinationFolder('System/Templates/Project Note.md', ['project', 'role/yo-manager'])).toBeNull();
      expect(determineDestinationFolder('System/Tests/Sample Test.md', ['project'])).toBeNull();
    });
  });
});
