import { setIcon } from 'obsidian';
import type { ViewContext } from './types';
import type { DateAnchorField, RoleId, SortCriteria, TaskItem } from '../types';

function getUniqueFolders(tasks: TaskItem[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) {
    const parts = t.filePath.replace(/\\/g, '/').split('/');
    if (parts.length > 1) {
      set.add(parts[0]);
    }
  }
  return Array.from(set).sort();
}

/** Toolbar: mode/layout/sort controls, role chips, search, quick chips, folder, refresh, stats. */
export function renderToolbar(container: HTMLElement, allTasks: TaskItem[], ctx: ViewContext): void {
  const state = ctx.getState();
  const toolbar = container.createDiv({ cls: 'gtd-toolbar' });

  // Mode Switcher Segmented Control
  const modeGroup = toolbar.createDiv({ cls: 'gtd-mode-switcher' });
  const gtdBtn = modeGroup.createEl('button', {
    cls: `gtd-mode-btn ${state.viewMode === 'gtd' ? 'is-active' : ''}`,
    text: 'GTD Workflow'
  });
  gtdBtn.addEventListener('click', () => {
    if (state.viewMode !== 'gtd') {
      ctx.setState({ viewMode: 'gtd' });
    }
  });

  const eisenBtn = modeGroup.createEl('button', {
    cls: `gtd-mode-btn ${state.viewMode === 'eisenhower' ? 'is-active' : ''}`,
    text: 'Eisenhower Matrix'
  });
  eisenBtn.addEventListener('click', () => {
    if (state.viewMode !== 'eisenhower') {
      ctx.setState({ viewMode: 'eisenhower' });
    }
  });

  const dateBtn = modeGroup.createEl('button', {
    cls: `gtd-mode-btn ${state.viewMode === 'date' ? 'is-active' : ''}`,
    text: 'By Date'
  });
  dateBtn.title = 'By Date: tasks grouped into date buckets by anchor date';
  dateBtn.addEventListener('click', () => {
    if (state.viewMode !== 'date') {
      ctx.setState({ viewMode: 'date' });
    }
  });

  // Anchor field selector (By Date only); session-only, defaults to Scheduled
  if (state.viewMode === 'date') {
    const anchorGroup = toolbar.createDiv({ cls: 'gtd-mode-switcher gtd-anchor-switcher' });
    const anchors: { id: DateAnchorField; label: string }[] = [
      { id: 'start', label: 'Start' },
      { id: 'scheduled', label: 'Scheduled' },
      { id: 'due', label: 'Due' }
    ];
    for (const anchor of anchors) {
      const anchorBtn = anchorGroup.createEl('button', {
        cls: `gtd-mode-btn ${state.dateAnchor === anchor.id ? 'is-active' : ''}`,
        text: anchor.label
      });
      anchorBtn.title = `Position tasks by their ${anchor.label.toLowerCase()} date`;
      anchorBtn.addEventListener('click', () => {
        if (ctx.getState().dateAnchor !== anchor.id) {
          ctx.setState({ dateAnchor: anchor.id });
        }
      });
    }
  }

  // Tag / Role View Mode Toggle [Filter | Swimlanes] — hidden while By Date is active
  if (state.viewMode !== 'date') {
    const tagModeGroup = toolbar.createDiv({ cls: 'gtd-mode-switcher gtd-tagmode-switcher' });
    const filterBtn = tagModeGroup.createEl('button', {
      cls: `gtd-mode-btn ${state.tagViewMode === 'filter' ? 'is-active' : ''}`,
      text: 'Filter'
    });
    filterBtn.title = 'Filter view: display matching tasks in standard columns';
    filterBtn.addEventListener('click', () => {
      if (state.tagViewMode !== 'filter') {
        ctx.setState({ tagViewMode: 'filter' });
      }
    });
    const swimlanesBtn = tagModeGroup.createEl('button', {
      cls: `gtd-mode-btn ${state.tagViewMode === 'swimlanes' ? 'is-active' : ''}`,
      text: 'Swimlanes'
    });
    swimlanesBtn.title = 'Swimlane view: divide board horizontally by role';
    swimlanesBtn.addEventListener('click', () => {
      if (state.tagViewMode !== 'swimlanes') {
        ctx.setState({ tagViewMode: 'swimlanes' });
      }
    });
  }

  // Layout Toggle (Board / List) — persists into settings.defaultLayoutMode
  const layoutGroup = toolbar.createDiv({ cls: 'gtd-layout-switcher' });
  const boardBtn = layoutGroup.createEl('button', {
    cls: `gtd-layout-btn ${state.layoutMode === 'board' ? 'is-active' : ''}`,
    attr: { 'aria-label': 'Board view' }
  });
  setIcon(boardBtn, 'layout-dashboard');
  boardBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'board') {
      ctx.settings.defaultLayoutMode = 'board';
      void ctx.saveSettings();
      ctx.setState({ layoutMode: 'board' });
    }
  });
  const listBtn = layoutGroup.createEl('button', {
    cls: `gtd-layout-btn ${state.layoutMode === 'list' ? 'is-active' : ''}`,
    attr: { 'aria-label': 'List view' }
  });
  setIcon(listBtn, 'list');
  listBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'list') {
      ctx.settings.defaultLayoutMode = 'list';
      void ctx.saveSettings();
      ctx.setState({ layoutMode: 'list' });
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
    if (state.sortCriteria === opt.id) optionEl.selected = true;
  }
  sortSelect.addEventListener('change', () => {
    ctx.setState({ sortCriteria: sortSelect.value as SortCriteria });
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
    const isActive = state.activeFilterRoles.has(r.id);
    const pill = roleChipsWrapper.createEl('button', {
      cls: `gtd-role-chip-btn ${isActive ? 'is-active' : ''} chip-${r.id.replace('/', '-')}`,
      text: r.label
    });
    pill.title = isActive ? `Exclude ${r.label}` : `Include ${r.label}`;
    pill.addEventListener('click', () => {
      const roles = new Set(ctx.getState().activeFilterRoles);
      if (roles.has(r.id)) {
        if (roles.size > 1) {
          roles.delete(r.id);
        }
      } else {
        roles.add(r.id);
      }
      ctx.setState({ activeFilterRoles: roles });
    });
  }

  // Search bar
  const searchWrapper = toolbar.createDiv({ cls: 'gtd-search-wrapper' });
  const searchInput = searchWrapper.createEl('input', {
    type: 'text',
    cls: 'gtd-search-input',
    placeholder: 'Search tasks, tags, projects...'
  });
  searchInput.value = state.searchQuery;
  searchInput.addEventListener('input', () => {
    ctx.setState({ searchQuery: searchInput.value });
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
      cls: `gtd-chip-btn ${state.activeChip === chip.id ? 'is-active' : ''}`,
      text: chip.label
    });
    chipBtn.addEventListener('click', () => {
      ctx.setState({ activeChip: chip.id });
    });
  }

  // Folder Filter
  const folders = getUniqueFolders(allTasks);
  if (folders.length > 0) {
    const select = toolbar.createEl('select', { cls: 'gtd-folder-select' });
    const allOpt = select.createEl('option', { value: 'all', text: 'All Folders' });
    if (state.selectedFolder === 'all') allOpt.selected = true;

    for (const f of folders) {
      const opt = select.createEl('option', { value: f, text: f });
      if (state.selectedFolder === f) opt.selected = true;
    }

    select.addEventListener('change', () => {
      ctx.setState({ selectedFolder: select.value });
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
    await ctx.rescan();
  });

  // Stats Pill
  const openCount = allTasks.filter((t) => !t.isCompleted).length;
  const doneCount = allTasks.filter((t) => t.isCompleted).length;
  const statsPill = toolbar.createDiv({ cls: 'gtd-stats-pill' });
  statsPill.setText(`${openCount} open · ${doneCount} done`);
}
