import { ItemView, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import { VaultScanner } from './vault-scanner';
import { TaskItem, TaskPriority, SectionId, SectionDefinition } from './types';
import { getTaskSection } from './parser';

export const VIEW_TYPE_GTD_MATRIX = 'gtd-matrix-tasks-view';

const SECTIONS: SectionDefinition[] = [
  {
    id: 'inbox',
    title: '📥 Inbox — Untriaged Tasks',
    subtitle: 'Tasks with no priority assigned yet. Triage or prioritize them.',
    badgeClass: 'badge-inbox',
    icon: 'inbox',
    targetPriority: 'none'
  },
  {
    id: 'q1-do',
    title: '🔴 Q1: Urgent & Important — Do First',
    subtitle: 'Crises, deadlines, and highest-impact commitments (⏫).',
    badgeClass: 'badge-q1',
    icon: 'alert-triangle',
    targetPriority: 'highest'
  },
  {
    id: 'q2-schedule',
    title: '🔵 Q2: Important, Not Urgent — Schedule & Focus',
    subtitle: 'Strategic goals, deep work, health, and skill building (🔼).',
    badgeClass: 'badge-q2',
    icon: 'compass',
    targetPriority: 'high'
  },
  {
    id: 'q3-delegate',
    title: '🟡 Q3: Urgent, Not Important — Delegate & Waiting',
    subtitle: 'Blocked or delegated tasks (🔽 or On Hold [?]).',
    badgeClass: 'badge-q3',
    icon: 'clock',
    targetPriority: 'medium'
  },
  {
    id: 'scheduled',
    title: '📅 Scheduled & Due This Week',
    subtitle: 'Tasks with due or scheduled dates within the next 7 days.',
    badgeClass: 'badge-scheduled',
    icon: 'calendar',
    targetPriority: 'none'
  },
  {
    id: 'q4-someday',
    title: '⚪ Q4: Not Urgent & Not Important — Someday / Maybe',
    subtitle: 'Low-priority backlog, deferred reading, or ideas (⏬).',
    badgeClass: 'badge-q4',
    icon: 'archive',
    targetPriority: 'low'
  },
  {
    id: 'completed-today',
    title: '✅ Log — Completed Today',
    subtitle: 'Tasks checked off today. Keep up the momentum!',
    badgeClass: 'badge-done',
    icon: 'check-circle',
    targetPriority: 'none'
  }
];

export class GTDMatrixView extends ItemView {
  private scanner: VaultScanner;
  private searchQuery = '';
  private selectedFolder = 'all';
  private unsubscribe: (() => void) | null = null;
  private collapsedSections: Set<SectionId> = new Set();

  constructor(leaf: WorkspaceLeaf, scanner: VaultScanner) {
    super(leaf);
    this.scanner = scanner;
  }

  getViewType(): string {
    return VIEW_TYPE_GTD_MATRIX;
  }

  getDisplayText(): string {
    return 'GTD Matrix Tasks';
  }

  getIcon(): string {
    return 'list-todo';
  }

  override onload(): void {
    super.onload();
    this.unsubscribe = this.scanner.onTasksUpdated(() => {
      this.render();
    });
    void this.scanner.scanVault().then(() => this.render());
  }

  async onOpen(): Promise<void> {
    if (!this.unsubscribe) {
      this.unsubscribe = this.scanner.onTasksUpdated(() => {
        this.render();
      });
    }

    // Initial scan
    await this.scanner.scanVault();
    this.render();
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass('gtd-matrix-view');

    const tasks = this.scanner.getTasks();
    const todayStr = this.scanner.getTodayDateString();

    // Render Toolbar
    this.renderToolbar(container, tasks);

    // Filter Tasks
    const filteredTasks = tasks.filter((t) => {
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        const matchesText = t.description.toLowerCase().includes(q);
        const matchesTag = t.tags.some((tag) => tag.toLowerCase().includes(q));
        const matchesFile = t.fileName.toLowerCase().includes(q);
        if (!matchesText && !matchesTag && !matchesFile) return false;
      }

      if (this.selectedFolder !== 'all') {
        const norm = t.filePath.replace(/\\/g, '/');
        if (!norm.startsWith(this.selectedFolder)) return false;
      }

      return true;
    });

    // Group tasks into sections
    const grouped = new Map<SectionId, TaskItem[]>();
    for (const sec of SECTIONS) {
      grouped.set(sec.id, []);
    }

    for (const task of filteredTasks) {
      const secId = getTaskSection(task, todayStr);
      if (secId) {
        grouped.get(secId)?.push(task);
      }
    }

    // Render Sections List
    const sectionsWrapper = container.createDiv({ cls: 'gtd-sections-wrapper' });

    for (const sec of SECTIONS) {
      const sectionTasks = grouped.get(sec.id) || [];
      this.renderSection(sectionsWrapper, sec, sectionTasks);
    }
  }

  private renderToolbar(container: HTMLElement, allTasks: TaskItem[]): void {
    const toolbar = container.createDiv({ cls: 'gtd-toolbar' });

    // Search bar
    const searchWrapper = toolbar.createDiv({ cls: 'gtd-search-wrapper' });
    const searchInput = searchWrapper.createEl('input', {
      type: 'text',
      cls: 'gtd-search-input',
      placeholder: 'Search tasks, tags, or notes...'
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.render();
    });

    // Folder Filter
    const folders = this.getUniqueFolders(allTasks);
    if (folders.length > 0) {
      const select = toolbar.createEl('select', { cls: 'gtd-folder-select' });
      const allOpt = select.createEl('option', { value: 'all', text: 'All Folders' });
      if (this.selectedFolder === 'all') allOpt.selected = true;

      for (const f of folders) {
        const opt = select.createEl('option', { value: f, text: f });
        if (this.selectedFolder === f) opt.selected = true;
      }

      select.addEventListener('change', () => {
        this.selectedFolder = select.value;
        this.render();
      });
    }

    // Refresh Button
    const refreshBtn = toolbar.createEl('button', {
      cls: 'gtd-btn-icon',
      attr: { 'aria-label': 'Refresh tasks' }
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', async () => {
      setIcon(refreshBtn, 'loader');
      await this.scanner.scanVault();
    });

    // Stats Pill
    const openCount = allTasks.filter((t) => !t.isCompleted).length;
    const doneCount = allTasks.filter((t) => t.isCompleted).length;
    const statsPill = toolbar.createDiv({ cls: 'gtd-stats-pill' });
    statsPill.setText(`${openCount} open · ${doneCount} done`);
  }

  private getUniqueFolders(tasks: TaskItem[]): string[] {
    const set = new Set<string>();
    for (const t of tasks) {
      const parts = t.filePath.replace(/\\/g, '/').split('/');
      if (parts.length > 1) {
        set.add(parts[0]);
      }
    }
    return Array.from(set).sort();
  }

  private renderSection(
    container: HTMLElement,
    sec: SectionDefinition,
    tasks: TaskItem[]
  ): void {
    const isCollapsed = this.collapsedSections.has(sec.id);
    const sectionEl = container.createDiv({
      cls: `gtd-section ${sec.badgeClass} ${isCollapsed ? 'collapsed' : ''}`
    });

    // Header
    const headerEl = sectionEl.createDiv({ cls: 'gtd-section-header' });

    const toggleIcon = headerEl.createSpan({ cls: 'gtd-toggle-icon' });
    setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

    const titleGroup = headerEl.createDiv({ cls: 'gtd-title-group' });
    const titleEl = titleGroup.createSpan({ cls: 'gtd-section-title', text: sec.title });
    const countBadge = titleGroup.createSpan({
      cls: 'gtd-count-badge',
      text: String(tasks.length)
    });

    const subtitleEl = headerEl.createDiv({
      cls: 'gtd-section-subtitle',
      text: sec.subtitle
    });

    // Click header to collapse / expand
    headerEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      if (this.collapsedSections.has(sec.id)) {
        this.collapsedSections.delete(sec.id);
      } else {
        this.collapsedSections.add(sec.id);
      }
      this.render();
    });

    // Drag-and-Drop on Section
    sectionEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      sectionEl.addClass('gtd-drag-over');
    });

    sectionEl.addEventListener('dragleave', () => {
      sectionEl.removeClass('gtd-drag-over');
    });

    sectionEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      sectionEl.removeClass('gtd-drag-over');

      const taskId = e.dataTransfer?.getData('text/plain');
      if (!taskId) return;

      const task = this.scanner.getTasks().find((t) => t.id === taskId);
      if (!task) return;

      await this.handleTaskDrop(task, sec.id);
    });

    // Body
    if (!isCollapsed) {
      const bodyEl = sectionEl.createDiv({ cls: 'gtd-section-body' });

      if (tasks.length === 0) {
        bodyEl.createDiv({
          cls: 'gtd-empty-state',
          text: 'No tasks here. Drop a task or add one below.'
        });
      } else {
        // Sort tasks: Due date first, then priority, then note name
        const sorted = [...tasks].sort((a, b) => {
          if (a.dueDate && b.dueDate) {
            return a.dueDate.localeCompare(b.dueDate);
          }
          if (a.dueDate && !b.dueDate) return -1;
          if (!a.dueDate && b.dueDate) return 1;
          return a.fileName.localeCompare(b.fileName);
        });

        for (const task of sorted) {
          this.renderTaskItem(bodyEl, task);
        }
      }

      // Quick-add input row
      this.renderQuickAddRow(bodyEl, sec.id);
    }
  }

  private renderTaskItem(container: HTMLElement, task: TaskItem): void {
    const itemEl = container.createDiv({
      cls: `gtd-task-item ${task.isCompleted ? 'is-completed' : ''}`
    });

    // HTML5 Drag and Drop
    itemEl.draggable = true;
    itemEl.addEventListener('dragstart', (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }
      itemEl.addClass('is-dragging');
    });

    itemEl.addEventListener('dragend', () => {
      itemEl.removeClass('is-dragging');
    });

    // Checkbox
    const checkbox = itemEl.createEl('input', {
      type: 'checkbox',
      cls: 'gtd-checkbox'
    });
    checkbox.checked = task.isCompleted;
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      await this.scanner.setCompletion(task, checkbox.checked);
    });

    // Priority badge
    const priorityBtn = itemEl.createEl('button', {
      cls: `gtd-priority-badge priority-${task.priority}`,
      attr: { 'aria-label': 'Click to change priority' }
    });
    priorityBtn.setText(this.getPriorityLabel(task.priority));
    priorityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPriorityMenu(e, task);
    });

    // Description (inline editable)
    const descEl = itemEl.createDiv({ cls: 'gtd-task-desc' });
    descEl.setText(task.description || '(No description)');
    descEl.title = 'Click to edit description';

    descEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.makeEditable(descEl, task);
    });

    // Meta row (Date + Note link)
    const metaEl = itemEl.createDiv({ cls: 'gtd-task-meta' });

    // Date pill
    if (task.dueDate) {
      const today = this.scanner.getTodayDateString();
      const isOverdue = !task.isCompleted && task.dueDate < today;
      const isToday = task.dueDate === today;

      const datePill = metaEl.createEl('button', {
        cls: `gtd-date-pill ${isOverdue ? 'is-overdue' : ''} ${isToday ? 'is-today' : ''}`,
        text: `📅 ${task.dueDate}`
      });
      datePill.title = 'Click to change due date';
      datePill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showDatePicker(datePill, task);
      });
    } else {
      const addDateBtn = metaEl.createEl('button', {
        cls: 'gtd-date-pill gtd-date-add',
        text: '+ Date'
      });
      addDateBtn.title = 'Add due date';
      addDateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showDatePicker(addDateBtn, task);
      });
    }

    // Origin note link
    const fileLink = metaEl.createEl('a', {
      cls: 'gtd-file-link',
      text: `[[${task.fileName}]]`
    });
    fileLink.title = `Open ${task.filePath}`;
    fileLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.app.workspace.openLinkText(task.filePath, '', false);
    });
  }

  private renderQuickAddRow(container: HTMLElement, secId: SectionId): void {
    const quickAddEl = container.createDiv({ cls: 'gtd-quick-add-row' });
    const input = quickAddEl.createEl('input', {
      type: 'text',
      cls: 'gtd-quick-add-input',
      placeholder: '+ Add task (press Enter)...'
    });

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const text = input.value.trim();
        input.value = '';
        await this.scanner.quickAddTask(secId, text);
      }
    });
  }

  private makeEditable(descEl: HTMLElement, task: TaskItem): void {
    const originalText = task.description;
    const input = createEl('input', {
      type: 'text',
      cls: 'gtd-desc-inline-input',
      value: originalText
    });

    descEl.empty();
    descEl.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const save = async () => {
      if (committed) return;
      committed = true;
      const newText = input.value.trim();
      if (newText && newText !== originalText) {
        await this.scanner.setDescription(task, newText);
      } else {
        descEl.setText(originalText);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        save();
      } else if (e.key === 'Escape') {
        committed = true;
        descEl.setText(originalText);
      }
    });

    input.addEventListener('blur', save);
  }

  private showPriorityMenu(e: MouseEvent, task: TaskItem): void {
    const menu = new Menu();
    const priorities: { prio: TaskPriority; label: string }[] = [
      { prio: 'highest', label: '🔺 Highest (Q1 Do)' },
      { prio: 'high', label: '⏫ High (Q2 Schedule)' },
      { prio: 'medium', label: '🔼 Medium (Q3 Delegate)' },
      { prio: 'low', label: '🔽 Low (Q4 Someday)' },
      { prio: 'none', label: '⚪ None (Inbox)' }
    ];

    for (const p of priorities) {
      menu.addItem((item) => {
        item.setTitle(p.label).onClick(async () => {
          await this.scanner.setPriority(task, p.prio);
        });
      });
    }

    menu.showAtMouseEvent(e);
  }

  private showDatePicker(anchor: HTMLElement, task: TaskItem): void {
    const popover = createDiv({ cls: 'gtd-date-popover' });
    const dateInput = popover.createEl('input', {
      type: 'date',
      cls: 'gtd-date-input',
      value: task.dueDate || this.scanner.getTodayDateString()
    });

    const clearBtn = popover.createEl('button', {
      cls: 'gtd-btn-sm',
      text: 'Clear'
    });

    anchor.parentElement?.appendChild(popover);
    dateInput.focus();

    dateInput.addEventListener('change', async () => {
      await this.scanner.setDueDate(task, dateInput.value || null);
      popover.remove();
    });

    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.scanner.setDueDate(task, null);
      popover.remove();
    });

    popover.addEventListener('mouseleave', () => {
      popover.remove();
    });
  }

  private async handleTaskDrop(task: TaskItem, targetSection: SectionId): Promise<void> {
    switch (targetSection) {
      case 'inbox':
        await this.scanner.setPriority(task, 'none');
        break;
      case 'q1-do':
        await this.scanner.setPriority(task, 'highest');
        break;
      case 'q2-schedule':
        await this.scanner.setPriority(task, 'high');
        break;
      case 'q3-delegate':
        await this.scanner.setPriority(task, 'medium');
        break;
      case 'q4-someday':
        await this.scanner.setPriority(task, 'low');
        break;
      case 'scheduled':
        if (!task.dueDate) {
          await this.scanner.setDueDate(task, this.scanner.getTodayDateString());
        }
        break;
      case 'completed-today':
        await this.scanner.setCompletion(task, true);
        break;
    }
  }

  private getPriorityLabel(prio: TaskPriority): string {
    switch (prio) {
      case 'highest':
        return '⏫ Q1';
      case 'high':
        return '🔼 Q2';
      case 'medium':
        return '🔽 Q3';
      case 'low':
      case 'lowest':
        return '⏬ Q4';
      default:
        return '⚪';
    }
  }
}
