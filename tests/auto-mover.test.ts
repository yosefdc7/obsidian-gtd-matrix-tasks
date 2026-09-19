
import { describe, it, expect } from 'vitest';
import {
  determineDestinationFolder,
  resolveCollision,
  normalizeTag
} from '../src/auto-mover';

describe('AutoMover Classification & Routing', () => {
  it('normalizes tags with hashes and casing', () => {
    expect(normalizeTag('#Finance')).toBe('finance');
    expect(normalizeTag('role/yo-manager')).toBe('role/yo-manager');
    expect(normalizeTag(' #Role/Yo-Manager ')).toBe('role/yo-manager');
  });

  describe('Jots Eviction & Protection', () => {
    it('evicts non-dated notes from Jots to References/Topics', () => {
      const dest = determineDestinationFolder('Jots/2026/Sep/Project Planner.md', []);
      expect(dest).toBe('References/Topics');
    });

    it('evicts non-dated notes from Jots root', () => {
      const dest = determineDestinationFolder('Jots/Meeting Notes.md', []);
      expect(dest).toBe('References/Topics');
    });

    it('strictly protects dated daily notes in Jots', () => {
      expect(determineDestinationFolder('Jots/2026/Sep/Sep 14 2026.md', ['finance'])).toBeNull();
      expect(determineDestinationFolder('Jots/2024/Apr/10.md', ['project', 'role/yo-manager'])).toBeNull();
      expect(determineDestinationFolder('Jots/2026/09/2026-09-14.md', [])).toBeNull();
    });
  });

  describe('Role + Project Routing', () => {
    it('routes #project + #role/yo-manager to 00 Identity/Yo the Manager/Projects', () => {
      const dest = determineDestinationFolder('References/Topics/New Project.md', ['project', 'role/yo-manager']);
      expect(dest).toBe('00 Identity/Yo the Manager/Projects');
    });

    it('routes #project + #role/josef-selfcare to 00 Identity/Josef with Self Care/Projects', () => {
      const dest = determineDestinationFolder('References/Topics/Fitness App.md', ['project', 'role/josef-selfcare']);
      expect(dest).toBe('00 Identity/Josef with Self Care/Projects');
    });

    it('routes #project + #role/rj-supportive to 00 Identity/RJ the Supportive/Projects', () => {
      const dest = determineDestinationFolder('References/Topics/House Renovation.md', ['project', 'role/rj-supportive']);
      expect(dest).toBe('00 Identity/RJ the Supportive/Projects');
    });

    it('supports frontmatter type: project', () => {
      const dest = determineDestinationFolder('References/Topics/Special Doc.md', ['role/yo-manager'], { type: 'project' });
      expect(dest).toBe('00 Identity/Yo the Manager/Projects');
    });

    it('routes project by frontmatter identities without #role tags', () => {
      const dest = determineDestinationFolder('References/Topics/Tagless Project.md', ['project'], {
        identities: ['[[Yo the Manager]]']
      });
      expect(dest).toBe('00 Identity/Yo the Manager/Projects');
    });
  });

  describe('PARA Area Routing', () => {
    it('routes Trading & Finance tags', () => {
      expect(determineDestinationFolder('References/Topics/Coin.md', ['crypto'])).toBe('References/Topics/Trading & Finance');
      expect(determineDestinationFolder('References/Topics/Option.md', ['trading'])).toBe('References/Topics/Trading & Finance');
      expect(determineDestinationFolder('References/Topics/Account.md', ['finance'])).toBe('References/Topics/Trading & Finance');
    });

    it('routes Health & Fitness tags', () => {
      expect(determineDestinationFolder('References/Topics/Jogging.md', ['fitness'])).toBe('References/Topics/Health & Fitness');
      expect(determineDestinationFolder('References/Topics/Sleep.md', ['health'])).toBe('References/Topics/Health & Fitness');
      expect(determineDestinationFolder('References/Topics/Morning.md', ['habits'])).toBe('References/Topics/Health & Fitness');
    });

    it('routes Agile & Delivery tags', () => {
      expect(determineDestinationFolder('References/Topics/Standup.md', ['scrum'])).toBe('References/Topics/Agile & Delivery');
      expect(determineDestinationFolder('References/Topics/Release.md', ['delivery'])).toBe('References/Topics/Agile & Delivery');
    });

    it('routes Admin & Life tags', () => {
      expect(determineDestinationFolder('References/Topics/BIR.md', ['tax'])).toBe('References/Topics/Admin & Life');
      expect(determineDestinationFolder('References/Topics/Contract.md', ['admin'])).toBe('References/Topics/Admin & Life');
    });

    it('routes System & PKM tags', () => {
      expect(determineDestinationFolder('References/Topics/Hotkeys.md', ['obsidian'])).toBe('References/Topics/System & PKM');
      expect(determineDestinationFolder('References/Topics/PKM Design.md', ['pkm'])).toBe('References/Topics/System & PKM');
    });
  });

  describe('PARA Resource Routing', () => {
    it('routes #goal to References/Goals', () => {
      expect(determineDestinationFolder('References/Topics/Q4 Target.md', ['goal'])).toBe('References/Goals');
    });

    it('routes #person to References/People', () => {
      expect(determineDestinationFolder('References/Topics/Alice.md', ['person'])).toBe('References/People');
    });

    it('routes #partner to References/Partners', () => {
      expect(determineDestinationFolder('References/Topics/AcmeCorp.md', ['partner'])).toBe('References/Partners');
    });

    it('routes #guide to References/Guides', () => {
      expect(determineDestinationFolder('References/Topics/Onboarding.md', ['guide'])).toBe('References/Guides');
    });
  });

  describe('Excluded Paths', () => {
    it('never moves templates, archives, or system notes', () => {
      expect(determineDestinationFolder('References/Templates/Project Note.md', ['project', 'role/yo-manager'])).toBeNull();
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
