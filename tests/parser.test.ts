import { describe, it, expect } from 'vitest';
import {
  parseTaskLine,
  setTaskPriority,
  setTaskCompletion,
  setTaskDueDate,
  setTaskScheduledDate,
  setTaskDescription,
  setTaskWaiting,
  setTaskSomeday,
  getGTDSection,
  getEisenhowerSection
} from '../src/parser';
import { TaskItem } from '../src/types';

describe('Task Parser', () => {
  it('parses a basic task with no metadata', () => {
    const line = '- [ ] Buy groceries';
    const task = parseTaskLine(line, 'test.md', 0);
    expect(task).not.toBeNull();
    expect(task?.description).toBe('Buy groceries');
    expect(task?.isCompleted).toBe(false);
    expect(task?.priority).toBe('none');
    expect(task?.dueDate).toBeNull();
    expect(task?.isWaiting).toBe(false);
    expect(task?.isSomeday).toBe(false);
    expect(task?.isProject).toBe(false);
  });

  it('detects waiting state from status [?] or #waiting', () => {
    const task1 = parseTaskLine('- [?] Await feedback', 'test.md', 0);
    expect(task1?.isWaiting).toBe(true);

    const task2 = parseTaskLine('- [ ] Await response #waiting', 'test.md', 1);
    expect(task2?.isWaiting).toBe(true);
  });

  it('detects someday state from #someday or low priority', () => {
    const task1 = parseTaskLine('- [ ] Learn piano #someday', 'test.md', 0);
    expect(task1?.isSomeday).toBe(true);

    const task2 = parseTaskLine('- [ ] Read backlog ⏬', 'test.md', 1);
    expect(task2?.isSomeday).toBe(true);
  });

  it('detects project tasks from file path or tags', () => {
    const task1 = parseTaskLine('- [ ] Design schema', 'Roles/Yo Manager/Projects/Sprynt.md', 0);
    expect(task1?.isProject).toBe(true);

    const task2 = parseTaskLine('- [ ] Align roadmap #project', 'Jots/2026/Sep/12.md', 1);
    expect(task2?.isProject).toBe(true);
  });
});

describe('Task Mutators', () => {
  it('toggles waiting state on task line', () => {
    const line = '- [ ] Review contract';
    const waiting = setTaskWaiting(line, true);
    expect(waiting).toBe('- [?] Review contract');

    const restored = setTaskWaiting(waiting, false);
    expect(restored).toBe('- [ ] Review contract');
  });

  it('toggles someday tag on task line', () => {
    const line = '- [ ] Learn surfing';
    const someday = setTaskSomeday(line, true);
    expect(someday).toBe('- [ ] Learn surfing #someday');

    const restored = setTaskSomeday(someday, false);
    expect(restored).toBe('- [ ] Learn surfing');
  });

  it('sets and clears scheduled date on task line', () => {
    const line = '- [ ] Prepare quarterly review';
    const scheduled = setTaskScheduledDate(line, '2026-09-20');
    expect(scheduled).toBe('- [ ] Prepare quarterly review ⏳ 2026-09-20');

    const updated = setTaskScheduledDate(scheduled, '2026-09-25');
    expect(updated).toBe('- [ ] Prepare quarterly review ⏳ 2026-09-25');

    const cleared = setTaskScheduledDate(updated, null);
    expect(cleared).toBe('- [ ] Prepare quarterly review');
  });
});

describe('Section Routing', () => {
  const baseTask: TaskItem = {
    id: 'f.md:0',
    filePath: 'Jots/2026/Sep/12.md',
    fileName: '12',
    lineNumber: 0,
    rawText: '',
    indent: '',
    statusChar: ' ',
    isCompleted: false,
    description: 'Test',
    priority: 'none',
    dueDate: null,
    scheduledDate: null,
    startDate: null,
    completedDate: null,
    tags: [],
    isWaiting: false,
    isSomeday: false,
    isProject: false,
    createdDate: null,
    linkedNotes: [],
    effectiveRole: 'untagged',
    roleSource: 'none'
  };

  const today = '2026-09-12';

  describe('GTD Routing', () => {
    it('routes raw capture tasks to GTD Inbox', () => {
      expect(getGTDSection({ ...baseTask }, today)).toBe('gtd-inbox');
    });

    it('routes prioritized or project tasks to Next Actions', () => {
      expect(getGTDSection({ ...baseTask, priority: 'highest' }, today)).toBe('gtd-next-actions');
      expect(getGTDSection({ ...baseTask, isProject: true }, today)).toBe('gtd-next-actions');
    });

    it('routes waiting tasks to Waiting For', () => {
      expect(getGTDSection({ ...baseTask, isWaiting: true }, today)).toBe('gtd-waiting');
    });

    it('routes scheduled tasks to Scheduled', () => {
      expect(getGTDSection({ ...baseTask, dueDate: '2026-09-20' }, today)).toBe('gtd-scheduled');
      expect(getGTDSection({ ...baseTask, scheduledDate: '2026-09-20' }, today)).toBe('gtd-scheduled');
    });

    it('routes someday tasks to Someday / Maybe', () => {
      expect(getGTDSection({ ...baseTask, isSomeday: true }, today)).toBe('gtd-someday');
    });

    it('routes completed tasks to Completed Today', () => {
      expect(getGTDSection({ ...baseTask, isCompleted: true, completedDate: today }, today)).toBe('gtd-completed');
      expect(getGTDSection({ ...baseTask, isCompleted: true, completedDate: '2026-09-10' }, today)).toBeNull();
    });
  });

  describe('Eisenhower Routing', () => {
    it('routes to Q1, Q2, Q3, Q4 based on priority', () => {
      expect(getEisenhowerSection({ ...baseTask, priority: 'highest' }, today)).toBe('eisen-q1');
      expect(getEisenhowerSection({ ...baseTask, priority: 'high' }, today)).toBe('eisen-q2');
      expect(getEisenhowerSection({ ...baseTask, priority: 'medium' }, today)).toBe('eisen-q3');
      expect(getEisenhowerSection({ ...baseTask, priority: 'low' }, today)).toBe('eisen-q4');
    });

    it('routes unprioritized tasks to Untriaged Inbox in Eisenhower mode', () => {
      expect(getEisenhowerSection({ ...baseTask, priority: 'none' }, today)).toBe('eisen-inbox');
    });
  });
});
