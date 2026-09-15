import { describe, it, expect } from 'vitest';
import { parseTaskLine } from '../src/parser';
import { filterTasks, groupBySection } from '../src/view/task-filter';
import type { TaskFilterState } from '../src/view/task-filter';
import { EISENHOWER_SECTIONS, GTD_SECTIONS } from '../src/view/types';
import { TaskItem } from '../src/types';

function makeTask(
  line: string,
  filePath = 'Jots/2026/Sep/Sep 15 2026.md',
  overrides: Partial<TaskItem> = {}
): TaskItem {
  const task = parseTaskLine(line, filePath, 0);
  if (!task) throw new Error(`Unparseable task line: ${line}`);
  return { ...task, ...overrides };
}

function baseState(overrides: Partial<TaskFilterState> = {}): TaskFilterState {
  return {
    activeFilterRoles: new Set(['role/yo-manager', 'role/josef-selfcare', 'role/rj-supportive', 'untagged']),
    searchQuery: '',
    selectedFolder: 'all',
    activeChip: 'all',
    ...overrides
  };
}

describe('filterTasks', () => {
  it('filters by active roles', () => {
    const yo = makeTask('- [ ] Yo thing', undefined, { effectiveRole: 'role/yo-manager' });
    const untagged = makeTask('- [ ] Loose thing');
    const state = baseState({ activeFilterRoles: new Set(['untagged']) });
    expect(filterTasks([yo, untagged], state)).toEqual([untagged]);
  });

  it('matches search against description, tags, and file name', () => {
    const byText = makeTask('- [ ] Buy groceries');
    const byTag = makeTask('- [ ] Book flight #someday');
    const other = makeTask('- [ ] Random item');

    expect(filterTasks([byText, byTag, other], baseState({ searchQuery: 'GROCER' }))).toEqual([byText]);
    expect(filterTasks([byText, byTag, other], baseState({ searchQuery: 'someday' }))).toEqual([byTag]);
    expect(filterTasks([byText, byTag, other], baseState({ searchQuery: 'sep 15 2026' }))).toEqual([
      byText,
      byTag,
      other
    ]);
  });

  it('filters by folder prefix with separator normalization', () => {
    const inFolder = makeTask('- [ ] A', 'Jots/2026/Sep/Sep 15 2026.md');
    const backslashPath = makeTask('- [ ] B', 'Jots\\2026\\Sep\\Sep 16 2026.md');
    const elsewhere = makeTask('- [ ] C', 'References/System/Note.md');
    const state = baseState({ selectedFolder: 'Jots/2026' });
    expect(filterTasks([inFolder, backslashPath, elsewhere], state)).toEqual([inFolder, backslashPath]);
  });

  it('applies quick chip filters', () => {
    const highest = makeTask('- [ ] A ⏫');
    const high = makeTask('- [ ] B 🔼');
    const medium = makeTask('- [ ] C 🔽');
    const project = makeTask('- [ ] D #project');

    expect(filterTasks([highest, high, medium, project], baseState({ activeChip: 'urgent' }))).toEqual([
      highest,
      medium
    ]);
    expect(filterTasks([highest, high, medium, project], baseState({ activeChip: 'important' }))).toEqual([
      highest,
      high
    ]);
    expect(filterTasks([highest, high, medium, project], baseState({ activeChip: 'projects' }))).toEqual([project]);
    expect(filterTasks([highest, high, medium, project], baseState())).toEqual([highest, high, medium, project]);
  });

  it('combines role, folder, and chip filters', () => {
    const match = makeTask('- [ ] A ⏫', 'Roles/Yo Manager/Projects/App.md');
    const wrongRole = makeTask('- [ ] B ⏫', 'Roles/Yo Manager/Projects/App.md', {
      effectiveRole: 'role/josef-selfcare'
    });
    const wrongChip = makeTask('- [ ] C 🔼', 'Roles/Yo Manager/Projects/App.md');
    const state = baseState({
      activeFilterRoles: new Set(['role/yo-manager', 'untagged']),
      selectedFolder: 'Roles/Yo Manager',
      activeChip: 'urgent'
    });
    expect(filterTasks([match, wrongRole, wrongChip], state)).toEqual([match]);
  });
});

describe('groupBySection', () => {
  const TODAY = '2026-09-15';

  it('routes GTD tasks into sections and drops older completed tasks', () => {
    const doneToday = makeTask('- [x] Done today ✅ 2026-09-15');
    const doneOld = makeTask('- [x] Done long ago ✅ 2026-09-01');
    const waiting = makeTask('- [?] Await reply');
    const someday = makeTask('- [ ] Idea #someday');
    const next = makeTask('- [ ] Soon 📅 2026-09-17');
    const scheduled = makeTask('- [ ] Later 📅 2026-10-05');
    const inbox = makeTask('- [ ] Raw capture');
    const tasks = [doneToday, doneOld, waiting, someday, next, scheduled, inbox];

    const grouped = groupBySection(tasks, GTD_SECTIONS, 'gtd', TODAY, 'date');

    expect(grouped.get('gtd-completed')).toEqual([doneToday]);
    expect(grouped.get('gtd-waiting')).toEqual([waiting]);
    expect(grouped.get('gtd-someday')).toEqual([someday]);
    expect(grouped.get('gtd-next-actions')).toEqual([next]);
    expect(grouped.get('gtd-scheduled')).toEqual([scheduled]);
    expect(grouped.get('gtd-inbox')).toEqual([inbox]);

    const all = [...grouped.values()].flat();
    expect(all).not.toContain(doneOld);
    expect(all).toHaveLength(6);
  });

  it('routes Eisenhower tasks by priority', () => {
    const q1 = makeTask('- [ ] A ⏫');
    const q2 = makeTask('- [ ] B 🔼');
    const q3 = makeTask('- [ ] C 🔽');
    const q4 = makeTask('- [ ] D ⏬');
    const none = makeTask('- [ ] E');
    const tasks = [q1, q2, q3, q4, none];

    const grouped = groupBySection(tasks, EISENHOWER_SECTIONS, 'eisenhower', TODAY, 'date');

    expect(grouped.get('eisen-q1')).toEqual([q1]);
    expect(grouped.get('eisen-q2')).toEqual([q2]);
    expect(grouped.get('eisen-q3')).toEqual([q3]);
    expect(grouped.get('eisen-q4')).toEqual([q4]);
    expect(grouped.get('eisen-inbox')).toEqual([none]);
  });

  it('pre-sorts buckets by priority', () => {
    const higher = makeTask('- [ ] Higher ⏫');
    const lower = makeTask('- [ ] Lower 🔼');
    const grouped = groupBySection([lower, higher], GTD_SECTIONS, 'gtd', TODAY, 'priority');
    expect(grouped.get('gtd-next-actions')).toEqual([higher, lower]);
  });

  it('pre-sorts date-based buckets ascending', () => {
    const sooner = makeTask('- [ ] Sooner 📅 2026-09-26');
    const later = makeTask('- [ ] Later 📅 2026-10-25');
    const grouped = groupBySection([later, sooner], GTD_SECTIONS, 'gtd', TODAY, 'date');
    expect(grouped.get('gtd-scheduled')).toEqual([sooner, later]);
  });
});
