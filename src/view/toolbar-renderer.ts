import { setIcon } from 'obsidian';
import { parseNaturalLanguageInput, previewDestinationLabel } from '../nl-input';
import { renderParseChips } from './composer';
import type { ViewContext } from './types';
import type { DateAnchorField, RoleId, SortCriteria, TaskItem } from '../types';

const NL_PLACEHOLDER = 'Add task — try “Pay internet bill tomorrow p1 #rj”';

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

/**
 * Stream toolbar: brand row (stats + search), segmented view tabs, By Date
 * anchor row, options disclosure (layout/sort/filter/quick chips/folder/
 * refresh), natural-language quick-add bar and the role chip row.
 */
export function renderToolbar(container: HTMLElement, allTasks: TaskItem[], ctx: ViewContext): void {
  const state = ctx.getState();
  const toolbar = container.createDiv({ cls: 'gtd-toolbar' });

  // Brand row: grid icon + title + stats + search
  const head = toolbar.createDiv({ cls: 'gtd-stream-head' });
  const brand = head.createDiv({ cls: 'gtd-brand' });
  const brandIcon = brand.createSpan({ cls: 'gtd-brand-icon' });
  setIcon(brandIcon, 'layout-grid');
  brand.createSpan({ cls: 'gtd-brand-label', text: 'GTD Matrix Tasks' });

  const openCount = allTasks.filter((t) => !t.isCompleted).length;
  const doneCount = allTasks.filter((t) => t.isCompleted).length;
  head.createDiv({ cls: 'gtd-stats-pill', text: `${openCount} open · ${doneCount} done` });

  const searchWrapper = head.createDiv({ cls: 'gtd-search-wrapper' });
  const searchIcon = searchWrapper.createSpan({ cls: 'gtd-search-icon' });
  setIcon(searchIcon, 'search');
  const searchInput = searchWrapper.createEl('input', {
    type: 'text',
    cls: 'gtd-search-input',
    placeholder: 'Search tasks...',
    attr: { 'aria-label': 'Search tasks' }
  });
  searchInput.value = state.searchQuery;
  searchInput.addEventListener('input', () => {
    const hadFocus = document.activeElement === searchInput;
    ctx.setState({ searchQuery: searchInput.value });
    if (hadFocus) {
      requestAnimationFrame(() => {
        const el = container.querySelector<HTMLInputElement>('.gtd-search-input');
        if (el && document.activeElement !== el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  });

  // Segmented view tabs
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
    text: 'Eisenhower'
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

  // Options disclosure: layout, sort, Filter|Swimlanes, quick chips, folder, refresh
  const optionsWrap = toolbar.createDiv({ cls: 'gtd-options' });
  const optionsToggle = optionsWrap.createEl('button', {
    cls: `gtd-options-toggle ${state.optionsOpen ? 'is-active' : ''}`,
    attr: { 'aria-label': 'More options' }
  });
  setIcon(optionsToggle, 'sliders-horizontal');
  optionsToggle.title = 'More options';
  optionsToggle.addEventListener('click', () => {
    ctx.setState({ optionsOpen: !ctx.getState().optionsOpen });
  });

  const optionsRow = optionsWrap.createDiv({
    cls: `gtd-options-row ${state.optionsOpen ? '' : 'is-hidden'}`
  });

  // Layout Toggle (Board / List) — persists into settings.defaultLayoutMode
  const layoutGroup = optionsRow.createDiv({ cls: 'gtd-layout-switcher' });
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
  const sortWrapper = optionsRow.createDiv({ cls: 'gtd-sort-wrapper' });
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

  // Tag / Role View Mode Toggle [Filter | Swimlanes] — hidden while By Date is active
  if (state.viewMode !== 'date') {
    const tagModeGroup = optionsRow.createDiv({ cls: 'gtd-mode-switcher gtd-tagmode-switcher' });
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

  // Quick Filter Chips Row
  const chipsWrapper = optionsRow.createDiv({ cls: 'gtd-chips-wrapper' });
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
    const select = optionsRow.createEl('select', { cls: 'gtd-folder-select' });
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
  const refreshBtn = optionsRow.createEl('button', {
    cls: 'gtd-btn-icon',
    attr: { 'aria-label': 'Refresh tasks' }
  });
  setIcon(refreshBtn, 'refresh-cw');
  refreshBtn.addEventListener('click', async () => {
    setIcon(refreshBtn, 'loader');
    await ctx.rescan();
  });

  // Natural-language quick-add bar
  const nlBar = toolbar.createDiv({ cls: 'gtd-nl-bar' });
  const nlRow = nlBar.createDiv({ cls: 'gtd-nl-bar-row' });
  const nlIcon = nlRow.createSpan({ cls: 'gtd-nl-bar-icon' });
  setIcon(nlIcon, 'plus');
  const nlInput = nlRow.createEl('input', {
    type: 'text',
    cls: 'gtd-nl-bar-input',
    placeholder: NL_PLACEHOLDER,
    attr: { 'aria-label': 'Quick add task' }
  });
  const nlAdd = nlRow.createEl('button', { cls: 'gtd-nl-bar-add', text: 'Add' });
  const nlChips = nlBar.createDiv({ cls: 'gtd-nl-chips' });

  const updateNlChips = (): void => {
    const value = nlInput.value.trim();
    const todayStr = ctx.getTodayDateString();
    if (!value) {
      renderParseChips(nlChips, null, '', todayStr);
      return;
    }
    const parsed = parseNaturalLanguageInput(value, todayStr);
    const live = ctx.getState();
    const destLabel = previewDestinationLabel(parsed, live.viewMode, todayStr, live.dateAnchor);
    renderParseChips(nlChips, parsed, destLabel, todayStr);
  };
  updateNlChips();

  nlInput.addEventListener('input', updateNlChips);
  nlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitNl();
    }
  });
  nlAdd.addEventListener('click', () => {
    void commitNl();
  });

  async function commitNl(): Promise<void> {
    const value = nlInput.value.trim();
    if (!value) return;
    const parsed = parseNaturalLanguageInput(value, ctx.getTodayDateString());
    nlInput.value = '';
    updateNlChips();
    await ctx.taskMutator.quickAddTask('gtd-inbox', parsed.description, undefined, parsed);
    const refocus = (): void => {
      container.querySelector<HTMLInputElement>('.gtd-nl-bar-input')?.focus();
    };
    refocus();
    requestAnimationFrame(refocus);
  }

  // Role chips row (dot + label; toggles the active role filter)
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
      attr: { 'aria-label': `${isActive ? 'Exclude' : 'Include'} ${r.label}` }
    });
    pill.title = isActive ? `Exclude ${r.label}` : `Include ${r.label}`;
    pill.createSpan({ cls: 'gtd-role-chip-dot' });
    pill.createSpan({ cls: 'gtd-role-chip-label', text: r.label });
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
}
