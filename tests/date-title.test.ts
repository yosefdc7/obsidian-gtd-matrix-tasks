import { describe, it, expect } from 'vitest';
import { isDateTitledNote } from '../src/date-utils';

describe('Date Title Detector', () => {
  it('detects MMM DD YYYY formatted titles', () => {
    expect(isDateTitledNote('Jots/2026/Sep/Sep 14 2026.md')).toBe(true);
    expect(isDateTitledNote('Sep 14 2026.md')).toBe(true);
    expect(isDateTitledNote('Apr 10 2024.md')).toBe(true);
    expect(isDateTitledNote('Dec 05 2025')).toBe(true);
  });

  it('detects MMMM DD, YYYY formatted titles', () => {
    expect(isDateTitledNote('September 14, 2026.md')).toBe(true);
    expect(isDateTitledNote('Jots/2026/September 14 2026.md')).toBe(true);
  });

  it('detects ISO formatted dates', () => {
    expect(isDateTitledNote('2026-09-14.md')).toBe(true);
    expect(isDateTitledNote('Notes/2026-09-14.md')).toBe(true);
  });

  it('detects legacy daily note day numbers in folder paths', () => {
    expect(isDateTitledNote('Jots/2026/Sep/14.md')).toBe(true);
    expect(isDateTitledNote('Jots/2024/Apr/01.md')).toBe(true);
  });

  it('rejects non-date titles so properties section displays as default', () => {
    expect(isDateTitledNote('Jots/2026/Sep/Project Planner.md')).toBe(false);
    expect(isDateTitledNote('Jots/2026/Sep/PPE.md')).toBe(false);
    expect(isDateTitledNote('References/Topics/Bank.md')).toBe(false);
    expect(isDateTitledNote('Roles/Josef Self-Care/Josef Self-Care.md')).toBe(false);
    expect(isDateTitledNote('Projects/Wedding Done.md')).toBe(false);
    expect(isDateTitledNote('Business Ideas.md')).toBe(false);
  });
});
