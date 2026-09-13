import { ItemView, WorkspaceLeaf, setIcon, Menu, MarkdownRenderer } from 'obsidian';
import { VaultScanner } from './vault-scanner';
import { TaskItem, TaskPriority, SectionId, SectionDefinition, ViewMode, LayoutMode, PluginSettings } from './types';
import { getGTDSection, getEisenhowerSection } from './parser';

export const VIEW_TYPE_GTD_MATRIX = 'gtd-matrix-tasks-view';

const GTD_SECTIONS: SectionDefinition[] = [
  {
    id: 'gtd-inbox',
    title: 'Inbox — Capture',
    subtitle: 'Raw unprocessed capture items and daily note jots.',
    badgeClass: 'badge-inbox',
    icon: 'inbox'
  },
  {
    id: 'gtd-next-actions',
    title: 'Next Actions — Ready to Do',
    subtitle: 'Clarified actionable steps ready to execute now.',
    badgeClass: 'badge-next-actions',
    icon: 'zap'
  },
  {
    id: 'gtd-waiting',
    title: 'Waiting For — Blocked & Delegated',
    subtitle: 'Tasks on hold [?] or awaiting someone else (#waiting).',
    badgeClass: 'badge-q3',
    icon: 'clock'
  },
  {
    id: 'gtd-scheduled',
    title: 'Scheduled — Calendar & Deadlines',
    subtitle: 'Commitments due or scheduled in the next 7 days.',
    badgeClass: 'badge-scheduled',
    icon: 'calendar'
  },
  {
    id: 'gtd-someday',
    title: 'Someday / Maybe — Incubating Backlog',
    subtitle: 'Ideas, aspirational projects, and deferred backlog.',
    badgeClass: 'badge-q4',
    icon: 'archive'
  },
  {
    id: 'gtd-completed',
    title: 'Completed Today',
    subtitle: 'Tasks checked off today. Celebrate your momentum!',
    badgeClass: 'badge-done',
    icon: 'check-circle'
  }
];

const EISENHOWER_SECTIONS: SectionDefinition[] = [
  {
    id: 'eisen-q1',
    title: 'Q1: Urgent & Important — Do First',
    subtitle: 'Crises, pressing deadlines, and top priorities.',
    badgeClass: 'badge-q1',
    icon: 'alert-triangle'
  },
  {
    id: 'eisen-q2',
    title: 'Q2: Important — Schedule & Focus',
    subtitle: 'Strategic work, planning, health, and skill building.',
    badgeClass: 'badge-q2',
    icon: 'compass'
  },
  {
    id: 'eisen-q3',
    title: 'Q3: Urgent — Delegate & Waiting',
    subtitle: 'Interruptions, delegated items, and on-hold tasks.',
    badgeClass: 'badge-q3',
    icon: 'clock'
  },
  {
    id: 'eisen-q4',
    title: 'Q4: Low Priority — Someday / Eliminate',
    subtitle: 'Low-value backlog, distractions, and deferred items.',
    badgeClass: 'badge-q4',
    icon: 'archive'
  },
  {
    id: 'eisen-inbox',
    title: 'Inbox — Untriaged Tasks',
    subtitle: 'Tasks without a priority level assigned yet.',
    badgeClass: 'badge-inbox',
    icon: 'inbox'
  },
  {
    id: 'eisen-completed',
    title: 'Completed Today',
    subtitle: 'Tasks checked off today.',
    badgeClass: 'badge-done',
    icon: 'check-circle'
  }
];

export class GTDMatrixView extends ItemView {
  private scanner: VaultScanner;
  private viewMode: ViewMode = 'gtd';
  private layoutMode: LayoutMode = 'board';
  private searchQuery = '';
  private activeChip: 'all' | 'urgent' | 'important' | 'projects' = 'all';
  private selectedFolder = 'all';
  private unsubscribe: (() => void) | null = null;
  private collapsedSections: Set<SectionId> = new Set();

  constructor(leaf: WorkspaceLeaf, scanner: VaultScanner, settings?: PluginSettings) {
    super(leaf);
    this.scanner = scanner;
    if (settings) {
      this.layoutMode = settings.defaultLayoutMode;
      this.viewMode = settings.defaultViewMode;
    }
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
    if (this.scanner.getTasks().length === 0) {
      void this.scanner.scanVault().then(() => this.render());
    } else {
      this.render();
    }
  }

  async onOpen(): Promise<void> {
    if (!this.unsubscribe) {
      this.unsubscribe = this.scanner.onTasksUpdated(() => {
        this.render();
      });
    }

    if (this.scanner.getTasks().length === 0) {
      await this.scanner.scanVault();
    }
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

    // Render Toolbar (Mode Switcher, Layout Toggle, Search, Quick Chips, Folder, Refresh)
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

      // Quick Chips Filter
      if (this.activeChip === 'urgent') {
        if (t.priority !== 'highest' && t.priority !== 'medium') return false;
      } else if (this.activeChip === 'important') {
        if (t.priority !== 'highest' && t.priority !== 'high') return false;
      } else if (this.activeChip === 'projects') {
        if (!t.isProject) return false;
      }

      return true;
    });

    // Group tasks according to active View Mode
    const activeSections = this.viewMode === 'gtd' ? GTD_SECTIONS : EISENHOWER_SECTIONS;
    const grouped = new Map<SectionId, TaskItem[]>();
    for (const sec of activeSections) {
      grouped.set(sec.id, []);
    }

    for (const task of filteredTasks) {
      const secId =
        this.viewMode === 'gtd'
          ? getGTDSection(task, todayStr)
          : getEisenhowerSection(task, todayStr);

      if (secId) {
        grouped.get(secId)?.push(task);
      }
    }

    // Render Board or List
    if (this.layoutMode === 'board') {
      this.renderBoard(container, activeSections, grouped);
    } else {
      const sectionsWrapper = container.createDiv({ cls: 'gtd-sections-wrapper' });
      for (const sec of activeSections) {
        const sectionTasks = grouped.get(sec.id) || [];
        this.renderSection(sectionsWrapper, sec, sectionTasks);
      }
    }
  }

  private renderToolbar(container: HTMLElement, allTasks: TaskItem[]): void {
    const toolbar = container.createDiv({ cls: 'gtd-toolbar' });

    // Mode Switcher Segmented Control
    const modeGroup = toolbar.createDiv({ cls: 'gtd-mode-switcher' });
    const gtdBtn = modeGroup.createEl('button', {
      cls: `gtd-mode-btn ${this.viewMode === 'gtd' ? 'is-active' : ''}`,
      text: 'GTD Workflow'
    });
    gtdBtn.addEventListener('click', () => {
      if (this.viewMode !== 'gtd') {
        this.viewMode = 'gtd';
        this.render();
      }
    });

    const eisenBtn = modeGroup.createEl('button', {
      cls: `gtd-mode-btn ${this.viewMode === 'eisenhower' ? 'is-active' : ''}`,
      text: 'Eisenhower Matrix'
    });
    eisenBtn.addEventListener('click', () => {
      if (this.viewMode !== 'eisenhower') {
        this.viewMode = 'eisenhower';
        this.render();
      }
    });

    // Layout Toggle (Board / List)
    const layoutGroup = toolbar.createDiv({ cls: 'gtd-layout-switcher' });
    const boardBtn = layoutGroup.createEl('button', {
      cls: `gtd-layout-btn ${this.layoutMode === 'board' ? 'is-active' : ''}`,
      attr: { 'aria-label': 'Board view' }
    });
    setIcon(boardBtn, 'layout-dashboard');
    boardBtn.addEventListener('click', () => {
      if (this.layoutMode !== 'board') {
        this.layoutMode = 'board';
        this.render();
      }
    });
    const listBtn = layoutGroup.createEl('button', {
      cls: `gtd-layout-btn ${this.layoutMode === 'list' ? 'is-active' : ''}`,
      attr: { 'aria-label': 'List view' }
    });
    setIcon(listBtn, 'list');
    listBtn.addEventListener('click', () => {
      if (this.layoutMode !== 'list') {
        this.layoutMode = 'list';
        this.render();
      }
    });

    // Search bar
    const searchWrapper = toolbar.createDiv({ cls: 'gtd-search-wrapper' });
    const searchInput = searchWrapper.createEl('input', {
      type: 'text',
      cls: 'gtd-search-input',
      placeholder: 'Search tasks, tags, projects...'
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.render();
    });

    // Quick Filter Chips Row
    const chipsWrapper = toolbar.createDiv({ cls: 'gtd-chips-wrapper' });
    const chips: { id: 'all' | 'urgent' | 'important' | 'projects'; label: string }[] = [
      { id: 'all', label: 'All' },
      { id: 'urgent', label: 'Urgent' },
      { id: 'important', label: 'Important' },
      { id: 'projects', label: 'Projects' }
    ];

    for (const chip of chips) {
      const chipBtn = chipsWrapper.createEl('button', {
        cls: `gtd-chip-btn ${this.activeChip === chip.id ? 'is-active' : ''}`,
        text: chip.label
      });
      chipBtn.addEventListener('click', () => {
        this.activeChip = chip.id;
        this.render();
      });
    }

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

  private renderBoard(
    container: HTMLElement,
    sections: SectionDefinition[],
    grouped: Map<SectionId, TaskItem[]>
  ): void {
    const board = container.createDiv({ cls: 'gtd-board' });

    for (const sec of sections) {
      const colTasks = grouped.get(sec.id) || [];
      const col = board.createDiv({ cls: `gtd-board-column ${sec.badgeClass}` });

      // Column header
      const colHeader = col.createDiv({ cls: 'gtd-board-col-header' });
      const iconSpan = colHeader.createSpan({ cls: 'gtd-board-col-icon' });
      setIcon(iconSpan, sec.icon);
      colHeader.createSpan({ cls: 'gtd-board-col-title', text: sec.title });
      colHeader.createSpan({ cls: 'gtd-count-badge', text: String(colTasks.length) });

      // Drop zone
      const dropZone = col.createDiv({ cls: 'gtd-board-drop-zone' });
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        dropZone.addClass('gtd-drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.removeClass('gtd-drag-over');
      });
      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.removeClass('gtd-drag-over');
        const taskId = e.dataTransfer?.getData('text/plain');
        if (!taskId) return;
        const task = this.scanner.getTasks().find((t) => t.id === taskId);
        if (!task) return;
        await this.handleTaskDrop(task, sec.id);
      });

      // Sort tasks
      const sorted = [...colTasks].sort((a, b) => {
        const dateA = a.scheduledDate || a.dueDate;
        const dateB = b.scheduledDate || b.dueDate;
        if (dateA && dateB) return dateA.localeCompare(dateB);
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
        return a.fileName.localeCompare(b.fileName);
      });

      if (sorted.length === 0) {
        dropZone.createDiv({ cls: 'gtd-board-empty', text: 'Drop a task here' });
      } else {
        for (const task of sorted) {
          this.renderBoardCard(dropZone, task);
        }
      }

      // Quick-add inside board column
      this.renderQuickAddRow(col, sec.id);
    }
  }

  private renderBoardCard(container: HTMLElement, task: TaskItem): void {
    const today = this.scanner.getTodayDateString();
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

    // Top row: checkbox + priority badge
    const topRow = card.createDiv({ cls: 'gtd-board-card-top' });
    const checkbox = topRow.createEl('input', { type: 'checkbox', cls: 'gtd-checkbox' });
    checkbox.checked = task.isCompleted;
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      await this.scanner.setCompletion(task, checkbox.checked);
    });

    const priorityBtn = topRow.createEl('button', {
      cls: `gtd-priority-badge priority-${task.priority}`,
      attr: { 'aria-label': 'Change priority' }
    });
    priorityBtn.setText(this.getPriorityLabel(task.priority));
    priorityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPriorityMenu(e, task);
    });

    // Description
    const descEl = card.createDiv({ cls: 'gtd-board-card-desc' });
    if (task.description) {
      void MarkdownRenderer.render(this.app, task.description, descEl, task.filePath, this);
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
        else void this.app.workspace.openLinkText(href, task.filePath, 'tab');
        return;
      }
      e.stopPropagation();
      this.makeEditable(descEl, task);
    });

    // Meta row: dates + source file
    const metaEl = card.createDiv({ cls: 'gtd-board-card-meta' });

    if (task.scheduledDate) {
      const isOverdue = !task.isCompleted && task.scheduledDate < today;
      metaEl.createEl('button', {
        cls: `gtd-date-pill gtd-date-scheduled ${isOverdue ? 'is-overdue' : ''}`,
        text: `⏳ ${task.scheduledDate}`
      }).addEventListener('click', (e) => { e.stopPropagation(); this.showScheduledDatePicker(e.target as HTMLElement, task); });
    }
    if (task.dueDate) {
      const isOverdue = !task.isCompleted && task.dueDate < today;
      metaEl.createEl('button', {
        cls: `gtd-date-pill gtd-date-due ${isOverdue ? 'is-overdue' : ''}`,
        text: `📅 ${task.dueDate}`
      }).addEventListener('click', (e) => { e.stopPropagation(); this.showDueDatePicker(e.target as HTMLElement, task); });
    }

    const fileLink = metaEl.createEl('a', {
      cls: `gtd-file-link ${task.isProject ? 'is-project-link' : ''}`,
      text: task.isProject ? `📂 ${task.fileName}` : `[[${task.fileName}]]`
    });
    fileLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.app.workspace.openLinkText(task.filePath, '', 'tab');
    });
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
    titleGroup.createSpan({ cls: 'gtd-section-title', text: sec.title });
    titleGroup.createSpan({
      cls: 'gtd-count-badge',
      text: String(tasks.length)
    });

    headerEl.createDiv({
      cls: 'gtd-section-subtitle',
      text: sec.subtitle
    });

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
        const sorted = [...tasks].sort((a, b) => {
          const dateA = a.scheduledDate || a.dueDate;
          const dateB = b.scheduledDate || b.dueDate;
          if (dateA && dateB) return dateA.localeCompare(dateB);
          if (dateA && !dateB) return -1;
          if (!dateA && dateB) return 1;
          return a.fileName.localeCompare(b.fileName);
        });

        for (const task of sorted) {
          this.renderTaskItem(bodyEl, task);
        }
      }

      this.renderQuickAddRow(bodyEl, sec.id);
    }
  }

  private renderTaskItem(container: HTMLElement, task: TaskItem): void {
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

    // Priority color pill
    const priorityBtn = itemEl.createEl('button', {
      cls: `gtd-priority-badge priority-${task.priority}`,
      attr: { 'aria-label': 'Change priority' }
    });
    priorityBtn.setText(this.getPriorityLabel(task.priority));
    priorityBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPriorityMenu(e, task);
    });

    // Description (rendered markdown with smart click routing)
    const descEl = itemEl.createDiv({ cls: 'gtd-task-desc' });
    if (task.description) {
      void MarkdownRenderer.render(this.app, task.description, descEl, task.filePath, this);
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
          void this.app.workspace.openLinkText(href, task.filePath, 'tab');
        }
        return;
      }

      e.stopPropagation();
      this.makeEditable(descEl, task);
    });

    descEl.addEventListener('mouseover', (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('data-href') || anchor.getAttribute('href');
        const isExternal = anchor.classList.contains('external-link') || (href ? /^(https?:|\/\/)/i.test(href) : false);
        if (href && !isExternal) {
          this.app.workspace.trigger('hover-link', {
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

    // Edit button on hover
    const editBtn = itemEl.createEl('button', {
      cls: 'gtd-edit-btn',
      attr: { 'aria-label': 'Edit task text' }
    });
    setIcon(editBtn, 'pencil');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.makeEditable(descEl, task);
    });

    // Meta row (Scheduled Date + Due Date + Project badge / Note link)
    const metaEl = itemEl.createDiv({ cls: 'gtd-task-meta' });
    const today = this.scanner.getTodayDateString();

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
        this.showScheduledDatePicker(schedPill, task);
      });
    } else {
      const addSchedBtn = metaEl.createEl('button', {
        cls: 'gtd-date-pill gtd-date-add',
        text: '+ Scheduled'
      });
      addSchedBtn.title = 'Add scheduled date (⏳)';
      addSchedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showScheduledDatePicker(addSchedBtn, task);
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
        this.showDueDatePicker(duePill, task);
      });
    }

    // Origin note / Project link
    const fileLink = metaEl.createEl('a', {
      cls: `gtd-file-link ${task.isProject ? 'is-project-link' : ''}`,
      text: task.isProject ? `📂 ${task.fileName}` : `[[${task.fileName}]]`
    });
    fileLink.title = `Open ${task.filePath} in a new tab`;
    fileLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.app.workspace.openLinkText(task.filePath, '', 'tab');
    });
    fileLink.addEventListener('mouseover', (event: MouseEvent) => {
      this.app.workspace.trigger('hover-link', {
        event,
        source: 'gtd-matrix-tasks',
        hoverParent: metaEl,
        targetEl: fileLink,
        linktext: task.filePath,
        sourcePath: ''
      });
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

    let committed = false;
    const save = async () => {
      if (committed) return;
      committed = true;
      const newText = input.value.trim();
      if (newText && newText !== originalText) {
        await this.scanner.setDescription(task, newText);
      } else {
        descEl.innerHTML = '';
        if (originalText) {
          void MarkdownRenderer.render(this.app, originalText, descEl, task.filePath, this);
        } else {
          descEl.setText('(No description)');
        }
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        save();
      } else if (e.key === 'Escape') {
        committed = true;
        descEl.innerHTML = '';
        if (originalText) {
          void MarkdownRenderer.render(this.app, originalText, descEl, task.filePath, this);
        } else {
          descEl.setText('(No description)');
        }
      }
    });

    input.addEventListener('blur', save);
  }

  private showPriorityMenu(e: MouseEvent, task: TaskItem): void {
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
          await this.scanner.setPriority(task, p.prio);
        });
      });
    }

    menu.showAtMouseEvent(e);
  }

  private showScheduledDatePicker(anchor: HTMLElement, task: TaskItem): void {
    const popover = createDiv({ cls: 'gtd-date-popover' });
    const dateInput = popover.createEl('input', {
      type: 'date',
      cls: 'gtd-date-input',
      value: task.scheduledDate || this.scanner.getTodayDateString()
    });

    const clearBtn = popover.createEl('button', {
      cls: 'gtd-btn-sm',
      text: 'Clear'
    });

    anchor.parentElement?.appendChild(popover);
    dateInput.focus();

    dateInput.addEventListener('change', async () => {
      await this.scanner.setScheduledDate(task, dateInput.value || null);
      popover.remove();
    });

    clearBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.scanner.setScheduledDate(task, null);
      popover.remove();
    });

    popover.addEventListener('mouseleave', () => {
      popover.remove();
    });
  }

  private showDueDatePicker(anchor: HTMLElement, task: TaskItem): void {
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
    const dateOffset = (days: number): string => {
      const d = new Date(this.scanner.getTodayDateString());
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    // GTD Mode Transitions
    if (this.viewMode === 'gtd') {
      switch (targetSection) {
        case 'gtd-next-actions':
          // Clear waiting/someday flags, set dueDate = today+3
          if (task.isWaiting) await this.scanner.setWaiting(task, false);
          if (task.isSomeday) await this.scanner.setSomeday(task, false);
          await this.scanner.setDueDate(task, dateOffset(3));
          break;
        case 'gtd-waiting':
          // Add #waiting tag (setWaiting handles the statusChar '?' approach)
          await this.scanner.setWaiting(task, true);
          break;
        case 'gtd-scheduled':
          // Set scheduledDate = today+10
          if (task.isWaiting) await this.scanner.setWaiting(task, false);
          if (task.isSomeday) await this.scanner.setSomeday(task, false);
          await this.scanner.setScheduledDate(task, dateOffset(10));
          break;
        case 'gtd-someday':
          // Add #someday tag, clear dates
          await this.scanner.setSomeday(task, true);
          await this.scanner.setDueDate(task, null);
          await this.scanner.setScheduledDate(task, null);
          break;
        case 'gtd-inbox':
          await this.scanner.setPriority(task, 'none');
          await this.scanner.setDueDate(task, null);
          await this.scanner.setScheduledDate(task, null);
          await this.scanner.setWaiting(task, false);
          await this.scanner.setSomeday(task, false);
          break;
        case 'gtd-completed':
          await this.scanner.setCompletion(task, true);
          break;
      }
      return;
    }

    // Eisenhower Mode Transitions
    switch (targetSection) {
      case 'eisen-q1':
        await this.scanner.setPriority(task, 'highest');
        break;
      case 'eisen-q2':
        await this.scanner.setPriority(task, 'high');
        break;
      case 'eisen-q3':
        await this.scanner.setPriority(task, 'medium');
        break;
      case 'eisen-q4':
        await this.scanner.setPriority(task, 'low');
        break;
      case 'eisen-inbox':
        await this.scanner.setPriority(task, 'none');
        break;
      case 'eisen-completed':
        await this.scanner.setCompletion(task, true);
        break;
    }
  }


  private getPriorityLabel(prio: TaskPriority): string {
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
}
