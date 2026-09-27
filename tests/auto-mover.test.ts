import { describe, it, expect } from 'vitest';
import {
  determineDestinationFolder,
  normalizeTag,
  resolveCollision
} from '../src/auto-mover';

describe('AutoMover Classification & Routing', () => {
  it('normalizes tags with hashes and casing', () => {
    expect(normalizeTag('#Project')).toBe('project');
    expect(normalizeTag('#role/Yo-Manager')).toBe('role/yo-manager');
    expect(normalizeTag('finance')).toBe('finance');
  });

  describe('Jots Eviction & Protection', () => {
    it('evicts non-dated notes from Jots to References/Topics', () => {
      expect(determineDestinationFolder('Jots/2026/Sep/Random Idea.md', [])).toBe('References/Topics');
      expect(determineDestinationFolder('Jots/Draft Note.md', [])).toBe('References/Topics');
    });

    it('evicts non-dated notes from Jots root', () => {
      expect(determineDestinationFolder('Jots/Quick Thought.md', [])).toBe('References/Topics');
    });

    it('strictly protects dated daily notes in Jots', () => {
      expect(determineDestinationFolder('Jots/2026/Sep/Sep 24 2026.md', [])).toBeNull();
      expect(determineDestinationFolder('Jots/2026/Jul/Jul 03 2026.md', [])).toBeNull();
      expect(determineDestinationFolder('Jots/2026-09-24.md', [])).toBeNull();
    });
  });

  describe('Role + Project Routing (Property-First)', () => {
    it('routes #project + #role/yo-manager to 00 Identity/Yo the Manager/Projects', () => {
      const dest = determineDestinationFolder('References/Topics/Alpha.md', ['project', 'role/yo-manager']);
      expect(dest).toBe('00 Identity/Yo the Manager/Projects');
    });

    it('routes #project + #role/josef-selfcare to 00 Identity/Josef with Self Care/Projects', () => {
      const dest = determineDestinationFolder('References/Topics/Beta.md', ['project', 'role/josef-selfcare']);
      expect(dest).toBe('00 Identity/Josef with Self Care/Projects');
    });

    it('routes #project + #role/rj-supportive to 00 Identity/RJ the Supportive/Projects', () => {
      const dest = determineDestinationFolder('References/Topics/Gamma.md', ['project', 'role/rj-supportive']);
      expect(dest).toBe('00 Identity/RJ the Supportive/Projects');
    });

    it('supports frontmatter type: project with role tag', () => {
      const dest = determineDestinationFolder('References/Topics/Special Doc.md', ['role/yo-manager'], { type: 'project' });
      expect(dest).toBe('00 Identity/Yo the Manager/Projects');
    });

    it('routes project by frontmatter identities without #role tags', () => {
      const dest = determineDestinationFolder('References/Topics/Tagless Project.md', ['project'], {
        identities: ['[[Yo the Manager]]']
      });
      expect(dest).toBe('00 Identity/Yo the Manager/Projects');
    });

    it('routes project by frontmatter type: project and identities without any tags', () => {
      const dest = determineDestinationFolder('References/Topics/Clean Project.md', [], {
        type: 'project',
        identities: ['[[Josef with Self Care]]']
      });
      expect(dest).toBe('00 Identity/Josef with Self Care/Projects');
    });

    it('routes project by frontmatter type: project and role property', () => {
      const dest = determineDestinationFolder('References/Topics/Role Prop Project.md', [], {
        type: 'project',
        role: 'rj-supportive'
      });
      expect(dest).toBe('00 Identity/RJ the Supportive/Projects');
    });
  });

  describe('Property-First Reference/Resource Routing (Empty Tags)', () => {
    it('routes type: guide to References/Guides', () => {
      expect(determineDestinationFolder('References/Topics/New Guide.md', [], { type: 'guide' })).toBe('References/Guides');
    });

    it('routes type: playbook to References/Playbooks', () => {
      expect(determineDestinationFolder('References/Topics/New Playbook.md', [], { type: 'playbook' })).toBe('References/Playbooks');
    });

    it('routes type: person and area/people to References/People', () => {
      expect(determineDestinationFolder('References/Topics/Alice.md', [], { type: 'person' })).toBe('References/People');
      expect(determineDestinationFolder('References/Topics/Bob.md', [], { type: 'area/people' })).toBe('References/People');
    });

    it('routes type: partner to References/Partners', () => {
      expect(determineDestinationFolder('References/Topics/AcmeCorp.md', [], { type: 'partner' })).toBe('References/Partners');
    });

    it('routes type: source to References/Sources', () => {
      expect(determineDestinationFolder('References/Topics/Book Note.md', [], { type: 'source' })).toBe('References/Sources');
    });

    it('routes type: goal to References/Goals', () => {
      expect(determineDestinationFolder('References/Topics/Q4 Targets.md', [], { type: 'goal' })).toBe('References/Goals');
    });

    it('routes type: topic to References/Topics', () => {
      expect(determineDestinationFolder('00 Identity/Yo the Manager/Random Concept.md', [], { type: 'topic' })).toBe('References/Topics');
    });
  });

  describe('Area Routing (Property-First & Tag-Based)', () => {
    it('routes type: area with area property wikilink', () => {
      const dest = determineDestinationFolder('References/Topics/Crypto System.md', [], {
        type: 'area',
        area: '[[Investing & Trading]]'
      });
      expect(dest).toBe('00 Identity/Josef with Self Care/Investing & Trading');
    });

    it('routes type: area with area property plain text', () => {
      const dest = determineDestinationFolder('References/Topics/Team Standards.md', [], {
        type: 'area',
        area: 'Work & Leadership'
      });
      expect(dest).toBe('00 Identity/Yo the Manager/Work & Leadership');
    });

    it('routes type: area with parent property', () => {
      const dest = determineDestinationFolder('References/Topics/Tax Filings.md', [], {
        type: 'area',
        parent: '[[Life Admin]]'
      });
      expect(dest).toBe('00 Identity/Josef with Self Care/Life Admin');
    });

    it('routes Investing & Trading tags to canonical v2 folder', () => {
      expect(determineDestinationFolder('References/Topics/Coin.md', ['crypto'])).toBe('00 Identity/Josef with Self Care/Investing & Trading');
      expect(determineDestinationFolder('References/Topics/Option.md', ['trading'])).toBe('00 Identity/Josef with Self Care/Investing & Trading');
      expect(determineDestinationFolder('References/Topics/Account.md', ['finance'])).toBe('00 Identity/Josef with Self Care/Investing & Trading');
    });

    it('routes Health & Fitness tags', () => {
      expect(determineDestinationFolder('References/Topics/Jogging.md', ['fitness'])).toBe('00 Identity/Josef with Self Care/Health & Fitness');
      expect(determineDestinationFolder('References/Topics/Sleep.md', ['health'])).toBe('00 Identity/Josef with Self Care/Health & Fitness');
      expect(determineDestinationFolder('References/Topics/Morning.md', ['habits'])).toBe('00 Identity/Josef with Self Care/Health & Fitness');
    });

    it('routes Work & Leadership tags', () => {
      expect(determineDestinationFolder('References/Topics/Standup.md', ['scrum'])).toBe('00 Identity/Yo the Manager/Work & Leadership');
      expect(determineDestinationFolder('References/Topics/Release.md', ['delivery'])).toBe('00 Identity/Yo the Manager/Work & Leadership');
    });

    it('routes Life Admin tags', () => {
      expect(determineDestinationFolder('References/Topics/BIR.md', ['tax'])).toBe('00 Identity/Josef with Self Care/Life Admin');
      expect(determineDestinationFolder('References/Topics/Contract.md', ['admin'])).toBe('00 Identity/Josef with Self Care/Life Admin');
    });

    it('routes Personal Systems & PKM tags to canonical v2 folder', () => {
      expect(determineDestinationFolder('References/Topics/Hotkeys.md', ['obsidian'])).toBe('00 Identity/Josef with Self Care/Personal Systems & PKM');
      expect(determineDestinationFolder('References/Topics/PKM Design.md', ['pkm'])).toBe('00 Identity/Josef with Self Care/Personal Systems & PKM');
    });

    it('routes Family & Relationships tags', () => {
      expect(determineDestinationFolder('References/Topics/Family Gathering.md', ['family'])).toBe('00 Identity/RJ the Supportive/Family & Relationships');
    });

    it('routes Home & Household tags', () => {
      expect(determineDestinationFolder('References/Topics/Furniture Repair.md', ['furniture'])).toBe('00 Identity/RJ the Supportive/Home & Household');
    });
  });

  describe('Excluded & Protected Paths', () => {
    it('never moves templates, archives, system, or root identity anchor notes', () => {
      expect(determineDestinationFolder('00 Identity/Josef Romeo.md', ['health'])).toBeNull();
      expect(determineDestinationFolder('00 Identity/Yo the Manager/Yo the Manager.md', ['scrum'])).toBeNull();
      expect(determineDestinationFolder('00 Identity/Josef with Self Care/Josef with Self Care.md', ['health'])).toBeNull();
      expect(determineDestinationFolder('00 Identity/RJ the Supportive/RJ the Supportive.md', ['family'])).toBeNull();
      expect(determineDestinationFolder('00 Identity/Yo the Manager/Work & Leadership/Work & Leadership.md', ['scrum'])).toBeNull();
      expect(determineDestinationFolder('System/Templates/Goal Note.md', ['goal'])).toBeNull();
      expect(determineDestinationFolder('System/Templates/Project Note.md', ['project', 'role/yo-manager'])).toBeNull();
      expect(determineDestinationFolder('zArchive/Old Note.md', ['finance'])).toBeNull();
      expect(determineDestinationFolder('References/System/Settings.md', ['system'])).toBeNull();
    });
  });

  describe('Collision Resolution', () => {
    it('keeps name if no collision', () => {
      const res = resolveCollision('References/Topics', 'Unique Note.md', () => false);
      expect(res).toBe('References/Topics/Unique Note.md');
    });

    it('appends (1) if collision exists', () => {
      const exists = new Set(['References/Topics/Bank.md']);
      const res = resolveCollision('References/Topics', 'Bank.md', (p) => exists.has(p));
      expect(res).toBe('References/Topics/Bank (1).md');
    });

    it('increments counter if (1) also exists', () => {
      const exists = new Set(['References/Topics/Bank.md', 'References/Topics/Bank (1).md']);
      const res = resolveCollision('References/Topics', 'Bank.md', (p) => exists.has(p));
      expect(res).toBe('References/Topics/Bank (2).md');
    });
  });
});
