import { MarkdownRenderer, setIcon } from 'obsidian';
import { showCalendarPicker } from './calendar-picker';
import { showMoveColumnMenu, showPriorityMenu, showStatusMenu, showTaskActionMenu } from './task-menus';
import type { ViewContext } from './types';
import type { TaskItem, TaskPriority } from '../types';
import { formatRoleLabel, getRoleColor } from '../parser';

function getPriorityLabel(prio: TaskPriority): string {
  switch (prio) {
    case 'highest':
      return 'Urgent · Important';
    case 'high':
      return 'Important';
    case 'medium':
      return 'Urgent';
    case 'low':
    case 'lowest':
      return 'Low Priority';
    default:
      return '+ Priority';
  }
}

/** Kanban board card with drag handle, checkbox, priority badge and action buttons. */
export function renderBoardCard(container: HTMLElement, task: TaskItem, ctx: ViewContext): void {
  const today = ctx.getTodayDateString();
  const card = container.createDiv({
    cls: `gtd-board-card ${task.isCompleted ? 'is-completed' : ''} ${task.isProject ? 'is-project-task' : ''}`
  });

  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
    }
    card.addClass('is-dragging');
  });
  card.addEventListener('dragend', () => card.removeClass('is-dragging'));

  // Top row: checkbox + priority badge + action menu button
  const topRow = card.createDiv({ cls: 'gtd-board-card-top' });
  const checkbox = topRow.createEl('input', { type: 'checkbox', cls: 'gtd-checkbox' });
  checkbox.checked = task.isCompleted;
  checkbox.addEventListener('change', async (e) => {
    e.stopPropagation();
    await ctx.taskMutator.setCompletion(task, checkbox.checked);
  });

  const priorityBtn = topRow.createEl('button', {
    cls: `gtd-priority-badge priority-${task.priority}`,
    attr: { 'aria-label': `Priority: ${getPriorityLabel(task.priority)} — click to change` }
  });
  setIcon(priorityBtn, 'arrow-up-down');
  priorityBtn.title = `Priority: ${getPriorityLabel(task.priority)}`;
  priorityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showPriorityMenu(e, task, ctx);
  });

  const moveColBtn = topRow.createEl('button', {
    cls: 'gtd-move-col-btn',
    attr: { 'aria-label': 'Move to column' }
  });
  setIcon(moveColBtn, 'columns');
  moveColBtn.title = 'Move task to column';
  moveColBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showMoveColumnMenu(e, task, ctx);
  });

  const actionBtn = topRow.createEl('button', {
    cls: 'gtd-card-action-btn',
    attr: { 'aria-label': 'Task actions' }
  });
  setIcon(actionBtn, 'more-horizontal');
  actionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showTaskActionMenu(e, task, ctx);
  });

  // Description
  const descEl = card.createDiv({ cls: 'gtd-board-card-desc' });
  if (task.description) {
    void MarkdownRenderer.render(ctx.app, task.description, descEl, task.filePath, ctx.component);
  } else {
    descEl.setText('(No description)');
  }
  descEl.addEventListener('click', (e) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
      const href = anchor.getAttribute('data-href') || anchor.getAttribute('href');
      if (!href) return;
      const isExternal = /^(https?:|\/\/)/.test(href);
      if (isExternal) window.open(href, '_blank');
      else void ctx.app.workspace.openLinkText(href, task.filePath, 'tab');
      return;
    }
    e.stopPropagation();
    makeEditable(descEl, task, ctx);
  });

  // Meta row: dates + source file + role badge
  const metaEl = card.createDiv({ cls: 'gtd-board-card-meta' });

  // Role badge
  if (task.effectiveRole && task.effectiveRole !== 'untagged') {
    const roleColor = getRoleColor(task.effectiveRole);
    const roleBadge = metaEl.createSpan({
      cls: `gtd-role-badge badge-${task.effectiveRole.replace('/', '-')}`,
      text: formatRoleLabel(task.effectiveRole)
    });
    roleBadge.style.setProperty('--role-color', roleColor);
    roleBadge.addClass('has-custom-color');
    roleBadge.title = `Role source: ${task.roleSource}`;
  }

  if (task.scheduledDate) {
    const isOverdue = !task.isCompleted && task.scheduledDate < today;
    metaEl.createEl('button', {
      cls: `gtd-date-pill gtd-date-scheduled ${isOverdue ? 'is-overdue' : ''}`,
      text: `⏳ ${task.scheduledDate}`
    }).addEventListener('click', (e) => { e.stopPropagation(); showScheduledDatePicker(e.target as HTMLElement, task, ctx); });
  }
  if (task.dueDate) {
    const isOverdue = !task.isCompleted && task.dueDate < today;
    metaEl.createEl('button', {
      cls: `gtd-date-pill gtd-date-due ${isOverdue ? 'is-overdue' : ''}`,
      text: `📅 ${task.dueDate}`
    }).addEventListener('click', (e) => { e.stopPropagation(); showDueDatePicker(e.target as HTMLElement, task, ctx); });
  }
  if (task.startDate) {
    metaEl.createEl('button', {
      cls: 'gtd-date-pill gtd-date-start',
      text: `🛫 ${task.startDate}`
    }).addEventListener('click', (e) => { e.stopPropagation(); showStartDatePicker(e.target as HTMLElement, task, ctx); });
  }

  const fileLink = metaEl.createEl('a', {
    cls: `gtd-file-link ${task.isProject ? 'is-project-link' : ''}`,
    text: task.isProject ? `📂 ${task.fileName}` : `[[${task.fileName}]]`
  });
  fileLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void ctx.app.workspace.openLinkText(task.filePath, '', 'tab');
  });
}

/** Stream list row: check circle, title, meta chips and a hover action cluster. */
export function renderTaskItem(container: HTMLElement, task: TaskItem, ctx: ViewContext): void {
  const itemEl = container.createDiv({
    cls: `gtd-task-item ${task.isCompleted ? 'is-completed' : ''} ${task.isProject ? 'is-project-task' : ''}`
  });

  itemEl.draggable = true;
  itemEl.addEventListener('dragstart', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button') || target.closest('input') || target.closest('.gtd-desc-inline-input')) {
      e.preventDefault();
      return;
    }
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
    }
    itemEl.addClass('is-dragging');
  });

  itemEl.addEventListener('dragend', () => {
    itemEl.removeClass('is-dragging');
  });

  // Circular status button: plain click = complete/uncomplete; Ctrl+click = status picker
  const checkBtn = itemEl.createEl('button', {
    cls: `gtd-row-check ${task.isCompleted ? 'is-checked' : ''}`,
    attr: { 'aria-label': task.isCompleted ? 'Mark incomplete (Ctrl+click for status menu)' : 'Complete task (Ctrl+click for status menu)' }
  });
  // Completed → filled check icon; Uncompleted → CSS ring only (no icon needed)
  if (task.isCompleted) setIcon(checkBtn, 'check');
  checkBtn.title = task.isCompleted
    ? 'Click to uncomplete · Ctrl+click for status menu'
    : 'Click to complete · Ctrl+click for status menu';
  checkBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      showStatusMenu(e, task, ctx);
    } else {
      await ctx.taskMutator.setCompletion(task, !task.isCompleted);
    }
  });

  // Body: title + meta chips
  const bodyEl = itemEl.createDiv({ cls: 'gtd-row-body' });

  // Description (rendered markdown with smart click routing)
  const descEl = bodyEl.createDiv({ cls: 'gtd-task-desc' });
  if (task.description) {
    void MarkdownRenderer.render(ctx.app, task.description, descEl, task.filePath, ctx.component);
  } else {
    descEl.setText('(No description)');
  }
  descEl.title = 'Click to edit description (or click links to open in a new tab)';

  descEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();

      const href = anchor.getAttribute('data-href') || anchor.getAttribute('href');
      if (!href) return;

      const isExternal = anchor.classList.contains('external-link') || /^(https?:|\/\/)/i.test(href);
      if (isExternal) {
        window.open(href, '_blank');
      } else {
        void ctx.app.workspace.openLinkText(href, task.filePath, 'tab');
      }
      return;
    }

    e.stopPropagation();
    makeEditable(descEl, task, ctx);
  });

  descEl.addEventListener('mouseover', (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('data-href') || anchor.getAttribute('href');
      const isExternal = anchor.classList.contains('external-link') || (href ? /^(https?:|\/\/)/i.test(href) : false);
      if (href && !isExternal) {
        ctx.app.workspace.trigger('hover-link', {
          event,
          source: 'gtd-matrix-tasks',
          hoverParent: descEl,
          targetEl: anchor,
          linktext: href,
          sourcePath: task.filePath
        });
      }
    }
  });

  // Meta row (Scheduled Date + Due Date + Project badge / Note link)
  const metaEl = bodyEl.createDiv({ cls: 'gtd-task-meta' });
  const today = ctx.getTodayDateString();

  // 1. Scheduled Date Pill (⏳ Primary)
  if (task.scheduledDate) {
    const isOverdue = !task.isCompleted && task.scheduledDate < today;
    const isToday = task.scheduledDate === today;

    const schedPill = metaEl.createEl('button', {
      cls: `gtd-date-pill gtd-date-scheduled ${isOverdue ? 'is-overdue' : ''} ${isToday ? 'is-today' : ''}`,
      text: `⏳ ${task.scheduledDate}`
    });
    schedPill.title = 'Click to change scheduled date';
    schedPill.addEventListener('click', (e) => {
      e.stopPropagation();
      showScheduledDatePicker(schedPill, task, ctx);
    });
  }

  // 2. Due Date Pill (📅 if present)
  if (task.dueDate) {
    const isOverdue = !task.isCompleted && task.dueDate < today;
    const isToday = task.dueDate === today;

    const duePill = metaEl.createEl('button', {
      cls: `gtd-date-pill gtd-date-due ${isOverdue ? 'is-overdue' : ''} ${isToday ? 'is-today' : ''}`,
      text: `📅 ${task.dueDate}`
    });
    duePill.title = 'Click to change due date';
    duePill.addEventListener('click', (e) => {
      e.stopPropagation();
      showDueDatePicker(duePill, task, ctx);
    });
  }

  // 3. Start Date Pill (🛫 if present)
  if (task.startDate) {
    const startPill = metaEl.createEl('button', {
      cls: 'gtd-date-pill gtd-date-start',
      text: `🛫 ${task.startDate}`
    });
    startPill.title = 'Click to change start date';
    startPill.addEventListener('click', (e) => {
      e.stopPropagation();
      showStartDatePicker(startPill, task, ctx);
    });
  }

  // Priority chip (icon-only; color and tooltip carry the level)
  const priorityBtn = metaEl.createEl('button', {
    cls: `gtd-priority-badge priority-${task.priority}`,
    attr: { 'aria-label': `Priority: ${getPriorityLabel(task.priority)} — click to change` }
  });
  setIcon(priorityBtn, 'arrow-up-down');
  priorityBtn.title = `Priority: ${getPriorityLabel(task.priority)}`;
  priorityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showPriorityMenu(e, task, ctx);
  });

  // Origin note / Project link
  const fileLink = metaEl.createEl('a', {
    cls: `gtd-file-link ${task.isProject ? 'is-project-link' : ''}`,
    text: task.isProject ? `📂 ${task.fileName}` : `[[${task.fileName}]]`
  });
  fileLink.title = `Open ${task.filePath} in a new tab`;
  fileLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void ctx.app.workspace.openLinkText(task.filePath, '', 'tab');
  });
  fileLink.addEventListener('mouseover', (event: MouseEvent) => {
    ctx.app.workspace.trigger('hover-link', {
      event,
      source: 'gtd-matrix-tasks',
      hoverParent: metaEl,
      targetEl: fileLink,
      linktext: task.filePath,
      sourcePath: ''
    });
  });

  // Role dot chip
  if (task.effectiveRole && task.effectiveRole !== 'untagged') {
    const roleColor = getRoleColor(task.effectiveRole);
    const roleBadge = metaEl.createSpan({
      cls: `gtd-role-badge badge-${task.effectiveRole.replace('/', '-')}`
    });
    roleBadge.style.setProperty('--role-color', roleColor);
    roleBadge.addClass('has-custom-color');
    const dot = roleBadge.createSpan({ cls: 'gtd-role-dot' });
    dot.style.backgroundColor = roleColor;
    roleBadge.createSpan({
      cls: 'gtd-role-label',
      text: formatRoleLabel(task.effectiveRole)
    });
    roleBadge.title = `Role source: ${task.roleSource}`;
  }

  // Hover action cluster: schedule, move-to-column, more menu
  const actionsEl = itemEl.createDiv({ cls: 'gtd-row-actions' });

  const scheduleBtn = actionsEl.createEl('button', {
    cls: 'gtd-row-action-btn',
    attr: { 'aria-label': 'Schedule' }
  });
  setIcon(scheduleBtn, 'calendar');
  scheduleBtn.title = 'Schedule task';
  scheduleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showScheduledDatePicker(scheduleBtn, task, ctx);
  });

  const moveColBtn = actionsEl.createEl('button', {
    cls: 'gtd-row-action-btn',
    attr: { 'aria-label': 'Move to column' }
  });
  setIcon(moveColBtn, 'columns');
  moveColBtn.title = 'Move task to column';
  moveColBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showMoveColumnMenu(e, task, ctx);
  });

  const actionBtn = actionsEl.createEl('button', {
    cls: 'gtd-row-action-btn',
    attr: { 'aria-label': 'Task actions' }
  });
  setIcon(actionBtn, 'more-horizontal');
  actionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showTaskActionMenu(e, task, ctx);
  });
}

function makeEditable(descEl: HTMLElement, task: TaskItem, ctx: ViewContext): void {
  if (descEl.querySelector('input')) return;

  const originalText = task.description;
  const input = createEl('input', {
    type: 'text',
    cls: 'gtd-desc-inline-input',
    value: originalText
  });

  descEl.innerHTML = '';
  descEl.appendChild(input);
  input.focus();
  input.select();

  const restoreStatic = () => {
    descEl.innerHTML = '';
    if (originalText) {
      void MarkdownRenderer.render(ctx.app, originalText, descEl, task.filePath, ctx.component);
    } else {
      descEl.setText('(No description)');
    }
  };

  let committed = false;
  const save = async () => {
    if (committed) return;
    committed = true;
    const newText = input.value.trim();
    if (newText && newText !== originalText) {
      await ctx.taskMutator.setDescription(task, newText);
    } else {
      restoreStatic();
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      save();
    } else if (e.key === 'Escape') {
      committed = true;
      restoreStatic();
    }
  });

  input.addEventListener('blur', save);
}

function showScheduledDatePicker(anchor: HTMLElement, task: TaskItem, ctx: ViewContext): void {
  showCalendarPicker(anchor, {
    currentDate: task.scheduledDate,
    todayDate: ctx.getTodayDateString(),
    onSelect: async (date) => {
      await ctx.taskMutator.setScheduledDate(task, date);
    }
  });
}

function showDueDatePicker(anchor: HTMLElement, task: TaskItem, ctx: ViewContext): void {
  showCalendarPicker(anchor, {
    currentDate: task.dueDate,
    todayDate: ctx.getTodayDateString(),
    onSelect: async (date) => {
      await ctx.taskMutator.setDueDate(task, date);
    }
  });
}

function showStartDatePicker(anchor: HTMLElement, task: TaskItem, ctx: ViewContext): void {
  showCalendarPicker(anchor, {
    currentDate: task.startDate,
    todayDate: ctx.getTodayDateString(),
    onSelect: async (date) => {
      await ctx.taskMutator.setStartDate(task, date);
    }
  });
}
