import { describe, it, expect } from 'vitest';
import { parseTaskLine } from '../src/parser';
import { addDays, executeDateBucketDrop, executeTaskTransition } from '../src/view/task-transitions';
import type { TaskMutator } from '../src/store/task-mutator';
import { DateAnchorField, RoleId, SectionId, TaskItem, ViewMode } from '../src/types';

interface RunOptions {
  viewMode?: ViewMode;
  roleTag?: RoleId | null;
  today?: string;
  overrides?: Partial<TaskItem>;
}

function taskFrom(line: string, overrides: Partial<TaskItem> = {}): TaskItem {
  const task = parseTaskLine(line, 'test.md', 0);
  if (!task) throw new Error(`Unparseable task line: ${line}`);
  return { ...task, ...overrides };
}

async function runTransition(line: string, targetSection: SectionId, options: RunOptions = {}) {
  const task = taskFrom(line, options.overrides);
  const calls: ((line: string) => string)[] = [];
  const mutator = {
    batchUpdateTaskLine: async (_task: TaskItem, fn: (line: string) => string) => {
      calls.push(fn);
      return true;
    }
  } as unknown as TaskMutator;

  await executeTaskTransition(
    task,
    targetSection,
    options.viewMode ?? 'gtd',
    mutator,
    options.today ?? '2026-09-15',
    options.roleTag
  );
  return { output: calls.map((fn) => fn(line)).join(' | '), callCount: calls.length };
}

describe('addDays', () => {
  it('adds day offsets at day granularity', () => {
    expect(addDays('2026-09-15', 3)).toBe('2026-09-18');
    expect(addDays('2026-09-15', 10)).toBe('2026-09-25');
  });

  it('rolls over month and year boundaries', () => {
    expect(addDays('2026-09-28', 3)).toBe('2026-10-01');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('GTD drop transitions (one atomic write per drop)', () => {
  it('Next Actions: clears waiting/someday and sets due = today + 3', async () => {
    const { output, callCount } = await runTransition('- [?] Await feedback #someday', 'gtd-next-actions');
    expect(output).toBe('- [ ] Await feedback 📅 2026-09-18');
    expect(callCount).toBe(1);
  });

  it('Waiting: switches the checkbox to [?]', async () => {
    const { output, callCount } = await runTransition('- [ ] Review contract', 'gtd-waiting');
    expect(output).toBe('- [?] Review contract');
    expect(callCount).toBe(1);
  });

  it('Scheduled: clears waiting and sets scheduled = today + 10', async () => {
    const { output, callCount } = await runTransition('- [?] Plan trip', 'gtd-scheduled');
    expect(output).toBe('- [ ] Plan trip ⏳ 2026-09-25');
    expect(callCount).toBe(1);
  });

  it('Someday: adds the #someday tag', async () => {
    const { output, callCount } = await runTransition('- [ ] Learn piano', 'gtd-someday');
    expect(output).toBe('- [ ] Learn piano #someday');
    expect(callCount).toBe(1);
  });

  it('Someday: clears a due date', async () => {
    const { output, callCount } = await runTransition('- [ ] Learn piano 📅 2026-10-01', 'gtd-someday');
    expect(output).toBe('- [ ] Learn piano  #someday');
    expect(callCount).toBe(1);
  });

  it('Someday: clears a scheduled date', async () => {
    const { output, callCount } = await runTransition('- [ ] Learn piano ⏳ 2026-10-02', 'gtd-someday');
    expect(output).toBe('- [ ] Learn piano  #someday');
    expect(callCount).toBe(1);
  });

  it('Inbox: clears priority, dates and tags', async () => {
    const { output, callCount } = await runTransition('- [?] Chase invoice #someday ⏫', 'gtd-inbox');
    expect(output).toBe('- [ ] Chase invoice');
    expect(callCount).toBe(1);
  });

  it('Completed: checks the box with the drop date', async () => {
    const { output, callCount } = await runTransition('- [ ] Ship release', 'gtd-completed');
    expect(output).toBe('- [x] Ship release ✅ 2026-09-15');
    expect(callCount).toBe(1);
  });

  it('keeps the completion marker when a completed task moves on', async () => {
    const { output } = await runTransition('- [x] Done thing ✅ 2026-09-14', 'gtd-next-actions');
    expect(output).toBe('- [x] Done thing ✅ 2026-09-14 📅 2026-09-18');
  });
});

describe('Eisenhower drop transitions', () => {
  it('Q1 sets highest priority', async () => {
    const { output, callCount } = await runTransition('- [ ] Do thing', 'eisen-q1', { viewMode: 'eisenhower' });
    expect(output).toBe('- [ ] Do thing ⏫');
    expect(callCount).toBe(1);
  });

  it('Q2 sets high priority', async () => {
    const { output } = await runTransition('- [ ] Do thing', 'eisen-q2', { viewMode: 'eisenhower' });
    expect(output).toBe('- [ ] Do thing 🔼');
  });

  it('Q3 sets medium priority', async () => {
    const { output } = await runTransition('- [ ] Do thing', 'eisen-q3', { viewMode: 'eisenhower' });
    expect(output).toBe('- [ ] Do thing 🔽');
  });

  it('Q4 sets low priority', async () => {
    const { output } = await runTransition('- [ ] Do thing', 'eisen-q4', { viewMode: 'eisenhower' });
    expect(output).toBe('- [ ] Do thing ⏬');
  });

  it('Inbox strips the priority', async () => {
    const { output } = await runTransition('- [ ] Do thing 🔼', 'eisen-inbox', { viewMode: 'eisenhower' });
    expect(output).toBe('- [ ] Do thing');
  });

  it('Completed checks the box with the drop date', async () => {
    const { output } = await runTransition('- [ ] Do thing', 'eisen-completed', { viewMode: 'eisenhower' });
    expect(output).toBe('- [x] Do thing ✅ 2026-09-15');
  });
});

describe('By Date day-bucket drops (scheduling gestures)', () => {
  async function runDateDrop(line: string, anchorField: DateAnchorField, dayDate = '2026-09-18') {
    const task = taskFrom(line);
    const calls: ((line: string) => string)[] = [];
    const mutator = {
      batchUpdateTaskLine: async (_task: TaskItem, fn: (line: string) => string) => {
        calls.push(fn);
        return true;
      }
    } as unknown as TaskMutator;

    await executeDateBucketDrop(task, dayDate, anchorField, mutator);
    return { output: calls.map((fn) => fn(line)).join(' | '), callCount: calls.length };
  }

  it('Scheduled anchor stamps the ⏳ date in one write', async () => {
    const { output, callCount } = await runDateDrop('- [ ] Review sprint plan', 'scheduled');
    expect(output).toBe('- [ ] Review sprint plan ⏳ 2026-09-18');
    expect(callCount).toBe(1);
  });

  it('Due anchor stamps the 📅 date', async () => {
    const { output } = await runDateDrop('- [ ] Send invoice', 'due');
    expect(output).toBe('- [ ] Send invoice 📅 2026-09-18');
  });

  it('Start anchor stamps the 🛫 date', async () => {
    const { output } = await runDateDrop('- [ ] Draft proposal', 'start');
    expect(output).toBe('- [ ] Draft proposal 🛫 2026-09-18');
  });

  it('replaces an existing date token instead of duplicating it', async () => {
    const { output, callCount } = await runDateDrop('- [ ] Reschedule me ⏳ 2026-09-10', 'scheduled');
    expect(output).toBe('- [ ] Reschedule me ⏳ 2026-09-18');
    expect(callCount).toBe(1);
  });

  it('does not touch other date tokens or priority', async () => {
    const { output } = await runDateDrop('- [ ] Keep me 📅 2026-10-01 ⏫', 'start');
    expect(output).toBe('- [ ] Keep me 📅 2026-10-01 ⏫ 🛫 2026-09-18');
  });
});

describe('Role folding into the same single write', () => {
  it('preserves the role when roleTag is undefined', async () => {
    const { output, callCount } = await runTransition('- [ ] Foo #role/yo-manager', 'gtd-next-actions', {
      overrides: { effectiveRole: 'role/yo-manager' }
    });
    expect(output).toBe('- [ ] Foo #role/yo-manager 📅 2026-09-18');
    expect(callCount).toBe(1);
  });

  it('sets the role when dropping into another swimlane', async () => {
    const { output, callCount } = await runTransition('- [ ] Foo #role/yo-manager', 'gtd-next-actions', {
      roleTag: 'role/josef-selfcare',
      overrides: { effectiveRole: 'role/yo-manager' }
    });
    expect(output).toBe('- [ ] Foo #role/josef-selfcare 📅 2026-09-18');
    expect(callCount).toBe(1);
  });

  it('leaves a matching role untouched', async () => {
    const { output } = await runTransition('- [ ] Foo #role/josef-selfcare', 'gtd-next-actions', {
      roleTag: 'role/josef-selfcare',
      overrides: { effectiveRole: 'role/josef-selfcare' }
    });
    expect(output).toBe('- [ ] Foo #role/josef-selfcare 📅 2026-09-18');
  });

  it('clears the role when dropping into the untagged lane', async () => {
    const { output, callCount } = await runTransition('- [ ] Foo #role/yo-manager', 'gtd-next-actions', {
      roleTag: null,
      overrides: { effectiveRole: 'role/yo-manager' }
    });
    expect(output).toBe('- [ ] Foo 📅 2026-09-18');
    expect(callCount).toBe(1);
  });

  it('does not touch an already-untagged task in the untagged lane', async () => {
    const { output } = await runTransition('- [ ] Foo', 'gtd-next-actions', {
      roleTag: null,
      overrides: { effectiveRole: 'untagged' }
    });
    expect(output).toBe('- [ ] Foo 📅 2026-09-18');
  });

  it('folds role changes with Eisenhower priority changes in one write', async () => {
    const { output, callCount } = await runTransition('- [ ] Foo', 'eisen-q2', {
      viewMode: 'eisenhower',
      roleTag: 'role/rj-supportive',
      overrides: { effectiveRole: 'untagged' }
    });
    expect(output).toBe('- [ ] Foo #role/rj-supportive 🔼');
    expect(callCount).toBe(1);
  });
});
