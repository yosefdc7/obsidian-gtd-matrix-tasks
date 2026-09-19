import { describe, it, expect } from 'vitest';
import {
  parseTaskLine,
  setTaskRole,
  extractRoleFromTags,
  extractRoleFromPath,
  formatRoleLabel,
  parseConfiguredRoles,
  getRoleColor
} from '../src/parser';

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
    expect(extractRoleFromPath('00 Identity/Yo the Manager/Projects/App.md')).toBe('role/yo-manager');
    expect(extractRoleFromPath('00 Identity/Josef with Self Care/Projects/Health.md')).toBe('role/josef-selfcare');
    expect(extractRoleFromPath('00 Identity/RJ the Supportive/Projects/Family.md')).toBe('role/rj-supportive');
    expect(extractRoleFromPath('References/Topics/Finance.md')).toBeNull();
  });

  it('mutates task line with setTaskRole', () => {
    const line = '- [ ] Fix production bug #role/yo-manager ⏳ 2026-09-20';
    
    // Switch to Josef Self-Care
    const switched = setTaskRole(line, 'role/josef-selfcare');
    expect(switched).not.toContain('#role/yo-manager');
    expect(switched).toContain('[[Josef with Self Care]]');

    // Strip role (untagged)
    const stripped = setTaskRole(switched, 'untagged');
    expect(stripped).not.toContain('[[Josef with Self Care]]');
    expect(stripped).not.toContain('#role/');
    expect(stripped).toBe('- [ ] Fix production bug ⏳ 2026-09-20');
  });

  it('parses wikilinks from task body', () => {
    const line = '- [ ] Update roadmap [[GCash Strategic Planning]] and check [[Budget 2026|Budget]]';
    const task = parseTaskLine(line, 'Jots/2026/Sep/Sep 14 2026.md', 10);
    expect(task).not.toBeNull();
    expect(task?.linkedNotes).toEqual(['GCash Strategic Planning', 'Budget 2026']);
  });

  it('formats role labels in clean Title Case', () => {
    expect(formatRoleLabel('role/yo-manager')).toBe('Yo the Manager');
    expect(formatRoleLabel('role/josef-selfcare')).toBe('Josef with Self Care');
    expect(formatRoleLabel('role/rj-supportive')).toBe('RJ the Supportive');
    expect(formatRoleLabel('deep-work')).toBe('Deep Work');
    expect(formatRoleLabel('#roles/client-project')).toBe('Client Project');
  });

  it('parses configured role tags from csv string', () => {
    const roles = parseConfiguredRoles('role/engineering, client-ops, #personal');
    expect(roles).toHaveLength(3);
    expect(roles[0]).toEqual({ id: 'role/engineering', label: 'Engineering', tag: 'role/engineering' });
    expect(roles[1]).toEqual({ id: 'role/client-ops', label: 'Client Ops', tag: 'client-ops' });
    expect(roles[2]).toEqual({ id: 'role/personal', label: 'Personal', tag: 'personal' });
  });

  it('extracts role using custom configured roles', () => {
    const customRoles = parseConfiguredRoles('role/engineering, marketing');
    expect(extractRoleFromTags(['#role/engineering'], customRoles)).toBe('role/engineering');
    expect(extractRoleFromTags(['#marketing'], customRoles)).toBe('role/marketing');
    expect(extractRoleFromPath('Roles/Engineering/Task.md', customRoles)).toBe('role/engineering');
  });

  it('generates consistent colors for roles', () => {
    expect(getRoleColor('untagged')).toContain('var(');
    expect(getRoleColor('role/yo-manager')).toContain('blue');
    expect(getRoleColor('role/josef-selfcare')).toContain('green');
    expect(getRoleColor('role/custom-a')).toBe(getRoleColor('role/custom-a'));
  });
});
