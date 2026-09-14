import { describe, it, expect } from 'vitest';
import { parseTaskLine, setTaskRole, extractRoleFromTags, extractRoleFromPath } from '../src/parser';

describe('Role Tag Mutation & Extraction', () => {
  it('extracts role from inline tags', () => {
    expect(extractRoleFromTags(['#role/yo-manager', '#work'])).toBe('role/yo-manager');
    expect(extractRoleFromTags(['#role/josef-selfcare'])).toBe('role/josef-selfcare');
    expect(extractRoleFromTags(['#role/rj-supportive'])).toBe('role/rj-supportive');
    expect(extractRoleFromTags(['#other', '#urgent'])).toBeNull();
  });

  it('extracts role from file path', () => {
    expect(extractRoleFromPath('Roles/Yo Manager/Projects/App.md')).toBe('role/yo-manager');
    expect(extractRoleFromPath('Roles/Josef Self-Care/Projects/Health.md')).toBe('role/josef-selfcare');
    expect(extractRoleFromPath('Roles/RJ Supportive/Projects/Family.md')).toBe('role/rj-supportive');
    expect(extractRoleFromPath('References/Topics/Finance.md')).toBeNull();
  });

  it('mutates task line with setTaskRole', () => {
    const line = '- [ ] Fix production bug #role/yo-manager ⏳ 2026-09-20';
    
    // Switch to Josef Self-Care
    const switched = setTaskRole(line, 'role/josef-selfcare');
    expect(switched).not.toContain('#role/yo-manager');
    expect(switched).toContain('#role/josef-selfcare');

    // Strip role (untagged)
    const stripped = setTaskRole(switched, 'untagged');
    expect(stripped).not.toContain('#role/josef-selfcare');
    expect(stripped).not.toContain('#role/');
    expect(stripped).toBe('- [ ] Fix production bug ⏳ 2026-09-20');
  });

  it('parses wikilinks from task body', () => {
    const line = '- [ ] Update roadmap [[GCash Strategic Planning]] and check [[Budget 2026|Budget]]';
    const task = parseTaskLine(line, 'Jots/2026/Sep/Sep 14 2026.md', 10);
    expect(task).not.toBeNull();
    expect(task?.linkedNotes).toEqual(['GCash Strategic Planning', 'Budget 2026']);
  });
});
