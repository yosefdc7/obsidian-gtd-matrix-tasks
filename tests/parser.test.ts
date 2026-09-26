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
  setTaskStartDate,
  getGTDSection,
  getEisenhowerSection
} from '../src/parser';
import { TaskItem } from '../src/types';

describe('Task Parser', () => {
  it('hides UUID metadata from the description and preserves it when renaming', () => {
    const line = '- [ ] Buy milk 🛫 2026-09-22 <!-- {"uuid":"123e4567-e89b-12d3-a456-426614174000"} -->';
    const parsed = parseTaskLine(line, 'note.md', 0);
    expect(parsed?.description).toBe('Buy milk');
    expect(setTaskDescription(line, 'Buy oat milk')).toBe(
      '- [ ] Buy oat milk 🛫 2026-09-22 <!-- {"uuid":"123e4567-e89b-12d3-a456-426614174000"} -->'
    );
  });

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

  it('sets, replaces, and clears start date on task line', () => {
    const line = '- [ ] Prepare quarterly review';
    const start = setTaskStartDate(line, '2026-09-17');
    expect(start).toBe('- [ ] Prepare quarterly review 🛫 2026-09-17');

    const updated = setTaskStartDate(start, '2026-09-19');
    expect(updated).toBe('- [ ] Prepare quarterly review 🛫 2026-09-19');

    const cleared = setTaskStartDate(updated, null);
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

  describe('File Task Hierarchy & Child Notes Parser', () => {
    it('parses child notes indented under parent task', () => {
      const { parseFileTasks } = require('../src/parser');
      const lines = [
        '- [ ] Call Diana 📅 2026-09-26',
        '    - Ask about baby formula',
        '    - Check delivery status of crib',
        '- [ ] Another task'
      ];
      const tasks = parseFileTasks(lines, 'Jots/2026/Sep/Sep 26 2026.md');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].description).toBe('Call Diana');
      expect(tasks[0].childNotes).toBe('- Ask about baby formula\n- Check delivery status of crib');
      expect(tasks[1].description).toBe('Another task');
      expect(tasks[1].childNotes).toBeUndefined();
    });

    it('identifies child checkboxes as subtasks with parentTaskId and parentLineNumber', () => {
      const { parseFileTasks } = require('../src/parser');
      const lines = [
        '- [ ] Parent Project Plan',
        '    - Context note',
        '    - [ ] Export architecture diagrams',
        '    - [ ] Review with team',
        '- [ ] Sibling task'
      ];
      const tasks = parseFileTasks(lines, 'Project.md');
      expect(tasks).toHaveLength(4);

      const parent = tasks[0];
      const child1 = tasks[1];
      const child2 = tasks[2];
      const sibling = tasks[3];

      expect(parent.description).toBe('Parent Project Plan');
      expect(parent.childNotes).toBe('- Context note');
      expect(parent.parentTaskId).toBeUndefined();

      expect(child1.description).toBe('Export architecture diagrams');
      expect(child1.parentTaskId).toBe('Project.md:0');
      expect(child1.parentLineNumber).toBe(0);

      expect(child2.description).toBe('Review with team');
      expect(child2.parentTaskId).toBe('Project.md:0');
      expect(child2.parentLineNumber).toBe(0);

      expect(sibling.description).toBe('Sibling task');
      expect(sibling.parentTaskId).toBeUndefined();
    });

    it('resets outline stack on markdown headings', () => {
      const { parseFileTasks } = require('../src/parser');
      const lines = [
        '- [ ] Task above heading',
        '## Next Section',
        '    - [ ] Task below heading'
      ];
      const tasks = parseFileTasks(lines, 'Test.md');
      expect(tasks).toHaveLength(2);
      expect(tasks[1].parentTaskId).toBeUndefined();
    });
  });
});
