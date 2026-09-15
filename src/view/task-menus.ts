import { Menu } from 'obsidian';
import { getEisenhowerSection, getGTDSection } from '../parser';
import { EISENHOWER_SECTIONS, GTD_SECTIONS } from './types';
import type { ViewContext } from './types';
import type { RoleId, SectionId, TaskItem, TaskPriority } from '../types';

/** Priority picker shared by the card priority button and the action menu. */
export function showPriorityMenu(e: MouseEvent, task: TaskItem, ctx: ViewContext): void {
  const menu = new Menu();
  const priorities: { prio: TaskPriority; label: string }[] = [
    { prio: 'highest', label: 'Urgent & Important (Q1)' },
    { prio: 'high', label: 'Important (Q2)' },
    { prio: 'medium', label: 'Urgent (Q3)' },
    { prio: 'low', label: 'Low Priority (Q4)' },
    { prio: 'none', label: 'Untriaged (Inbox)' }
  ];

  for (const p of priorities) {
    menu.addItem((item) => {
      item.setTitle(p.label).onClick(async () => {
        await ctx.taskMutator.setPriority(task, p.prio);
      });
    });
  }

  menu.showAtMouseEvent(e);
}

/** "Move to column" picker for the active mode, with the current section checked. */
export function showMoveColumnMenu(e: MouseEvent, task: TaskItem, ctx: ViewContext): void {
  const menu = new Menu();
  const viewMode = ctx.getState().viewMode;
  const todayStr = ctx.getTodayDateString();
  const activeSections = viewMode === 'gtd' ? GTD_SECTIONS : EISENHOWER_SECTIONS;
  const currentSectionId =
    viewMode === 'gtd' ? getGTDSection(task, todayStr) : getEisenhowerSection(task, todayStr);

  for (const sec of activeSections) {
    menu.addItem((item) => {
      item
        .setTitle(sec.title)
        .setIcon(sec.icon)
        .setChecked(sec.id === currentSectionId)
        .onClick(async () => {
          if (sec.id !== currentSectionId) {
            await ctx.handleTaskDrop(task, sec.id);
          }
        });
    });
  }

  menu.showAtMouseEvent(e);
}

/** Full per-task action menu: completion, GTD moves, priority, role, open note. */
export function showTaskActionMenu(e: MouseEvent, task: TaskItem, ctx: ViewContext): void {
  const menu = new Menu();

  // 1. Completion toggle
  menu.addItem((item) => {
    item
      .setTitle(task.isCompleted ? 'Mark Incomplete' : 'Mark Complete')
      .setIcon(task.isCompleted ? 'circle' : 'check-circle')
      .onClick(async () => {
        await ctx.taskMutator.setCompletion(task, !task.isCompleted);
      });
  });

  menu.addSeparator();

  // 2. GTD state transitions
  const moves: { title: string; icon: string; section: SectionId }[] = [
    { title: 'Move to Next Actions', icon: 'zap', section: 'gtd-next-actions' },
    { title: 'Schedule (Set Today+10)', icon: 'calendar', section: 'gtd-scheduled' },
    { title: 'Mark as Waiting (#waiting)', icon: 'clock', section: 'gtd-waiting' },
    { title: 'Move to Someday / Maybe (#someday)', icon: 'archive', section: 'gtd-someday' },
    { title: 'Move to Inbox', icon: 'inbox', section: 'gtd-inbox' }
  ];
  for (const m of moves) {
    menu.addItem((item) => {
      item
        .setTitle(m.title)
        .setIcon(m.icon)
        .onClick(async () => {
          await ctx.handleTaskDrop(task, m.section);
        });
    });
  }

  menu.addSeparator();

  // 3. Priority picker
  menu.addItem((item) => {
    item
      .setTitle('Change Priority...')
      .setIcon('flag')
      .onClick(() => {
        showPriorityMenu(e, task, ctx);
      });
  });

  // 4. Role assignment
  const roles: { id: RoleId | null; label: string; icon: string }[] = [
    { id: 'role/yo-manager', label: 'Role: Yo Manager', icon: 'briefcase' },
    { id: 'role/josef-selfcare', label: 'Role: Josef Self-Care', icon: 'heart' },
    { id: 'role/rj-supportive', label: 'Role: RJ Supportive', icon: 'users' },
    { id: null, label: 'Role: Untagged / None', icon: 'tag' }
  ];
  for (const r of roles) {
    menu.addItem((item) => {
      item
        .setTitle(r.label)
        .setIcon(r.icon)
        .setChecked(task.effectiveRole === (r.id || 'untagged'))
        .onClick(async () => {
          await ctx.taskMutator.setRole(task, r.id);
        });
    });
  }

  menu.addSeparator();

  // 5. Open source note
  menu.addItem((item) => {
    item
      .setTitle(`Open Note (${task.fileName})`)
      .setIcon('file-text')
      .onClick(() => {
        void ctx.app.workspace.openLinkText(task.filePath, '', 'tab');
      });
  });

  menu.addSeparator();

  // 6. Delete task (removes the raw line from its source file)
  menu.addItem((item) => {
    item
      .setTitle('Delete task')
      .setIcon('trash')
      .onClick(async () => {
        await ctx.taskMutator.deleteTaskLine(task);
      });
  });

  menu.showAtMouseEvent(e);
}
