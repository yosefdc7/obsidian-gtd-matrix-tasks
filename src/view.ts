import { ItemView, WorkspaceLeaf, setIcon, Menu, MarkdownRenderer } from 'obsidian';
import { VaultScanner } from './vault-scanner';
import {
  TaskItem,
  TaskPriority,
  SectionId,
  SectionDefinition,
  ViewMode,
  LayoutMode,
  PluginSettings,
  SortCriteria,
  TagViewMode,
  RoleId,
  SwimlaneDefinition
} from './types';
import { getGTDSection, getEisenhowerSection, sortTasks } from './parser';

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

export const ROLE_SWIMLANES: SwimlaneDefinition[] = [
  {
    id: 'role/yo-manager',
    title: 'Yo Manager',
    subtitle: 'Engineering, product delivery, apps, and operations.',
    icon: 'briefcase',
    badgeClass: 'badge-role-yo-manager',
    roleTag: 'role/yo-manager'
  },
  {
    id: 'role/josef-selfcare',
    title: 'Josef Self-Care',
    subtitle: 'Health, personal growth, habits, and life strategy.',
    icon: 'heart',
    badgeClass: 'badge-role-josef-selfcare',
    roleTag: 'role/josef-selfcare'
  },
  {
    id: 'role/rj-supportive',
    title: 'RJ Supportive',
    subtitle: 'Family, home, partner support, and shared commitments.',
    icon: 'users',
    badgeClass: 'badge-role-rj-supportive',
    roleTag: 'role/rj-supportive'
  },
  {
    id: 'untagged',
    title: 'Other / Untagged',
    subtitle: 'Tasks without a designated role tag or link.',
    icon: 'help-circle',
    badgeClass: 'badge-role-untagged',
    roleTag: null
  }
];

export class GTDMatrixView extends ItemView {
  private scanner: VaultScanner;
  private viewMode: ViewMode = 'gtd';
  private layoutMode: LayoutMode = 'board';
  private sortCriteria: SortCriteria = 'date';
  private tagViewMode: TagViewMode = 'filter';
  private activeFilterRoles: Set<RoleId> = new Set([
    'role/yo-manager',
    'role/josef-selfcare',
    'role/rj-supportive',
    'untagged'
  ]);
  private collapsedSwimlanes: Set<RoleId> = new Set();
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
      this.sortCriteria = settings.defaultSortCriteria || 'date';
      this.tagViewMode = settings.defaultTagViewMode || 'filter';
      if (settings.activeFilterRoles && settings.activeFilterRoles.length > 0) {
        this.activeFilterRoles = new Set(settings.activeFilterRoles as RoleId[]);
      }
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
      // 1. Role Filter
      if (!this.activeFilterRoles.has(t.effectiveRole)) return false;

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

    const activeSections = this.viewMode === 'gtd' ? GTD_SECTIONS : EISENHOWER_SECTIONS;

    // Render Swimlanes
    if (this.tagViewMode === 'swimlanes') {
      if (this.layoutMode === 'board') {
        this.renderSwimlaneBoard(container, activeSections, filteredTasks, todayStr);
      } else {
        this.renderSwimlaneList(container, activeSections, filteredTasks, todayStr);
      }
    } else {
      // Group tasks according to active View Mode (Filter Mode)
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

    // Floating action button for mobile quick capture
    this.renderFloatingActionButton(container);
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

    // Tag / Role View Mode Toggle [Filter | Swimlanes]
    const tagModeGroup = toolbar.createDiv({ cls: 'gtd-mode-switcher gtd-tagmode-switcher' });
    const filterBtn = tagModeGroup.createEl('button', {
      cls: `gtd-mode-btn ${this.tagViewMode === 'filter' ? 'is-active' : ''}`,
      text: 'Filter'
    });
    filterBtn.title = 'Filter view: display matching tasks in standard columns';
    filterBtn.addEventListener('click', () => {
      if (this.tagViewMode !== 'filter') {
        this.tagViewMode = 'filter';
        this.render();
      }
    });
    const swimlanesBtn = tagModeGroup.createEl('button', {
      cls: `gtd-mode-btn ${this.tagViewMode === 'swimlanes' ? 'is-active' : ''}`,
      text: 'Swimlanes'
    });
    swimlanesBtn.title = 'Swimlane view: divide board horizontally by role';
    swimlanesBtn.addEventListener('click', () => {
      if (this.tagViewMode !== 'swimlanes') {
        this.tagViewMode = 'swimlanes';
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

    // Sort Dropdown
    const sortWrapper = toolbar.createDiv({ cls: 'gtd-sort-wrapper' });
    const sortSelect = sortWrapper.createEl('select', { cls: 'gtd-sort-select' });
    const sortOptions: { id: SortCriteria; label: string }[] = [
      { id: 'date', label: 'Sort: Date (Earliest)' },
      { id: 'priority', label: 'Sort: Priority (Highest)' },
      { id: 'title', label: 'Sort: Title (A-Z)' },
      { id: 'created', label: 'Sort: Created (Newest)' }
    ];
    for (const opt of sortOptions) {
      const optionEl = sortSelect.createEl('option', { value: opt.id, text: opt.label });
      if (this.sortCriteria === opt.id) optionEl.selected = true;
    }
    sortSelect.addEventListener('change', () => {
      this.sortCriteria = sortSelect.value as SortCriteria;
      this.render();
    });

    // Role Filter Chips Row
    const roleChipsWrapper = toolbar.createDiv({ cls: 'gtd-role-chips-wrapper' });
    const roleList: { id: RoleId; label: string }[] = [
      { id: 'role/yo-manager', label: 'Yo Manager' },
      { id: 'role/josef-selfcare', label: 'Josef Self-Care' },
      { id: 'role/rj-supportive', label: 'RJ Supportive' },
      { id: 'untagged', label: 'Untagged' }
    ];
    for (const r of roleList) {
      const isActive = this.activeFilterRoles.has(r.id);
      const pill = roleChipsWrapper.createEl('button', {
        cls: `gtd-role-chip-btn ${isActive ? 'is-active' : ''} chip-${r.id.replace('/', '-')}`,
        text: r.label
      });
      pill.title = isActive ? `Exclude ${r.label}` : `Include ${r.label}`;
      pill.addEventListener('click', () => {
        if (this.activeFilterRoles.has(r.id)) {
          if (this.activeFilterRoles.size > 1) {
            this.activeFilterRoles.delete(r.id);
          }
        } else {
          this.activeFilterRoles.add(r.id);
        }
        this.render();
      });
    }

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
    // Render mobile column tabs carousel
    const tabsWrapper = container.createDiv({ cls: 'gtd-mobile-col-tabs' });
    const tabButtons = new Map<SectionId, HTMLButtonElement>();

    for (const sec of sections) {
      const colTasks = grouped.get(sec.id) || [];
      const tabBtn = tabsWrapper.createEl('button', {
        cls: 'gtd-mobile-tab-btn',
        attr: { 'data-target-section': sec.id }
      });
      const iconSpan = tabBtn.createSpan({ cls: 'gtd-mobile-tab-icon' });
      setIcon(iconSpan, sec.icon);

      const shortTitle = this.getSectionShortTitle(sec.id, sec.title);
      tabBtn.createSpan({ cls: 'gtd-mobile-tab-label', text: shortTitle });
      tabBtn.createSpan({ cls: 'gtd-count-badge', text: String(colTasks.length) });

      tabBtn.addEventListener('click', () => {
        const targetCol = board.querySelector(`[data-section-id="${sec.id}"]`);
        if (targetCol) {
          targetCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
        tabButtons.forEach((btn) => btn.removeClass('is-active'));
        tabBtn.addClass('is-active');
      });

      tabButtons.set(sec.id, tabBtn);
    }

    if (sections.length > 0) {
      tabButtons.get(sections[0].id)?.addClass('is-active');
    }

    const board = container.createDiv({ cls: 'gtd-board' });

    // Sync horizontal scroll with mobile tabs
    let scrollTimer: number | null = null;
    board.addEventListener('scroll', () => {
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const boardRect = board.getBoundingClientRect();
        const boardCenter = boardRect.left + boardRect.width / 2;
        let closestSecId: SectionId | null = null;
        let minDistance = Infinity;

        const cols = board.querySelectorAll<HTMLElement>('.gtd-board-column');
        cols.forEach((col) => {
          const rect = col.getBoundingClientRect();
          const colCenter = rect.left + rect.width / 2;
          const dist = Math.abs(colCenter - boardCenter);
          if (dist < minDistance) {
            minDistance = dist;
            closestSecId = col.getAttribute('data-section-id') as SectionId;
          }
        });

        if (closestSecId && tabButtons.has(closestSecId)) {
          tabButtons.forEach((btn) => btn.removeClass('is-active'));
          const activeBtn = tabButtons.get(closestSecId);
          if (activeBtn) {
            activeBtn.addClass('is-active');
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        }
      }, 75);
    });

    for (const sec of sections) {
      const colTasks = grouped.get(sec.id) || [];
      const col = board.createDiv({ cls: `gtd-board-column ${sec.badgeClass}` });
      col.setAttribute('data-section-id', sec.id);

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
      const sorted = sortTasks(colTasks, this.sortCriteria);

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

    // Top row: checkbox + priority badge + action menu button
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

    const actionBtn = topRow.createEl('button', {
      cls: 'gtd-card-action-btn',
      attr: { 'aria-label': 'Task actions' }
    });
    setIcon(actionBtn, 'more-horizontal');
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTaskActionMenu(e, task);
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

    // Meta row: dates + source file + role badge
    const metaEl = card.createDiv({ cls: 'gtd-board-card-meta' });

    // Role badge
    if (task.effectiveRole && task.effectiveRole !== 'untagged') {
      const roleBadge = metaEl.createSpan({
        cls: `gtd-role-badge badge-${task.effectiveRole.replace('/', '-')}`,
        text:
          task.effectiveRole === 'role/yo-manager'
            ? 'Yo Manager'
            : task.effectiveRole === 'role/josef-selfcare'
            ? 'Josef Self-Care'
            : 'RJ Supportive'
      });
      roleBadge.title = `Role source: ${task.roleSource}`;
    }

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
    tasks: TaskItem[],
    roleTag?: string | null
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

      // Role mutation if dropped in swimlane list
      if (roleTag !== undefined && task.effectiveRole !== (roleTag || 'untagged')) {
        await this.scanner.setRole(task, (roleTag as RoleId) || null);
      }

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
        const sorted = sortTasks(tasks, this.sortCriteria);

        for (const task of sorted) {
          this.renderTaskItem(bodyEl, task);
        }
      }

      this.renderQuickAddRow(bodyEl, sec.id, roleTag);
    }
  }

  private renderSwimlaneBoard(
    container: HTMLElement,
    sections: SectionDefinition[],
    tasks: TaskItem[],
    todayStr: string
  ): void {
    const swimlanesContainer = container.createDiv({ cls: 'gtd-swimlanes-container' });

    for (const lane of ROLE_SWIMLANES) {
      if (!this.activeFilterRoles.has(lane.id)) continue;

      const laneTasks = tasks.filter((t) => t.effectiveRole === lane.id);
      if (lane.id === 'untagged' && laneTasks.length === 0) continue;

      const isCollapsed = this.collapsedSwimlanes.has(lane.id);
      const laneEl = swimlanesContainer.createDiv({
        cls: `gtd-swimlane-row ${lane.badgeClass} ${isCollapsed ? 'is-collapsed' : ''}`
      });

      // Swimlane Header Bar
      const laneHeader = laneEl.createDiv({ cls: 'gtd-swimlane-header' });
      const toggleIcon = laneHeader.createSpan({ cls: 'gtd-toggle-icon' });
      setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

      const iconSpan = laneHeader.createSpan({ cls: 'gtd-swimlane-icon' });
      setIcon(iconSpan, lane.icon);

      const titleGroup = laneHeader.createDiv({ cls: 'gtd-swimlane-title-group' });
      titleGroup.createSpan({ cls: 'gtd-swimlane-title', text: lane.title });
      titleGroup.createSpan({ cls: 'gtd-count-badge', text: String(laneTasks.length) });

      laneHeader.createDiv({ cls: 'gtd-swimlane-subtitle', text: lane.subtitle });

      laneHeader.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        if (this.collapsedSwimlanes.has(lane.id)) {
          this.collapsedSwimlanes.delete(lane.id);
        } else {
          this.collapsedSwimlanes.add(lane.id);
        }
        this.render();
      });

      if (isCollapsed) continue;

      // Group lane tasks by section
      const laneGrouped = new Map<SectionId, TaskItem[]>();
      for (const sec of sections) {
        laneGrouped.set(sec.id, []);
      }
      for (const t of laneTasks) {
        const secId =
          this.viewMode === 'gtd'
            ? getGTDSection(t, todayStr)
            : getEisenhowerSection(t, todayStr);
        if (secId) {
          laneGrouped.get(secId)?.push(t);
        }
      }

      // Board Grid inside swimlane
      const grid = laneEl.createDiv({ cls: 'gtd-board gtd-swimlane-board' });
      for (const sec of sections) {
        const colTasks = laneGrouped.get(sec.id) || [];
        const col = grid.createDiv({ cls: `gtd-board-column ${sec.badgeClass}` });
        col.setAttribute('data-section-id', sec.id);

        // Column header
        const colHeader = col.createDiv({ cls: 'gtd-board-col-header' });
        const colIcon = colHeader.createSpan({ cls: 'gtd-board-col-icon' });
        setIcon(colIcon, sec.icon);
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

          // Cross-swimlane role mutation
          if (task.effectiveRole !== lane.id) {
            await this.scanner.setRole(task, (lane.roleTag as RoleId) || null);
          }
          await this.handleTaskDrop(task, sec.id);
        });

        const sorted = sortTasks(colTasks, this.sortCriteria);
        if (sorted.length === 0) {
          dropZone.createDiv({ cls: 'gtd-board-empty', text: 'Drop a task here' });
        } else {
          for (const task of sorted) {
            this.renderBoardCard(dropZone, task);
          }
        }

        // Quick add inside column with swimlane role
        this.renderQuickAddRow(col, sec.id, lane.roleTag);
      }
    }
  }

  private renderSwimlaneList(
    container: HTMLElement,
    sections: SectionDefinition[],
    tasks: TaskItem[],
    todayStr: string
  ): void {
    const wrapper = container.createDiv({ cls: 'gtd-swimlanes-list-wrapper' });

    for (const lane of ROLE_SWIMLANES) {
      if (!this.activeFilterRoles.has(lane.id)) continue;

      const laneTasks = tasks.filter((t) => t.effectiveRole === lane.id);
      if (lane.id === 'untagged' && laneTasks.length === 0) continue;

      const isCollapsed = this.collapsedSwimlanes.has(lane.id);
      const laneEl = wrapper.createDiv({
        cls: `gtd-swimlane-list-group ${lane.badgeClass} ${isCollapsed ? 'is-collapsed' : ''}`
      });

      // Role Header
      const headerEl = laneEl.createDiv({ cls: 'gtd-swimlane-list-header' });
      const toggleIcon = headerEl.createSpan({ cls: 'gtd-toggle-icon' });
      setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

      const iconSpan = headerEl.createSpan({ cls: 'gtd-swimlane-icon' });
      setIcon(iconSpan, lane.icon);

      const titleGroup = headerEl.createDiv({ cls: 'gtd-swimlane-title-group' });
      titleGroup.createSpan({ cls: 'gtd-swimlane-title', text: lane.title });
      titleGroup.createSpan({ cls: 'gtd-count-badge', text: String(laneTasks.length) });

      headerEl.createDiv({ cls: 'gtd-swimlane-subtitle', text: lane.subtitle });

      headerEl.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        if (this.collapsedSwimlanes.has(lane.id)) {
          this.collapsedSwimlanes.delete(lane.id);
        } else {
          this.collapsedSwimlanes.add(lane.id);
        }
        this.render();
      });

      if (isCollapsed) continue;

      // Group lane tasks by section
      const laneGrouped = new Map<SectionId, TaskItem[]>();
      for (const sec of sections) {
        laneGrouped.set(sec.id, []);
      }
      for (const t of laneTasks) {
        const secId =
          this.viewMode === 'gtd'
            ? getGTDSection(t, todayStr)
            : getEisenhowerSection(t, todayStr);
        if (secId) {
          laneGrouped.get(secId)?.push(t);
        }
      }

      const bodyEl = laneEl.createDiv({ cls: 'gtd-swimlane-list-body' });
      for (const sec of sections) {
        const secTasks = laneGrouped.get(sec.id) || [];
        this.renderSection(bodyEl, sec, secTasks, lane.roleTag);
      }
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

    // Action menu button
    const actionBtn = itemEl.createEl('button', {
      cls: 'gtd-card-action-btn',
      attr: { 'aria-label': 'Task actions' }
    });
    setIcon(actionBtn, 'more-horizontal');
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showTaskActionMenu(e, task);
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

    // Role badge
    if (task.effectiveRole && task.effectiveRole !== 'untagged') {
      const roleBadge = metaEl.createSpan({
        cls: `gtd-role-badge badge-${task.effectiveRole.replace('/', '-')}`,
        text:
          task.effectiveRole === 'role/yo-manager'
            ? 'Yo Manager'
            : task.effectiveRole === 'role/josef-selfcare'
            ? 'Josef Self-Care'
            : 'RJ Supportive'
      });
      roleBadge.title = `Role source: ${task.roleSource}`;
    }
  }

  private renderQuickAddRow(container: HTMLElement, secId: SectionId, roleTag?: string | null): void {
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
        await this.scanner.quickAddTask(secId, text, (roleTag as RoleId) || null);
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

  private getSectionShortTitle(secId: SectionId, defaultTitle: string): string {
    const titles: Record<string, string> = {
      'gtd-inbox': 'Inbox',
      'gtd-next-actions': 'Next Actions',
      'gtd-waiting': 'Waiting',
      'gtd-scheduled': 'Scheduled',
      'gtd-someday': 'Someday',
      'gtd-completed': 'Done',
      'eisen-q1': 'Q1 Urgent',
      'eisen-q2': 'Q2 Important',
      'eisen-q3': 'Q3 Delegate',
      'eisen-q4': 'Q4 Low',
      'eisen-inbox': 'Inbox',
      'eisen-completed': 'Done'
    };
    return titles[secId] || defaultTitle.split('—')[0].trim();
  }

  private showTaskActionMenu(e: MouseEvent, task: TaskItem): void {
    const menu = new Menu();

    // 1. Completion Toggle
    menu.addItem((item) => {
      item
        .setTitle(task.isCompleted ? 'Mark Incomplete' : 'Mark Complete')
        .setIcon(task.isCompleted ? 'circle' : 'check-circle')
        .onClick(async () => {
          await this.scanner.setCompletion(task, !task.isCompleted);
        });
    });

    menu.addSeparator();

    // 2. GTD State Transitions
    menu.addItem((item) => {
      item
        .setTitle('Move to Next Actions')
        .setIcon('zap')
        .onClick(async () => {
          await this.handleTaskDrop(task, 'gtd-next-actions');
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('Schedule (Set Today+10)')
        .setIcon('calendar')
        .onClick(async () => {
          await this.handleTaskDrop(task, 'gtd-scheduled');
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('Mark as Waiting (#waiting)')
        .setIcon('clock')
        .onClick(async () => {
          await this.handleTaskDrop(task, 'gtd-waiting');
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('Move to Someday / Maybe (#someday)')
        .setIcon('archive')
        .onClick(async () => {
          await this.handleTaskDrop(task, 'gtd-someday');
        });
    });

    menu.addItem((item) => {
      item
        .setTitle('Move to Inbox')
        .setIcon('inbox')
        .onClick(async () => {
          await this.handleTaskDrop(task, 'gtd-inbox');
        });
    });

    menu.addSeparator();

    // 3. Priority Menu Trigger
    menu.addItem((item) => {
      item
        .setTitle('Change Priority...')
        .setIcon('flag')
        .onClick(() => {
          this.showPriorityMenu(e, task);
        });
    });

    // 4. Role Assignment Subitems
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
            await this.scanner.setRole(task, r.id);
          });
      });
    }

    menu.addSeparator();

    // 5. Open Source Note
    menu.addItem((item) => {
      item
        .setTitle(`Open Note (${task.fileName})`)
        .setIcon('file-text')
        .onClick(() => {
          void this.app.workspace.openLinkText(task.filePath, '', 'tab');
        });
    });

    menu.showAtMouseEvent(e);
  }

  private renderFloatingActionButton(container: HTMLElement): void {
    const fab = container.createEl('button', {
      cls: 'gtd-fab-btn',
      attr: { 'aria-label': 'Quick capture task' }
    });
    setIcon(fab, 'plus');
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openQuickAddModal();
    });
  }

  private openQuickAddModal(): void {
    const backdrop = document.body.createDiv({ cls: 'gtd-modal-backdrop' });
    const sheet = backdrop.createDiv({ cls: 'gtd-modal-sheet' });

    // Header
    const header = sheet.createDiv({ cls: 'gtd-modal-title-row' });
    header.createSpan({ cls: 'gtd-modal-title', text: 'Quick Capture Task' });
    const closeBtn = header.createEl('button', {
      cls: 'gtd-modal-close-btn',
      attr: { 'aria-label': 'Close modal' }
    });
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('click', () => backdrop.remove());

    // Task Description Input
    const input = sheet.createEl('input', {
      type: 'text',
      cls: 'gtd-modal-input',
      placeholder: 'What needs to be done?'
    });

    // Destination Section Selector
    const secRow = sheet.createDiv({ cls: 'gtd-modal-options-row' });
    secRow.createSpan({ cls: 'gtd-modal-options-label', text: 'Destination' });
    const secChips = secRow.createDiv({ cls: 'gtd-modal-chips' });
    const sections: { id: SectionId; label: string }[] = [
      { id: 'gtd-next-actions', label: '⚡ Next Actions' },
      { id: 'gtd-inbox', label: '📥 Inbox' },
      { id: 'gtd-scheduled', label: '⏳ Scheduled' },
      { id: 'gtd-waiting', label: '🕒 Waiting' },
      { id: 'gtd-someday', label: '📦 Someday' }
    ];
    let selectedSecId: SectionId = 'gtd-next-actions';
    const secButtons: HTMLElement[] = [];

    for (const sec of sections) {
      const chip = secChips.createEl('button', {
        cls: `gtd-modal-chip ${sec.id === selectedSecId ? 'is-active' : ''}`,
        text: sec.label
      });
      secButtons.push(chip);
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        selectedSecId = sec.id;
        secButtons.forEach((b) => b.removeClass('is-active'));
        chip.addClass('is-active');
      });
    }

    // Role Selector
    const roleRow = sheet.createDiv({ cls: 'gtd-modal-options-row' });
    roleRow.createSpan({ cls: 'gtd-modal-options-label', text: 'Role' });
    const roleChips = roleRow.createDiv({ cls: 'gtd-modal-chips' });
    const roles: { id: RoleId | null; label: string }[] = [
      { id: 'role/yo-manager', label: '💼 Yo Manager' },
      { id: 'role/josef-selfcare', label: '❤️ Josef Self-Care' },
      { id: 'role/rj-supportive', label: '👥 RJ Supportive' },
      { id: null, label: '🏷️ None' }
    ];
    let selectedRole: RoleId | null = null;
    const roleButtons: HTMLElement[] = [];

    for (const role of roles) {
      const chip = roleChips.createEl('button', {
        cls: `gtd-modal-chip ${role.id === selectedRole ? 'is-active' : ''}`,
        text: role.label
      });
      roleButtons.push(chip);
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        selectedRole = role.id;
        roleButtons.forEach((b) => b.removeClass('is-active'));
        chip.addClass('is-active');
      });
    }

    // Submit Button
    const submitBtn = sheet.createEl('button', {
      cls: 'gtd-modal-submit-btn',
      text: 'Capture to Daily Jot'
    });

    const handleSave = async () => {
      const text = input.value.trim();
      if (!text) return;
      backdrop.remove();
      await this.scanner.quickAddTask(selectedSecId, text, selectedRole);
    };

    submitBtn.addEventListener('click', handleSave);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleSave();
      } else if (e.key === 'Escape') {
        backdrop.remove();
      }
    });

    // Dismiss on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });

    setTimeout(() => input.focus(), 60);
  }
}
